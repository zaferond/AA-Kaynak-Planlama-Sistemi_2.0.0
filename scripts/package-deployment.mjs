import { fileURLToPath } from "node:url";
import { createDeploymentPackage } from "./deployment-package.mjs";

try {
  const args = process.argv.slice(2);
  if (args.length !== 2 || args[0] !== "--output" || !args[1].trim())
    throw Error(
      'Kullanım: npm run deploy:package -- --output "yeni-paket-klasörü"',
    );
  const result = await createDeploymentPackage(
    fileURLToPath(new URL("../", import.meta.url)),
    args[1],
  );
  console.log(JSON.stringify({ ok: true, ...result }, null, 2));
} catch (error) {
  console.error(
    error.code === "EEXIST"
      ? "Hedef zaten var; mevcut dosyalara dokunulmadı. Yeni bir klasör seçin."
      : error.code
        ? "Paket oluşturulamadı. Hedef üst klasörünü ve dosya izinlerini kontrol edin."
        : error.message,
  );
  process.exitCode = 1;
}
