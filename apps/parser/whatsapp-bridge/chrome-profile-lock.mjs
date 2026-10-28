import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const singletonNames = ["SingletonLock", "SingletonSocket", "SingletonCookie"];

export async function cleanStaleChromeSingletons(authPath, { hostname = os.hostname(), signal = process.kill } = {}) {
  const profile = path.join(authPath, "session-extravity");
  let profileStat;
  try {
    profileStat = await fs.lstat(profile);
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
  if (!profileStat.isDirectory() || profileStat.isSymbolicLink()) return false;

  const lock = path.join(profile, "SingletonLock");
  let lockStat;
  let target;
  try {
    lockStat = await fs.lstat(lock);
    if (!lockStat.isSymbolicLink()) return false;
    target = await fs.readlink(lock);
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
  const match = /^(.+)-(\d+)$/.exec(target);
  const pid = match ? Number(match[2]) : 0;
  if (!match || match[1] !== hostname || !Number.isSafeInteger(pid) || pid <= 1) return false;
  try {
    signal(pid, 0);
    return false;
  } catch (error) {
    if (error?.code !== "ESRCH") return false;
  }

  const current = await fs.lstat(lock).catch((error) => {
    if (error?.code === "ENOENT") return null;
    throw error;
  });
  if (!current?.isSymbolicLink() || current.ino !== lockStat.ino || await fs.readlink(lock) !== target) return false;
  for (const name of singletonNames) {
    const file = path.join(profile, name);
    const stat = await fs.lstat(file).catch((error) => {
      if (error?.code === "ENOENT") return null;
      throw error;
    });
    if (stat?.isSymbolicLink()) await fs.unlink(file);
  }
  return true;
}
