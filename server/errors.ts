export class AppError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}

export function providerError(error: unknown, provider: string): AppError {
  if (error instanceof AppError) return error;
  if (error instanceof Error && ['AbortError', 'TimeoutError', 'APIUserAbortError', 'APIConnectionTimeoutError'].includes(error.name)) {
    return new AppError(504, 'provider_timeout', `${provider} took too long. Your input is unchanged. Retry when you are ready.`);
  }
  const status = typeof error === 'object' && error !== null && 'status' in error ? error.status : null;
  if (status === 401 || status === 403) return new AppError(503, 'provider_auth', `${provider} authentication failed. The host must check its server-side key and account access.`);
  if (status === 429) return new AppError(429, 'provider_quota', `${provider} is rate-limited or out of quota. Wait and retry, or use the illustrative example.`);
  return new AppError(502, 'provider_failure', `${provider} could not complete this request. Your text is unchanged. Please retry.`);
}
