import {
  assertResourceRole,
  assertUniqueResourceResponsibilities,
} from "./resource-roles.ts";
import type { Data } from "./model.ts";
import { invalidSnapshot as bad } from "./snapshot-validation-error.ts";
import type { Version } from "./model.ts";
import {
  assertResourceDates,
  unchangedLegacyPeriod,
} from "./resource-policy.ts";
import { normalizeResourceDate } from "./resource-dates.ts";
import {
  assertMilestoneBarSeparation,
  assertPointRange,
} from "./milestone-ranges.ts";

/** Normalize only the parsed copy, retaining legacy-period and departure rules. */
export function normalizeSnapshotResources(
  d: Data,
  teamIds: ReadonlySet<string>,
  previous: ReadonlyMap<string, ReadonlyMap<string, Version>>,
) {
  for (const r of d.resources) {
    if (new Set(r.versions.map((v) => v.effective)).size !== r.versions.length)
      throw bad("Aynı ay için birden fazla kaynak değişikliği kaydedilemez.");
    for (const v of r.versions) {
      v.start = normalizeResourceDate(v.start, "start");
      v.end = normalizeResourceDate(v.end, "end");
      if (v.team && !teamIds.has(v.team)) throw bad("Takım bulunamadı.");
      if (v.assignmentRole && v.assignmentRole !== "leader" && !v.lead)
        v.lead = d.teams.find((team) => team.id === v.team)?.lead || "";
      try {
        assertResourceRole(d, v);
        assertResourceDates(
          v,
          unchangedLegacyPeriod(v, previous.get(r.id)?.get(v.effective)),
        );
      } catch (error) {
        throw bad((error as Error).message);
      }
    }
    for (const departure of r.versions.filter(
      (v) => v.status === "İşten Ayrıldı",
    ))
      for (const v of r.versions)
        if (
          v.effective <= departure.effective &&
          (!v.end || v.end > departure.end)
        ) {
          v.end = departure.end;
          if (v.start && v.end < v.start)
            throw bad(
              "İşten ayrılış tarihi önceki çalışma döneminden önce olamaz.",
            );
        }
  }
  assertUniqueResourceResponsibilities(d, previous);
}

export function validateSnapshotProjects(d: Data) {
  for (const p of d.projects) {
    if (p.start > p.end) throw bad("Projenin bitişi başlangıçtan önce olamaz.");
    const milestones = p.milestones || [];
    if (new Set(milestones.map((m) => m.id)).size !== milestones.length)
      throw bad("Aynı kilometre taşı kimliği iki kez kullanılamaz.");
    for (const m of milestones) {
      if (m.hasCriticalTopics === false) {
        if (
          m.displayKind === "milestone" ||
          m.additionalRanges?.length ||
          m.barNotes?.length ||
          m.barText?.trim()
        )
          throw bad("Kritik konusu olmayan bilgi açıklama içeremez.");
        continue;
      }
      const ranges = [
        {
          start: m.start,
          end: m.end,
          notes: m.barNotes,
          displayKind: m.displayKind,
          description:
            m.barText || (m.displayKind === "milestone" ? m.name : ""),
        },
        ...(m.additionalRanges || []),
      ].sort((a, b) => a.start.localeCompare(b.start));
      for (const range of ranges) {
        try {
          assertPointRange(range);
        } catch (error) {
          throw bad((error as Error).message);
        }
        if (
          range.start > range.end ||
          range.start < p.start + "-01" ||
          range.end.slice(0, 7) > p.end
        )
          throw bad("Kilometre taşı proje dönemi içinde olmalı.");
        for (const note of range.notes || []) {
          const noteStart = note.start ?? range.start,
            noteEnd = note.end ?? range.end;
          if (
            noteStart > noteEnd ||
            noteStart < p.start + "-01" ||
            noteEnd.slice(0, 7) > p.end
          )
            throw bad(
              "Açıklama tarihleri geçerli sırada ve proje dönemi içinde olmalı.",
            );
        }
      }
      try {
        assertMilestoneBarSeparation(ranges);
      } catch (error) {
        throw bad((error as Error).message);
      }
    }
  }
}
