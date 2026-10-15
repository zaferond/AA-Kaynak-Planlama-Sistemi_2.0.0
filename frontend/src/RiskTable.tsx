import { X } from "lucide-react";
import RiskValue from "./features/risk-table/RiskValue";
import RiskCellEditor from "./features/risk-table/RiskCellEditor";
import {
  riskColumns,
  riskColumnGroups,
  visibleRiskColumns,
} from "./features/risk-table/columns";
import { useRiskDraft } from "./features/risk-table/useRiskDraft";
import {
  useRiskTableViewport,
  useRiskTableInteraction,
} from "./features/risk-table/useRiskTableInteraction";
import type { RiskTableProps } from "./features/risk-table/types";
export type { RiskLeaveGuard } from "./features/risk-table/types";

export default function RiskTable(props: RiskTableProps) {
  const { risks, selectedProjectIds, projectNames, canEdit, canDelete } = props;
  const { scrollRef, revealNewRow } = useRiskTableViewport();
  const controls = useRiskDraft(props, revealNewRow);
  const {
    draft,
    isNew,
    saving,
    error,
    conflict,
    uncertain,
    inspectOutcome,
    update,
    activate,
    cancel,
    reload,
    remove,
  } = controls;
  const { onRowKeyDown } = useRiskTableInteraction(controls);
  const visibleColumns = visibleRiskColumns(selectedProjectIds.length > 1);
  const width = visibleColumns.reduce(
    (total, column) => total + column.width,
    0,
  );
  // Remotely removed records keep their draft visible until resolved or cancelled.
  const rows =
    draft && !risks.some((risk) => risk.id === draft.id)
      ? [...risks, draft]
      : risks;
  return (
    <div className="risk-register">
      <div className="risk-register-head">
        <div className="risk-register-title">
          <h3>Risk Kayıtları</h3>
          <span>
            {risks.length} kayıt · {riskColumns.length} plan alanı
            {isNew ? " · Yeni risk ekleniyor" : ""}
          </span>
        </div>
        <div className="risk-register-actions">
          <span className="risk-scroll-hint" role="status">
            {saving
              ? "Kaydediliyor…"
              : uncertain
                ? "Sonuç belirsiz · Düzenlemeleriniz korunuyor"
                : conflict
                  ? "Çakışma var · Düzenlemeleriniz korunuyor"
                  : draft
                    ? "Enter veya satır dışına tıklayarak kaydı onaylayın · Shift+Enter yeni satır · Esc iptal"
                    : "Düzenlemek için hücreye tıklayın · Tüm sütunlar yatay kaydırılabilir"}
          </span>
        </div>
      </div>
      {error && (
        <div className="risk-inline-error" role="alert">
          <span>
            {error}
            {conflict
              ? " Düzenlemeleriniz korunuyor; güncel kaydı yükleyin veya düzenlemeyi iptal edin."
              : ""}
          </span>
          {uncertain && (
            <div className="risk-conflict-actions" data-risk-cancel>
              <button
                type="button"
                className="risk-row-cancel"
                disabled={saving}
                onClick={() => void inspectOutcome()}
              >
                Sunucu Kaydını Kontrol Et
              </button>
              <button
                type="button"
                className="risk-row-cancel"
                disabled={saving}
                onClick={cancel}
              >
                Düzenlemeyi İptal Et
              </button>
            </div>
          )}
          {conflict && !uncertain && (
            <div className="risk-conflict-actions" data-risk-cancel>
              <button
                type="button"
                className="risk-row-cancel"
                disabled={saving}
                onClick={() => void reload()}
              >
                Güncel Kaydı Yükle
              </button>
              <button
                type="button"
                className="risk-row-cancel"
                disabled={saving}
                onClick={cancel}
              >
                Düzenlemeyi İptal Et
              </button>
            </div>
          )}
        </div>
      )}
      <div
        className="risk-table-scroll"
        ref={scrollRef}
        role="region"
        aria-label="Proje risk planı tablosu"
        tabIndex={0}
      >
        <table className="risk-table" style={{ width }}>
          <colgroup>
            {visibleColumns.map((column) => (
              <col key={column.key} style={{ width: column.width }} />
            ))}
          </colgroup>
          <thead>
            <tr className="risk-group-head">
              {riskColumnGroups.map((group) => (
                <th
                  key={group.key}
                  colSpan={
                    visibleColumns.filter(
                      (column) => column.group === group.key,
                    ).length
                  }
                >
                  {group.label}
                </th>
              ))}
            </tr>
            <tr className="risk-column-head">
              {visibleColumns.map((column) => (
                <th
                  key={column.key}
                  className={
                    "risk-head-" +
                    column.group +
                    (column.center ? " risk-center" : "")
                  }
                >
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length ? (
              rows.map((risk, index) => {
                const editing = draft?.id === risk.id,
                  display = editing ? draft : risk,
                  editable = (isNew && editing) || canEdit(risk);
                return (
                  <tr
                    key={risk.id}
                    data-risk-id={risk.id}
                    data-risk-editable={editable}
                    className={[
                      editing ? "risk-editing-row" : "",
                      isNew && editing ? "risk-new-row" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    onKeyDown={editing ? onRowKeyDown : undefined}
                    onClick={
                      !editing && editable
                        ? (event) => {
                            const key =
                              (
                                event.target as HTMLElement
                              ).closest<HTMLTableCellElement>(
                                "td[data-risk-column]",
                              )?.dataset.riskColumn || "description";
                            void activate(risk, key);
                          }
                        : undefined
                    }
                  >
                    {visibleColumns.map((column) => (
                      <td
                        key={column.key}
                        data-risk-column={column.key}
                        className={[
                          "risk-cell",
                          "risk-cell-" + column.group,
                          column.text ? "risk-text-cell" : "",
                          column.center ? "risk-center" : "",
                          column.key === "score" ||
                          column.key === "level" ||
                          column.key === "residualScore" ||
                          column.key === "residualLevel"
                            ? "risk-assessment-cell"
                            : "",
                          editing ? "risk-cell-editing" : "",
                        ]
                          .filter(Boolean)
                          .join(" ")}
                      >
                        {column.key === "project" ? (
                          <span className="risk-project-name">
                            {projectNames[risk.projectId] || "—"}
                          </span>
                        ) : editing ? (
                          <RiskCellEditor
                            column={column}
                            risk={display}
                            systems={props.systems}
                            index={index}
                            saving={saving}
                            isNew={isNew}
                            canDelete={canDelete}
                            conflict={conflict || uncertain}
                            update={update}
                            remove={remove}
                          />
                        ) : editable ? (
                          <button
                            type="button"
                            className="risk-cell-trigger"
                            title="Satırda düzenle"
                            aria-label={
                              column.label + " alanını satırda düzenle"
                            }
                            disabled={saving}
                          >
                            <RiskValue
                              risk={risk}
                              column={column}
                              index={index}
                            />
                          </button>
                        ) : (
                          <RiskValue
                            risk={risk}
                            column={column}
                            index={index}
                          />
                        )}
                      </td>
                    ))}
                  </tr>
                );
              })
            ) : (
              <tr className="risk-empty-row">
                <td colSpan={visibleColumns.length}>
                  Seçili projelerde henüz risk kaydı yok. İlk kaydı oluşturmak
                  için Risk Ekle’yi kullanın.
                </td>
              </tr>
            )}
            {isNew && draft && (
              <tr className="risk-new-actions-row">
                <td colSpan={visibleColumns.length}>
                  <button
                    type="button"
                    className="risk-row-cancel"
                    data-risk-cancel
                    disabled={saving}
                    onClick={cancel}
                  >
                    <X size={15} aria-hidden="true" />
                    Vazgeç
                  </button>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
