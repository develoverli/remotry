import fs from "fs-extra";
import path from "path";
import os from "os";
import { ConfigStore, ProjectConfig } from "./types";

const CONFIG_DIR_NAME = ".remotry";
const CONFIG_FILE = "projects.json";

export class Store {
  private configPath: string;

  constructor(customPath?: string) {
    this.configPath = customPath
      ? path.resolve(customPath)
      : path.join(os.homedir(), CONFIG_DIR_NAME, CONFIG_FILE);
  }

  getConfigPath(): string {
    return this.configPath;
  }

  private ensureConfigDir(): void {
    const dir = path.dirname(this.configPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  load(): ConfigStore {
    this.ensureConfigDir();
    if (!fs.existsSync(this.configPath)) {
      return { projects: {} };
    }
    try {
      const content = fs.readFileSync(this.configPath, "utf-8");
      return JSON.parse(content) as ConfigStore;
    } catch {
      return { projects: {} };
    }
  }

  save(config: ConfigStore): void {
    this.ensureConfigDir();
    fs.writeFileSync(this.configPath, JSON.stringify(config, null, 2), "utf-8");
  }

  addProject(project: ProjectConfig, isUpdate = false): void {
    const config = this.load();
    const exists = !!config.projects[project.name];

    if (exists && !isUpdate) {
      throw new Error(`Project "${project.name}" already exists. Use --update to modify.`);
    }

    config.projects[project.name] = project;
    this.save(config);
  }

  getProject(name: string): ProjectConfig | undefined {
    const config = this.load();
    return config.projects[name];
  }

  listProjects(): Record<string, ProjectConfig> {
    const config = this.load();
    return config.projects;
  }

  projectExists(name: string): boolean {
    const config = this.load();
    return !!config.projects[name];
  }

  removeProject(name: string): boolean {
    const config = this.load();
    if (!config.projects[name]) {
      return false;
    }
    delete config.projects[name];
    this.save(config);
    return true;
  }
}

export const store = new Store();
