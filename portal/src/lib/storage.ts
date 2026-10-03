import "server-only";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { db } from "./db";
import { UPLOAD_LIMITS } from "./constants";

// Private file storage. Files live outside /public and are only reachable through
// time-limited HMAC-signed URLs (/api/files/:id?exp&sig). Swap writeFile/readFile for
// an S3 client (private bucket + presigned GET) in production — callers don't change.

const root = () => path.resolve(process.env.STORAGE_DIR ?? "./storage");
const signKey = () => process.env.FILE_SIGNING_SECRET ?? "";

export type UploadKind = keyof typeof UPLOAD_LIMITS;

export class UploadError extends Error {}

export function checkUpload(file: File, kind: UploadKind) {
  const lim = UPLOAD_LIMITS[kind];
  if (!lim.mime.includes(file.type)) throw new UploadError(`${file.name}: unsupported type. Allowed: ${lim.label}`);
  if (file.size > lim.maxBytes) throw new UploadError(`${file.name}: too large. Allowed: ${lim.label}`);
}

export async function saveUpload(opts: {
  file: File;
  kind: UploadKind;
  attachmentKind: string;
  orgId: string;
  userId: string;
  rfqId?: string;
}) {
  checkUpload(opts.file, opts.kind);
  const key = `${opts.orgId}/${randomUUID()}`;
  const full = path.join(root(), key);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, Buffer.from(await opts.file.arrayBuffer()));
  return db.attachment.create({
    data: {
      orgId: opts.orgId,
      rfqId: opts.rfqId,
      kind: opts.attachmentKind,
      fileName: opts.file.name.slice(0, 200),
      mimeType: opts.file.type,
      size: opts.file.size,
      storageKey: key,
      uploadedById: opts.userId,
    },
  });
}

export async function readStored(storageKey: string) {
  const full = path.join(root(), storageKey);
  if (!full.startsWith(root())) throw new Error("bad key");
  return readFile(full);
}

function sig(id: string, exp: number) {
  return createHmac("sha256", signKey()).update(`${id}.${exp}`).digest("base64url");
}

/** Signed URL valid for `ttlSec` (default 15 min). Only call after an authorization check. */
export function signedFileUrl(id: string, ttlSec = 900, download = false) {
  const exp = Math.floor(Date.now() / 1000) + ttlSec;
  return `/api/files/${id}?exp=${exp}&sig=${sig(id, exp)}${download ? "&dl=1" : ""}`;
}

export function verifyFileSig(id: string, exp: string | null, s: string | null) {
  if (!exp || !s) return false;
  const e = Number(exp);
  if (!Number.isFinite(e) || e < Date.now() / 1000) return false;
  const a = Buffer.from(sig(id, e));
  const b = Buffer.from(s);
  return a.length === b.length && timingSafeEqual(a, b);
}

// Generic signed tokens (public report viewer links)
export function signToken(payload: string, ttlSec: number) {
  const exp = Math.floor(Date.now() / 1000) + ttlSec;
  const body = Buffer.from(`${payload}.${exp}`).toString("base64url");
  return `${body}.${createHmac("sha256", signKey()).update(body).digest("base64url")}`;
}

export function verifyToken(token: string): string | null {
  const [body, s] = token.split(".");
  if (!body || !s) return null;
  const expected = createHmac("sha256", signKey()).update(body).digest("base64url");
  if (expected.length !== s.length || !timingSafeEqual(Buffer.from(expected), Buffer.from(s))) return null;
  const decoded = Buffer.from(body, "base64url").toString();
  const i = decoded.lastIndexOf(".");
  const exp = Number(decoded.slice(i + 1));
  if (!Number.isFinite(exp) || exp < Date.now() / 1000) return null;
  return decoded.slice(0, i);
}
