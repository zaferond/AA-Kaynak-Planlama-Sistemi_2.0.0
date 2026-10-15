import { trustedProxyAddresses } from "./trusted-proxies.mjs";

// APP_ORIGIN is a browser origin, not a URL with a path or credentials.
// Never include the configured value in errors: it may contain a secret.
export function applicationAddress(value) {
  const invalid = () =>
    Error(
      "APP_ORIGIN geçerli bir http:// veya https:// adresi olmalıdır; yol, kullanıcı bilgisi, sorgu ve fragment içeremez.",
    );
  if (
    typeof value !== "string" ||
    !/^https?:\/\/[^/?#\\\s]+\/?$/i.test(value.trim())
  )
    throw invalid();
  let url;
  try {
    url = new URL(value.trim());
  } catch {
    throw invalid();
  }
  if (url.username || url.password || !url.hostname) throw invalid();
  return {
    origin: url.origin,
    authority: url.host,
    secure: url.protocol === "https:",
  };
}

export function httpConfig(env = process.env) {
  const address = applicationAddress(env.APP_ORIGIN ?? "http://localhost:3000");
  if (env.NODE_ENV === "production" && !address.secure)
    throw Error("Production için HTTPS APP_ORIGIN gerekir.");
  const rawPort = env.PORT ?? "3000";
  const port = Number(rawPort);
  if (
    typeof rawPort !== "string" ||
    !/^\d+$/.test(rawPort.trim()) ||
    !Number.isInteger(port) ||
    port < 1 ||
    port > 65535
  )
    throw Error("PORT 1–65535 arasında bir tam sayı olmalıdır.");
  return {
    origin: address.origin,
    port,
    host: env.HOST || "127.0.0.1",
    trustedProxies: trustedProxyAddresses(env.TRUST_PROXY),
  };
}
