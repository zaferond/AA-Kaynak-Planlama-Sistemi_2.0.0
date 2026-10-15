import { requiresResourceStart } from "./resource-policy.ts";
import { ownValue } from "./records.ts";
import { validPlanningMonth, validPlanningDate } from "./planning-dates.ts";
import { fold, statuses, isWorkingStatus } from "./model.ts";
import {
  currentPlanningMonth,
  currentYearStartDate,
  monthEndDate,
} from "./resource-dates.ts";
import type { Data, Resource } from "./model.ts";
import type { ExcelRow } from "./import-types.ts";
export const importColumns = [
  ["name", "Ad Soyad"],
  ["lead", "Liderlik"],
  ["team", "Takım"],
  ["status", "Statü"],
  ["included", "Dahil"],
  ["amount", "Kişi Eşdeğeri"],
  ["start", "İşbaşı Tarihi"],
  ["end", "İşten Ayrılış Tarihi"],
  ["note", "İK Notu"],
] as const;
export type ImportField = (typeof importColumns)[number][0] | "effective";
export type ImportRow = {
  row: number;
  values: Partial<Record<ImportField, string | number | boolean>>;
  problems: string[];
  date1904: boolean;
};
export type PreviewRow = {
  source: ImportRow;
  state: "ready" | "duplicate" | "error";
  errors: string[];
  resource?: Resource;
  teamName: string;
  lead: string;
};
const clean = (x: unknown) => String(x ?? "").trim();
const norm = (x: unknown) => fold(clean(x)).replace(/[^a-z0-9]/g, "");
const aliases: Record<string, ImportField> = {
  adkadro: "name",
  adsoyad: "name",
  calisanadi: "name",
  ad: "name",
  liderlikadi: "lead",
  takimadi: "team",
  statu: "status",
  kaynakplanlamasinadahil: "included",
  dahilmi: "included",
  gecerliliktarihi: "effective",
  gecerliliktarih: "effective",
  kisieşdegeri: "amount",
  miktar: "amount",
  baslangic: "start",
  baslangicayi: "start",
  bitis: "end",
  bitisayi: "end",
  sondahilolunanay: "end",
  not: "note",
};
export function sourceRows(rows: ExcelRow[], date1904 = false): ImportRow[] {
  if (rows.length < 2)
    throw Error("Başlık ve en az bir veri satırı bulunmalı.");
  const cols = new Map<ImportField, number>();
  rows[0].cells.forEach((c, i) => {
    if (!c) return;
    const key = norm(c.value);
    const f =
      importColumns.find(([, label]) => norm(label) === key)?.[0] ||
      ownValue(aliases, key);
    if (f) {
      if (cols.has(f)) throw Error("Tekrarlanan sütun: " + c.value);
      cols.set(f, i);
    }
  });
  for (const f of [
    "name",
    "lead",
    "team",
    "status",
    "included",
    "amount",
    "start",
  ] as ImportField[])
    if (!cols.has(f))
      throw Error("Eksik sütun: " + importColumns.find((c) => c[0] === f)![1]);
  return rows
    .slice(1)
    .map((row) => {
      const values: ImportRow["values"] = {},
        problems: string[] = [];
      for (const [f, c] of cols) {
        const cell = row.cells[c];
        values[f] = cell?.value ?? "";
        if (cell?.formula)
          problems.push(
            (importColumns.find((c) => c[0] === f)?.[1] ||
              "Eski geçerlilik ayı") + ": formül yerine değeri yapıştırın.",
          );
        if (cell?.error) problems.push("Excel hata hücresi var.");
      }
      return { row: row.number, values, problems, date1904 };
    })
    .filter((r) => Object.values(r.values).some((v) => clean(v) !== ""));
}
function month(x: unknown, required: boolean, date1904: boolean) {
  if (clean(x) === "") {
    if (required) throw Error("zorunludur.");
    return "";
  }
  let value = clean(x);
  if (typeof x === "number") {
    if (!Number.isFinite(x) || x < 1 || x > 110000)
      throw Error("geçersiz Excel tarihi.");
    const base = date1904 ? Date.UTC(1904, 0, 1) : Date.UTC(1899, 11, 30);
    value = new Date(base + Math.floor(x) * 86400000).toISOString().slice(0, 7);
  } else if (/^\d{4}-\d{2}-\d{2}(T.*)?$/.test(value)) {
    const check = new Date(value.slice(0, 10) + "T12:00:00Z");
    if (
      !Number.isFinite(check.getTime()) ||
      check.toISOString().slice(0, 10) !== value.slice(0, 10)
    )
      throw Error("geçersiz tarih.");
    value = value.slice(0, 7);
  } else if (/^\d{1,2}[./]\d{4}$/.test(value)) {
    const [m, y] = value.split(/[./]/);
    value = y + "-" + m.padStart(2, "0");
  } else if (/^\d{1,2}[./]\d{1,2}[./]\d{4}$/.test(value)) {
    const [day, m, y] = value.split(/[./]/);
    const dayString = y + "-" + m.padStart(2, "0") + "-" + day.padStart(2, "0"),
      d = new Date(dayString + "T12:00:00Z");
    if (
      !Number.isFinite(d.getTime()) ||
      d.toISOString().slice(0, 10) !== dayString
    )
      throw Error("geçersiz tarih.");
    value = dayString.slice(0, 7);
  }
  if (!validPlanningMonth(value))
    throw Error("YYYY-AA biçiminde ay veya Excel tarihi girin.");
  return value;
}
function employmentDate(
  x: unknown,
  edge: "start" | "end",
  required: boolean,
  date1904: boolean,
) {
  if (clean(x) === "") {
    if (required) throw Error("zorunludur.");
    return "";
  }
  let value = clean(x);
  if (typeof x === "number") {
    if (!Number.isFinite(x) || x < 1 || x > 110000)
      throw Error("geçersiz Excel tarihi.");
    const base = date1904 ? Date.UTC(1904, 0, 1) : Date.UTC(1899, 11, 30);
    value = new Date(base + Math.floor(x) * 86400000)
      .toISOString()
      .slice(0, 10);
  } else if (/^\d{1,2}[./]\d{1,2}[./]\d{4}$/.test(value)) {
    const [d, m, y] = value.split(/[./]/);
    value = y + "-" + m.padStart(2, "0") + "-" + d.padStart(2, "0");
  } else if (/^\d{4}-\d{2}-\d{2}T/.test(value)) value = value.slice(0, 10);
  else if (validPlanningMonth(value))
    value = edge === "start" ? value + "-01" : monthEndDate(value);
  if (!validPlanningDate(value))
    throw Error(
      "GG.AA.YYYY veya YYYY-AA-GG biçiminde geçerli bir tarih girin.",
    );
  return value;
}
export function prepareImport(d: Data, rows: ImportRow[]): PreviewRow[] {
  if (!rows.length || rows.length > 5000)
    throw Error("1–5.000 veri satırı seçin.");
  const seenNames = new Set(
    d.resources.flatMap((r) =>
      r.versions.map((v) => norm(r.name) + "|" + v.team),
    ),
  );
  const assignments = new Map<string, string>();
  return rows.map((source) => {
    const v = source.values,
      errors = [...source.problems];
    const read = (field: ImportField, fn: () => string) => {
      try {
        return fn();
      } catch (e) {
        errors.push(
          (importColumns.find((c) => c[0] === field)?.[1] ||
            "Eski geçerlilik ayı") +
            ": " +
            (e as Error).message,
        );
        return "";
      }
    };
    const name = clean(v.name),
      note = clean(v.note);
    if (!name || name.length > 200)
      errors.push("Ad Soyad: 1–200 karakter olmalı.");
    if (note.length > 10000) errors.push("İK Notu: en fazla 10.000 karakter.");
    const leads = d.leaders?.filter((l) => norm(l) === norm(v.lead)) || [];
    const lead = leads.length === 1 ? leads[0] : "";
    if (!lead) errors.push("Liderlik: listeden geçerli bir liderlik girin.");
    const matches = d.teams.filter((t) => norm(t.name) === norm(v.team)),
      candidates = matches.filter((t) => !t.lead || t.lead === lead);
    const team = candidates.length === 1 ? candidates[0] : undefined;
    if (!team)
      errors.push(
        matches.length
          ? "Takım liderlikle eşleşmiyor veya adı belirsiz."
          : "Takım: güncel listede bulunamadı.",
      );
    const status = statuses.find((s) => norm(s) === norm(v.status)) || "";
    if (!status) errors.push("Statü: geçerli bir statü girin.");
    const flag = norm(v.included);
    const included = ["evet", "true", "1"].includes(flag);
    if (!["evet", "true", "1", "hayir", "false", "0"].includes(flag))
      errors.push("Dahil: Evet veya Hayır girin.");
    const amountText = clean(v.amount),
      amount = Number(amountText.replace(",", "."));
    if (
      !amountText ||
      !/^\d+(?:[.,]\d+)?$/.test(amountText) ||
      !Number.isFinite(amount) ||
      amount < 0 ||
      amount > 100
    )
      errors.push("Kişi Eşdeğeri: 0–100 arasında bir sayı girin.");
    const requiresStart = requiresResourceStart(status, included);
    const startInput = clean(v.start)
      ? v.start
      : isWorkingStatus(status)
        ? currentYearStartDate()
        : v.start;
    const start = read("start", () =>
      employmentDate(startInput, "start", requiresStart, source.date1904),
    );
    const end = read("end", () =>
      employmentDate(v.end, "end", status === "İşten Ayrıldı", source.date1904),
    );
    // Older Excel files may still provide a separate version month.
    const effective = clean(v.effective)
      ? read("effective", () => month(v.effective, true, source.date1904))
      : start.slice(0, 7) || currentPlanningMonth();
    if (start && end && end < start)
      errors.push("İşten Ayrılış Tarihi, İşbaşı Tarihi’nden önce olamaz.");
    if (team && !team.lead && lead) {
      const before = assignments.get(team.id);
      if (before && before !== lead)
        errors.push("Bu takım dosyada birden fazla liderliğe atanmış.");
      else assignments.set(team.id, lead);
    }
    const duplicate = !!team && seenNames.has(norm(name) + "|" + team.id);
    const state = errors.length ? "error" : duplicate ? "duplicate" : "ready";
    const resource: Resource | undefined =
      state === "ready"
        ? {
            id: crypto.randomUUID(),
            name,
            note,
            versions: [
              {
                team: team!.id,
                lead,
                status,
                included,
                amount,
                effective,
                start,
                end,
              },
            ],
          }
        : undefined;
    if (state === "ready") seenNames.add(norm(name) + "|" + team!.id);
    return {
      source,
      state,
      errors,
      resource,
      teamName: team?.name || clean(v.team),
      lead,
    } as PreviewRow;
  });
}
