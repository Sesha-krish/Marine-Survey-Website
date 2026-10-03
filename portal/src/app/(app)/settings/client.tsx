"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ImageUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ErrorSummary, Field, Input, Select } from "@/components/ui/form";
import { PhoneInput } from "@/components/ui/phone-input";
import { Alert, Badge, Card, CardHeader } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { INDIAN_STATES } from "@/lib/countries";
import { fmtDateTime } from "@/lib/format";
import { activateLetterheadAction, saveOrgAction, uploadLetterheadAction } from "@/app/actions/settings";

type Org = { name: string; gstin: string; email: string; phone: string; address: string; city: string; state: string };

export function OrgForm({ initial }: { initial: Org }) {
  const router = useRouter();
  const toast = useToast();
  const [v, setV] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  return (
    <Card>
      <CardHeader title="Company details" description="Printed on reports and GST invoices. Your state decides CGST+SGST vs IGST." />
      <form
        className="space-y-4 p-5"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          const r = await saveOrgAction(v);
          setBusy(false);
          if (!r.ok) return setErrors(r.fieldErrors ?? { _form: r.error });
          setErrors({});
          toast.success("Company details saved");
          router.refresh();
        }}
      >
        <ErrorSummary errors={errors} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Company name" required error={errors.name}>{(p) => <Input id={p.id} invalid={p.invalid} value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} />}</Field>
          <Field label="GSTIN" error={errors.gstin}>{(p) => <Input id={p.id} invalid={p.invalid} maxLength={15} value={v.gstin} onChange={(e) => setV({ ...v, gstin: e.target.value.toUpperCase() })} />}</Field>
          <Field label="Billing email" required error={errors.email}>{(p) => <Input id={p.id} invalid={p.invalid} type="email" value={v.email} onChange={(e) => setV({ ...v, email: e.target.value })} />}</Field>
          <Field label="Phone" required error={errors.phone}>{(p) => <PhoneInput id={p.id} invalid={p.invalid} value={v.phone} onChange={(x) => setV({ ...v, phone: x })} />}</Field>
        </div>
        <Field label="Address" required error={errors.address}>{(p) => <Input id={p.id} invalid={p.invalid} value={v.address} onChange={(e) => setV({ ...v, address: e.target.value })} />}</Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="City" required error={errors.city}>{(p) => <Input id={p.id} invalid={p.invalid} value={v.city} onChange={(e) => setV({ ...v, city: e.target.value })} />}</Field>
          <Field label="State" required error={errors.state}>{(p) => <Select id={p.id} invalid={p.invalid} value={v.state} onChange={(e) => setV({ ...v, state: e.target.value })} placeholder="Select state">{INDIAN_STATES.map((s) => <option key={s}>{s}</option>)}</Select>}</Field>
        </div>
        <Button type="submit" loading={busy}>Save</Button>
      </form>
    </Card>
  );
}

const W = 3811, H = 780;

/** Tenant letterhead: in-browser cropper to exactly 3811×780, live preview, version history and revert. */
export function LetterheadManager({ items }: { items: { id: string; version: number; active: boolean; url: string; createdAt: string }[] }) {
  const router = useRouter();
  const toast = useToast();
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [zoom, setZoom] = useState(1);
  const [ox, setOx] = useState(0.5);
  const [oy, setOy] = useState(0.5);
  const [busy, setBusy] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const c = canvas.current;
    if (!c || !img) return;
    c.width = W;
    c.height = H;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, W, H);
    // Cover-fit then zoom; offsets pick which part of the overflow is shown.
    const base = Math.max(W / img.width, H / img.height) * zoom;
    const dw = img.width * base, dh = img.height * base;
    ctx.drawImage(img, (W - dw) * ox, (H - dh) * oy, dw, dh);
  }, [img, zoom, ox, oy]);

  const upload = async () => {
    const c = canvas.current!;
    let q = 0.9;
    let blob: Blob | null = null;
    for (let i = 0; i < 6; i++) {
      blob = await new Promise((r) => c.toBlob(r, "image/jpeg", q));
      if (blob && blob.size <= 1024 * 1024) break;
      q -= 0.12;
    }
    if (!blob || blob.size > 1024 * 1024) return toast.error("Couldn't get the image under 1 MB — try a simpler image");
    setBusy(true);
    const fd = new FormData();
    fd.set("file", new File([blob], "letterhead.jpg", { type: "image/jpeg" }));
    const r = await uploadLetterheadAction(fd);
    setBusy(false);
    if (!r.ok) return toast.error(r.error);
    toast.success("Letterhead uploaded and set as default");
    setImg(null);
    router.refresh();
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader title="Upload a new letterhead" description="Any JPG/PNG — crop it here to 3811 × 780. It's used on every report you generate (issued reports keep the letterhead they were issued with)." />
        <div className="space-y-4 p-5">
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-border-strong px-4 py-2 text-sm font-medium hover:bg-surface-2">
            <ImageUp className="h-4 w-4" aria-hidden /> Choose image
            <input type="file" accept="image/jpeg,image/png" className="sr-only" onChange={(e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              const im = new Image();
              im.onload = () => { setImg(im); setZoom(1); setOx(0.5); setOy(0.5); };
              im.src = URL.createObjectURL(f);
            }} />
          </label>
          {img && (
            <>
              <canvas ref={canvas} className="w-full rounded border border-border" aria-label="Letterhead preview" />
              <div className="grid gap-4 sm:grid-cols-3">
                <label className="text-sm">Zoom<input type="range" min={1} max={3} step={0.01} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} className="block w-full" /></label>
                <label className="text-sm">Horizontal position<input type="range" min={0} max={1} step={0.01} value={ox} onChange={(e) => setOx(Number(e.target.value))} className="block w-full" /></label>
                <label className="text-sm">Vertical position<input type="range" min={0} max={1} step={0.01} value={oy} onChange={(e) => setOy(Number(e.target.value))} className="block w-full" /></label>
              </div>
              <div className="flex gap-2"><Button onClick={upload} loading={busy}>Upload & set as default</Button><Button variant="ghost" onClick={() => setImg(null)}>Cancel</Button></div>
            </>
          )}
        </div>
      </Card>
      <Card>
        <CardHeader title="Versions" />
        {items.length === 0 ? <div className="p-5"><Alert tone="info">No letterhead yet — reports use a plain text header with your company details.</Alert></div> : (
          <ul className="divide-y divide-border">
            {items.map((l) => (
              <li key={l.id} className="space-y-2 p-5">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold">Version {l.version} {l.active && <Badge tone="green">Default</Badge>} <span className="font-normal text-muted">· {fmtDateTime(l.createdAt)}</span></p>
                  {!l.active && <Button size="sm" variant="outline" onClick={async () => { const r = await activateLetterheadAction(l.id); if (!r.ok) return toast.error(r.error); toast.success(`Reverted to version ${l.version}`); router.refresh(); }}>Make default</Button>}
                </div>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={l.url} alt={`Letterhead version ${l.version}`} className="w-full rounded border border-border" />
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
