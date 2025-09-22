import { clearAuth } from "./auth.store";

export class UnauthorizedError extends Error {
  constructor() {
    super("UNAUTHORIZED");
    this.name = "UnauthorizedError";
  }
}

export function handleUnauthorized(res: Response): void {
  if (res.status === 401) {
    clearAuth();
    window.location.hash = "#/login";
    throw new UnauthorizedError();
  }
}
