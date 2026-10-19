import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ArrowDownToLine, Lock, LockOpen } from "lucide-react";
import type { Principal } from "../../access";
import ProjectResponsible from "../../ProjectResponsible";
import type { Change } from "../../../../shared/commands";
import { monthLabel, fmt } from "../../format";
import { downloadProgressReport } from "./progress-export";
import {
  projectRows,
  pctLabel,
  type ProgressContext,
  type ProjectRow,
} from "./progress-view";
import {
  manageProject,
  STATE_HELP,
  STATE_LABELS,
  type ProgressState,
  transferComparisons,
  type ManagedProject,
} from "./progress-management";
import ProgressManagementMatrix from "./ProgressManagementMatrix";
import {
  managementSheets,
  managementExportRows,
} from "./progress-management-export";

type DecisionFilter =
  "" | "risk" | "ahead" | "behind" | "missing" | "donor" | "scenario";
const FILTER_LABELS: Record<DecisionFilter, string> = {
  "": "Tüm projeler",
  risk: "Gecikme / teslim riski",
  ahead: "Planın önünde",
  behind: "Planın gerisinde",
  missing: "Veri / plan eksik",
  donor: "Aktarım için incelenebilir",
  scenario: "Takvim / kaynak senaryosu",
};
const matches = (project: ManagedProject, filter: DecisionFilter) => {
  const { assessment: a } = project;
  if (filter === "risk") return a.risk === "red" || a.risk === "amber";
  if (filter === "ahead" || filter === "behind")
    return a.point.state === filter;
  if (filter === "missing")
    return ["missing", "unplanned", "unweighted"].includes(a.point.state);
  if (filter === "donor") return a.donor;
  if (filter === "scenario")
    return a.action === "Takvim / kaynak senaryosu değerlendir";
  return true;
};
const PAGE_SIZE = 10;

/** Project headings, leadership detail and monthly cumulative progress. */
export default function ProgressReport({
  ctx,
  responsibleFilter,
  user,
  month,
  currentMonth,
  saving,
  onSave,
  initialDetail = "",
}: {
  ctx: ProgressContext;
  responsibleFilter: ReactNode;
  user: Principal | null;
  month: string;
  currentMonth: string;
  saving: boolean;
  onSave: (changes: Change[]) => Promise<void>;
  initialDetail?: string;
}) {
  const { data } = ctx;
  const admin = user?.role === "admin";
  const [leader, setLeader] = useState("");
  const [projectId, setProjectId] = useState("");
  const [decision, setDecision] = useState<DecisionFilter>("");
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [detail, setDetail] = useState(initialDetail);
  const [year, setYear] = useState(month.slice(0, 4));
  const [page, setPage] = useState(0);
  const [error, setError] = useState("");
  useEffect(() => {
    setYear(month.slice(0, 4));
  }, [month]);
  useEffect(() => {
    if (initialDetail)
      document
        .getElementById("progress-detail")
        ?.scrollIntoView({ block: "start" });
  }, [initialDetail]);
  useEffect(() => {
    setPage(0);
  }, [ctx, month, leader, projectId, decision]);
  useEffect(() => {
    if (projectId && !data.projects.some((p) => p.id === projectId))
      setProjectId("");
  }, [data.projects, projectId]);
  const allRows = useMemo(
    () => projectRows(ctx, month, { includeUntracked: true }),
    [ctx, month],
  );
  const rows = useMemo(
    () =>
      projectRows(ctx, month, { leader, projectId, includeUntracked: true }),
    [ctx, month, leader, projectId],
  );
  const projects = useMemo(
    () =>
      rows
        .map((row) => manageProject(ctx, row, month))
        .sort((a, b) => {
          const order = (p: ManagedProject) =>
            p.assessment.risk === "red"
              ? 0
              : p.assessment.point.state === "behind"
                ? 1
                : p.assessment.risk === "amber"
                  ? 2
                  : ["missing", "unplanned"].includes(p.assessment.point.state)
                    ? 3
                    : 4;
          return (
            order(a) - order(b) ||
            (a.assessment.point.gap ?? 0) - (b.assessment.point.gap ?? 0) ||
            a.row.project.name.localeCompare(b.row.project.name, "tr")
          );
        }),
    [ctx, rows, month],
  );
  const filtered = useMemo(
    () => projects.filter((p) => matches(p, decision)),
    [projects, decision],
  );
  const comparisons = useMemo(() => transferComparisons(projects), [projects]);
  const monthColumns = useMemo(
    () =>
      Array.from(
        { length: 12 },
        (_, index) => `${year}-${String(index + 1).padStart(2, "0")}`,
      ),
    [year],
  );
  const years = useMemo(() => {
    const values = new Set([month.slice(0, 4), currentMonth.slice(0, 4)]);
    for (const row of allRows) {
      for (
        let y = Number(row.project.start.slice(0, 4));
        y <= Number(row.project.end.slice(0, 4));
        y++
      )
        values.add(String(y));
    }
    return [...values].sort();
  }, [allRows, month, currentMonth]);
  const leaderNames = [
    ...new Set(allRows.flatMap((r) => r.leaders.map((l) => l.record.leader))),
  ].sort((a, b) => a.localeCompare(b, "tr"));
  const count = (filter: DecisionFilter) =>
    projects.filter((p) => matches(p, filter)).length;
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const visible = filtered.slice(
    Math.min(page, pageCount - 1) * PAGE_SIZE,
    (Math.min(page, pageCount - 1) + 1) * PAGE_SIZE,
  );
  const lock = (data.progressLocks || []).find((item) => item.id === month);
  const detailRow = rows.find((row) => row.project.id === detail);

  async function toggleLock() {
    setError("");
    try {
      await onSave([
        {
          kind: "progressLock",
          id: month,
          value: lock ? null : { id: month, lockedByName: "", lockedAt: "" },
          revision: data.revisions["progressLock:" + month] || 0,
          ...(lock ? { operation: "delete" as const } : {}),
        },
      ]);
    } catch (cause) {
      setError((cause as Error).message);
    }
  }
  function exportReport() {
    try {
      downloadProgressReport(
        managementExportRows(filtered),
        month,
        monthLabel(month),
        managementSheets(ctx, filtered, month, monthColumns),
      );
      setError("");
    } catch (cause) {
      setError((cause as Error).message);
    }
  }
  return (
    <div className="progress-report">
      <header className="progress-management-head">
        <div>
          <h3>Proje ve Liderlik Bazında Aylık İlerleme</h3>
          <p>
            Değerlendirme: {monthLabel(month)} · Kümülatif tamamlanma yüzdeleri
            · {projects.length} proje /{" "}
            {projects.reduce((n, p) => n + p.row.leaders.length, 0)} liderlik
            kaydı
          </p>
        </div>
        <span className="progress-management-period">
          Aylık görünüm: {year}
        </span>
      </header>
      <div className="progress-filters">
        <label>
          Liderlik
          <select
            value={leader}
            onChange={(e) => {
              setLeader(e.target.value);
              setProjectId("");
            }}
          >
            <option value="">Tümü</option>
            {leaderNames.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>
        {responsibleFilter}
        <label>
          Proje
          <select
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
          >
            <option value="">Tümü</option>
            {allRows.map((r) => (
              <option key={r.project.id} value={r.project.id}>
                {r.project.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Değerlendirme
          <select
            value={decision}
            onChange={(e) => setDecision(e.target.value as DecisionFilter)}
          >
            {(Object.keys(FILTER_LABELS) as DecisionFilter[]).map((key) => (
              <option key={key} value={key}>
                {FILTER_LABELS[key]} ({count(key)})
              </option>
            ))}
          </select>
        </label>
        <label>
          Aylık görünüm yılı
          <select value={year} onChange={(e) => setYear(e.target.value)}>
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="button progress-lock-button"
          disabled={!filtered.length}
          onClick={exportReport}
        >
          <ArrowDownToLine size={14} />
          Excel’e Aktar
        </button>
        {admin && (
          <button
            type="button"
            className="button progress-lock-button"
            disabled={saving}
            onClick={() => void toggleLock()}
          >
            {lock ? <LockOpen size={14} /> : <Lock size={14} />}
            {monthLabel(month)} Ayını Değişikliğe {lock ? "Aç" : "Kapat"}
          </button>
        )}
      </div>
      {lock && (
        <p className="progress-locked">
          Ay kilidi ({monthLabel(month)}): Değişikliğe kapalı ·{" "}
          {lock.lockedByName}
        </p>
      )}
      {error && (
        <p role="alert" className="progress-error">
          {error}
        </p>
      )}
      <div className="progress-management-cards" aria-label="Yönetici özeti">
        {(
          [
            {
              filter: "risk",
              tone: "risk",
              label: "Gecikme / teslim riski",
              detail: "İlerleme veya kaynak riski sinyali",
            },
            {
              filter: "ahead",
              tone: "ahead",
              label: "Planın önünde",
              detail: "Gerçekleşen, hedefin üzerinde",
            },
            {
              filter: "donor",
              tone: "donor",
              label: "Aktarım için incelenebilir",
              detail: "En az 5 puan önde; kaynak incelemesine uygun",
            },
            {
              filter: "missing",
              tone: "missing",
              label: "Veri / plan eksik",
              detail: "Karşılaştırma için tamamlanmalı",
            },
          ] as const
        ).map((card) => (
          <button
            key={card.filter}
            type="button"
            data-tone={card.tone}
            aria-pressed={decision === card.filter}
            onClick={() =>
              setDecision(decision === card.filter ? "" : card.filter)
            }
          >
            <span>{card.label}</span>
            <strong>{count(card.filter)}</strong>
            <small>{card.detail}</small>
          </button>
        ))}
      </div>
      <details className="progress-process-help progress-report-help">
        <summary>Değerlendirme durumları ve riskler ne anlama geliyor?</summary>
        <p>
          Değerlendirme durumu seçili ayın hedef ve gerçekleşen ilerlemesine
          göre her ay yeniden hesaplanır. Örneğin hedef %60, gerçekleşen %50 ise
          proje 10 puan geridedir.
        </p>
        <dl className="progress-evaluation-definitions">
          {(Object.keys(STATE_LABELS) as ProgressState[]).map((state) => (
            <div key={state}>
              <dt>{STATE_LABELS[state]}</dt>
              <dd>{STATE_HELP[state]}</dd>
            </div>
          ))}
        </dl>
        <p>
          <strong>Yüksek risk:</strong> Gecikme veya kaynak sorunları için
          öncelikli inceleme gerekir. <strong>Risk izlenmeli:</strong> Planın
          gerisinde kalma, kapasite açığı veya kritik konu gibi uyarılar takip
          edilmelidir. Proje toplamı planın önünde olsa da bir liderlikteki
          sorun nedeniyle risk etiketi gösterilebilir. İlgili satırdaki “Riskin
          nedeni ve öneri” bağlantısı bu uyarının gerekçesini gösterir.
        </p>
        <p>
          Planlanan ve gerçekleşen yüzdeler işin tamamlanma payıdır. Fark =
          gerçekleşen − planlanan; birimi yüzde puandır. Pozitif fark planın
          önünde, negatif fark planın gerisinde ilerlemeyi gösterir. Kaynak
          değerleri ayrıca kişi-ay olarak verilir.
        </p>
        <p>
          Proje toplamları mevcut hesaplama ayarları ve planlanan kaynak
          dağılımına göre hesaplanır. Onaylı plan veya gerçekleşen girişi eksik
          liderlik varsa proje toplamında eksik gerçekleşen değer yerine “—”
          gösterilir. Gelecek ve takip öncesi aylar gerçekleşmiş kabul edilmez.
          Liderlik filtresi seçildiğinde proje toplamları bu kapsamı gösterir.
        </p>
        <p>
          Gerçekleşen / hedef oranı 0,80’in altında veya fark −15 puan ve
          altında ise yüksek risk; diğer negatif farklar ve kaynak / kritik konu
          sinyalleri izleme gerektirir. Liderliklerdeki riskler proje özetine
          taşınır. En az 5 puan önde, kaynak verisi mevcut, ek risk ve gelecek
          dönem kapasite açığı bulunmayan projeler aktarım için incelenebilir.
        </p>
        <p>
          En az 5 puan geride olup ilgili liderliklerinde sonraki 3 ayın
          tamamında kapasite açığı bulunan projeler için takvim / kaynak
          senaryosu önerilir. Proje öncelikleri, kritik teslimler ve takım
          yetkinlikleri yönetici değerlendirmesine eklenmelidir.
        </p>
      </details>
      {comparisons.length > 0 && (
        <section
          className="progress-transfer-review"
          aria-label="Kaynak aktarımı için karşılaştırma"
        >
          <h4>Kaynak aktarımı için karşılaştırma</h4>
          <p>
            Seçili proje ve liderlik kapsamında aynı liderlikteki projeler
            eşleştirilir. Kaynak miktarı ve takım yetkinliği ayrıca
            değerlendirilir.
          </p>
          <div>
            {comparisons.slice(0, 6).map((pair) => (
              <article
                key={`${pair.from.row.project.id}:${pair.to.row.project.id}:${pair.leader}`}
              >
                <strong>
                  {pair.from.row.project.name} → {pair.to.row.project.name}
                </strong>
                <span>{pair.leader}</span>
                <small>
                  Kaynak incelenecek proje: +{fmt(pair.fromGap)} puan · Destek
                  ihtiyacı: {fmt(pair.toGap)} puan
                </small>
                <small>
                  İlk projenin bu liderlikteki sonraki 3 ay tahsisi:{" "}
                  {fmt(pair.planned)} kişi-ay
                </small>
              </article>
            ))}
          </div>
        </section>
      )}
      <div className="progress-matrix-toolbar">
        <span>
          {filtered.length} proje · {year} aylık görünümü · Değerlendirme ayı:{" "}
          {monthLabel(month)}
        </span>
        <div>
          <button
            type="button"
            className="button"
            disabled={!visible.some((p) => !expanded.has(p.row.project.id))}
            onClick={() => {
              const next = new Set(expanded);
              visible.forEach((p) => next.add(p.row.project.id));
              setExpanded(next);
            }}
          >
            Liderlikleri Aç
          </button>
          <button
            type="button"
            className="button"
            disabled={!visible.some((p) => expanded.has(p.row.project.id))}
            onClick={() => {
              const next = new Set(expanded);
              visible.forEach((p) => next.delete(p.row.project.id));
              setExpanded(next);
            }}
          >
            Liderlikleri Kapat
          </button>
        </div>
      </div>
      {filtered.length ? (
        <ProgressManagementMatrix
          ctx={ctx}
          projects={visible}
          months={monthColumns}
          month={month}
          expanded={expanded}
          setExpanded={setExpanded}
          detail={detail}
          onDetail={setDetail}
        />
      ) : (
        <p className="emptymsg">Bu süzgeçlere uyan ilerleme kaydı yok.</p>
      )}
      {pageCount > 1 && (
        <div className="progress-report-pages">
          <button
            type="button"
            className="button"
            disabled={page === 0}
            onClick={() => setPage(page - 1)}
          >
            Önceki
          </button>
          <span>
            {Math.min(page, pageCount - 1) + 1} / {pageCount} · Sayfa başına{" "}
            {PAGE_SIZE} proje
          </span>
          <button
            type="button"
            className="button"
            disabled={page >= pageCount - 1}
            onClick={() => setPage(page + 1)}
          >
            Sonraki
          </button>
        </div>
      )}
      {detailRow && <ProjectDetail row={detailRow} />}
    </div>
  );
}

function ProjectDetail({ row }: { row: ProjectRow }) {
  const history = row.leaders
    .flatMap((l) =>
      Object.entries(l.record.actuals).map(([month, entry]) => ({
        month,
        leader: l.record.leader,
        ...entry,
      })),
    )
    .sort(
      (a, b) =>
        b.month.localeCompare(a.month) ||
        a.leader.localeCompare(b.leader, "tr"),
    );
  return (
    <section
      id="progress-detail"
      className="progress-detail"
      aria-label={row.project.name + " ayrıntısı"}
    >
      <h3>{row.project.name}</h3>
      <ProjectResponsible project={row.project} />
      <h4>Açıklama geçmişi</h4>
      {history.length ? (
        <table className="progress-table compact">
          <thead>
            <tr>
              <th>Ay</th>
              <th>Liderlik</th>
              <th className="num">Gerçekleşen %</th>
              <th>Açıklama</th>
              <th>Giren</th>
            </tr>
          </thead>
          <tbody>
            {history.map((h) => (
              <tr key={h.month + h.leader}>
                <td>{monthLabel(h.month)}</td>
                <td>{h.leader}</td>
                <td className="num">{pctLabel(h.pct)}</td>
                <td>{h.note}</td>
                <td>{h.byName || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="emptymsg">Henüz gerçekleşen girişi yok.</p>
      )}
    </section>
  );
}
