// ANSI color codes for terminal output
const colors = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  dim: "\x1b[2m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  blue: "\x1b[34m",
};

export class MCPClientLogger {
  private readonly prefix: string;
  private readonly debugMode: boolean;

  constructor(
    prefix: string = "NextChat MCP Client",
    debugMode: boolean = false,
  ) {
    this.prefix = prefix;
    this.debugMode = debugMode;
  }

  info(message: unknown) {
    this.print(colors.blue, message);
  }

  success(message: unknown) {
    this.print(colors.green, message);
  }

  error(message: unknown) {
    this.print(colors.red, message);
  }

  warn(message: unknown) {
    this.print(colors.yellow, message);
  }

  debug(message: unknown) {
    if (this.debugMode) {
      this.print(colors.dim, message);
    }
  }

  /**
   * Format message to string, if message is object, convert to JSON string
   */
  private formatMessage(message: unknown): string {
    return typeof message === "object"
      ? JSON.stringify(message, null, 2)
      : String(message);
  }

  /**
   * Print formatted message to console
   */
  private print(color: string, message: unknown) {
    const formattedMessage = this.formatMessage(message);
    const logMessage = `${color}${colors.bright}[${this.prefix}]${colors.reset} ${formattedMessage}`;

    // 只使用 console.log，这样日志会显示在 Tauri 的终端中
    // eslint-disable-next-line no-console
    console.log(logMessage);
  }
}
