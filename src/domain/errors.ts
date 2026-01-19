export class KartError extends Error {
  constructor(
    message: string,
    public readonly command: string,
    public readonly exitCode: number | null,
    public readonly stderr: string,
  ) {
    super(message);
    this.name = "KartError";
  }
}

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

export class SshSetupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SshSetupError";
  }
}
