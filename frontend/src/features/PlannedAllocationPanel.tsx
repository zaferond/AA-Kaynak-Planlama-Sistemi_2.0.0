import { Switch } from "@/components/ui/switch";
import PlannedCapacitySummary from "./planned-allocation/PlannedCapacitySummary";
import PlannedAllocationTable from "./planned-allocation/PlannedAllocationTable";
import type { PlannedAllocationProps } from "./planned-allocation/types";
import { useViewportWorkspace } from "./workspace/useViewportWorkspace";
export default function PlannedAllocationPanel(props: PlannedAllocationProps) {
  const { teams, projects, groups, onlyDataRows } = props;
  const viewportRef = useViewportWorkspace();
  return (
    <section className="panel workspace-dock" ref={viewportRef}>
      <PlannedCapacitySummary {...props} />
      <div
        className="workspace-view-options"
        role="group"
        aria-label="Görünüm seçenekleri"
      >
        <label>
          <Switch
            size="sm"
            checked={props.showAllActual}
            onCheckedChange={props.onShowAllActualChange}
          />
          Gerçekleşen Dağılım Göster
        </label>
        <label>
          <Switch
            size="sm"
            checked={onlyDataRows}
            onCheckedChange={props.onOnlyDataRowsChange}
          />
          Sadece veri olanlar
        </label>
        {props.view === "team" && (
          <span className="capacity-legend">
            <span>Takım satırı:</span>
            {["Aktif kaynak", "Dağıtılan", "Kalan"].map((label, index) => (
              <span
                key={label}
                className={"capacity-legend-item team-capacity-kind-" + index}
              >
                <i aria-hidden="true" />
                {label}
              </span>
            ))}
          </span>
        )}
      </div>
      <PlannedAllocationTable {...props} />
      {(!teams.length || !projects.length) && (
        <p className="emptymsg">Bu filtrelere uygun takım veya proje yok.</p>
      )}
      {!!teams.length &&
        !!projects.length &&
        onlyDataRows &&
        !groups.length && (
          <p className="emptymsg">
            Seçili dönemde planlanan dağılımı olan satır yok. Bütün satırları
            görmek için “Sadece veri olanlar” anahtarını kapatın.
          </p>
        )}
      <footer className="tablefoot">
        <span>Birim: aylık kişi eşdeğeri · Ondalık giriş: 0,5</span>
        <span>
          Fareyle sürükleyerek aralık seçin; sağ tıkla kopyalayıp yapıştırın.
          Proje dönemi dışına giriş yapılamaz.
        </span>
      </footer>
    </section>
  );
}
