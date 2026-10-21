import assert from "node:assert/strict";
import { hashPassword } from "../../backend/auth.mjs";

// An account opened with a temporary password sees only the password step
// after signing in. Once changed, the workspace opens under the new session,
// and the user menu offers the same change for local accounts later.
export async function checkPasswordChange(f) {
  await f.store.bootstrapUser({
    _id: "first-login",
    username: "qa.first-login",
    name: "Browser first-login",
    role: "admin",
    resourceId: "",
    leaders: [],
    active: true,
    password: await hashPassword(f.password),
    mustChangePassword: true,
    version: 1,
    revision: 1,
  });
  const chosen = "Browser-chosen-password-58!";
  const again = "Browser-second-password-71!";
  const { page, context } = await f.client("first-login", { login: false });
  const fill = async (current, next) => {
    await page.getByLabel("Mevcut şifre", { exact: true }).fill(current);
    await page.getByLabel("Yeni şifre", { exact: true }).fill(next);
    await page.getByLabel("Yeni şifre (tekrar)", { exact: true }).fill(next);
    await page.getByRole("button", { name: "Şifreyi Değiştir" }).click();
  };
  try {
    await f.check(
      "password: a temporary password leads to the forced change step",
      async () => {
        await page.getByLabel("Kullanıcı Adı").fill("qa.first-login");
        await page.getByLabel("Şifre", { exact: true }).fill(f.password);
        await page.getByRole("button", { name: "Giriş Yap" }).click();
        await page
          .getByRole("heading", { name: "Şifrenizi Belirleyin" })
          .waitFor();
        assert.equal(
          await page
            .getByRole("tab", { name: "Projeler", includeHidden: true })
            .count(),
          0,
        );
        // A mismatching repeat keeps the button disabled with a message.
        await page.getByLabel("Mevcut şifre", { exact: true }).fill(f.password);
        await page.getByLabel("Yeni şifre", { exact: true }).fill(chosen);
        await page
          .getByLabel("Yeni şifre (tekrar)", { exact: true })
          .fill(chosen + "x");
        await page.getByText("Yeni şifre ile tekrarı aynı değil.").waitFor();
        assert(
          await page
            .getByRole("button", { name: "Şifreyi Değiştir" })
            .isDisabled(),
        );
        // The server refuses a wrong current password.
        await fill("Wrong-current-password-1", chosen);
        await page.getByRole("alert").filter({ hasText: /şifre/i }).waitFor();
        await fill(f.password, chosen);
        await page
          .getByRole("button", { name: "Ana menüyü aç", exact: true })
          .waitFor();
        assert.equal(
          (await f.store.findUser({ id: "first-login" })).mustChangePassword,
          undefined,
        );
      },
    );
    await f.check(
      "password: the user menu changes a local account's password",
      async () => {
        await page.getByRole("button", { name: /Kullanıcı menüsü/ }).click();
        await page.getByRole("button", { name: "Şifre Değiştir" }).click();
        const dialog = page.getByRole("dialog", { name: "Şifre Değiştir" });
        await dialog.waitFor();
        await fill(chosen, again);
        await dialog.waitFor({ state: "hidden" });
        await page
          .getByRole("button", { name: "Ana menüyü aç", exact: true })
          .waitFor();
        // The page keeps working under the renewed session.
        await page.reload();
        await page
          .getByRole("button", { name: "Ana menüyü aç", exact: true })
          .waitFor();
        assert.equal(await page.getByLabel("Kullanıcı Adı").count(), 0);
      },
    );
  } finally {
    await context.close();
  }
}
