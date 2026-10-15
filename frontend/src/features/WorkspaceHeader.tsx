import type { ChangeEvent } from "react";
import { Layers3, Users, Minimize2, Maximize2 } from "lucide-react";
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
          <div className="mastuser">
            <Users size={15} />
            <span>
              {user?.username} ·{" "}
              {isAdmin ? "Admin" : isManager ? "Yönetici" : "Normal Kullanıcı"}
            </span>
          </div>
          <label
            className="default-tab-control"
            title="Bu tarayıcıda sonraki girişte açılacak sekme"
          >
            <span>Varsayılan Sekme</span>
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
          </label>
          <div className="mastglobalactions">
            {isAdmin && (
              <>
                <button
                  className="button"
                  data-risk-leave
                  onClick={onExportBackup}
                >
                  Veri Yedeği İndir
                </button>
                <label className="button" data-risk-leave>
                  Yedek Yükle
                  <input
                    hidden
                    type="file"
                    accept=".json"
                    onChange={onRestoreBackup}
                  />
                </label>
              </>
            )}
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
        <strong>AA Planlanan Kaynak Dağılımı</strong>
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
