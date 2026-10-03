import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";

export async function GET() {
  const u = await getSession();
  if (!u) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const [items, unread] = await Promise.all([
    db.notification.findMany({ where: { userId: u.id }, orderBy: { createdAt: "desc" }, take: 15 }),
    db.notification.count({ where: { userId: u.id, readAt: null } }),
  ]);
  return NextResponse.json({ items, unread });
}

export async function POST(req: Request) {
  const u = await getSession();
  if (!u) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { ids?: string[]; all?: boolean };
  await db.notification.updateMany({
    where: { userId: u.id, readAt: null, ...(body.all ? {} : { id: { in: (body.ids ?? []).slice(0, 100) } }) },
    data: { readAt: new Date() },
  });
  return NextResponse.json({ ok: true });
}
