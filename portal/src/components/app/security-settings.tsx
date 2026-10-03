"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import QRCode from "qrcode";
import { ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
import { Alert, Card, CardHeader } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { beginTotpAction, changePasswordAction, confirmTotpAction, disableTotpAction, revokeSessionsAction } from "@/app/actions/users";

/** Password, TOTP two-factor and session controls — shared by vendor Settings and the Surveyor profile. */
export function SecuritySettings({ totpEnabled, sessions }: { totpEnabled: boolean; sessions: number }) {
  const router = useRouter();
  const toast = useToast();
  const [pw, setPw] = useState({ current: "", next: "", confirm: "" });
  const [pwErr, setPwErr] = useState<Record<string, string>>({});
  const [setup, setSetup] = useState<{ secret: string; qr: string } | null>(null);
  const [code, setCode] = useState("");
  const [codeErr, setCodeErr] = useState<string>();
  const [disablePw, setDisablePw] = useState("");

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader title="Password" description="At least 10 characters with letters and numbers. Changing it signs out your other devices." />
        <form
          className="grid gap-4 p-5 sm:grid-cols-3"
          onSubmit={async (e) => {
            e.preventDefault();
            if (pw.next !== pw.confirm) return setPwErr({ confirm: "Passwords don't match" });
            const r = await changePasswordAction(pw.current, pw.next);
            if (!r.ok) return setPwErr(r.fieldErrors ?? { next: r.error });
            setPw({ current: "", next: "", confirm: "" });
            setPwErr({});
            toast.success("Password changed");
          }}
        >
          <Field label="Current password" error={pwErr.current}>{(p) => <Input id={p.id} type="password" autoComplete="current-password" invalid={p.invalid} value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} />}</Field>
          <Field label="New password" error={pwErr.next}>{(p) => <Input id={p.id} type="password" autoComplete="new-password" invalid={p.invalid} value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} />}</Field>
          <Field label="Confirm new password" error={pwErr.confirm}>{(p) => <Input id={p.id} type="password" autoComplete="new-password" invalid={p.invalid} value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} />}</Field>
          <div className="sm:col-span-3"><Button type="submit" disabled={!pw.current || !pw.next}>Change password</Button></div>
        </form>
      </Card>

      <Card>
        <CardHeader title={<span className="flex items-center gap-2">Two-factor authentication {totpEnabled && <ShieldCheck className="h-4 w-4 text-success" aria-label="enabled" />}</span>} description="A 6-digit code from an authenticator app (Google Authenticator, Authy, 1Password) at every sign-in." />
        <div className="space-y-4 p-5">
          {totpEnabled ? (
            <>
              <Alert tone="success" title="Two-factor authentication is on" />
              <div className="flex flex-wrap items-end gap-3">
                <Field label="Confirm your password to turn it off">{(p) => <Input id={p.id} type="password" value={disablePw} onChange={(e) => setDisablePw(e.target.value)} className="w-64" />}</Field>
                <Button variant="danger" disabled={!disablePw} onClick={async () => { const r = await disableTotpAction(disablePw); if (!r.ok) return toast.error(r.error); setDisablePw(""); toast.success("Two-factor authentication turned off"); router.refresh(); }}>Turn off</Button>
              </div>
            </>
          ) : setup ? (
            <div className="grid gap-5 sm:grid-cols-[180px_1fr]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={setup.qr} alt="QR code for your authenticator app" className="h-44 w-44 rounded-lg border border-border bg-white p-2" />
              <div className="space-y-3">
                <p className="text-sm">1. Scan the QR code with your authenticator app, or enter this key manually:</p>
                <code className="block break-all rounded bg-surface-2 px-3 py-2 font-mono text-sm">{setup.secret.match(/.{1,4}/g)?.join(" ")}</code>
                <p className="text-sm">2. Enter the 6-digit code it shows:</p>
                <div className="flex flex-wrap items-start gap-2">
                  <Field label="Code" error={codeErr}>{(p) => <Input id={p.id} inputMode="numeric" autoComplete="one-time-code" maxLength={7} className="w-36" invalid={p.invalid} value={code} onChange={(e) => setCode(e.target.value)} />}</Field>
                  <Button className="mt-6" onClick={async () => { const r = await confirmTotpAction(code); if (!r.ok) return setCodeErr(r.fieldErrors?.code ?? r.error); setSetup(null); toast.success("Two-factor authentication is on"); router.refresh(); }}>Verify & turn on</Button>
                </div>
              </div>
            </div>
          ) : (
            <Button onClick={async () => { const r = await beginTotpAction(); if (!r.ok) return toast.error(r.error); setSetup({ secret: r.data.secret, qr: await QRCode.toDataURL(r.data.url, { margin: 1, width: 320 }) }); }}>Set up two-factor authentication</Button>
          )}
        </div>
      </Card>

      <Card>
        <CardHeader title="Sessions" description={`You're signed in on ${sessions} device${sessions === 1 ? "" : "s"}.`} />
        <div className="p-5">
          <Button variant="outline" disabled={sessions <= 1} onClick={async () => { await revokeSessionsAction(); toast.success("Signed out of other devices"); router.refresh(); }}>Sign out of all other devices</Button>
        </div>
      </Card>
    </div>
  );
}
