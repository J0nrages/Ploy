import type { RulesErrorCode } from "./types";

export class RulesError extends Error {
  readonly code: RulesErrorCode;

  constructor(code: RulesErrorCode, message?: string) {
    super(message ?? code);
    this.name = "RulesError";
    this.code = code;
  }
}
