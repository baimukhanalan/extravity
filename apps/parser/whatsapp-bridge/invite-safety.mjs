import fs from "node:fs/promises";

export function parseInviteCode(raw) {
  const value = String(raw || "").trim();
  let code = value;
  if (value.startsWith("https://") || value.startsWith("http://")) {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.hostname !== "chat.whatsapp.com" || url.search || url.hash) {
      throw new Error("Expected a WhatsApp group invite URL without query parameters");
    }
    const parts = url.pathname.split("/").filter(Boolean);
    if (parts.length !== 1) throw new Error("Expected exactly one WhatsApp group invite code");
    [code] = parts;
  }
  if (!/^[A-Za-z0-9]{16,64}$/.test(code)) {
    throw new Error("Invalid WhatsApp group invite code");
  }
  return code;
}

export async function readInviteCode(filePath) {
  if (!filePath) throw new Error("Specify --file with one WhatsApp group invite URL or code");
  const stat = await fs.lstat(filePath);
  if (!stat.isFile() || stat.size > 2048) throw new Error("Invite file must be a small regular file");
  const lines = (await fs.readFile(filePath, "utf8")).split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length !== 1) throw new Error("Invite file must contain exactly one invite URL or code");
  return parseInviteCode(lines[0]);
}

export async function readRegistryInviteCodes(filePath) {
  if (!filePath) throw new Error("Specify --registry with the source registry Markdown file");
  const stat = await fs.lstat(filePath);
  if (!stat.isFile() || stat.size > 1024 * 1024) throw new Error("Registry must be a regular Markdown file under 1 MB");
  const raw = await fs.readFile(filePath, "utf8");
  const matches = [...raw.matchAll(/https:\/\/chat\.whatsapp\.com\/([A-Za-z0-9]{16,64})(?![A-Za-z0-9])/g)];
  const codes = [...new Set(matches.map((match) => parseInviteCode(match[0])))];
  if (codes.length !== 8) throw new Error(`Expected eight unique WhatsApp group invites in registry; found ${codes.length}`);
  return codes;
}

export function publicInvitePreview(info) {
  const group = info && typeof info === "object" ? info : {};
  const title = String(group.subject || group.name || "")
    .replace(/\b\d{7,}@(?:c\.us|g\.us|newsletter)\b/gi, "[redacted]")
    .replace(/\+?\d[\d\s().-]{7,}\d/g, "[redacted]")
    .trim()
    .slice(0, 160);
  const participantCount = Number(group.size || group.participantsCount);
  const approval = group.membershipApprovalMode ?? group.membershipApproval;
  return {
    title,
    participantCount: Number.isInteger(participantCount) && participantCount >= 0 ? participantCount : null,
    requiresApproval: typeof approval === "boolean"
      ? approval
      : typeof approval === "string"
        ? ["on", "enabled", "true"].includes(approval.toLowerCase())
        : null,
  };
}

export function joinedGroupId(result) {
  const gid = typeof result === "string" ? result : result?.gid || result?.groupId || result?.id;
  const serialized = typeof gid === "string" ? gid : gid?._serialized || gid?.$1;
  return typeof serialized === "string" && serialized.endsWith("@g.us") ? serialized : null;
}

export function confirmedJoinResult(result) {
  return joinedGroupId(result) !== null;
}

export function hasJoinedGroup(chats, groupId) {
  if (!groupId || !Array.isArray(chats)) return false;
  return chats.some((chat) => {
    const id = chat?.id?._serialized || chat?.id?.$1;
    return id === groupId && (chat.isGroup === true || id.endsWith("@g.us"));
  });
}

export function isRateLimitError(error) {
  const value = `${error?.name || ""} ${error?.message || ""}`;
  return /(?:\b429\b|rate.?limit|too many requests|flood|throttl|try again later)/i.test(value);
}
