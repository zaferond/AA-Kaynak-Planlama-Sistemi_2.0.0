// Renders manual.html to an A4 PDF with Chrome.
import path from "node:path";
import { pathToFileURL } from "node:url";
const { chromium } = await import(
  path.join(process.env.APP_ROOT, "node_modules/playwright/index.mjs")
);
const [src, out] = process.argv.slice(2);
const browser = await chromium.launch({ headless: true, channel: "chrome" });
const page = await browser.newPage();
await page.goto(pathToFileURL(src).href, { waitUntil: "networkidle" });
await page.pdf({
  path: out,
  format: "A4",
  printBackground: true,
  preferCSSPageSize: true,
  displayHeaderFooter: true,
  headerTemplate:
    '<div style="font-size:7pt;color:#7b867c;width:100%;padding:0 15mm;font-family:Arial">AA Kaynak Planlama Sistemi · Kullanıcı Manueli ve Yetki Matrisi</div>',
  footerTemplate:
    '<div style="font-size:7.5pt;color:#7b867c;width:100%;padding:0 15mm;text-align:right;font-family:Arial"><span class="pageNumber"></span> / <span class="totalPages"></span></div>',
});
await browser.close();
