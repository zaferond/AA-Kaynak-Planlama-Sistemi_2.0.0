import { Switch } from "@/components/ui/switch";
import PlannedCapacitySummary from "./planned-allocation/PlannedCapacitySummary";
import PlannedAllocationTable from "./planned-allocation/PlannedAllocationTable";
import type { PlannedAllocationProps } from "./planned-allocation/types";
import { useViewportWorkspace } from "./workspace/useViewportWorkspace";
export default function PlannedAllocationPanel(props: PlannedAllocationProps) {
  const { teams, projects } = props;
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
      </div>
      <PlannedAllocationTable {...props} />
      {(!teams.length || !projects.length) && (
        <p className="emptymsg">Bu filtrelere uygun takım veya proje yok.</p>
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
