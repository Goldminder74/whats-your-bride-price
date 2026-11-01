/** Stable error codes returned to clients. Messages stay generic on purpose. */
export class PaidError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, status: number) {
    super(code);
    this.name = "PaidError";
    this.code = code;
    this.status = status;
  }
}

export function isPaidError(error: unknown): error is PaidError {
  return error instanceof PaidError;
}
