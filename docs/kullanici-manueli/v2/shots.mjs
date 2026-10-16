// Takes manual screenshots from the temporary demo copy on :3100.
import path from "node:path";
const root = process.env.APP_ROOT;
const { chromium } = await import(
  path.join(root, "node_modules/playwright/index.mjs")
);
const out = process.argv[2];
const only = process.argv[3] ? process.argv[3].split(",") : null;
const URL = "http://localhost:3100/";
const browser = await chromium.launch({ headless: true, channel: "chrome" });
const log = (...a) => console.log(...a);

async function login(username, password = "Sunum-2026!") {
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 860 },
    deviceScaleFactor: 1.5,
    locale: "tr-TR",
  });
  const page = await ctx.newPage();
  await page.goto(URL);
  await page.locator("#login-username").fill(username);
  await page.locator("input[type=password]").fill(password);
  await page.getByRole("button", { name: "Giriş Yap" }).click();
  await page.locator(".navtabs").waitFor();
  await page.waitForTimeout(1200);
  return { ctx, page };
}
const tab = async (page, name) => {
  await page.getByRole("tab", { name, exact: true }).click();
  await page.waitForTimeout(1500);
};
const shot = async (page, name, opts = {}) => {
  await page.screenshot({ path: path.join(out, name + ".png"), ...opts });
  log("ok", name);
};
const want = (n) => !only || only.includes(n);
async function run(name, fn) {
  if (!want(name)) return;
  try {
    await fn();
  } catch (e) {
    log("FAIL", name, e.message.split("\n")[0]);
  }
}

await run("giris", async () => {
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 860 },
    deviceScaleFactor: 1.5,
  });
  const page = await ctx.newPage();
  await page.goto(URL);
  await page.locator("#login-username").waitFor();
  await page.waitForTimeout(500);
  await shot(page, "giris");
  await ctx.close();
});

await run("yonetici", async () => {
  const { ctx, page } = await login("genel.mudur");
  await tab(page, "Gerçekleşen Kaynak Dağılımı");
  await shot(page, "gerceklesen");
  await tab(page, "Planlanan Kaynak Dağılımı");
  await shot(page, "planlanan");
  await tab(page, "Mühendislik Liderliği Projeler");
  await shot(page, "projeler");
  await page
    .getByRole("switch", { name: "Detayları Göster", exact: true })
    .check();
  await page.waitForTimeout(1200);
  await shot(page, "proje-detay");
  await tab(page, "Kritik Proje Konuları");
  await shot(page, "kritik");
  await tab(page, "Kaynak Planlama Raporları");
  await shot(page, "raporlar");
  await page.getByRole("tab", { name: "Head Count", exact: true }).click();
  await page.waitForTimeout(1500);
  await shot(page, "headcount");
  await tab(page, "Aylık Aktivite Raporu");
  await shot(page, "aktivite");
  await page.locator(".mastuser-trigger").click();
  await page.waitForTimeout(400);
  await shot(page, "kullanici-menusu", {
    clip: { x: 900, y: 0, width: 540, height: 330 },
  });
  await ctx.close();
});

await run("admin", async () => {
  const { ctx, page } = await login("sistem.admin", "Manuel-Gorsel-2026!");
  await tab(page, "Organizasyon & Çalışan & Yetki");
  await shot(page, "organizasyon");
  await page
    .getByRole("button", { name: /Kaynak Ekle \/ Yetki Tanımla/ })
    .click();
  await page.waitForTimeout(900);
  await shot(page, "kaynak-ekle");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(500);
  await page
    .getByRole("button", { name: "Değişiklik Geçmişi", exact: true })
    .click();
  await page.waitForTimeout(1500);
  await shot(page, "degisiklik-gecmisi");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(500);
  await page
    .getByRole("tab", { name: "Organizasyon Yapısı", exact: true })
    .click();
  await page.waitForTimeout(1200);
  await shot(page, "organizasyon-yapisi");
  await tab(page, "Mühendislik Liderliği Projeler");
  await page
    .locator("[data-project-heading] .project-name-copy .textbutton")
    .first()
    .click();
  await page.waitForTimeout(800);
  await page
    .getByText("Görüntüleme yetkisi")
    .first()
    .waitFor({ timeout: 4000 });
  await page.getByText("Yalnızca seçilenler").click();
  await page.waitForTimeout(400);
  await shot(page, "proje-yetki");
  await ctx.close();
});

await run("normalproje", async () => {
  const { ctx, page } = await login("proje.ofisi", "Manuel-Gorsel-2026!");
  await shot(page, "normal-proje", {
    clip: { x: 0, y: 0, width: 1440, height: 430 },
  });
  await ctx.close();
});

await run("normal", async () => {
  const { ctx, page } = await login("muhendis.detay");
  await tab(page, "Gerçekleşen Kaynak Dağılımı");
  await shot(page, "normal-gerceklesen");
  await page.locator(".person-calendar-trigger").first().click();
  await page.waitForTimeout(1000);
  await shot(page, "kisisel-takvim");
  await ctx.close();
});
await browser.close();
