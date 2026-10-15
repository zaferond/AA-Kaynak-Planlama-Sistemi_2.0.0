import { fileURLToPath } from "node:url";
import { verifyDeployment } from "./deployment-manifest.mjs";

try {
  const result = await verifyDeployment(
    fileURLToPath(new URL("../", import.meta.url)),
  );
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) {
    console.error(
      "Kaynaklar veya derleme değişmiş. Doğru paketi seçip yeniden derleyin.",
    );
    process.exitCode = 1;
  }
} catch (error) {
  // No raw environment, manifest values or filesystem exception details in output.
  console.error(
    "Dağıtım doğrulanamadı: " +
      (error.code ? "Dosyalar eksik veya okunamıyor." : error.message),
  );
  process.exitCode = 1;
}
