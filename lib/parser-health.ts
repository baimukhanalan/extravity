import { z } from "zod";

const readinessSchema = z.object({
  ready: z.boolean(),
  reason: z.string().optional(),
}).passthrough();

const automationSchema = z.object({
  requested: z.boolean(),
  active: z.boolean(),
  ready: z.boolean(),
}).passthrough();

const collectorSchema = z.object({
  ready: z.boolean(),
  enabled_sources: z.number().int().nonnegative().default(0),
  reasons: z.array(z.string()).default([]),
  automation: automationSchema,
}).passthrough();

const instagramSchema = collectorSchema.extend({
  configured: z.boolean(),
  enabled_hashtags: z.number().int().nonnegative().default(0),
  enabled_profiles: z.number().int().nonnegative().default(0),
});

const parserHealthSchema = z.object({
  status: z.literal("ok"),
  scheduled_jobs: z.array(z.string()).default([]),
  telegram_live: z.object({
    state: z.string(),
    channels: z.number().int().nonnegative().default(0),
  }).passthrough(),
  telegram_storage: readinessSchema,
  whatsapp_linked_session: readinessSchema,
  whatsapp_collector: collectorSchema,
  instagram_graph: instagramSchema,
}).passthrough();

export type ParserHealth = z.infer<typeof parserHealthSchema>;

export type ParserIntegrationCard = {
  key: "telegram" | "whatsapp" | "instagram";
  title: string;
  ready: boolean;
  scheduled: boolean;
  sourceCount: number | null;
  detail: string;
};

export function parserIntegrationCards(health: ParserHealth): ParserIntegrationCard[] {
  const telegramConnected = health.telegram_storage.ready
    && health.telegram_live.state === "connected"
    && health.telegram_live.channels > 0;
  const telegramScheduled = telegramConnected || health.scheduled_jobs.includes("collect-telegram");
  const whatsapp = health.whatsapp_collector;
  const instagram = health.instagram_graph;
  const instagramSources = instagram.enabled_hashtags + instagram.enabled_profiles;

  return [
    {
      key: "telegram",
      title: "Telegram",
      ready: telegramConnected,
      scheduled: telegramScheduled,
      sourceCount: health.telegram_live.channels,
      detail: !health.telegram_storage.ready
        ? health.telegram_storage.reason ?? "Хранилище Telegram не готово."
        : health.telegram_live.state === "auth_required"
          ? "Аккаунт Telegram не авторизован — подключите устройство."
          : telegramConnected
            ? "Аккаунт подключён, сбор из разрешённых каналов работает."
            : health.telegram_live.channels === 0
              ? "Нет подключённых разрешённых каналов."
              : `Сбор Telegram не активен (${health.telegram_live.state}).`,
    },
    {
      key: "whatsapp",
      title: "WhatsApp",
      ready: health.whatsapp_linked_session.ready && whatsapp.ready,
      scheduled: whatsapp.automation.active,
      sourceCount: whatsapp.enabled_sources,
      detail: !health.whatsapp_linked_session.ready
        ? health.whatsapp_linked_session.reason ?? "Нужно привязать linked-device session."
        : whatsapp.reasons[0] ?? (whatsapp.automation.active ? "Сбор работает по расписанию." : "Источники готовы, расписание выключено."),
    },
    {
      key: "instagram",
      title: "Instagram",
      ready: instagram.ready,
      scheduled: instagram.automation.active,
      sourceCount: instagramSources,
      detail: instagram.reasons[0] ?? (instagram.automation.active ? "Graph API сбор работает по расписанию." : "Graph API готов, расписание выключено."),
    },
  ];
}

export async function fetchParserHealth(): Promise<{ ok: true; health: ParserHealth } | { ok: false; reason: string }> {
  const configured = process.env.PARSER_HEALTH_URL?.trim();
  if (!configured) return { ok: false, reason: "PARSER_HEALTH_URL не настроен" };

  let url: URL;
  try {
    url = new URL(configured);
  } catch {
    return { ok: false, reason: "PARSER_HEALTH_URL имеет неверный формат" };
  }
  if (url.protocol !== "https:") return { ok: false, reason: "PARSER_HEALTH_URL должен использовать HTTPS" };

  try {
    const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(5_000) });
    if (!response.ok) return { ok: false, reason: `Parser health вернул HTTP ${response.status}` };
    const parsed = parserHealthSchema.safeParse(await response.json());
    return parsed.success
      ? { ok: true, health: parsed.data }
      : { ok: false, reason: "Parser health вернул неожиданный формат" };
  } catch (error) {
    return { ok: false, reason: error instanceof Error && error.name === "TimeoutError" ? "Parser health не ответил за 5 секунд" : "Parser health недоступен" };
  }
}
