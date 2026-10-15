import fs from "node:fs/promises";
import { pbkdf2Sync, createDecipheriv } from "node:crypto";
const [input, output] = process.argv.slice(2);
if (!input || !output || !process.env.LEGACY_PASSWORD)
  throw Error(
    "LEGACY_PASSWORD ayarlayın. Kullanım: node --env-file=.env backend/convert-legacy.mjs eski.json aktarim.json",
  );
const e = JSON.parse(await fs.readFile(input, "utf8"));
if (e.format !== "kaynak-planlama-encrypted-v1" || e.iterations !== 210000)
  throw Error("Eski şifreli yedek geçersiz.");
const key = pbkdf2Sync(
  process.env.LEGACY_PASSWORD,
  Buffer.from(e.salt, "base64"),
  210000,
  32,
  "sha256",
);
const encrypted = Buffer.from(e.ciphertext, "base64"),
  decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(e.iv, "base64"));
decipher.setAuthTag(encrypted.subarray(-16));
const data = JSON.parse(
  Buffer.concat([
    decipher.update(encrypted.subarray(0, -16)),
    decipher.final(),
  ]).toString(),
);
delete data.users;
data.revisions = {};
await fs.writeFile(
  output,
  JSON.stringify({ format: "aa-planning-data-v1", data }),
  { flag: "wx", mode: 0o600 },
);
console.log(
  "Planlama verileri dönüştürüldü. Bu JSON şifreli değildir; aktarım sonrası güvenli saklayın veya silin.",
);
