import { clearAuth } from "./auth.store";

export class UnauthorizedError extends Error {
  constructor() {
    super("UNAUTHORIZED");
    this.name = "UnauthorizedError";
  }
}

export class NetworkError extends Error {
  constructor(message: string = "Network error") {
    super(message);
    this.name = "NetworkError";
  }
}

export function handleUnauthorized(res: Response): void {
  if (res.status === 401) {
    clearAuth();
    window.location.hash = "#/login";
    throw new UnauthorizedError();
  }
}

export function handleNetworkError(error: any): void {
  if (isNetworkError(error)) {
    console.warn("Network error detected, logging out user", error);
    clearAuth();
    window.location.hash = "#/login";
    throw new NetworkError(error.message || "Network connection lost");
  }
  throw error;
}

function isNetworkError(error: any): boolean {
  return (
    error instanceof TypeError &&
    (error.message.includes('fetch') ||
     error.message.includes('network') ||
     error.message.includes('Failed to fetch'))
  ) ||
  error.name === 'NetworkError' ||
  (error.code && ['NETWORK_ERROR', 'ERR_NETWORK', 'ERR_INTERNET_DISCONNECTED'].includes(error.code));
}
