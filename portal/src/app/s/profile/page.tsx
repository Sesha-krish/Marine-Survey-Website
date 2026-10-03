import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { SecuritySettings } from "@/components/app/security-settings";
import { Card, CardHeader, DescList } from "@/components/ui/misc";
import { formatPhone } from "@/lib/countries";

export const metadata = { title: "Profile" };

export default async function SurveyorProfile() {
  const u = await requireUser(["SURVEYOR"]);
  const [me, sessions, sv] = await Promise.all([
    db.user.findUniqueOrThrow({ where: { id: u.id } }),
    db.session.count({ where: { userId: u.id, revoked: false, expiresAt: { gt: new Date() } } }),
    u.surveyorId ? db.surveyor.findUnique({ where: { id: u.surveyorId }, include: { capabilities: { include: { surveyType: true } } } }) : null,
  ]);
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Profile</h1>
      <Card>
        <CardHeader title={me.firstName + " " + (me.lastName ?? "")} />
        <div className="p-5">
          <DescList items={[
            { label: "Email", value: me.email },
            { label: "Mobile", value: formatPhone(me.phone) },
            { label: "Type", value: sv?.kind === "INDEPENDENT" ? "Independent surveyor" : "In-house surveyor" },
            { label: "Base", value: sv?.baseLocation ?? "—" },
            { label: "Qualified for", value: sv?.capabilities.map((c) => c.surveyType.name).join(", ") || "—", wide: true },
          ]} />
        </div>
      </Card>
      <SecuritySettings totpEnabled={me.totpEnabled} sessions={sessions} />
    </div>
  );
}
