import {
  Copy,
  ClipboardPaste,
  Palette,
  PaintBucket,
  Square,
  SquareCheck,
} from "lucide-react";
import { milestoneRanges, rangeNotes } from "../../../shared/milestone-ranges";
import type { Data } from "../model";
import { phasePalette } from "../model";
import { phaseChipPalette } from "../phase-chip";
import { monthLabel } from "../format";
import type { useProjectMenus } from "./useProjectMenus";
type Props = {
  menus: ReturnType<typeof useProjectMenus>;
  data: Data | null;
  isAdmin: boolean;
  saving: boolean;
};
export default function ProjectContextMenus({
  menus,
  data,
  isAdmin,
  saving,
}: Props) {
  const {
    phaseGrid,
    menuRef,
    phaseMenu,
    setPhaseMenu,
    milestoneMenu,
    setMilestoneMenu,
    copiedPhase,
    copiedPhaseColor,
    copiedPhaseBundle,
    copyPhase,
    copyPhaseColor,
    copyPhaseBundle,
    pastePhase,
    pastePhaseColor,
    pastePhaseBundle,
    copyMilestoneColor,
    pasteMilestoneColor,
    toggleMilestoneReport,
  } = menus;
  const milestone = milestoneMenu?.project.milestones?.find(
    (item) => item.id === milestoneMenu.milestoneId,
  );
  const range =
    milestone && milestoneMenu
      ? milestoneRanges(milestone)[milestoneMenu.rangeIndex]
      : undefined;
  const notes = range ? rangeNotes(range) : [];
  return (
    <>
      <>
        {phaseMenu && (
          <>
            <div
              className="phase-menu-backdrop"
              aria-hidden="true"
              onClick={() => setPhaseMenu(null)}
              onContextMenu={(e) => {
                e.preventDefault();
                setPhaseMenu(null);
              }}
            />
            <div
              className="phase-menu"
              role="menu"
              aria-label="Aşama metni ve renk işlemleri"
              tabIndex={-1}
              ref={menuRef}
              style={{ left: phaseMenu.x, top: phaseMenu.y }}
            >
              <div className="phase-menu-title">
                {phaseGrid.menuSelection(
                  phaseGrid.key(phaseMenu.projectId, phaseMenu.month),
                ).length > 1 ? (
                  phaseGrid.menuSelection(
                    phaseGrid.key(phaseMenu.projectId, phaseMenu.month),
                  ).length + " aşama hücresi"
                ) : (
                  <>
                    {
                      data?.projects.find((p) => p.id === phaseMenu.projectId)
                        ?.name
                    }{" "}
                    · {monthLabel(phaseMenu.month)}
                  </>
                )}
              </div>
              <button type="button" role="menuitem" onClick={copyPhase}>
                <Copy size={15} />
                Metni Kopyala
              </button>
              {isAdmin && (
                <button
                  type="button"
                  role="menuitem"
                  disabled={copiedPhase === null || saving}
                  onClick={pastePhase}
                >
                  <ClipboardPaste size={15} />
                  Metni Yapıştır
                </button>
              )}
              <div className="phase-menu-divider" role="separator" />
              <button type="button" role="menuitem" onClick={copyPhaseColor}>
                <Palette size={15} />
                Rengi Kopyala
              </button>
              {isAdmin && (
                <button
                  type="button"
                  role="menuitem"
                  disabled={!phaseGrid.clipboards.color || saving}
                  onClick={pastePhaseColor}
                >
                  <PaintBucket size={15} />
                  Rengi Yapıştır
                  {copiedPhaseColor && (
                    <span
                      className="phase-color-swatch"
                      style={{
                        background: phaseChipPalette.find(
                          (c) => c.id === copiedPhaseColor,
                        )?.border,
                        borderColor: phaseChipPalette.find(
                          (c) => c.id === copiedPhaseColor,
                        )?.border,
                      }}
                    />
                  )}
                </button>
              )}
              <div className="phase-menu-divider" role="separator" />
              <button type="button" role="menuitem" onClick={copyPhaseBundle}>
                <Copy size={15} />
                Metin ve Rengi Kopyala
              </button>
              {isAdmin && (
                <button
                  type="button"
                  role="menuitem"
                  disabled={copiedPhaseBundle === null || saving}
                  onClick={pastePhaseBundle}
                >
                  <ClipboardPaste size={15} />
                  Metin ve Rengi Yapıştır
                  {copiedPhaseBundle && (
                    <span
                      className="phase-color-swatch"
                      style={{
                        background: phaseChipPalette.find(
                          (c) => c.id === copiedPhaseBundle.values[0][0].color,
                        )?.border,
                        borderColor: phaseChipPalette.find(
                          (c) => c.id === copiedPhaseBundle.values[0][0].color,
                        )?.border,
                      }}
                    />
                  )}
                </button>
              )}
            </div>
          </>
        )}
      </>
      <>
        {milestoneMenu && (
          <>
            <div
              className="phase-menu-backdrop"
              aria-hidden="true"
              onClick={() => setMilestoneMenu(null)}
              onContextMenu={(e) => {
                e.preventDefault();
                setMilestoneMenu(null);
              }}
            />
            <div
              className="phase-menu milestone-report-menu"
              role="menu"
              aria-label="Bar ve Milestone işlemleri"
              tabIndex={-1}
              ref={menuRef}
              style={{ left: milestoneMenu.x, top: milestoneMenu.y }}
            >
              <div className="phase-menu-title">{milestone?.name}</div>
              <div className="milestone-report-heading">Rapor Durumu</div>
              <div className="milestone-report-items">
                {notes.length ? (
                  notes.map((note, index) => (
                    <button
                      key={index}
                      type="button"
                      role="menuitemcheckbox"
                      aria-checked={note.includeInReport}
                      aria-label={
                        (note.includeInReport
                          ? "Rapordan çıkar: "
                          : "Rapora ekle: ") + note.text
                      }
                      className="milestone-report-item"
                      disabled={
                        !isAdmin ||
                        saving ||
                        (!note.includeInReport && !note.text.trim())
                      }
                      onClick={() =>
                        toggleMilestoneReport(index, !note.includeInReport)
                      }
                    >
                      {note.includeInReport ? (
                        <SquareCheck size={18} className="report-checked" />
                      ) : (
                        <Square size={18} />
                      )}
                      <span className="milestone-report-note">
                        <span>{note.text || "(Boş detay not)"}</span>
                        <small
                          className={
                            note.includeInReport
                              ? "report-included"
                              : "report-excluded"
                          }
                        >
                          {note.includeInReport
                            ? "Rapora Ekli"
                            : "Rapora Ekli Değil"}
                        </small>
                      </span>
                    </button>
                  ))
                ) : (
                  <div className="milestone-report-empty">
                    Rapora eklenebilecek detay not yok.
                  </div>
                )}
              </div>
              <div className="phase-menu-divider" role="separator" />
              <button
                type="button"
                role="menuitem"
                onClick={copyMilestoneColor}
              >
                <Palette size={15} />
                Rengi Kopyala
              </button>
              {isAdmin && (
                <button
                  type="button"
                  role="menuitem"
                  disabled={copiedPhaseColor === null || saving}
                  onClick={pasteMilestoneColor}
                >
                  <PaintBucket size={15} />
                  Rengi Yapıştır
                  {copiedPhaseColor && (
                    <span
                      className="phase-color-swatch"
                      style={{
                        background: phasePalette.find(
                          (c) => c.id === copiedPhaseColor,
                        )?.bg,
                        borderColor: phasePalette.find(
                          (c) => c.id === copiedPhaseColor,
                        )?.border,
                      }}
                    />
                  )}
                </button>
              )}
            </div>
          </>
        )}
      </>
    </>
  );
}
