import {
  escapeXml,
  EXCEL_MAX_ROWS,
  spreadsheetNamespace,
} from "./xlsx-cells.ts";
import { zipFiles } from "./xlsx-zip.ts";

type WorkbookSheet = { name: string; xml: string; printTitleRows?: number };
type DefinedName = { name: string; formula: string; localSheetId?: number };
type WorkbookOptions = {
  sheets: WorkbookSheet[];
  styles: string;
  definedNames?: DefinedName[];
  activeTab?: number;
  recalculate?: boolean;
  properties?: { title: string; creator: string; created?: Date };
};
const declaration = '<?xml version="1.0" encoding="UTF-8"?>';
const packageNamespace =
  "http://schemas.openxmlformats.org/package/2006/relationships";
const officeNamespace =
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const documentType =
  "application/vnd.openxmlformats-officedocument.spreadsheetml";
export const XLSX_MIME = `${documentType}.sheet`;
const documentXml = (xml: string) =>
  xml.startsWith("<?xml") ? xml : declaration + xml;

export const excelSheetNameKeys = (name: string) => [
  name.toUpperCase(),
  name.toLocaleLowerCase("tr-TR"),
];

/** Package only: cell values, formulas and report-specific styles belong to sheet writers. */
export function createWorkbook(options: WorkbookOptions): Uint8Array {
  const { sheets, styles, activeTab, properties } = options;
  if (!sheets.length || sheets.length > 65529)
    throw Error("Geçersiz Excel sayfa sayısı.");
  const names = new Set<string>();
  for (const sheet of sheets) {
    const keys = excelSheetNameKeys(sheet.name);
    if (
      !sheet.name.trim() ||
      sheet.name.length > 31 ||
      /[\\/\[\]*?:\u0000-\u001f]/.test(sheet.name) ||
      /^'|'$/.test(sheet.name) ||
      keys.some((key) => names.has(key))
    )
      throw Error("Excel sayfa adları geçerli ve benzersiz olmalıdır.");
    keys.forEach((key) => names.add(key));
    if (
      sheet.printTitleRows !== undefined &&
      (!Number.isInteger(sheet.printTitleRows) ||
        sheet.printTitleRows < 1 ||
        sheet.printTitleRows > EXCEL_MAX_ROWS)
    )
      throw Error("Geçersiz Excel yazdırma başlığı.");
  }
  if (
    activeTab !== undefined &&
    (!Number.isInteger(activeTab) ||
      activeTab < 0 ||
      activeTab >= sheets.length)
  )
    throw Error("Geçersiz aktif Excel sayfası.");
  const definedNames = [
    ...(options.definedNames || []),
    ...sheets.flatMap((sheet, index) =>
      sheet.printTitleRows
        ? [
            {
              name: "_xlnm.Print_Titles",
              localSheetId: index,
              formula: `'${sheet.name.replaceAll("'", "''")}'!$1:$${sheet.printTitleRows}`,
            },
          ]
        : [],
    ),
  ];
  for (const name of definedNames)
    if (
      !name.name ||
      !name.formula ||
      (name.localSheetId !== undefined &&
        (!Number.isInteger(name.localSheetId) ||
          name.localSheetId < 0 ||
          name.localSheetId >= sheets.length))
    )
      throw Error("Geçersiz Excel adlandırılmış aralığı.");
  const sheetParts = sheets
    .map(
      (_, index) =>
        `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="${documentType}.worksheet+xml"/>`,
    )
    .join("");
  const files: Record<string, string> = {
    "[Content_Types].xml": `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="${documentType}.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="${documentType}.styles+xml"/>${sheetParts}${properties ? '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>' : ""}</Types>`,
    "_rels/.rels": `<Relationships xmlns="${packageNamespace}"><Relationship Id="rId1" Type="${officeNamespace}/officeDocument" Target="xl/workbook.xml"/>${properties ? `<Relationship Id="rId2" Type="${packageNamespace}/metadata/core-properties" Target="docProps/core.xml"/>` : ""}</Relationships>`,
    "xl/workbook.xml": `<workbook xmlns="${spreadsheetNamespace}" xmlns:r="${officeNamespace}">${activeTab !== undefined ? `<bookViews><workbookView activeTab="${activeTab}"/></bookViews>` : ""}<sheets>${sheets.map((sheet, index) => `<sheet name="${escapeXml(sheet.name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`).join("")}</sheets>${definedNames.length ? `<definedNames>${definedNames.map((name) => `<definedName name="${escapeXml(name.name)}"${name.localSheetId !== undefined ? ` localSheetId="${name.localSheetId}"` : ""}>${escapeXml(name.formula)}</definedName>`).join("")}</definedNames>` : ""}${options.recalculate ? '<calcPr calcId="0" fullCalcOnLoad="1" forceFullCalc="1"/>' : ""}</workbook>`,
    "xl/_rels/workbook.xml.rels": `<Relationships xmlns="${packageNamespace}">${sheets.map((_, index) => `<Relationship Id="rId${index + 1}" Type="${officeNamespace}/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`).join("")}<Relationship Id="rId${sheets.length + 1}" Type="${officeNamespace}/styles" Target="styles.xml"/></Relationships>`,
    "xl/styles.xml": styles,
  };
  if (properties)
    files["docProps/core.xml"] =
      `<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:creator>${escapeXml(properties.creator)}</dc:creator><dc:title>${escapeXml(properties.title)}</dc:title><dcterms:created xsi:type="dcterms:W3CDTF">${(properties.created || new Date()).toISOString()}</dcterms:created></cp:coreProperties>`;
  sheets.forEach((sheet, index) => {
    files[`xl/worksheets/sheet${index + 1}.xml`] = sheet.xml;
  });
  return zipFiles(
    Object.fromEntries(
      Object.entries(files).map(([name, xml]) => [name, documentXml(xml)]),
    ),
  );
}

export function downloadWorkbook(bytes: Uint8Array, name: string) {
  const url = URL.createObjectURL(
    new Blob([bytes as BlobPart], { type: XLSX_MIME }),
  );
  try {
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = name;
    anchor.click();
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
