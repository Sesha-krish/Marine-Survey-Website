"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { FilePlus2, Pencil, Plus, UserCheck, UserX } from "lucide-react";
import { Button, ButtonLink } from "@/components/ui/button";
import { CustomerDrawer, type CustomerValues } from "@/components/app/customer-form";
import { ConfirmButton } from "@/components/ui/confirm";
import { useToast } from "@/components/ui/toast";
import { setCustomerActive } from "@/app/actions/customers";

export function AddCustomerButton({ initialName }: { initialName?: string }) {
  const [open, setOpen] = useState(false);
  const [n, setN] = useState(0);
  const router = useRouter();
  return (
    <>
      <Button onClick={() => { setN((x) => x + 1); setOpen(true); }}>
        <Plus className="h-4 w-4" aria-hidden /> Add customer
      </Button>
      <CustomerDrawer
        key={n}
        open={open}
        onClose={() => setOpen(false)}
        initial={initialName ? { organizationName: initialName } : undefined}
        onSaved={(c) => router.push(`/rfqs/new?customerId=${c.id}`)}
      />
    </>
  );
}

type Row = CustomerValues & { id: string; active: boolean };

export function CustomerRowActions({ customer }: { customer: Row }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const toast = useToast();
  return (
    <>
      {customer.active && (
        <ButtonLink href={`/rfqs/new?customerId=${customer.id}`} variant="ghost" size="sm" aria-label="Submit RFQ for this customer" title="Submit RFQ">
          <FilePlus2 className="h-4 w-4" aria-hidden /> <span className="hidden xl:inline">RFQ</span>
        </ButtonLink>
      )}
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)} aria-label="Edit customer" title="Edit">
        <Pencil className="h-4 w-4" aria-hidden />
      </Button>
      <ConfirmButton
        variant="ghost"
        size="sm"
        label={customer.active ? <UserX className="h-4 w-4" aria-label="Deactivate customer" /> : <UserCheck className="h-4 w-4" aria-label="Reactivate customer" />}
        title={customer.active ? "Deactivate customer?" : "Reactivate customer?"}
        description={customer.active ? "They'll be hidden from pickers. Existing RFQs, invoices and reports are kept." : "They'll be available in pickers again."}
        confirmVariant={customer.active ? "danger" : "primary"}
        confirmLabel={customer.active ? "Deactivate" : "Reactivate"}
        action={async () => {
          const r = await setCustomerActive(customer.id, !customer.active);
          if (!r.ok) return r.error;
          toast.success(customer.active ? "Customer deactivated" : "Customer reactivated");
          router.refresh();
        }}
      />
      <CustomerDrawer key={String(open)} open={open} onClose={() => setOpen(false)} id={customer.id} initial={customer} onSaved={() => router.refresh()} />
    </>
  );
}
