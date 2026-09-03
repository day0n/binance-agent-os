export class AppError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 400,
    public retryable = false,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export function publicError(error: unknown) {
  if (error instanceof AppError)
    return {
      code: error.code,
      message: error.message,
      retryable: error.retryable,
    };
  // Never surface SDK exception text: it can contain auth headers, URLs, or account data.
  return {
    code: "INTERNAL_ERROR",
    message: "服务暂时不可用，请稍后重试。",
    retryable: true,
  };
}
