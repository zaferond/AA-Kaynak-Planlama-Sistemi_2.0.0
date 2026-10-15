import type { ExcelCell, ExcelRow } from "../../shared/import-types.ts";
export type { ExcelCell, ExcelRow } from "../../shared/import-types.ts";
export type ExcelSheet = { name: string; path: string };
const MAX = 40_000_000,
  MAX_ENTRY = 15_000_000;
const utf8 = new TextDecoder("utf-8", { fatal: true });
function xml(raw: Uint8Array) {
  const text = utf8.decode(raw);
  if (/<!DOCTYPE|<!ENTITY/i.test(text))
    throw Error("Desteklenmeyen XML içeriği.");
  const d = new DOMParser().parseFromString(text, "application/xml");
  if (d.getElementsByTagName("parsererror").length)
    throw Error("Excel XML içeriği okunamadı.");
  return d;
}
const nodes = (n: Document | Element, name: string) =>
  Array.from(n.getElementsByTagNameNS("*", name));
async function unzip(data: Uint8Array) {
  const v = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let end = -1;
  for (let i = data.length - 22; i >= Math.max(0, data.length - 65557); i--)
    if (v.getUint32(i, true) === 0x06054b50) {
      end = i;
      break;
    }
  if (end < 0) throw Error("Geçerli bir .xlsx dosyası seçin.");
  const count = v.getUint16(end + 10, true),
    offset = v.getUint32(end + 16, true);
  if (v.getUint16(end + 4, true) || count > 1000)
    throw Error("Excel dosyası çok büyük veya desteklenmiyor.");
  const entries = new Map<
    string,
    { offset: number; size: number; raw: number; method: number }
  >();
  let p = offset,
    total = 0;
  for (let i = 0; i < count; i++) {
    if (p + 46 > data.length || v.getUint32(p, true) !== 0x02014b50)
      throw Error("Excel arşivi bozuk.");
    const flags = v.getUint16(p + 8, true),
      method = v.getUint16(p + 10, true),
      size = v.getUint32(p + 20, true),
      raw = v.getUint32(p + 24, true),
      n = v.getUint16(p + 28, true),
      extra = v.getUint16(p + 30, true),
      comment = v.getUint16(p + 32, true),
      local = v.getUint32(p + 42, true);
    total += raw;
    if (
      raw > MAX_ENTRY ||
      total > MAX ||
      flags & 1 ||
      ![0, 8].includes(method) ||
      p + 46 + n + extra + comment > data.length
    )
      throw Error("Dosya şifreli, çok büyük veya desteklenmeyen biçimde.");
    const name = utf8.decode(data.subarray(p + 46, p + 46 + n));
    if (entries.has(name)) throw Error("Tekrarlanan Excel arşiv öğesi.");
    entries.set(name, { offset: local, size, raw, method });
    p += 46 + n + extra + comment;
  }
  return async (name: string) => {
    const e = entries.get(name);
    if (!e) throw Error("Excel bölümü bulunamadı: " + name);
    if (
      e.offset + 30 > data.length ||
      v.getUint32(e.offset, true) !== 0x04034b50
    )
      throw Error("Excel arşivi bozuk.");
    const start =
      e.offset +
      30 +
      v.getUint16(e.offset + 26, true) +
      v.getUint16(e.offset + 28, true);
    if (start + e.size > data.length) throw Error("Excel arşivi eksik.");
    const compressed = data.slice(start, start + e.size);
    if (e.method === 0) {
      if (compressed.length !== e.raw) throw Error("Excel boyutu tutarsız.");
      return compressed;
    }
    if (typeof DecompressionStream === "undefined")
      throw Error(
        "Excel aktarımı için güncel Chrome, Edge veya Firefox kullanın.",
      );
    const stream = new Blob([compressed as BlobPart])
      .stream()
      .pipeThrough(new DecompressionStream("deflate-raw"));
    const reader = stream.getReader(),
      chunks: Uint8Array[] = [];
    let length = 0;
    while (true) {
      const r = await reader.read();
      if (r.done) break;
      length += r.value.length;
      if (length > MAX_ENTRY || length > e.raw) {
        await reader.cancel();
        throw Error("Excel açılmış boyut sınırını aşıyor.");
      }
      chunks.push(r.value);
    }
    if (length !== e.raw) throw Error("Excel boyutu tutarsız.");
    const out = new Uint8Array(length);
    let pos = 0;
    for (const c of chunks) {
      out.set(c, pos);
      pos += c.length;
    }
    return out;
  };
}
function pathOf(target: string) {
  const parts = (
      target.startsWith("/") ? target.slice(1) : "xl/" + target
    ).split("/"),
    out: string[] = [];
  for (const p of parts) {
    if (p === "..") out.pop();
    else if (p && p !== ".") out.push(p);
  }
  return out.join("/");
}
export async function openExcel(file: File) {
  if (!/\.xlsx$/i.test(file.name))
    throw Error(
      "Excel dosyasını .xlsx biçiminde kaydedip seçin. .xls ve .xlsm desteklenmiyor.",
    );
  if (file.size > 10_000_000) throw Error("Dosya en fazla 10 MB olabilir.");
  const get = await unzip(new Uint8Array(await file.arrayBuffer()));
  const workbook = xml(await get("xl/workbook.xml")),
    rels = xml(await get("xl/_rels/workbook.xml.rels"));
  const relationships = nodes(rels, "Relationship");
  const sheets: ExcelSheet[] = nodes(workbook, "sheet").map((s) => {
    const id =
      s.getAttribute("r:id") ||
      s.getAttributeNS(
        "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
        "id",
      );
    const rel = relationships.find((r) => r.getAttribute("Id") === id);
    if (!rel || rel.getAttribute("TargetMode") === "External")
      throw Error("Excel sayfa bağlantısı geçersiz.");
    return {
      name: s.getAttribute("name") || "Sayfa",
      path: pathOf(rel.getAttribute("Target") || ""),
    };
  });
  if (!sheets.length) throw Error("Excel çalışma sayfası yok.");
  const date1904 = ["1", "true"].includes(
    nodes(workbook, "workbookPr")[0]?.getAttribute("date1904") || "",
  );
  const stringsRel = relationships.find((r) =>
    r.getAttribute("Type")?.endsWith("/sharedStrings"),
  );
  let strings: string[] = [];
  if (stringsRel) {
    const stringsDoc = xml(
      await get(pathOf(stringsRel.getAttribute("Target")!)),
    );
    strings = nodes(stringsDoc, "si").map((si) =>
      nodes(si, "t")
        .map((t) => t.textContent || "")
        .join(""),
    );
  }
  return {
    sheets,
    date1904,
    async rows(path: string): Promise<ExcelRow[]> {
      if (!sheets.some((s) => s.path === path))
        throw Error("Sayfa bulunamadı.");
      const d = xml(await get(path)),
        out: ExcelRow[] = [];
      for (const row of nodes(d, "row")) {
        const cells: ExcelCell[] = [];
        for (const c of nodes(row, "c")) {
          const ref = c.getAttribute("r") || "",
            letters = ref.match(/^[A-Z]+/i)?.[0];
          if (!letters) throw Error("Excel hücre adresi geçersiz.");
          let col = 0;
          for (const ch of letters.toUpperCase())
            col = col * 26 + ch.charCodeAt(0) - 64;
          if (col > 100) {
            if ((c.textContent || "").trim())
              throw Error("En fazla 100 sütun desteklenir.");
            continue;
          }
          const type = c.getAttribute("t"),
            raw = nodes(c, "v")[0]?.textContent || "";
          let value: string | number | boolean = raw;
          if (type === "s") {
            const i = Number(raw);
            if (!Number.isInteger(i) || strings[i] === undefined)
              throw Error("Excel metin kaydı geçersiz.");
            value = strings[i];
          } else if (type === "inlineStr")
            value = nodes(c, "t")
              .map((t) => t.textContent || "")
              .join("");
          else if (type === "b") value = raw === "1";
          else if ((!type || type === "n") && raw !== "") value = Number(raw);
          cells[col - 1] = {
            value,
            formula: nodes(c, "f").length > 0,
            error: type === "e",
          };
        }
        if (
          cells.some(
            (c) => c && (String(c.value).trim() || c.formula || c.error),
          )
        ) {
          out.push({ number: Number(row.getAttribute("r")), cells });
          if (out.length > 5001)
            throw Error(
              "Bir aktarımda en fazla 5.000 veri satırı desteklenir.",
            );
        }
      }
      return out;
    },
  };
}
