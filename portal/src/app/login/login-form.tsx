"use client";
import { useActionState } from "react";
import { loginAction, type LoginState } from "@/app/actions/session";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
import { Alert } from "@/components/ui/misc";

export function LoginForm({ next }: { next?: string }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(loginAction, {});
  return (
    <form action={action} className="mt-6 space-y-4" noValidate>
      <input type="hidden" name="next" value={next ?? ""} />
      {state.error && <Alert tone="danger">{state.error}</Alert>}
      <Field label="Email" required>
        {(p) => <Input id={p.id} name="email" type="email" autoComplete="username" defaultValue={state.email} required autoFocus={!state.needTotp} />}
      </Field>
      <Field label="Password" required>
        {(p) => <Input id={p.id} name="password" type="password" autoComplete="current-password" required />}
      </Field>
      {state.needTotp && (
        <Field label="Authenticator code" required help="Two-factor authentication is on for this account.">
          {(p) => <Input id={p.id} aria-describedby={p.describedBy} name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]*" maxLength={7} autoFocus />}
        </Field>
      )}
      <Button type="submit" className="w-full" size="lg" loading={pending}>
        {state.needTotp ? "Verify & sign in" : "Sign in"}
      </Button>
    </form>
  );
}
