import type { LucideIcon } from "lucide-react";
import { ButtonLink, Card } from "@/components/ui";
import styles from "./info-page.module.css";

export function InfoHero({
  eyebrow,
  title,
  subtitle,
  cta,
}: {
  eyebrow?: string;
  title: string;
  subtitle: string;
  cta?: { href: string; label: string };
}) {
  return (
    <section className={styles.hero}>
      <div className={styles.heroGlow} aria-hidden="true" />
      <div className={styles.heroInner}>
        {eyebrow && <p className={styles.eyebrow}>{eyebrow}</p>}
        <h1 className={styles.heroTitle}>{title}</h1>
        <p className={styles.heroSubtitle}>{subtitle}</p>
        {cta && (
          <div className={styles.heroAction}>
            <ButtonLink href={cta.href} size="lg">{cta.label}</ButtonLink>
          </div>
        )}
      </div>
    </section>
  );
}

export function FeatureGrid({ items }: { items: { icon: LucideIcon; title: string; text: string }[] }) {
  return (
    <section className={styles.features}>
      <div className={styles.featureGrid}>
        {items.map((f, i) => (
          <Card key={i} className={`${styles.featureCard} p-6`}>
            <span className={styles.featureIcon}>
              <f.icon className="h-5 w-5" />
            </span>
            <h3 className={styles.featureTitle}>{f.title}</h3>
            <p className={styles.featureText}>{f.text}</p>
          </Card>
        ))}
      </div>
    </section>
  );
}

export function Prose({ children }: { children: React.ReactNode }) {
  return (
    <section className={`${styles.prose} mx-auto max-w-3xl px-4 py-10`}>
      <div className="space-y-4 text-[15px] leading-relaxed text-foreground/90 [&_h2]:mt-8 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-foreground [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1.5 [&_ul]:text-muted">
        {children}
      </div>
    </section>
  );
}
