import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { inflateRawSync } from "node:zlib";
import { zipFiles } from "../../frontend/src/xlsx-zip.ts";

export function workbook(rows, secondRows = []) {
  const xml = (text) =>
    String(text)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  const ns = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
  const sheet = (rows) =>
    `<worksheet xmlns="${ns}"><sheetData>${rows.map((values, index) => `<row r="${index + 1}">${values.map((value, column) => `<c r="${String.fromCharCode(65 + column)}${index + 1}" t="inlineStr"><is><t>${xml(value)}</t></is></c>`).join("")}</row>`).join("")}</sheetData></worksheet>`;
  return Buffer.from(
    zipFiles({
      "[Content_Types].xml":
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>',
      "_rels/.rels":
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships" Target="xl/workbook.xml"/></Relationships>',
      "xl/workbook.xml": `<workbook xmlns="${ns}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Kaynaklar" sheetId="1" r:id="rId1"/><sheet name="İkinci Sayfa" sheetId="2" r:id="rId2"/></sheets></workbook>`,
      "xl/_rels/workbook.xml.rels":
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/></Relationships>',
      "xl/worksheets/sheet1.xml": sheet(rows),
      "xl/worksheets/sheet2.xml": sheet(secondRows),
    }),
  );
}
export async function download(page, button, file) {
  const pending = page.waitForEvent("download");
  await button.click();
  const result = await pending;
  assert.equal(await result.failure(), null);
  await result.saveAs(file);
  return fs.readFile(file);
}
export function zipEntries(bytes) {
  const result = {};
  let offset = 0;
  while (bytes.readUInt32LE(offset) === 0x04034b50) {
    const flags = bytes.readUInt16LE(offset + 6),
      method = bytes.readUInt16LE(offset + 8),
      size = bytes.readUInt32LE(offset + 18),
      nameLength = bytes.readUInt16LE(offset + 26),
      extraLength = bytes.readUInt16LE(offset + 28);
    assert.equal(
      flags & 8,
      0,
      "ZIP data descriptors require a different reader",
    );
    const name = bytes
        .subarray(offset + 30, offset + 30 + nameLength)
        .toString(),
      start = offset + 30 + nameLength + extraLength,
      data = bytes.subarray(start, start + size);
    assert([0, 8].includes(method));
    result[name] = (method === 8 ? inflateRawSync(data) : data).toString();
    offset = start + size;
  }
  assert.equal(bytes.readUInt32LE(offset), 0x02014b50);
  return result;
}
export async function validateXml(page, entries) {
  for (const [name, xml] of Object.entries(entries).filter(
    ([name]) => name.endsWith(".xml") || name.endsWith(".rels"),
  )) {
    const error = await page.evaluate(
      (xml) =>
        new DOMParser()
          .parseFromString(xml, "application/xml")
          .querySelector("parsererror")?.textContent || "",
      xml,
    );
    assert.equal(error, "", name);
  }
  assert(entries["[Content_Types].xml"] && entries["xl/workbook.xml"]);
}
