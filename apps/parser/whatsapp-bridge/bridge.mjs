#!/usr/bin/env node
/**
 * Read-only WhatsApp linked-device bridge.
 *
 * It pairs the owner's account by phone-number code, lists chat identifiers,
 * and snapshots recent messages from an explicit allowlist. It never sends,
 * reacts to, deletes or marks messages as read.
 */
import fs from "node:fs/promises";
import fsSync from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import process from "node:process";
import readline from "node:readline/promises";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";
import QRCode from "qrcode";
import qrTerminal from "qrcode-terminal";
import pkg from "whatsapp-web.js";
import { fallbackChatsFromCollections } from "./chat-fallback.mjs";
import { cleanStaleChromeSingletons } from "./chrome-profile-lock.mjs";
import { hasJoinedGroup, isRateLimitError, joinedGroupId, publicInvitePreview, readInviteCode, readRegistryInviteCodes } from "./invite-safety.mjs";

const { Client, LocalAuth } = pkg;
process.umask(0o077);
const here = path.dirname(fileURLToPath(import.meta.url));
const parserRoot = path.resolve(here, "..");
const command = process.argv[2] || "help";

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const configPath = path.resolve(argument("--config") || path.join(parserRoot, "whatsapp-chats.yaml"));
const authPath = path.resolve(process.env.WA_SESSION_PATH || path.join(parserRoot, ".session", "whatsapp"));
const lockPath = path.resolve(process.env.WA_BRIDGE_LOCK_PATH || path.join(parserRoot, ".state", "whatsapp-bridge.lock"));
const pairingQrPath = path.join(parserRoot, ".state", "whatsapp-pairing-qr.png");
const readyMarkerPath = path.join(authPath, ".ready.json");
const maxMediaBytes = Math.min(64 * 1024 * 1024, Math.max(1, Number(process.env.WA_MAX_MEDIA_BYTES || 64 * 1024 * 1024)));
const pairTimeoutMs = boundedNumber("WA_PAIR_TIMEOUT_S", 600, 60, 1800) * 1000;
const reconnectTimeoutMs = boundedNumber("WA_RECONNECT_TIMEOUT_S", 300, 30, 900) * 1000;
const cleanupTimeoutMs = boundedNumber("WA_CLEANUP_TIMEOUT_S", 30, 5, 120) * 1000;
const persistSettleMs = boundedNumber("WA_PERSIST_SETTLE_MS", 5000, 1000, 30000);
const allowedMediaTypes = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
  ["video/mp4", "mp4"],
]);

function boundedNumber(name, fallback, minimum, maximum) {
  const parsed = Number(process.env[name] || fallback);
  return Number.isFinite(parsed) ? Math.max(minimum, Math.min(maximum, parsed)) : fallback;
}

async function ensurePrivateDirectory(directory) {
  await fs.mkdir(directory, { recursive: true, mode: 0o700 });
  await fs.chmod(directory, 0o700);
}

async function acquireLock() {
  await ensurePrivateDirectory(path.dirname(lockPath));
  try {
    const handle = await fs.open(lockPath, "wx", 0o600);
    await handle.writeFile(String(process.pid));
    await handle.close();
  } catch (error) {
    if (error?.code !== "EEXIST") throw error;
    const raw = await fs.readFile(lockPath, "utf8").catch(() => "");
    const pid = Number(raw.trim());
    let active = false;
    if (Number.isInteger(pid) && pid > 1) {
      try {
        process.kill(pid, 0);
        active = true;
      } catch {}
    }
    if (active) throw new Error(`WhatsApp bridge is already running (pid ${pid})`);
    await fs.unlink(lockPath).catch(() => {});
    return acquireLock();
  }
}

async function releaseLock() {
  await fs.unlink(lockPath).catch(() => {});
}

async function readSources() {
  const raw = yaml.load(await fs.readFile(configPath, "utf8")) || {};
  return (raw.chats || []).filter(
    (source) => source.enabled !== false && source.transport === "linked_device",
  );
}

function normalizedPhone(raw) {
  const digits = String(raw || "").replace(/\D/g, "");
  if (digits.length < 8 || digits.length > 15) {
    throw new Error("Use the full international phone number, digits only");
  }
  return digits;
}

function createClient(phoneNumber, headful = false) {
  const macChrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
  const executablePath = process.env.WA_CHROME_PATH || (fsSync.existsSync(macChrome) ? macChrome : undefined);
  return new Client({
    authStrategy: new LocalAuth({ clientId: "extravity", dataPath: authPath }),
    pairWithPhoneNumber: phoneNumber
      ? { phoneNumber, showNotification: true, intervalMs: 180000 }
      : undefined,
    puppeteer: {
      headless: !headful,
      ...(headful ? { defaultViewport: null } : {}),
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-component-update",
        "--disable-features=OptimizationGuideModelDownloading,OptimizationHintsFetching",
      ],
      ...(executablePath ? { executablePath } : {}),
    },
    deviceName: "Extravity Collector",
    browserName: "Chrome",
  });
}

async function writeSessionStatus(status, details = {}) {
  await ensurePrivateDirectory(authPath);
  const temp = `${readyMarkerPath}.${process.pid}.tmp`;
  await fs.writeFile(temp, `${JSON.stringify({ status, updatedAt: new Date().toISOString(), ...details })}\n`, { mode: 0o600 });
  await fs.rename(temp, readyMarkerPath);
  await fs.chmod(readyMarkerPath, 0o600);
}

async function readSessionStatus() {
  try {
    const payload = JSON.parse(await fs.readFile(readyMarkerPath, "utf8"));
    return payload && typeof payload === "object" ? payload : {};
  } catch {
    return {};
  }
}

async function requireVerifiedSession() {
  let marker;
  try {
    marker = JSON.parse(await fs.readFile(readyMarkerPath, "utf8"));
  } catch {
    throw new Error("WhatsApp session is not verified; run pair-qr or pair first");
  }
  if (marker?.status !== "ready" || !marker?.verifiedAt) {
    throw new Error(`WhatsApp session is not verified (state: ${marker?.status || "unknown"}); run pair-qr or pair first`);
  }
}

function waitForReady(client, { showPairingCode = false, showQr = false, timeoutMs = reconnectTimeoutMs, timeline = [] } = {}) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error(`WhatsApp connection timed out after ${Math.round(timeoutMs / 1000)}s (${timeline.join(" → ") || "no events"})`)),
      timeoutMs,
    );
    const done = (callback) => (value) => {
      clearTimeout(timeout);
      callback(value);
    };
    if (showPairingCode) {
      client.on("code", (code) => {
        timeline.push("code");
        const grouped = String(code).match(/.{1,4}/g)?.join("-") || code;
        process.stdout.write(`\nКод привязки: ${grouped}\n`);
        process.stdout.write("WhatsApp → Связанные устройства → Привязка по номеру телефона.\n\n");
      });
    }
    if (showQr) {
      client.on("qr", async (value) => {
        timeline.push("qr");
        process.stdout.write("\nОтсканируйте QR в WhatsApp → Связанные устройства:\n\n");
        qrTerminal.generate(value, { small: true });
        await ensurePrivateDirectory(path.dirname(pairingQrPath));
        await QRCode.toFile(pairingQrPath, value, { width: 720, margin: 4, errorCorrectionLevel: "M" });
        await fs.chmod(pairingQrPath, 0o600);
        process.stdout.write(`QR PNG: ${pairingQrPath}\n`);
      });
    } else if (!showPairingCode) {
      client.once("qr", done(() => {
        timeline.push("qr");
        reject(new Error(`WhatsApp session is not linked (${timeline.join(" → ")}); run pair-qr or pair before list/collect`));
      }));
    }
    client.once("ready", done(() => {
      timeline.push("ready");
      resolve();
    }));
    client.once("authenticated", () => {
      timeline.push("authenticated");
      process.stderr.write("WhatsApp authenticated; synchronizing chats…\n");
    });
    client.on("loading_screen", (percent, message) => {
      timeline.push(`sync:${percent}`);
      process.stderr.write(`WhatsApp sync ${percent}%${message ? `: ${message}` : ""}\n`);
    });
    client.on("change_state", (state) => {
      timeline.push(`state:${state}`);
      process.stderr.write(`WhatsApp state: ${state}\n`);
    });
    client.once("auth_failure", done((message) => reject(new Error(`Authentication failed: ${message}`))));
    client.once("disconnected", done((reason) => reject(new Error(`WhatsApp disconnected: ${reason}`))));
  });
}

async function verifyConnectedClient(client, timeline) {
  const deadline = Date.now() + Math.min(30_000, reconnectTimeoutMs);
  let state = await client.getState();
  while (state !== "CONNECTED" && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    state = await client.getState();
  }
  timeline.push(`verified-state:${state || "unknown"}`);
  if (state !== "CONNECTED") throw new Error(`WhatsApp ready event did not stabilize (${timeline.join(" → ")})`);
  let chats;
  let lastChatError;
  while (Date.now() < deadline) {
    try {
      chats = await client.getChats();
      break;
    } catch (error) {
      lastChatError = error;
      if (await client.getState() !== "CONNECTED") {
        throw new Error(`WhatsApp disconnected before chat verification (${timeline.join(" → ")})`);
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
  if (!chats) {
    const fallback = await client.pupPage.evaluate(fallbackChatsFromCollections)
      .catch((error) => ({ error: String(error?.message || error).slice(0, 80) }));
    if (!Array.isArray(fallback.rows)) {
      throw new Error(`WhatsApp chat verification timed out (${timeline.join(" → ")}); cause: ${lastChatError?.name || "unknown"}: ${lastChatError?.message || "unknown"}; fallback: ${fallback.error || "unavailable"}`);
    }
    chats = fallback.rows.map((item) => ({
      id: { _serialized: item.id, server: item.isGroup ? "g.us" : "newsletter" },
      name: item.name,
      isGroup: item.isGroup,
    }));
    timeline.push(`fallback-groups-and-channels:${chats.length}`);
  }
  timeline.push(`chats:${chats.length}`);
  await new Promise((resolve) => setTimeout(resolve, persistSettleMs));
  const finalState = await client.getState();
  timeline.push(`settled-state:${finalState || "unknown"}`);
  if (finalState !== "CONNECTED") throw new Error(`WhatsApp disconnected while persisting (${timeline.join(" → ")})`);
  return chats;
}

async function destroyClient(client, timeline) {
  let timer;
  const timedOut = new Promise((resolve) => {
    timer = setTimeout(() => resolve(true), cleanupTimeoutMs);
  });
  const destroyed = client.destroy().then(() => false).catch(() => false);
  const cleanupTimedOut = await Promise.race([destroyed, timedOut]);
  clearTimeout(timer);
  if (cleanupTimedOut) {
    timeline.push("cleanup-timeout");
    await client.pupBrowser?.close().catch(() => {});
  } else {
    timeline.push("destroyed");
  }
}

async function withClient(phoneNumber, action, { showQr = false, pairing = false, headful = false } = {}) {
  await ensurePrivateDirectory(authPath);
  await cleanStaleChromeSingletons(authPath);
  const client = createClient(phoneNumber, headful);
  const timeline = [];
  const ready = waitForReady(client, {
    showPairingCode: Boolean(phoneNumber),
    showQr,
    timeoutMs: pairing ? pairTimeoutMs : reconnectTimeoutMs,
    timeline,
  });
  try {
    await Promise.all([client.initialize(), ready]);
    const chats = await verifyConnectedClient(client, timeline);
    return await action(client, chats, timeline);
  } finally {
    await destroyClient(client, timeline);
    await fs.unlink(pairingQrPath).catch(() => {});
    await fs.chmod(authPath, 0o700).catch(() => {});
    process.stderr.write(`WhatsApp lifecycle: ${timeline.join(" → ")}\n`);
  }
}

async function verifyPairing(runInitialPair) {
  await writeSessionStatus("pairing");
  try {
    await runInitialPair();
    await writeSessionStatus("verifying");
    const counts = await withClient(undefined, async (_client, chats) => ({
      chatCount: chats.length,
      sourceChatCount: chats.filter((chat) => chat.isGroup || chat.id?.server === "newsletter").length,
    }));
    const { chatCount } = counts;
    await writeSessionStatus("ready", { verifiedAt: new Date().toISOString(), ...counts });
    process.stdout.write(`WhatsApp связан и повторно проверен. Доступно чатов: ${chatCount}.\n`);
  } catch (error) {
    await writeSessionStatus("failed", { error: String(error?.message || error).slice(0, 300) }).catch(() => {});
    throw error;
  }
}

async function probe() {
  const previous = await readSessionStatus();
  try {
    const counts = await withClient(undefined, async (_client, chats) => ({
      chatCount: chats.length,
      sourceChatCount: chats.filter((chat) => chat.isGroup || chat.id?.server === "newsletter").length,
    }));
    const verifiedAt = new Date().toISOString();
    await writeSessionStatus("ready", { verifiedAt, ...counts });
    process.stdout.write(`${JSON.stringify({ linked: true, verifiedAt, ...counts })}\n`);
  } catch (error) {
    await writeSessionStatus("unavailable", {
      ...(previous.verifiedAt ? { verifiedAt: previous.verifiedAt } : {}),
      checkedAt: new Date().toISOString(),
      error: String(error?.message || error).slice(0, 300),
    }).catch(() => {});
    throw error;
  }
}

async function unlink() {
  const previous = await readSessionStatus();
  if (previous.status !== "unlinked" && !String(previous.error || "").includes("LOGOUT")) {
    try {
      await withClient(undefined, async (client) => {
        try {
          await client.logout();
        } catch (error) {
          if (!String(error?.message || error).includes("this.pupBrowser.isConnected is not a function")) throw error;
          await client.authStrategy.logout();
        }
      });
    } catch (error) {
      if (!String(error?.message || error).includes("disconnected: LOGOUT")) throw error;
    }
  }
  const localAuth = new LocalAuth({ clientId: "extravity", dataPath: authPath });
  localAuth.userDataDir = path.join(authPath, "session-extravity");
  await localAuth.logout();
  await ensurePrivateDirectory(authPath);
  await writeSessionStatus("unlinked", { checkedAt: new Date().toISOString() });
  process.stdout.write("WhatsApp linked device logged out.\n");
}

async function pair() {
  let raw = argument("--phone") || process.env.WA_PHONE_NUMBER;
  if (!raw) {
    const terminal = readline.createInterface({ input: process.stdin, output: process.stdout });
    raw = await terminal.question("Номер WhatsApp в международном формате (только цифры): ");
    terminal.close();
  }
  const phone = normalizedPhone(raw);
  await verifyPairing(() => withClient(phone, async () => undefined, { pairing: true }));
}

async function pairQr() {
  await verifyPairing(() => withClient(undefined, async () => undefined, { showQr: true, pairing: true }));
}

async function listChats() {
  await requireVerifiedSession();
  await withClient(undefined, async (_client, chats) => {
    const rows = chats
      .map((chat) => ({
        id: chat.id?._serialized,
        title: chat.name || "",
        kind: chat.isGroup ? "group" : chat.id?.server === "newsletter" ? "channel" : "direct",
      }))
      .filter((row) => row.id && ["group", "channel"].includes(row.kind))
      .sort((a, b) => a.title.localeCompare(b.title));
    process.stdout.write(`${JSON.stringify(rows, null, 2)}\n`);
    await writeSessionStatus("ready", {
      verifiedAt: new Date().toISOString(),
      chatCount: chats.length,
      sourceChatCount: rows.length,
    });
  });
}

async function inspectOrJoinInvite() {
  await requireVerifiedSession();
  const inviteCode = await readInviteCode(argument("--file"));
  const joining = process.argv.includes("--join");
  const checking = process.argv.includes("--check");
  if (joining && checking) throw new Error("Use either --join or --check, not both");
  if (joining && !process.argv.includes("--confirm-join")) {
    throw new Error("Joining requires both --join and --confirm-join");
  }
  await withClient(undefined, async (client, initialChats) => {
    let info;
    try {
      info = await client.getInviteInfo(inviteCode);
    } catch {
      throw new Error("Unable to preview this group invite; no join attempted");
    }
    const preview = publicInvitePreview(info);
    if (!preview.title) throw new Error("Invite preview has no group title; no join attempted");
    const previewGroupId = joinedGroupId(info);
    const alreadyJoined = previewGroupId && hasJoinedGroup(initialChats, previewGroupId);
    process.stdout.write(`${JSON.stringify({ mode: joining ? "join" : checking ? "check" : "preview", ...preview, ...(checking || joining ? { membershipStatus: alreadyJoined ? "joined" : previewGroupId ? "not_in_synced_chats" : "unknown" } : {}) })}\n`);
    if (checking || !joining || alreadyJoined) return;
    try {
      const result = await client.acceptInvite(inviteCode);
      const groupId = joinedGroupId(result);
      if (!groupId) throw new Error("unconfirmed");
      let confirmed = false;
      for (let attempt = 0; attempt < 15; attempt += 1) {
        try {
          confirmed = hasJoinedGroup(await client.getChats(), groupId);
        } catch {
          confirmed = false;
        }
        if (confirmed) break;
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
      if (!confirmed) throw new Error("unconfirmed");
      process.stdout.write(`${JSON.stringify({ joined: true, title: preview.title })}\n`);
    } catch {
      throw new Error("Group join was not confirmed; status may be pending or unknown. Check WhatsApp manually before retrying");
    }
  });
}

async function waitForJoinedGroup(client, groupId) {
  for (let attempt = 0; attempt < 15; attempt += 1) {
    try {
      if (hasJoinedGroup(await client.getChats(), groupId)) return true;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  return false;
}

async function inspectOrJoinRegistryInvites() {
  await requireVerifiedSession();
  const codes = await readRegistryInviteCodes(argument("--registry"));
  const joining = process.argv.includes("--join");
  if (joining && !process.argv.includes("--confirm-join")) {
    throw new Error("Batch joining requires both --join and --confirm-join");
  }
  const excludedCode = joining ? await readInviteCode(argument("--exclude-file")) : null;
  if (joining && !codes.includes(excludedCode)) {
    throw new Error("Excluded ambiguous invite is not in the registry");
  }
  await withClient(undefined, async (client, initialChats) => {
    const previews = [];
    let consecutiveErrors = 0;
    for (const [index, code] of codes.entries()) {
      try {
        const info = await client.getInviteInfo(code);
        const preview = publicInvitePreview(info);
        if (!preview.title) throw new Error("missing title");
        const groupId = joinedGroupId(info);
        const alreadyJoined = Boolean(groupId && hasJoinedGroup(initialChats, groupId));
        previews.push({ index, code, groupId, preview, alreadyJoined });
        process.stdout.write(`${JSON.stringify({ number: index + 1, status: alreadyJoined ? "joined" : "previewed", ...preview })}\n`);
        consecutiveErrors = 0;
      } catch (error) {
        process.stdout.write(`${JSON.stringify({ number: index + 1, status: "preview_failed" })}\n`);
        if (isRateLimitError(error)) {
          process.stdout.write(`${JSON.stringify({ status: "stopped", reason: "rate_limit" })}\n`);
          return;
        }
        consecutiveErrors += 1;
        if (consecutiveErrors >= 2) {
          process.stdout.write(`${JSON.stringify({ status: "stopped", reason: "repeated_preview_errors" })}\n`);
          return;
        }
      }
    }
    if (!joining) return;
    for (const item of previews) {
      if (item.code === excludedCode) {
        process.stdout.write(`${JSON.stringify({ number: item.index + 1, status: "excluded_ambiguous" })}\n`);
        continue;
      }
      if (item.alreadyJoined) continue;
      let groupId;
      try {
        groupId = joinedGroupId(await client.acceptInvite(item.code));
      } catch {
        process.stdout.write(`${JSON.stringify({ number: item.index + 1, status: "join_unknown", action: "stop_and_check_manually" })}\n`);
        return;
      }
      if (!groupId || !(await waitForJoinedGroup(client, groupId))) {
        process.stdout.write(`${JSON.stringify({ number: item.index + 1, status: "join_unknown", action: "stop_and_check_manually" })}\n`);
        return;
      }
      process.stdout.write(`${JSON.stringify({ number: item.index + 1, status: "joined", title: item.preview.title })}\n`);
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
  });
}

async function openInviteUi() {
  await requireVerifiedSession();
  if (!process.stdin.isTTY) throw new Error("Visible invite inspection requires an interactive terminal");
  const inviteCode = await readInviteCode(argument("--file"));
  await withClient(undefined, async (client) => {
    const invitePage = await client.pupBrowser.newPage();
    try {
      await invitePage.goto(`https://chat.whatsapp.com/${inviteCode}`, {
        waitUntil: "domcontentloaded",
        timeout: 30000,
      });
      await invitePage.bringToFront();
    } catch {
      throw new Error("Unable to open the invite in visible Chrome");
    }
    process.stdout.write("WhatsApp invite is open in Chrome. Inspect or join using the normal page controls; no automated click will occur.\n");
    const terminal = readline.createInterface({ input: process.stdin, output: process.stdout });
    const controller = new AbortController();
    const stop = () => controller.abort();
    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
    try {
      await terminal.question("Press Enter or type q then Enter to close: ", { signal: controller.signal });
    } catch (error) {
      if (error?.name !== "AbortError") throw error;
    } finally {
      process.off("SIGINT", stop);
      process.off("SIGTERM", stop);
      terminal.close();
    }
  }, { headful: true });
}

function safeSegment(value) {
  return String(value || "unknown").replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 80) || "unknown";
}

async function downloadMessageMedia(message, source, output) {
  if (source.include_media === false || !message.hasMedia) return [];
  let media;
  try {
    media = await message.downloadMedia();
  } catch {
    return [];
  }
  const mimeType = String(media?.mimetype || "").split(";", 1)[0].toLowerCase();
  const extension = allowedMediaTypes.get(mimeType);
  if (!extension || !media?.data) return [];
  const content = Buffer.from(media.data, "base64");
  if (!content.length || content.length > maxMediaBytes) return [];

  const directory = path.join(path.dirname(output), ".media", safeSegment(source.key));
  await ensurePrivateDirectory(directory);
  const platformMediaId = String(message.id?._serialized || message.id?.id || "unknown");
  const digest = crypto.createHash("sha256").update(platformMediaId).digest("hex");
  const target = path.join(directory, `${digest}.${extension}`);
  const temp = `${target}.${process.pid}.tmp`;
  await fs.writeFile(temp, content, { mode: 0o600 });
  await fs.rename(temp, target);
  await fs.chmod(target, 0o600);
  return [{ path: target, mime_type: mimeType, platform_media_id: platformMediaId }];
}

async function writeSnapshot(source, messages) {
  const output = path.isAbsolute(source.path)
    ? source.path
    : path.resolve(parserRoot, source.path);
  await ensurePrivateDirectory(path.dirname(output));
  const serialized = messages.map((message) => JSON.stringify(message)).join("\n");
  const temp = `${output}.${process.pid}.tmp`;
  await fs.writeFile(temp, serialized ? `${serialized}\n` : "", { mode: 0o600 });
  await fs.rename(temp, output);
  await fs.chmod(output, 0o600);
}

async function collect() {
  await requireVerifiedSession();
  const sources = await readSources();
  if (!sources.length) {
    process.stdout.write("No enabled linked_device chats in whatsapp-chats.yaml\n");
    return;
  }
  for (const source of sources) {
    if (!source.chat_id || !source.path) {
      throw new Error(`Source ${source.key || "<unknown>"} needs chat_id and path`);
    }
    if (!String(source.chat_id).endsWith("@g.us") && !String(source.chat_id).endsWith("@newsletter")) {
      throw new Error(
        `Source ${source.key || "<unknown>"} must be an explicitly allowlisted group or channel`,
      );
    }
  }

  const failures = [];
  await withClient(undefined, async (_client, verifiedChats) => {
    const chats = new Map(verifiedChats.map((chat) => [chat.id?._serialized, chat]));
    for (const source of sources) {
      try {
        const available = chats.get(source.chat_id);
        const chat = available?.fetchMessages ? available : await _client.getChatById(source.chat_id);
        if (!chat) throw new Error("allowlisted chat is not available");
        const limit = Math.max(1, Number(source.max_messages || 200));
        const recent = await chat.fetchMessages({ limit });
        const output = path.isAbsolute(source.path) ? source.path : path.resolve(parserRoot, source.path);
        const rows = [];
        for (const message of recent
          .filter((item) => item.type !== "e2e_notification" && String(item.body || "").trim())
          .sort((a, b) => Number(a.timestamp) - Number(b.timestamp))) {
          const id = message.id?._serialized || message.id?.id;
          const timestamp = Number(message.timestamp) * 1000;
          if (!id || !Number.isFinite(timestamp)) continue;
          const media = await downloadMessageMedia(message, source, output);
          rows.push({
            id,
            date: new Date(timestamp).toISOString(),
            sender: message.author || message.from || "unknown",
            text: String(message.body).trim(),
            media,
            media_expected: ["image", "video"].includes(String(message.type || "").toLowerCase()),
          });
        }
        await writeSnapshot(source, rows);
        process.stdout.write(`${source.key}: ${rows.length} messages → ${source.path}\n`);
      } catch (error) {
        process.stderr.write(`Source ${source.key}: ${error?.message || error}\n`);
        failures.push(source.key || "<unknown>");
      }
    }
    await writeSessionStatus("ready", {
      verifiedAt: new Date().toISOString(),
      chatCount: verifiedChats.length,
    });
  });
  if (failures.length) {
    throw new Error(`WhatsApp snapshot failed for allowlisted source(s): ${failures.join(", ")}`);
  }
}

async function main() {
  if (!["pair", "pair-qr", "probe", "list", "collect", "unlink", "invite", "invite-batch", "open-invite-ui"].includes(command)) {
    process.stdout.write("Usage: node bridge.mjs pair|pair-qr|probe|list|collect|unlink|invite|invite-batch|open-invite-ui [--file invite.txt] [--registry source-registry.md] [--check | --join --confirm-join --exclude-file ambiguous-invite.txt]\n");
    process.exitCode = 2;
    return;
  }
  await acquireLock();
  try {
    if (command === "pair") await pair();
    if (command === "pair-qr") await pairQr();
    if (command === "probe") await probe();
    if (command === "unlink") await unlink();
    if (command === "list") await listChats();
    if (command === "collect") await collect();
    if (command === "invite") await inspectOrJoinInvite();
    if (command === "invite-batch") await inspectOrJoinRegistryInvites();
    if (command === "open-invite-ui") await openInviteUi();
  } finally {
    await releaseLock();
  }
}

main().then(
  () => { process.exit(0); },
  (error) => {
    process.stderr.write(
      `WhatsApp bridge error: ${error?.message || error}\n`,
      () => process.exit(1),
    );
  },
);
