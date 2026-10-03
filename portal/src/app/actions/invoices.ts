"use server";
import { revalidatePath } from "next/cache";
import { run, VENDOR } from "@/server/action";
import { cancelInvoice, createInvoice, markInvoiceSent, recordPayment } from "@/server/billing";

export async function createInvoiceAction(raw: unknown) {
  return run(VENDOR, async (u) => {
    const inv = await createInvoice(u, raw);
    revalidatePath("/invoices");
    return { id: inv.id, number: inv.number };
  });
}

export async function sendInvoiceAction(id: string) {
  return run(VENDOR, async (u) => {
    await markInvoiceSent(u, id);
    revalidatePath(`/invoices/${id}`);
  });
}

export async function recordPaymentAction(id: string, raw: unknown) {
  return run(VENDOR, async (u) => {
    await recordPayment(u, id, raw);
    revalidatePath(`/invoices/${id}`);
  });
}

export async function cancelInvoiceAction(id: string, reason: string) {
  return run(VENDOR, async (u) => {
    await cancelInvoice(u, id, reason);
    revalidatePath(`/invoices/${id}`);
  });
}
