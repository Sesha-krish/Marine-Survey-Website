import { db } from "@/lib/db";
import { readStored, verifyFileSig } from "@/lib/storage";

// Private files: only reachable with a valid, unexpired HMAC signature minted server-side
// after an authorization check. No session = no listing, no guessing.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const url = new URL(req.url);
  if (!verifyFileSig(id, url.searchParams.get("exp"), url.searchParams.get("sig"))) {
    return new Response("Link expired or invalid", { status: 403 });
  }
  const a = await db.attachment.findUnique({ where: { id } });
  if (!a) return new Response("Not found", { status: 404 });
  const buf = await readStored(a.storageKey);
  const dl = url.searchParams.get("dl") === "1";
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": a.mimeType,
      "Content-Length": String(buf.length),
      "Content-Disposition": `${dl ? "attachment" : "inline"}; filename="${a.fileName.replace(/"/g, "")}"`,
      "Cache-Control": "private, max-age=600",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
