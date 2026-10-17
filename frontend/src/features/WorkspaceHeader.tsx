import { useRef, useState, type ChangeEvent } from "react";
import {
  Layers3,
  Users,
  Minimize2,
  Maximize2,
  ChevronDown,
  Download,
  Upload,
  KeyRound,
} from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import PasswordChangeForm from "../PasswordChangeForm";
import type { Principal } from "../access";
import { allowedDefaultTabs } from "../navigation";
import { SYSTEM_NAME, TAB_LABELS } from "../settings";

type Props = {
  user: Principal | null;
  defaultTab: string;
  setOpeningTab: (tab: string) => void;
  onExportBackup: () => void;
  onRestoreBackup: (event: ChangeEvent<HTMLInputElement>) => Promise<void>;
  onLogout: () => Promise<void>;
};
export default function WorkspaceHeader({
  user,
  defaultTab,
  setOpeningTab,
  onExportBackup,
  onRestoreBackup,
  onLogout,
}: Props) {
  const isAdmin = user?.role === "admin",
    isManager = user?.role === "manager";
  const roleLabel = isAdmin
    ? "Admin"
    : isManager
      ? "Yönetici"
      : user?.projectEditor
        ? "Normal-Proje"
        : "Normal Kullanıcı";
  const [menuOpen, setMenuOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const restoreInput = useRef<HTMLInputElement>(null);
  return (
    <header className="mast">
      <div className="mastbrandrow">
        <div className="brand">
          <div className="mark">
            <Layers3 size={20} />
          </div>
          <h1 className="systembrand">{SYSTEM_NAME}</h1>
        </div>
        <div className="masttopright">
          <Popover open={menuOpen} onOpenChange={setMenuOpen}>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="mastuser mastuser-trigger"
                aria-label={"Kullanıcı menüsü: " + (user?.username || "")}
              >
                <Users size={15} />
                <span>
                  {user?.username} · {roleLabel}
                </span>
                <ChevronDown size={14} aria-hidden="true" />
              </button>
            </PopoverTrigger>
            <PopoverContent align="end" className="user-menu">
              <div className="user-menu-head">
                <strong>{user?.username}</strong>
                <span>{roleLabel}</span>
              </div>
              <label className="user-menu-field">
                <span>Varsayılan sekme</span>
                <select
                  aria-label="Varsayılan Sekme"
                  value={defaultTab}
                  onChange={(e) => setOpeningTab(e.target.value)}
                >
                  {allowedDefaultTabs(user).map((id) => (
                    <option key={id} value={id}>
                      {TAB_LABELS[id as keyof typeof TAB_LABELS]}
                    </option>
                  ))}
                </select>
                <small>Bu tarayıcıda sonraki girişte açılacak sekme.</small>
              </label>
              {user && user.authSource !== "ldap" && (
                <div className="user-menu-section">
                  <button
                    type="button"
                    className="button"
                    onClick={() => {
                      setMenuOpen(false);
                      setPasswordOpen(true);
                    }}
                  >
                    <KeyRound size={14} aria-hidden="true" />
                    Şifre Değiştir
                  </button>
                </div>
              )}
              {isAdmin && (
                <div className="user-menu-section">
                  <span className="user-menu-title">Veri yedeği</span>
                  <button
                    type="button"
                    className="button"
                    data-risk-leave
                    onClick={() => {
                      setMenuOpen(false);
                      onExportBackup();
                    }}
                  >
                    <Download size={14} aria-hidden="true" />
                    Veri Yedeği İndir
                  </button>
                  <button
                    type="button"
                    className="button"
                    data-risk-leave
                    onClick={() => {
                      setMenuOpen(false);
                      restoreInput.current?.click();
                    }}
                  >
                    <Upload size={14} aria-hidden="true" />
                    Yedek Yükle
                  </button>
                </div>
              )}
            </PopoverContent>
          </Popover>
          <Dialog open={passwordOpen} onOpenChange={setPasswordOpen}>
            <DialogContent className="password-change-dialog">
              <DialogHeader>
                <DialogTitle>Şifre Değiştir</DialogTitle>
                <DialogDescription>
                  Değişiklikten sonra diğer tarayıcılardaki oturumlarınız
                  kapanır.
                </DialogDescription>
              </DialogHeader>
              {passwordOpen && (
                <PasswordChangeForm
                  onCancel={() => setPasswordOpen(false)}
                  onDone={() => {
                    setPasswordOpen(false);
                    // The server issued a new session; reload under it.
                    window.dispatchEvent(new Event("session-changed"));
                  }}
                />
              )}
            </DialogContent>
          </Dialog>
          {/* Outside the menu: the menu unmounts on close, the chooser must not. */}
          {isAdmin && (
            <input
              ref={restoreInput}
              hidden
              type="file"
              accept=".json"
              onChange={onRestoreBackup}
            />
          )}
          <div className="mastglobalactions">
            <button className="button" data-risk-leave onClick={onLogout}>
              Çıkış
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}

export function FullPlanHeader({
  browserFullScreen,
  toggleBrowserFullscreen,
}: {
  browserFullScreen: boolean;
  toggleBrowserFullscreen: () => Promise<void>;
}) {
  return (
    <div className="full-plan-header">
      <div>
        <strong>Kaynak Planlama</strong>
        <span>Geniş Çalışma Alanı</span>
      </div>
      <div className="full-plan-header-actions">
        <button
          type="button"
          className="button"
          onClick={toggleBrowserFullscreen}
        >
          {browserFullScreen ? (
            <Minimize2 size={15} />
          ) : (
            <Maximize2 size={15} />
          )}{" "}
          {browserFullScreen ? "Ekran görünümünden çık" : "Ekranı kapla"}
        </button>
        <a className="button" href="/">
          Normal Görünüme Dön
        </a>
      </div>
    </div>
  );
}
