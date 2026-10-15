import fs from "node:fs/promises";
import { constants } from "node:fs";
import { createInterface } from "node:readline/promises";
import { Writable } from "node:stream";
const file = new URL("../.env", import.meta.url);
let exists = false;
try {
  await fs.lstat(file);
  exists = true;
  if (!(await fs.stat(file)).isFile())
    throw Error(".env normal bir dosya olmalı.");
  await fs.access(file, constants.R_OK);
  console.log("Ayar dosyası zaten var; mevcut veriler ve ayarlar korunuyor.");
  process.exit(0);
} catch (error) {
  if (exists || error.code !== "ENOENT")
    throw Error(
      ".env okunamıyor. Dosya türünü ve erişim izinlerini kontrol edin.",
    );
}
if (!process.stdin.isTTY)
  throw Error("Kurulumu Terminal penceresinde çalıştırın.");
if (Number(process.versions.node.split(".")[0]) < 24)
  throw Error("Node.js 24 veya daha yenisi gerekir.");
let muted = false;
const output = new Writable({
  write(chunk, _encoding, done) {
    if (!muted) process.stdout.write(chunk);
    done();
  },
});
const rl = createInterface({ input: process.stdin, output, terminal: true });
async function ask(label, hidden = false) {
  process.stdout.write(label);
  muted = hidden;
  try {
    return await rl.question("");
  } finally {
    muted = false;
    if (hidden) process.stdout.write("\n");
  }
}
try {
  console.log("\nAA Kaynak Planlama — İlk kurulum\n");
  let username;
  do {
    username =
      (await ask("Giriş e-postası [mehmetzaferonder@gmail.com]: "))
        .trim()
        .toLowerCase() || "mehmetzaferonder@gmail.com";
  } while (!/^[a-z0-9._@+-]{3,100}$/.test(username));
  let password;
  while (true) {
    password = await ask(
      "Giriş şifreniz (en az 10 karakter; yazarken görünmez): ",
      true,
    );
    if (
      password.length < 10 ||
      password.length > 256 ||
      /[\r\n\x00]/.test(password) ||
      password.includes("'")
    ) {
      console.log("10–256 karakter girin; tek tırnak kullanmayın.");
      continue;
    }
    if (password === (await ask("Aynı şifreyi tekrar yazın: ", true))) break;
    console.log("Şifreler uyuşmadı. Tekrar deneyin.");
  }
  const content = `DB_PROVIDER=sqljs
SQLJS_FILE=data/planlama.sqlite
DB_AUTO_MIGRATE=false
APP_ORIGIN=http://localhost:3000
HOST=127.0.0.1
PORT=3000
NODE_ENV=development
ADMIN_USERNAME=${username}
ADMIN_PASSWORD='${password}'
`;
  await fs.writeFile(file, content, { flag: "wx", mode: 0o600 });
  console.log(
    "\nAyarlar hazır. Yerel sql.js modu hazır; Docker gerekmez. Giriş adınız: " +
      username,
  );
} finally {
  rl.close();
}
