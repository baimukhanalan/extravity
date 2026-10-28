import { requireUser } from "@/lib/auth";
import { getT } from "@/lib/locale";
import { prisma } from "@/lib/prisma";
import { AchievementsManager } from "@/components/achievements-manager";
import styles from "../portal-pages.module.css";

export default async function AchievementsPage() {
  const { t, locale } = await getT();
  const user = await requireUser();
  const achievements = await prisma.achievement.findMany({
    where: { userId: user.id },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
  });

  return (
    <div className={styles.page}>
      <div className={styles.intro}>
        <div>
          <h1 className={styles.title}>{t.achievements.title}</h1>
          <p className={styles.subtitle}>{t.achievements.subtitle}</p>
        </div>
      </div>
      <div className={styles.storySection}>
        <AchievementsManager achievements={achievements} locale={locale} />
      </div>
    </div>
  );
}
