import type { FieldErrors } from "@/lib/schemas";

/** A user-facing error: thrown by services, turned into { ok:false } by actions. */
export class DomainError extends Error {
  constructor(message: string, public fieldErrors?: FieldErrors) {
    super(message);
  }
}

export class NotFound extends DomainError {
  constructor(what = "Record") {
    super(`${what} not found`);
  }
}

export type ActionResult<T = undefined> =
  | ({ ok: true } & (T extends undefined ? { data?: undefined } : { data: T }))
  | { ok: false; error: string; fieldErrors?: FieldErrors };

export function fail(e: unknown): { ok: false; error: string; fieldErrors?: FieldErrors } {
  if (e instanceof DomainError) return { ok: false, error: e.message, fieldErrors: e.fieldErrors };
  // Never leak internals to the client; log for observability.
  console.error("[action-error]", e);
  return { ok: false, error: "Something went wrong. Please try again." };
}
