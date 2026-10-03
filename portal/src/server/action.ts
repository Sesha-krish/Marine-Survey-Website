import "server-only";
import { requireUser, type SessionUser } from "@/lib/auth";
import type { Role } from "@/lib/constants";
import { fail, type ActionResult } from "./errors";

export const VENDOR: Role[] = ["VENDOR_ADMIN", "VENDOR_STAFF"];

/** Wrap a server action body: authenticate + authorize, then map errors to ActionResult. */
export async function run<T>(roles: Role[], body: (u: SessionUser) => Promise<T>): Promise<ActionResult<T>> {
  const u = await requireUser(roles);
  try {
    const data = await body(u);
    return { ok: true, data } as ActionResult<T>;
  } catch (e) {
    // next/navigation redirect() throws a control-flow error that must propagate
    if (e && typeof e === "object" && "digest" in e && String((e as { digest: unknown }).digest).startsWith("NEXT_")) throw e;
    return fail(e);
  }
}
