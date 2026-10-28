import { prisma } from "@/lib/prisma";
import { Card, Badge } from "@/components/ui";
import { UserActiveToggle } from "@/components/admin-controls";
import { formatDate } from "@/lib/utils";
import { getT } from "@/lib/locale";
import { interpolate } from "@/lib/i18n";

export default async function AdminUsersPage() {
  const { t, locale } = await getT();
  const users = await prisma.user.findMany({
    include: { studentProfile: true, subscription: { include: { plan: true } } },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return (
    <div>
      <h1 className="text-2xl font-semibold">{t.usersAdmin.title}</h1>
      <p className="mt-1 text-muted">{interpolate(t.usersAdmin.accountsCount, { count: users.length })}</p>

      <Card className="mt-6 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-surface-muted text-left text-xs text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">{t.usersAdmin.colUser}</th>
                <th className="px-4 py-3 font-medium">{t.usersAdmin.colRole}</th>
                <th className="px-4 py-3 font-medium">{t.usersAdmin.colPlan}</th>
                <th className="px-4 py-3 font-medium">{t.usersAdmin.colRegistered}</th>
                <th className="px-4 py-3 font-medium">{t.usersAdmin.colStatus}</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {users.map((u) => (
                <tr key={u.id} className="hover:bg-surface-muted/50">
                  <td className="px-4 py-3">
                    <p className="font-medium">
                      {u.studentProfile ? `${u.studentProfile.firstName} ${u.studentProfile.lastName}` : "—"}
                    </p>
                    <p className="text-xs text-muted">{u.email}</p>
                  </td>
                  <td className="px-4 py-3"><Badge tone={u.role === "STUDENT" ? "neutral" : "primary"}>{u.role}</Badge></td>
                  <td className="px-4 py-3 text-muted">{u.subscription?.plan.name ?? "Free"}</td>
                  <td className="px-4 py-3 text-muted">{formatDate(u.createdAt)}</td>
                  <td className="px-4 py-3">
                    <Badge tone={u.isActive ? "success" : "danger"}>{u.isActive ? t.usersAdmin.statusActive : t.usersAdmin.statusBlocked}</Badge>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {u.role === "STUDENT" && <UserActiveToggle id={u.id} active={u.isActive} locale={locale} />}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
