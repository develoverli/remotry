import { Client, ConnectConfig } from "ssh2";
import fs from "fs-extra";
import path from "path";
import os from "os";
import { AuthenticationError } from "./errors";

export interface SSHConfig {
  host: string;
  port?: number;
  username: string;
  password?: string;
  privateKey?: string;
  passphrase?: string;
  /** ssh-agent socket path, Windows named pipe, or "pageant". */
  agent?: string;
}

export class SSHClient {
  private client: Client;
  private connected: boolean;

  constructor() {
    this.client = new Client();
    this.connected = false;
  }

  async connect(config: SSHConfig): Promise<void> {
    return new Promise((resolve, reject) => {
      const options: ConnectConfig = {
        host: config.host,
        port: config.port || 22,
        username: config.username,
        readyTimeout: 30000,
      };

      if (config.agent) {
        options.agent = config.agent;
      } else if (config.password) {
        options.password = config.password;
      } else if (config.privateKey) {
        let keyPath = config.privateKey;
        // Expand ~ to home directory
        if (keyPath.startsWith("~")) {
          keyPath = path.join(os.homedir(), keyPath.slice(1));
        }
        try {
          options.privateKey = fs.readFileSync(keyPath);
          if (config.passphrase) {
            options.passphrase = config.passphrase;
          }
        } catch (err) {
          reject(new Error(`Cannot read SSH key from ${keyPath}: ${err}`));
          return;
        }
      }

      this.client.on("ready", () => {
        this.connected = true;
        resolve();
      });

      this.client.on("error", (err: Error & { level?: string }) => {
        this.connected = false;
        if (err.level === "client-authentication") {
          const kind = config.agent ? "agent" : config.password ? "password" : "key";
          reject(new AuthenticationError(`SSH authentication failed for ${config.username}@${config.host}`, kind));
          return;
        }
        reject(new Error(`SSH connection failed: ${err.message}`));
      });

      this.client.connect(options);
    });
  }

  async exec(command: string): Promise<string> {
    return new Promise((resolve, reject) => {
      if (!this.connected) {
        reject(new Error("Not connected to SSH server"));
        return;
      }

      this.client.exec(command, (err, stream) => {
        if (err) {
          reject(err);
          return;
        }

        let stdout = "";
        let stderr = "";

        stream.on("data", (data: Buffer) => {
          stdout += data.toString();
        });

        stream.stderr.on("data", (data: Buffer) => {
          stderr += data.toString();
        });

        stream.on("close", (code: number) => {
          if (code !== 0 && stderr) {
            reject(new Error(stderr || `Command exited with code ${code}`));
          } else {
            resolve(stdout);
          }
        });
      });
    });
  }

  async uploadDir(localPath: string, remotePath: string, onProgress?: (file: string) => void): Promise<void> {
    if (!this.connected) {
      throw new Error("Not connected to SSH server");
    }

    const remoteRoot = remotePath.replace(/\/+$/, "");

    const walkDir = (dir: string): string[] => {
      const files: string[] = [];
      try {
        for (const item of fs.readdirSync(dir)) {
          const fullPath = path.join(dir, item);
          const stat = fs.statSync(fullPath);
          if (stat.isDirectory()) {
            files.push(...walkDir(fullPath));
          } else {
            files.push(fullPath);
          }
        }
      } catch {
        // ignore read errors
      }
      return files;
    };

    const localFiles = walkDir(localPath);
    const entries = localFiles.map((localFile) => {
      const relativePath = path.relative(localPath, localFile).replace(/\\/g, "/");
      return {
        localFile,
        relativePath,
        remoteFilePath: `${remoteRoot}/${relativePath}`,
      };
    });

    // Pre-create every remote directory (including nested ones) up front.
    // Doing this per-file with a single-level sftp.mkdir fails whenever an
    // intermediate directory does not yet exist, so build the full set and
    // create them recursively via `mkdir -p`.
    const remoteDirs = new Set<string>([remoteRoot]);
    for (const entry of entries) {
      remoteDirs.add(path.posix.dirname(entry.remoteFilePath));
    }
    const dirList = [...remoteDirs];
    const BATCH = 50;
    for (let i = 0; i < dirList.length; i += BATCH) {
      const quoted = dirList
        .slice(i, i + BATCH)
        .map((d) => `"${d}"`)
        .join(" ");
      await this.exec(`mkdir -p ${quoted}`);
    }

    await new Promise<void>((resolve, reject) => {
      this.client.sftp((err, sftp) => {
        if (err) {
          reject(err);
          return;
        }

        let transferred = 0;
        const uploadNext = () => {
          if (transferred >= entries.length) {
            resolve();
            return;
          }
          const entry = entries[transferred];
          sftp.fastPut(entry.localFile, entry.remoteFilePath, (putErr: Error | null | undefined) => {
            if (putErr) {
              reject(new Error(`Failed to upload ${entry.localFile}: ${putErr.message}`));
              return;
            }
            if (onProgress) {
              onProgress(entry.relativePath);
            }
            transferred++;
            uploadNext();
          });
        };

        uploadNext();
      });
    });
  }

  /** Upload a single file, reporting bytes transferred. */
  async uploadFile(
    localFile: string,
    remoteFile: string,
    onProgress?: (transferred: number, total: number) => void
  ): Promise<void> {
    if (!this.connected) {
      throw new Error("Not connected to SSH server");
    }
    await new Promise<void>((resolve, reject) => {
      this.client.sftp((err, sftp) => {
        if (err) {
          reject(err);
          return;
        }
        sftp.fastPut(
          localFile,
          remoteFile,
          { step: (transferred: number, _chunk: number, total: number) => onProgress?.(transferred, total) },
          (putErr: Error | null | undefined) => {
            sftp.end();
            if (putErr) reject(new Error(`Failed to upload ${localFile}: ${putErr.message}`));
            else resolve();
          }
        );
      });
    });
  }

  async execRemoteCommand(command: string): Promise<{ stdout: string; stderr: string; code: number }> {
    return new Promise((resolve) => {
      if (!this.connected) {
        resolve({ stdout: "", stderr: "Not connected", code: 1 });
        return;
      }

      this.client.exec(command, (err, stream) => {
        if (err) {
          resolve({ stdout: "", stderr: err.message, code: 1 });
          return;
        }

        let stdout = "";
        let stderr = "";

        stream.on("data", (data: Buffer) => {
          stdout += data.toString();
        });

        stream.stderr.on("data", (data: Buffer) => {
          stderr += data.toString();
        });

        stream.on("close", (code: number) => {
          resolve({ stdout, stderr, code });
        });
      });
    });
  }

  disconnect(): void {
    if (this.connected) {
      this.client.end();
      this.connected = false;
    }
  }
}

export interface ParsedSSH {
  username: string;
  host: string;
  port: number;
  path: string;
}

export function parseSSHUrl(sshUrl: string): ParsedSSH | null {
  // ssh://user@host:port/path
  const sshMatch = sshUrl.match(/^ssh:\/\/(?:([^@]+)@)?([^:]+)(?::(\d+))?\/(.*)$/);
  if (sshMatch) {
    return {
      username: sshMatch[1] || "",
      host: sshMatch[2],
      port: parseInt(sshMatch[3] || "22", 10),
      path: "/" + sshMatch[4],
    };
  }

  // user@host:port/path or user@host/path or user@host
  const basicMatch = sshUrl.match(/^(?:([^@]+)@)?([^:]+)(?::(\d+))?(?:\/(.+))?$/);
  if (basicMatch) {
    return {
      username: basicMatch[1] || "",
      host: basicMatch[2],
      port: parseInt(basicMatch[3] || "22", 10),
      path: basicMatch[4] ? "/" + basicMatch[4] : "/",
    };
  }

  return null;
}

export function resolveHome(str: string): string {
  if (str.startsWith("~")) {
    return path.join(os.homedir(), str.slice(1));
  }
  return str;
}
