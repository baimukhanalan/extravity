import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isStorageConfigured } from "@/lib/storage";
import { DocumentsManager } from "@/components/documents-manager";
import { getT } from "@/lib/locale";
import styles from "../portal-pages.module.css";

export default async function DocumentsPage() {
  const { t, locale } = await getT();
  const user = await requireUser();
  const docs = await prisma.document.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true, type: true, isMock: true, sizeBytes: true },
  });

  return (
    <div className={styles.page}>
      <div className={styles.intro}>
        <div>
          <h1 className={styles.title}>{t.documents.title}</h1>
          <p className={styles.subtitle}>{t.documents.subtitle}</p>
        </div>
      </div>
      <div className={styles.storySection}>
        <DocumentsManager docs={docs} storageReady={isStorageConfigured()} locale={locale} />
      </div>
    </div>
  );
}
