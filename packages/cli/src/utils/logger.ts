import chalk from "chalk";
import ora, { Ora } from "ora";

type LogLevel = "info" | "warn" | "error" | "success";

const prefixes: Record<LogLevel, string> = {
  info: "ℹ",
  warn: "⚠",
  error: "✗",
  success: "✓",
};

const colorMap: Record<LogLevel, (str: string) => string> = {
  info: chalk.cyan,
  warn: chalk.yellow,
  error: chalk.red,
  success: chalk.green,
};

class Logger {
  private spinner: Ora | null = null;

  info(message: string): void {
    console.log(colorMap.info(`${prefixes.info} ${message}`));
  }

  warn(message: string): void {
    console.warn(colorMap.warn(`${prefixes.warn} ${message}`));
  }

  error(message: string): void {
    console.error(colorMap.error(`${prefixes.error} ${message}`));
  }

  success(message: string): void {
    console.log(colorMap.success(`${prefixes.success} ${message}`));
  }

  dim(message: string): void {
    console.log(chalk.gray(message));
  }

  bold(message: string): void {
    console.log(chalk.bold(message));
  }

  startSpinner(message: string): void {
    this.spinner = ora(message).start();
  }

  succeedSpinner(message: string): void {
    if (this.spinner) {
      this.spinner.succeed(message);
      this.spinner = null;
    }
  }

  failSpinner(message: string): void {
    if (this.spinner) {
      this.spinner.fail(message);
      this.spinner = null;
    }
  }

  warnSpinner(message: string): void {
    if (this.spinner) {
      this.spinner.warn(message);
      this.spinner = null;
    }
  }

  stopSpinner(): void {
    if (this.spinner) {
      this.spinner.stop();
      this.spinner = null;
    }
  }

  updateSpinner(message: string): void {
    if (this.spinner) {
      this.spinner.text = message;
    }
  }

  section(title: string): void {
    console.log();
    console.log(chalk.bold.cyan(`━━━ ${title} ━━━`));
  }

  step(label: string, message: string): void {
    console.log(`  ${chalk.gray(label)} ${message}`);
  }

  progress(current: number, total: number, label: string): void {
    const pct = Math.round((current / total) * 100);
    const bar = "█".repeat(Math.floor(pct / 5)) + "░".repeat(20 - Math.floor(pct / 5));
    const label2 = `${current}/${total}`;
    if (this.spinner) {
      this.spinner.text = `${label2} ${bar} ${pct}% ${label}`;
    }
  }
}

export const logger = new Logger();