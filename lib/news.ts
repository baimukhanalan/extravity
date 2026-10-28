export const NEWS_TOPICS = ["it", "ai", "money", "success", "education", "youth"] as const;
export type NewsTopic = (typeof NEWS_TOPICS)[number];

const labels: Record<"ru" | "kk" | "en", Record<NewsTopic, string>> = {
  ru: { it: "IT", ai: "ИИ", money: "Деньги", success: "Карьера", education: "Учёба", youth: "Молодёжь" },
  kk: { it: "IT", ai: "ЖИ", money: "Қаржы", success: "Мансап", education: "Оқу", youth: "Жастар" },
  en: { it: "IT", ai: "AI", money: "Money", success: "Career", education: "Education", youth: "Youth" },
};

export function newsTopicLabel(topic: string, locale: string): string {
  const language = locale === "kk" || locale === "en" ? locale : "ru";
  return NEWS_TOPICS.includes(topic as NewsTopic) ? labels[language][topic as NewsTopic] : topic;
}
