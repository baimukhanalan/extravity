import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getT } from "@/lib/locale";
import { interpolate } from "@/lib/i18n";

function icsDate(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
}

function escapeIcs(s: string): string {
  return s.replace(/([,;\\])/g, "\\$1").replace(/\n/g, "\\n");
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const { t } = await getT();

  const saved = await prisma.savedOpportunity.findMany({
    where: { userId: user.id },
    include: { opportunity: true },
  });

  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Extravity//RU",
    "CALSCALE:GREGORIAN",
  ];

  for (const s of saved) {
    const o = s.opportunity;
    if (o.applicationDeadline) {
      lines.push(
        "BEGIN:VEVENT",
        `UID:deadline-${o.id}@extracurriculars.kz`,
        `DTSTAMP:${icsDate(new Date())}`,
        `DTSTART:${icsDate(o.applicationDeadline)}`,
        `SUMMARY:${escapeIcs(interpolate(t.apiMsg.icsDeadlineSummary, { title: o.title }))}`,
        `DESCRIPTION:${escapeIcs(o.shortDescription)}`,
        "END:VEVENT",
      );
    }
    if (o.eventStartDate) {
      lines.push(
        "BEGIN:VEVENT",
        `UID:event-${o.id}@extracurriculars.kz`,
        `DTSTAMP:${icsDate(new Date())}`,
        `DTSTART:${icsDate(o.eventStartDate)}`,
        `SUMMARY:${escapeIcs(interpolate(t.apiMsg.icsEventStartSummary, { title: o.title }))}`,
        "END:VEVENT",
      );
    }
  }

  lines.push("END:VCALENDAR");

  return new Response(lines.join("\r\n"), {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'attachment; filename="extracurriculars-kz.ics"',
    },
  });
}
