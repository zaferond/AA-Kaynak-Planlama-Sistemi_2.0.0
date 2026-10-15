import assert from "node:assert/strict";
import path from "node:path";
import { applyChanges } from "../../backend/operations.mjs";
import {
  escapeXml,
  spreadsheetNamespace,
} from "../../frontend/src/xlsx-cells.ts";
import { resourceTemplate } from "../../frontend/src/resource-template.ts";
import { resourceReportWorkbook } from "../../frontend/src/resource-report-export.ts";
import { projectWorkbook } from "../../frontend/src/project-export.ts";
import { projectInfoReportWorkbook } from "../../frontend/src/project-info-report-export.ts";
import { buildProjectInfoReport } from "../../frontend/src/project-info-report.ts";
import { riskWorkbook } from "../../frontend/src/risk-export.ts";
import {
  plannedAllocationWorkbook,
  actualAllocationWorkbook,
} from "../../frontend/src/allocation-export.ts";
import { download, zipEntries, validateXml } from "./files.mjs";
import { openRisks, acceptRiskSaveConfirmations } from "./risk.mjs";

export async function checkExcelXmlCharacters(f) {
  const { page, context } = await f.client("employee");
  const stopConfirming = acceptRiskSaveConfirmations(page);
  let id;
  try {
    const valid =
      "=1+1 · Türkçe İıŞşĞğ😀\t\r\n" +
      String.fromCodePoint(
        0xd7ff,
        0xe000,
        0xfffd,
        0x10000,
        0x10ffff,
        0x7f,
        0x85,
        0x9f,
        0xfdd0,
      ) +
      " <&>\"' end";
    await f.check(
      "Excel XML: real DOMParser preserves Unicode boundaries, paired characters and CR/LF after escaping",
      async () => {
        const xml = `<worksheet xmlns="${spreadsheetNamespace}"><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t xml:space="preserve">${escapeXml(valid)}</t></is></c></row></sheetData></worksheet>`;
        const parsed = await page.evaluate((xml) => {
          const doc = new DOMParser().parseFromString(xml, "application/xml");
          return {
            error: doc.querySelector("parsererror")?.textContent || "",
            text: doc.querySelector("t")?.textContent,
          };
        }, xml);
        assert.equal(parsed.error, "");
        assert.equal(parsed.text, valid);
      },
    );
    await f.check(
      "Excel XML: all seven workbook writers produce parseable XML parts with valid special Unicode text",
      async () => {
        const state = await f.state();
        const team = { ...f.teamA, name: valid };
        const original = state.projects.find((project) => project.id === "p-a");
        const project = {
          ...original,
          name: valid,
          phases: { "2026-01": valid },
          milestones: [
            {
              id: "m",
              name: valid,
              start: "2026-01-01",
              end: "2026-01-02",
              barNotes: [{ text: valid, includeInReport: true }],
            },
          ],
        };
        const resource = {
          ...state.resources.find((resource) => resource.id === "r-own"),
          name: valid,
        };
        const data = {
          ...state,
          teams: [team],
          leaders: [team.lead],
          projects: [project],
          resources: [resource],
          allocations: { [team.id + "|p-a|2026-01"]: 0.5 },
          actualAllocations: { "r-own|p-a|2026-01": 0.5 },
        };
        const group = {
          name: valid,
          manager: "",
          personnel: 1,
          months: [{ remaining: 0.5, status: "normal" }],
        };
        const books = [
          resourceTemplate(data),
          resourceReportWorkbook(["2026-01"], [group], [group]),
          projectWorkbook([project], ["2026-01"]),
          projectInfoReportWorkbook(buildProjectInfoReport([project])),
          riskWorkbook(project, []),
          plannedAllocationWorkbook(data, [team], [project], ["2026-01"]),
          actualAllocationWorkbook(
            data,
            [team],
            [project],
            ["2026-01"],
            "2026-10",
            ["r-own"],
          ),
        ];
        for (const bytes of books)
          await validateXml(page, zipEntries(Buffer.from(bytes)));
      },
    );
    await f.check(
      "Excel XML: a normal user's stored invalid character blocks download with a clear error; correcting it exports losslessly",
      async () => {
        await openRisks(page);
        await page
          .getByRole("button", { name: "Risk Ekle", exact: true })
          .click();
        const editing = () => page.locator(".risk-editing-row");
        const field = (key) => editing().locator(`[data-risk-input="${key}"]`);
        await editing().waitFor();
        id = await editing().getAttribute("data-risk-id");
        const invalid = "Synthetic invalid \uFFFE risk";
        await field("description").fill(invalid);
        await field("likelihood").selectOption("2");
        await field("impact").selectOption("3");
        const saved = page.waitForResponse((response) =>
          response.url().endsWith("/api/changes"),
        );
        await field("description").press("Enter");
        assert.equal((await saved).status(), 200);
        await editing().waitFor({ state: "hidden" });
        const before = await f.state();
        assert.equal(
          before.risks.find((risk) => risk.id === id).description,
          invalid,
        );
        let downloads = 0,
          writes = 0;
        const downloaded = () => downloads++;
        const written = (request) => {
          if (
            request.url().endsWith("/api/changes") &&
            request.method() === "POST"
          )
            writes++;
        };
        page.on("download", downloaded);
        page.on("request", written);
        try {
          await page
            .getByRole("button", { name: "Excel'e Aktar", exact: true })
            .click();
          const error = page
            .getByRole("alert")
            .filter({ hasText: "Excel'e aktarılamayan karakter (U+FFFE)" });
          await error.waitFor();
          assert(
            (await error.textContent()).includes(
              "İlgili metni düzeltip tekrar aktarın.",
            ),
          );
          assert.equal(downloads, 0);
          assert.equal(writes, 0);
          assert.deepEqual((await f.state()).risks, before.risks);
          await f.capture(page, "excel-invalid-character-error");
        } finally {
          page.off("download", downloaded);
          page.off("request", written);
        }
        await page
          .locator(`tr[data-risk-id="${id}"] [data-risk-column="description"]`)
          .click();
        const corrected = "=1+1 · Türkçe İıŞşĞğ 😀 <&>\nYeni satır";
        await field("description").fill(corrected);
        await field("description").press("Enter");
        await editing().waitFor({ state: "hidden" });
        const bytes = await download(
          page,
          page.getByRole("button", { name: "Excel'e Aktar", exact: true }),
          path.join(f.dir, "excel-corrected-risk.xlsx"),
        );
        const entries = zipEntries(bytes);
        await validateXml(page, entries);
        const retained = await page.evaluate(
          ({ xml, text }) => {
            const doc = new DOMParser().parseFromString(xml, "application/xml");
            const cell = [...doc.querySelectorAll('c[t="inlineStr"]')].find(
              (cell) => cell.querySelector("t")?.textContent === text,
            );
            return !!cell && !cell.querySelector("f");
          },
          { xml: entries["xl/worksheets/sheet1.xml"], text: corrected },
        );
        assert(retained, "User text remains an inline string, never a formula");
        assert.equal(
          (await f.state()).risks.find((risk) => risk.id === id).description,
          corrected,
        );
      },
    );
  } catch (error) {
    await f.capture(page, "excel-xml-characters-failed").catch(() => {});
    throw error;
  } finally {
    stopConfirming();
    await context.close();
    const state = await f.state();
    if (id && state.risks.some((risk) => risk.id === id))
      await f.store.mutate(f.actor, (data, actor) =>
        applyChanges(data, actor, [
          {
            kind: "risk",
            id,
            operation: "delete",
            value: null,
            revision: state.revisions["risk:" + id],
          },
        ]),
      );
  }
}
