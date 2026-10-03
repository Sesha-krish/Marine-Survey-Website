"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/form";
import { Alert, Card, CardHeader } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { validateTemplate } from "@/lib/templates/check";
import { publishTemplateAction } from "@/app/actions/admin";

export function TemplateEditor({ typeId, typeName, initial }: { typeId: string; typeName: string; initial: string }) {
  const router = useRouter();
  const toast = useToast();
  const [json, setJson] = useState(initial);
  const [busy, setBusy] = useState(false);
  const problems = useMemo(() => {
    try {
      return validateTemplate(JSON.parse(json));
    } catch (e) {
      return [`Invalid JSON: ${(e as Error).message}`];
    }
  }, [json]);
  return (
    <Card>
      <CardHeader title="Edit & publish a new version" description={`Validated live. Publishing creates ${typeName} v-next; in-flight surveys are unaffected.`} actions={<Button disabled={problems.length > 0 || json === initial} loading={busy} onClick={async () => {
        setBusy(true);
        const r = await publishTemplateAction(typeId, json);
        setBusy(false);
        if (!r.ok) return toast.error(r.error);
        toast.success(`Published v${r.data}`);
        router.refresh();
      }}>Publish new version</Button>} />
      <div className="space-y-3 p-5">
        {problems.length > 0 ? <Alert tone="danger" title={`${problems.length} problem(s)`}><ul className="list-disc pl-5">{problems.slice(0, 10).map((p) => <li key={p}>{p}</li>)}</ul></Alert> : <Alert tone="success" title="Template is valid" />}
        <Textarea rows={24} className="font-mono text-xs" spellCheck={false} value={json} onChange={(e) => setJson(e.target.value)} aria-label="Template JSON" />
      </div>
    </Card>
  );
}
