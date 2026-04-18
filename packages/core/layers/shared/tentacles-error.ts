export class TentaclesError extends Error {
  constructor(message: string) {
    super(`[tentacles/core]: ${message}`);
    this.name = "TentaclesError";
  }
}

export function tentaclesWarn(message: string): void {
  console.warn(`[tentacles/core]: ${message}`);
}
