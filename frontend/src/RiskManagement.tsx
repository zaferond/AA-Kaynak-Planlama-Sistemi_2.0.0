import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
  type SetStateAction,
} from "react";
import { Plus, ShieldAlert, Download, ChevronDown, Layers } from "lucide-react";
import RiskSystemDialog from "./features/risk-table/RiskSystemDialog";
import { useDirectoryEditor } from "./features/team-directory/useDirectoryEditor";
import type { Data, Risk } from "./model";
import type { Principal } from "./access";
import { riskAssessment } from "./risk-score";
import { riskCreationOrder } from "./risk-order";
import RiskTable, { type RiskLeaveGuard } from "./RiskTable";
import { downloadRiskPlans } from "./risk-export";
import "./risk.css";
import { readLocal } from "./storage";

const likelihoodNames = [
  "Çok Küçük",
  "Küçük",
  "Orta Derece",
  "Yüksek",
  "Çok Yüksek",
];
const impactNames = ["Çok Hafif", "Hafif", "Orta Derece", "Ciddi", "Çok Ciddi"];
const today = () =>
  new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Istanbul" });
function blank(projectId: string, user: Principal): Risk {
  return {
    id: crypto.randomUUID(),
    projectId,
    reportedBy: user.name,
    category: "Teknik",
    reportedAt: today(),
    system: "",
    description: "",
    cause: "",
    actionPlan: "",
    targetAt: "",
    status: "Açık",
    owner: "",
    likelihood: 0,
    impact: 0,
    strategy: "",
    implementedAt: "",
    actionResult: "",
    residualLikelihood: null,
    residualImpact: null,
    createdBy: user.id,
    createdByName: user.name,
    createdAt: "",
    updatedAt: "",
  };
}
function Score({
  likelihood,
  impact,
}: {
  likelihood: number | null;
  impact: number | null;
}) {
  const result = riskAssessment(likelihood, impact);
  return result ? (
    <span className={"risk-score risk-" + result.className}>
      <strong>{result.score}</strong>
      <small>{result.level}</small>
    </span>
  ) : (
    <span className="risk-score risk-empty">Değerlendirilmedi</span>
  );
}
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="risk-field">
      <span>{label}</span>
      {children}
    </label>
  );
}
export default function RiskManagement({
  data,
  leaveGuardRef,
  user,
  onEditingChange,
  onReload,
  onSave,
  onDelete,
  onCatalogSaved,
  onDirectoryEditingChange,
}: {
  leaveGuardRef: RefObject<RiskLeaveGuard | null>;
  data: Data;
  user: Principal;
  onEditingChange: (editing: boolean) => void;
  onReload: () => Promise<Data>;
  onSave: (risk: Risk, revision: number) => Promise<void>;
  onDelete: (risk: Risk, revision: number) => Promise<void>;
  onCatalogSaved: (data: Data, message: string) => void;
  onDirectoryEditingChange: (editing: boolean) => void;
}) {
  const [selection, setSelection] = useState<string[] | "all">([]),
    [projectMenuOpen, setProjectMenuOpen] = useState(false),
    [newRiskProjectId, setNewRiskProjectId] = useState(""),
    [createSignal, setCreateSignal] = useState(0),
    [exportError, setExportError] = useState(""),
    [exporting, setExporting] = useState(false),
    [editing, setEditing] = useState(false);
  const systemEditor = useDirectoryEditor({
    data,
    onSaved: onCatalogSaved,
    onEditingChange: onDirectoryEditingChange,
  });
  async function openSystemEditor() {
    if (leaveGuardRef.current && !(await leaveGuardRef.current())) return;
    systemEditor.open("riskSystem");
  }
  const reportEditing = useCallback(
    (editing: boolean) => {
      setEditing(editing);
      onEditingChange(editing);
    },
    [onEditingChange],
  );
  const pickerRef = useRef<HTMLDivElement>(null);
  const selectedProjectIds =
    selection === "all"
      ? data.projects.map((project) => project.id)
      : selection.filter((id) =>
          data.projects.some((project) => project.id === id),
        );
  const selectedProjects = data.projects.filter((project) =>
    selectedProjectIds.includes(project.id),
  );
  const allSelected =
    data.projects.length > 0 &&
    selectedProjects.length === data.projects.length;
  const createProjectId =
    selectedProjects.length === 1
      ? selectedProjects[0].id
      : selectedProjectIds.includes(newRiskProjectId)
        ? newRiskProjectId
        : "";
  const projectNames = Object.fromEntries(
    data.projects.map((project) => [project.id, project.name]),
  );
  const risks = riskCreationOrder(
    (data.risks || []).filter((item) =>
      selectedProjectIds.includes(item.projectId),
    ),
  );
  useEffect(() => {
    if (!projectMenuOpen) return;
    const close = (event: PointerEvent) => {
      if (!pickerRef.current?.contains(event.target as Node))
        setProjectMenuOpen(false);
    };
    const escape = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") setProjectMenuOpen(false);
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", escape);
    };
  }, [projectMenuOpen]);
  async function changeProjects(next: SetStateAction<string[] | "all">) {
    if (leaveGuardRef.current && !(await leaveGuardRef.current())) return;
    setSelection(next);
    setExportError("");
  }
  function toggleProject(id: string) {
    void changeProjects((selection) => {
      const current =
        selection === "all"
          ? data.projects.map((project) => project.id)
          : selection;
      const next = current.includes(id)
        ? current.filter((value) => value !== id)
        : [...current, id];
      return next.length === data.projects.length ? "all" : next;
    });
  }
  async function exportRisks() {
    if (exporting) return;
    setExporting(true);
    try {
      if (leaveGuardRef.current && !(await leaveGuardRef.current())) return;
      // A save updates React asynchronously; export its committed snapshot, not this click's old props.
      const latest = await readLocal();
      const projects = latest.projects.filter((project) =>
        selectedProjectIds.includes(project.id),
      );
      const risks = riskCreationOrder(
        (latest.risks || []).filter((risk) =>
          selectedProjectIds.includes(risk.projectId),
        ),
      );
      downloadRiskPlans(projects, risks);
      setExportError("");
    } catch (e) {
      setExportError((e as Error).message);
    } finally {
      setExporting(false);
    }
  }
  const canEdit = (risk: Risk) =>
    user.role === "admin" ||
    user.role === "manager" ||
    risk.createdBy === user.id;
  const riskCount = risks.filter((r) => r.status !== "Kapalı").length;
  const highCount = risks.filter(
    (r) =>
      r.status !== "Kapalı" &&
      (riskAssessment(r.likelihood, r.impact)?.score || 0) >= 15,
  ).length;
  const lateCount = risks.filter(
    (r) => r.status !== "Kapalı" && r.targetAt && r.targetAt < today(),
  ).length;
  return (
    <section className="risk-workspace panel">
      <RiskSystemDialog data={data} editor={systemEditor} />
      <div className="risk-header">
        <div className="risk-toolbar">
          <div className="risk-field risk-project-field">
            <span>Proje seçimi</span>
            <div
              className="risk-project-picker"
              ref={pickerRef}
              data-risk-project-control
            >
              <button
                type="button"
                className="risk-project-toggle"
                aria-label="Risk projeleri"
                aria-expanded={projectMenuOpen}
                aria-controls="risk-project-menu"
                onClick={() => setProjectMenuOpen((open) => !open)}
              >
                <span>
                  {selectedProjects.length === 0
                    ? "Proje seçin"
                    : allSelected
                      ? "Tüm Projeler"
                      : selectedProjects.length === 1
                        ? selectedProjects[0].name
                        : `${selectedProjects.length} proje seçildi`}
                </span>
                <ChevronDown size={16} />
              </button>
              {projectMenuOpen && (
                <div className="risk-project-menu" id="risk-project-menu">
                  <label className="risk-project-option risk-project-all">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={(event) => {
                        void changeProjects(event.target.checked ? "all" : []);
                      }}
                    />
                    Tüm Projeler
                  </label>
                  <div className="risk-project-options">
                    {data.projects.map((project) => (
                      <label key={project.id} className="risk-project-option">
                        <input
                          type="checkbox"
                          checked={selectedProjectIds.includes(project.id)}
                          onChange={() => toggleProject(project.id)}
                        />
                        {project.name}
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
          {selectedProjects.length > 1 && (
            <Field label="Yeni riskin projesi">
              <select
                aria-label="Yeni riskin projesi"
                value={createProjectId}
                onChange={(event) => setNewRiskProjectId(event.target.value)}
              >
                <option value="">Proje seçin</option>
                {selectedProjects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
            </Field>
          )}
          <button
            type="button"
            className="button risk-export-button"
            data-risk-leave
            disabled={exporting || selectedProjects.length === 0}
            onClick={() => void exportRisks()}
          >
            <Download size={16} />
            Excel'e Aktar
          </button>
          <button
            type="button"
            className="button primary"
            data-risk-add
            disabled={!createProjectId}
            onClick={() => setCreateSignal((value) => value + 1)}
          >
            <Plus size={16} />
            Risk Ekle
          </button>
          {user.role === "admin" && (
            <button
              type="button"
              className="button"
              data-risk-leave
              onClick={() => void openSystemEditor()}
            >
              <Layers size={16} /> Sistem / Alt Sistem Ekle
            </button>
          )}
        </div>
      </div>
      {selectedProjects.length === 0 && !editing ? (
        <div className="risk-placeholder">
          <ShieldAlert size={32} />
          <strong>Risk planını açmak için proje seçin</strong>
          <span>Birden fazla proje veya Tüm Projeler seçilebilir.</span>
        </div>
      ) : (
        <>
          <div className="risk-summary">
            <div>
              <small>TOPLAM RİSK</small>
              <strong>{risks.length}</strong>
            </div>
            <div>
              <small>AÇIK / TAKİPTE</small>
              <strong>{riskCount}</strong>
            </div>
            <div>
              <small>YÜKSEK / TOLERE EDİLEMEZ</small>
              <strong>{highCount}</strong>
            </div>
            <div>
              <small>HEDEF TARİHİ GEÇEN</small>
              <strong>{lateCount}</strong>
            </div>
          </div>
          {exportError && (
            <div className="risk-export-error" role="alert">
              {exportError}
            </div>
          )}
          <RiskTable
            leaveGuardRef={leaveGuardRef}
            risks={risks}
            systems={(data.riskSystems || [])
              .slice()
              .sort((a, b) => a.name.localeCompare(b.name, "tr"))}
            revisions={data.revisions}
            onEditingChange={reportEditing}
            onReload={onReload}
            selectedProjectIds={selectedProjectIds}
            projectNames={projectNames}
            createSignal={createSignal}
            createRisk={() => blank(createProjectId, user)}
            canEdit={canEdit}
            canDelete={user.role !== "normal"}
            onSave={onSave}
            onDelete={onDelete}
          />
          <details className="risk-matrix-panel">
            <summary>Etki–olasılık matrisini göster</summary>
            <div className="risk-matrix-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Olasılık / Etki</th>
                    {impactNames.map((name, i) => (
                      <th key={name}>
                        {i + 1} · {name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {likelihoodNames.map((name, i) => (
                    <tr key={name}>
                      <th>
                        {i + 1} · {name}
                      </th>
                      {impactNames.map((_, j) => (
                        <td key={j}>
                          <Score likelihood={i + 1} impact={j + 1} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
          <div className="risk-legend">
            <span>Risk matrisi: Olasılık × Etki</span>
            <Score likelihood={1} impact={1} />
            <Score likelihood={1} impact={2} />
            <Score likelihood={2} impact={4} />
            <Score likelihood={3} impact={5} />
            <Score likelihood={5} impact={5} />
          </div>
        </>
      )}
    </section>
  );
}
