"use server";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { customerSchema, flattenErrors } from "@/lib/schemas";
import { customerName } from "@/lib/format";
import { run, VENDOR } from "@/server/action";
import { DomainError, NotFound } from "@/server/errors";

export async function saveCustomer(id: string | null, raw: unknown) {
  return run(VENDOR, async (u) => {
    const p = customerSchema.safeParse(raw);
    if (!p.success) throw new DomainError("Please fix the highlighted fields", flattenErrors(p.error));
    const v = p.data;
    const data = {
      ...v,
      organizationName: v.customerType === "ENTERPRISE" ? v.organizationName : null,
      firstName: v.customerType === "INDIVIDUAL" ? v.firstName : null,
      middleName: v.customerType === "INDIVIDUAL" ? v.middleName : null,
      lastName: v.customerType === "INDIVIDUAL" ? v.lastName : null,
    };
    const result = await db.$transaction(async (tx) => {
      // Duplicate guard: same email or same organization name within the tenant
      const dup = await tx.customer.findFirst({
        where: {
          orgId: u.orgId, active: true, id: id ? { not: id } : undefined,
          OR: [{ email: v.email }, ...(data.organizationName ? [{ organizationName: data.organizationName }] : [])],
        },
      });
      if (dup) throw new DomainError(`A customer with this ${dup.email === v.email ? "email" : "name"} already exists: ${customerName(dup)}`, { [dup.email === v.email ? "email" : "organizationName"]: "Already used by another customer" });
      if (id) {
        const before = await tx.customer.findFirst({ where: { id, orgId: u.orgId } });
        if (!before) throw new NotFound("Customer");
        const c = await tx.customer.update({ where: { id }, data });
        await audit(tx, u, { entityType: "CUSTOMER", entityId: id, action: "CUSTOMER_UPDATED", note: customerName(c) });
        return c;
      }
      const c = await tx.customer.create({ data: { ...data, orgId: u.orgId } });
      await audit(tx, u, { entityType: "CUSTOMER", entityId: c.id, action: "CUSTOMER_CREATED", note: customerName(c) });
      return c;
    });
    revalidatePath("/customers");
    return { id: result.id, name: customerName(result) };
  });
}

/** Never hard-delete: customers are referenced by RFQs, invoices and reports. */
export async function setCustomerActive(id: string, active: boolean) {
  return run(VENDOR, async (u) => {
    await db.$transaction(async (tx) => {
      const c = await tx.customer.findFirst({ where: { id, orgId: u.orgId } });
      if (!c) throw new NotFound("Customer");
      await tx.customer.update({ where: { id }, data: { active } });
      await audit(tx, u, { entityType: "CUSTOMER", entityId: id, action: active ? "CUSTOMER_UPDATED" : "CUSTOMER_DEACTIVATED", note: customerName(c) });
    });
    revalidatePath("/customers");
  });
}

/** Autocomplete for the RFQ wizard (and anywhere else a customer is picked). */
export async function searchCustomers(q: string) {
  return run(VENDOR, async (u) => {
    const s = q.trim();
    const rows = await db.customer.findMany({
      where: {
        orgId: u.orgId, active: true,
        ...(s ? { OR: [{ organizationName: { contains: s } }, { firstName: { contains: s } }, { lastName: { contains: s } }, { email: { contains: s.toLowerCase() } }, { phone: { contains: s.replace(/\s/g, "") } }] } : {}),
      },
      orderBy: { updatedAt: "desc" },
      take: 8,
    });
    return rows.map((c) => ({ ...c, displayName: customerName(c) }));
  });
}
