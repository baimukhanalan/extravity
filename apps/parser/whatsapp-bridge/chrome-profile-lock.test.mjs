import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { cleanStaleChromeSingletons } from "./chrome-profile-lock.mjs";

async function profileFixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "wa-chrome-lock-test-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const profile = path.join(root, "session-extravity");
  await fs.mkdir(profile);
  return { root, profile };
}

test("removes only exact stale singleton symlinks when owner PID is dead", async (t) => {
  const { root, profile } = await profileFixture(t);
  await fs.symlink("Mac-29333", path.join(profile, "SingletonLock"));
  await fs.symlink("cookie", path.join(profile, "SingletonCookie"));
  await fs.symlink("/tmp/example-socket", path.join(profile, "SingletonSocket"));
  await fs.writeFile(path.join(profile, "History"), "preserve");
  await fs.symlink("Mac-123", path.join(profile, "SingletonLock.stale-old"));
  const cleaned = await cleanStaleChromeSingletons(root, {
    hostname: "Mac",
    signal: () => { const error = new Error("gone"); error.code = "ESRCH"; throw error; },
  });
  assert.equal(cleaned, true);
  for (const name of ["SingletonLock", "SingletonCookie", "SingletonSocket"]) {
    await assert.rejects(fs.lstat(path.join(profile, name)), { code: "ENOENT" });
  }
  assert.equal(await fs.readFile(path.join(profile, "History"), "utf8"), "preserve");
  assert.equal(await fs.readlink(path.join(profile, "SingletonLock.stale-old")), "Mac-123");
});

test("keeps profile untouched while owner PID is active or unverified", async (t) => {
  const { root, profile } = await profileFixture(t);
  const lock = path.join(profile, "SingletonLock");
  await fs.symlink(`Mac-${process.pid}`, lock);
  assert.equal(await cleanStaleChromeSingletons(root, { hostname: "Mac" }), false);
  assert.equal(await fs.readlink(lock), `Mac-${process.pid}`);
  assert.equal(await cleanStaleChromeSingletons(root, { hostname: "OtherHost" }), false);
  await fs.unlink(lock);
  await fs.writeFile(lock, "ordinary-file");
  assert.equal(await cleanStaleChromeSingletons(root, { hostname: "Mac" }), false);
  assert.equal(await fs.readFile(lock, "utf8"), "ordinary-file");
});

test("keeps singleton when process existence cannot be checked", async (t) => {
  const { root, profile } = await profileFixture(t);
  const lock = path.join(profile, "SingletonLock");
  await fs.symlink("Mac-29333", lock);
  const cleaned = await cleanStaleChromeSingletons(root, {
    hostname: "Mac",
    signal: () => { const error = new Error("denied"); error.code = "EPERM"; throw error; },
  });
  assert.equal(cleaned, false);
  assert.equal(await fs.readlink(lock), "Mac-29333");
});
