// Dependency-free: setup.mjs imports this before npm packages are installed.
// Placeholders that shipped in example files or guides; a copied example must
// never become a publicly known root admin password.
const PASSWORD_PLACEHOLDERS = new Set(
  [
    "EN_AZ_10_KARAKTER_SIZE_OZEL_SIFRE",
    "ILK_KURULUM_ICIN_SIZE_OZEL_SIFRE",
    "yalnizca-ilk-kurulumda-gereken-portal-sifresi",
    "yeni-sifreniz",
  ].map((value) => value.toLowerCase()),
);
/** Rejects empty, placeholder or username-equal admin passwords from .env. */
export function assertAdminPassword(
  password,
  username = "",
  name = "ADMIN_PASSWORD",
) {
  const value = typeof password === "string" ? password.trim() : "";
  if (!value)
    throw Error(
      name + " boş. .env içine en az 10 karakterlik kendi şifrenizi yazın.",
    );
  const lower = value.toLowerCase();
  if (
    PASSWORD_PLACEHOLDERS.has(lower) ||
    /size_ozel_sifre/.test(lower) ||
    /^<.*>$/.test(value) ||
    (username && lower === username.trim().toLowerCase())
  )
    throw Error(
      name +
        " örnek dosyadaki yer tutucu veya kullanıcı adıyla aynı. Kendi şifrenizi yazın.",
    );
}
