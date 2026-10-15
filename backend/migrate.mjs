import { Store } from "./store.mjs";
const store = new Store();
try {
  await store.connect({ migrate: true });
  console.log("Şema ve başlangıç listeleri hazır. Mevcut kayıtlar korunur.");
} finally {
  await store.close();
}
