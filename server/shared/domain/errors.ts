export class ApplicationError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number = 400,
    public readonly retryAfter?: number,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "ApplicationError";
  }
}

export function assertActiveAccount(actor: { accountState: string }) {
  if (actor.accountState !== "active")
    throw new ApplicationError(
      "ACCOUNT_RESTRICTED",
      "This account cannot make changes.",
      403,
    );
}
