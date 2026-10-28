import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { confirmedJoinResult, hasJoinedGroup, isRateLimitError, joinedGroupId, parseInviteCode, publicInvitePreview, readInviteCode, readRegistryInviteCodes } from "./invite-safety.mjs";

const code = "AbCdEfGhIjKlMnOpQrStUv";

test("accepts one exact WhatsApp group invite code or URL", () => {
  assert.equal(parseInviteCode(code), code);
  assert.equal(parseInviteCode(`https://chat.whatsapp.com/${code}`), code);
  for (const value of [
    `http://chat.whatsapp.com/${code}`,
    `https://chat.whatsapp.com/${code}?tracking=1`,
    `https://chat.whatsapp.com/${code}/extra`,
    `https://evil.example/${code}`,
    `${code}\n${code}`,
  ]) assert.throws(() => parseInviteCode(value));
});

test("invite file contains exactly one invite and is not a symlink", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "wa-invite-test-"));
  try {
    const file = path.join(directory, "invite.txt");
    await fs.writeFile(file, `https://chat.whatsapp.com/${code}\n`);
    assert.equal(await readInviteCode(file), code);
    await fs.writeFile(file, `${code}\n${code}\n`);
    await assert.rejects(readInviteCode(file));
    const link = path.join(directory, "link.txt");
    await fs.symlink(file, link);
    await assert.rejects(readInviteCode(link));
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("registry reader deduplicates exactly eight invites without exposing them", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "wa-registry-test-"));
  try {
    const file = path.join(directory, "registry.md");
    const codes = Array.from({ length: 8 }, (_, index) => `AbCdEfGhIjKlMnOpQrSt${String(index).padStart(2, "0")}`);
    await fs.writeFile(file, `${codes.map((value) => `[group](https://chat.whatsapp.com/${value})`).join("\n")}\nhttps://chat.whatsapp.com/${codes[0]}\n`);
    assert.deepEqual(await readRegistryInviteCodes(file), codes);
    await fs.writeFile(file, `https://chat.whatsapp.com/${codes[0]}\n`);
    await assert.rejects(readRegistryInviteCodes(file));
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("preview omits participants, account IDs, invite code, and unrelated metadata", () => {
  assert.deepEqual(publicInvitePreview({
    subject: "Student opportunities",
    description: "Public events",
    size: 25,
    gid: { _serialized: "private@g.us" },
    participants: [{ id: "private@c.us" }],
    inviteCode: code,
  }), {
    title: "Student opportunities",
    participantCount: 25,
    requiresApproval: null,
  });
  assert.equal(publicInvitePreview({ subject: "Call +77004344952" }).title, "Call [redacted]");
});

test("join receipt supports both serialized and $1 group IDs", () => {
  assert.equal(confirmedJoinResult({ gid: { _serialized: "group@g.us" } }), true);
  assert.equal(confirmedJoinResult({ gid: { $1: "group@g.us" } }), true);
  assert.equal(confirmedJoinResult({ gid: { $1: "person@c.us" } }), false);
  assert.equal(confirmedJoinResult({}), false);
  assert.equal(joinedGroupId({ gid: "group@g.us" }), "group@g.us");
  assert.equal(joinedGroupId("group@g.us"), "group@g.us");
  assert.equal(joinedGroupId("person@c.us"), null);
  assert.equal(joinedGroupId({ gid: "person@c.us" }), null);
});

test("join is not confirmed until the group appears in the account chats", () => {
  assert.equal(hasJoinedGroup([{ id: { _serialized: "group@g.us" }, isGroup: true }], "group@g.us"), true);
  assert.equal(hasJoinedGroup([{ id: { $1: "group@g.us" }, isGroup: true }], "group@g.us"), true);
  assert.equal(hasJoinedGroup([], "group@g.us"), false);
  assert.equal(hasJoinedGroup([{ id: { _serialized: "other@g.us" }, isGroup: true }], "group@g.us"), false);
});

test("rate-limit signals trigger batch stop", () => {
  assert.equal(isRateLimitError(new Error("429 Too Many Requests")), true);
  assert.equal(isRateLimitError(new Error("try again later")), true);
  assert.equal(isRateLimitError(new Error("invite invalid")), false);
});
