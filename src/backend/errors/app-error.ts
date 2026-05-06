export type AppErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "VALIDATION_ERROR"
  | "USERNAME_TAKEN"
  | "DEPARTMENT_HEAD_TAKEN"
  | "ALREADY_ONBOARDED"
  | "TEMPLATE_LOCKED"
  | "WRONG_DEPARTMENT"
  | "INVALID_PASSCODE"
  | "INTERNAL_ERROR"
  // Payment + download flow
  | "PAYMENT_NOT_CONFIGURED"
  | "PAYMENT_NOT_FOUND"
  | "PAYMENT_NOT_SUCCESSFUL"
  | "PAYMENT_AMOUNT_MISMATCH"
  | "PAYMENT_VERIFY_FAILED"
  | "PAYMENT_REQUIRED"
  | "BAD_SIGNATURE";

export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly statusCode: number;
  readonly details?: unknown;

  constructor(
    code: AppErrorCode,
    message: string,
    statusCode = 400,
    details?: unknown
  ) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}
