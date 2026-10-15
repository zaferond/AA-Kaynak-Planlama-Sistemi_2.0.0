import {
  columnName as col,
  excelCellText,
  assertExcelRowCount,
} from "./xlsx-cells.ts";
import { createWorkbook, downloadWorkbook } from "./xlsx-workbook.ts";
import { importColumns } from "./resource-import.ts";
import { statuses } from "./model.ts";
import type { Data } from "./model.ts";
const ns = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const cell = (r: number, c: number, t: string, style = 0) =>
  `<c r="${col(c)}${r}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${excelCellText(t)}</t></is></c>`;
export function resourceTemplate(d: Data) {
  const teams = d.teams,
    leaders = d.leaders || [];
  assertExcelRowCount(
    Math.max(teams.length, leaders.length, statuses.length, 2) + 14,
  );
  const head = importColumns.map(([, name], i) => cell(1, i, name, 1)).join("");
  const widths = [30, 45, 55, 28, 16, 20, 24, 24, 45];
  const validations = [
    ["B", "Liderlikler"],
    ["C", "Takimlar"],
    ["D", "Statuler"],
    ["E", "DahilSecenekleri"],
  ]
    .map(
      ([c, n]) =>
        `<dataValidation type="list" allowBlank="0" showErrorMessage="1" errorTitle="Listeden seçim yapın" error="Listeler sayfasındaki geçerli değerlerden birini seçin." sqref="${c}2:${c}5001"><formula1>${n}</formula1></dataValidation>`,
    )
    .join("");
  const first = `<worksheet xmlns="${ns}"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" state="frozen"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="24"/><cols>${widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1" style="2"/>`).join("")}</cols><sheetData><row r="1" ht="36" customHeight="1">${head}</row></sheetData><autoFilter ref="A1:I5001"/><dataValidations count="4">${validations}</dataValidations></worksheet>`;
  const rows = [
    `<row r="1" ht="32" customHeight="1">${["Takım", "Bağlı liderlik", "", "Liderlik listesi", "", "Statü", "", "Dahil"].map((t, i) => cell(1, i, t, 1)).join("")}</row>`,
  ];
  for (
    let i = 0;
    i < Math.max(teams.length, leaders.length, statuses.length, 2);
    i++
  ) {
    const r = i + 2;
    rows.push(
      `<row r="${r}" ht="32" customHeight="1">${[teams[i]?.name || "", teams[i]?.lead || "", "", leaders[i] || "", "", statuses[i] || "", "", i < 2 ? ["Evet", "Hayır"][i] : ""].map((t, c) => cell(r, c, t)).join("")}</row>`,
    );
  }
  const helpStart =
    Math.max(teams.length, leaders.length, statuses.length, 2) + 5;
  const help = [
    "DOLDURMA VE AKTARIM",
    "Kaynaklar sayfasına her çalışan veya ilan için bir satır ekleyin. İlk satırdaki başlıkları değiştirmeyin.",
    "Zorunlu alanlar: Ad Soyad, Liderlik, Takım, Statü, Dahil ve Kişi Eşdeğeri. Çalışanlarda boş İşbaşı Tarihi bu yılın 1 Ocak günü olur; dahil edilen aktif ilanlarda tarih zorunludur.",
    "İşbaşı ve İşten Ayrılış Tarihlerini GG.AA.YYYY veya YYYY-AA-GG biçiminde girin. Excel tarihleri de okunur.",
    "İşten Ayrıldı statüsünde İşbaşı ve İşten Ayrılış Tarihi zorunludur. Kaynak yalnızca bu tarihlerin arasında gün oranıyla hesaplanır.",
    "Aynı Ad Soyad ve Takım birleşimine sahip kayıtlar yeniden eklenmez.",
    "Bu aktarım yeni kaynak ekler; mevcut kayıtları güncellemez. Formüller yerine yalnızca değerleri yapıştırın.",
    "Liderliği boş olan takıma ilk aktarımda belirttiğiniz liderlik atanır. Bir takım aynı dosyada iki farklı liderliğe atanamaz.",
    "Portalda dosyayı seçin, ilgili sayfayı seçin, önizlemedeki hataları Excel’de düzeltin ve tekrar yükleyin.",
    "Hatalı satır varsa aktarım yapılmaz. Tekrarlanan kayıtlar atlanır. Şablon en fazla 5.000 kayıt için hazırlanmıştır.",
  ];
  const merges: string[] = [];
  help.forEach((t, i) => {
    const r = helpStart + i;
    rows.push(
      `<row r="${r}" ht="32" customHeight="1">${cell(r, 0, t, i === 0 ? 1 : 0)}</row>`,
    );
    merges.push(`<mergeCell ref="A${r}:H${r}"/>`);
  });
  const second = `<worksheet xmlns="${ns}"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" state="frozen"/></sheetView></sheetViews><cols>${[55, 45, 3, 45, 3, 28, 3, 16].map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join("")}</cols><sheetData>${rows.join("")}</sheetData><mergeCells count="${merges.length}">${merges.join("")}</mergeCells></worksheet>`;
  const style = `<styleSheet xmlns="${ns}"><fonts count="2"><font><sz val="11"/><color rgb="FF182B43"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF1766BD"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf><xf numFmtId="49" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;
  return createWorkbook({
    sheets: [
      { name: "Kaynaklar", xml: first },
      { name: "Listeler", xml: second },
    ],
    styles: style,
    definedNames: [
      ["Liderlikler", "D", leaders.length],
      ["Takimlar", "A", teams.length],
      ["Statuler", "F", statuses.length],
      ["DahilSecenekleri", "H", 2],
    ].map(([name, column, length]) => ({
      name: String(name),
      formula: `'Listeler'!$${column}$2:$${column}$${Math.max(1, Number(length)) + 1}`,
    })),
  });
}
export function downloadResourceTemplate(d: Data) {
  downloadWorkbook(resourceTemplate(d), "Kaynak-Ice-Aktarma-Sablonu.xlsx");
}
