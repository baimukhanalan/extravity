import { describe, expect, it } from "vitest";
import { parserIntegrationCards, type ParserHealth } from "@/lib/parser-health";

function health(): ParserHealth {
  return {
    status: "ok",
    scheduled_jobs: ["collect-telegram"],
    telegram_live: { state: "connected", channels: 3 },
    telegram_storage: { ready: true, reason: "configured" },
    whatsapp_linked_session: { ready: false, status: "not_verified", reason: "pairing required" },
    whatsapp_collector: {
      ready: false,
      enabled_sources: 0,
      reasons: ["enable one source"],
      automation: { requested: false, active: false, ready: false },
    },
    instagram_graph: {
      ready: false,
      configured: false,
      enabled_sources: 0,
      enabled_hashtags: 0,
      enabled_profiles: 0,
      reasons: ["credentials required"],
      automation: { requested: false, active: false, ready: false },
    },
  };
}

describe("parser integration status cards", () => {
  it("shows Telegram as running only when a channel is connected", () => {
    expect(parserIntegrationCards(health())[0]).toMatchObject({ key: "telegram", ready: true, scheduled: true, sourceCount: 3 });
  });

  it("does not call a stored but unauthorised Telegram session ready", () => {
    const snapshot = health();
    snapshot.telegram_live = { state: "auth_required", channels: 0 };
    expect(parserIntegrationCards(snapshot)[0]).toMatchObject({
      key: "telegram",
      ready: false,
      sourceCount: 0,
      detail: "Аккаунт Telegram не авторизован — подключите устройство.",
    });
  });

  it("keeps unpaired WhatsApp and unconfigured Instagram visibly blocked", () => {
    const cards = parserIntegrationCards(health());
    expect(cards[1]).toMatchObject({ key: "whatsapp", ready: false, scheduled: false, sourceCount: 0, detail: "pairing required" });
    expect(cards[2]).toMatchObject({ key: "instagram", ready: false, scheduled: false, sourceCount: 0, detail: "credentials required" });
  });
});
