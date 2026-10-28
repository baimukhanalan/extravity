import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium, type Page } from "@playwright/test";

const ACK = "DELETE_TEST_ACCOUNT_AFTER_RUN";
const baseUrl = (process.env.CANARY_BASE_URL || "https://extracurriculars-kz.vercel.app").replace(/\/$/, "");
const slug = "talk-talk-korea-2026-my-first-k-culture-moment";

if (process.env.PRODUCTION_CANARY_ACK !== ACK) {
  throw new Error(`Set PRODUCTION_CANARY_ACK=${ACK}`);
}
if (new URL(baseUrl).hostname !== "extracurriculars-kz.vercel.app") {
  throw new Error("Production canary is restricted to extracurriculars-kz.vercel.app");
}

async function main(): Promise<void> {
const stamp = `${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
const email = `extravity-canary-${stamp}@example.invalid`;
const password = `Canary-${crypto.randomUUID()}!`;
const tempDirectory = await mkdtemp(join(tmpdir(), "extravity-canary-"));
const fixturePath = join(tempDirectory, "canary-photo.png");
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);
await writeFile(fixturePath, png, { mode: 0o600 });

const browser = await chromium.launch({
  headless: true,
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
});
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, acceptDownloads: true });
const page = await context.newPage();
let staleContext: Awaited<ReturnType<typeof browser.newContext>> | null = null;
const consoleErrors: string[] = [];
const serverErrors: Array<{ status: number; url: string }> = [];
let accountCreated = false;
let accountDeleted = false;

page.on("console", (message) => {
  if (message.type() === "error") consoleErrors.push(message.text());
});
page.on("response", (response) => {
  if (response.status() >= 500 && response.url().startsWith(baseUrl)) {
    serverErrors.push({ status: response.status(), url: response.url() });
  }
});

async function cleanupAccount(target: Page): Promise<void> {
  if (!accountCreated || accountDeleted) return;
  await target.goto(`${baseUrl}/app/settings`, { waitUntil: "networkidle" });
  target.once("dialog", async (dialog) => dialog.accept());
  await Promise.all([
    target.waitForURL(`${baseUrl}/`, { timeout: 20_000 }),
    target.getByRole("button", { name: "Удалить аккаунт", exact: true }).click(),
  ]);
  accountDeleted = true;
}

try {
  await page.goto(`${baseUrl}/signup`, { waitUntil: "networkidle" });
  await page.getByLabel("Имя", { exact: true }).fill("Canary");
  await page.getByLabel("Фамилия", { exact: true }).fill("Extravity");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Пароль", { exact: true }).fill(password);
  await Promise.all([
    page.waitForURL(/\/app\/onboarding/, { timeout: 20_000 }),
    page.getByRole("button", { name: "Создать профиль", exact: true }).click(),
  ]);
  accountCreated = true;

  await Promise.all([
    page.waitForURL(`${baseUrl}/app`, { timeout: 20_000 }),
    page.getByRole("button", { name: "Пропустить и заполнить позже", exact: true }).click(),
  ]);

  await page.goto(`${baseUrl}/opportunities/${slug}`, { waitUntil: "networkidle" });
  await Promise.all([
    page.waitForURL(/\/app\/applications\//, { timeout: 20_000 }),
    page.getByRole("button", { name: "Начать подготовку", exact: true }).click(),
  ]);
  const workspaceUrl = page.url();
  await page.getByText("Бесплатный каталог", { exact: true }).waitFor();
  await page.getByText("4 909 ₸ / месяц", { exact: true }).waitFor();

  await page.goto(`${baseUrl}/app/documents`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Добавить документ", exact: true }).click();
  await page.getByLabel("Название", { exact: true }).fill("Production canary photo");
  await page.getByLabel("Файл *", { exact: true }).setInputFiles(fixturePath);
  const uploadPromise = page.waitForResponse((response) => response.url() === `${baseUrl}/api/documents/upload` && response.request().method() === "POST");
  await page.getByRole("button", { name: "Сохранить", exact: true }).click();
  const uploadResponse = await uploadPromise;
  const uploadResult = await uploadResponse.json() as { ok?: boolean; stored?: boolean; verified?: boolean; error?: string };
  if (!uploadResponse.ok() || !uploadResult.ok || !uploadResult.stored || !uploadResult.verified) {
    throw new Error(`Document verification failed: ${uploadResult.error || uploadResponse.status()}`);
  }
  await page.getByText("Production canary photo", { exact: true }).waitFor({ timeout: 20_000 });

  const exportResponse = await page.request.get(`${baseUrl}/api/account/export`);
  if (!exportResponse.ok()) throw new Error(`Account export failed: ${exportResponse.status()}`);
  const exported = await exportResponse.json() as {
    account?: { email?: string };
    applications?: unknown[];
    documents?: Array<{ id: string; url?: string | null; isMock?: boolean }>;
  };
  if (exported.account?.email !== email) throw new Error("Account export returned the wrong user");
  if (!exported.applications?.length) throw new Error("Application workspace is absent from account export");
  if (!exported.documents?.length) throw new Error("Uploaded document is absent from account export");
  const exportedDocument = exported.documents[0];
  if (exportedDocument.isMock || !exportedDocument.url) throw new Error("Uploaded document was not persisted");

  const privateBlobResponse = await page.request.get(exportedDocument.url, { maxRedirects: 0 });
  if (privateBlobResponse.ok()) throw new Error("Private blob is directly accessible without storage authorization");

  const downloadResponse = await page.request.get(`${baseUrl}/api/documents/${exportedDocument.id}`);
  if (!downloadResponse.ok()) throw new Error(`Document download failed: ${downloadResponse.status()}`);
  const downloaded = await downloadResponse.body();
  if (!downloaded.equals(png)) throw new Error("Downloaded document bytes do not match the upload");

  const staleCookies = await context.cookies();
  staleContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await staleContext.addCookies(staleCookies);
  await cleanupAccount(page);
  const stalePage = await staleContext.newPage();
  await stalePage.goto(`${baseUrl}/login`, { waitUntil: "networkidle", timeout: 20_000 });
  if (new URL(stalePage.url()).pathname !== "/login") throw new Error("Deleted-account session did not settle on login");
  await stalePage.getByLabel("Email", { exact: true }).waitFor({ timeout: 20_000 });
  const remainingSession = (await staleContext.cookies()).some((cookie) => cookie.name === "eckz_session");
  if (remainingSession) throw new Error("Deleted-account session cookie was not cleared");
  await staleContext.close();
  staleContext = null;
  await page.goto(`${baseUrl}/login`, { waitUntil: "networkidle" });
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Пароль", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Войти", exact: true }).click();
  await page.getByText("Неверный email или пароль", { exact: true }).waitFor({ timeout: 20_000 });

  console.log(JSON.stringify({
    ok: true,
    accountDeleted,
    workspacePath: new URL(workspaceUrl).pathname,
    exportedApplications: exported.applications.length,
    exportedDocuments: exported.documents.length,
    privateBlobDirectStatus: privateBlobResponse.status(),
    downloadedBytes: downloaded.length,
    documentVerified: uploadResult.verified,
    staleSessionCleared: true,
    consoleErrors,
    serverErrors,
  }));
} finally {
  await staleContext?.close().catch(() => undefined);
  await cleanupAccount(page).catch((error) => {
    console.error(`CANARY_CLEANUP_FAILED: ${error instanceof Error ? error.message : String(error)}`);
  });
  await context.close();
  await browser.close();
  await rm(tempDirectory, { recursive: true, force: true });
}

if (!accountDeleted || consoleErrors.length || serverErrors.length) process.exitCode = 1;
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
