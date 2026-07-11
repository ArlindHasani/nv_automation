import type { Page, Locator } from "playwright";
import type { DiscoveredQuestion, QuestionType } from "@nv/core";
import { NV_SELECTORS, nvRadioGroupSelector } from "./selectors.js";

export async function findFirstVisible(
  page: Page,
  selectors: readonly string[],
): Promise<Locator | null> {
  for (const sel of selectors) {
    const loc = page.locator(sel).first();
    if ((await loc.count()) > 0 && (await loc.isVisible().catch(() => false))) {
      return loc;
    }
  }
  return null;
}

export interface GridStatement {
  name: string;
  rowLabel: string;
}

export interface ClassifiedQuestion {
  name: string;
  type: QuestionType;
  codes: string[];
  labels: Record<string, string>;
  /** NV input name for open/text fields (e.g. IDINT). */
  inputName?: string;
  /** Tile / icon grid — clicking a code submits the form (no Next button). */
  tileSelect?: boolean;
  /** Radio/checkbox with data-autosubmit — selecting submits the form. */
  autoSubmit?: boolean;
  /** NV table grid — multiple statement rows on one screen (QUESTLIST). */
  gridStatements?: GridStatement[];
  /** Each statement row allows multiple selections (table checkboxes). */
  gridMulti?: boolean;
}

/** NV Rev2 exposes the current question code in a hidden QLABEL field. */
export async function extractNvQuestionLabel(page: Page): Promise<string | null> {
  const qlabel = page.locator('input[name="QLABEL"]');
  if ((await qlabel.count()) > 0) {
    const value = (await qlabel.inputValue().catch(() => "")).trim();
    if (value) return value.toUpperCase();
  }

  const questList = page.locator('input[name="QUESTLIST"]');
  if ((await questList.count()) > 0) {
    const raw = (await questList.inputValue().catch(() => "")).trim();
    const first = raw.split(";").find((part) => part.trim());
    if (first) return first.trim().toUpperCase();
  }

  return null;
}

/** NV table#example with multiple statement rows (QUESTLIST) — radio or checkbox per cell. */
async function collectTableGridQuestion(
  page: Page,
): Promise<ClassifiedQuestion | null> {
  const result = await page.evaluate(() => {
    const table = document.querySelector("table#example");
    if (!table) return null;

    const questListRaw =
      (
        document.querySelector('input[name="QUESTLIST"]') as HTMLInputElement | null
      )?.value?.trim() ?? "";
    const questList = questListRaw
      .split(";")
      .map((part) => part.trim().toUpperCase())
      .filter(Boolean);

    const rows = Array.from(table.querySelectorAll("tbody tr"));
    if (rows.length === 0) return null;

    const headerCells = Array.from(table.querySelectorAll("thead th"));
    const statements: Array<{
      name: string;
      rowLabel: string;
      codes: string[];
    }> = [];
    const labels: Record<string, string> = {};
    let gridMulti = false;

    for (const row of rows) {
      const cells = Array.from(row.querySelectorAll("td"));
      if (cells.length === 0) continue;

      const rowLabel = cells[0]?.textContent?.trim() ?? "";
      const inputs = Array.from(
        row.querySelectorAll(
          'input[type="radio"], input[type="RADIO"], input[type="checkbox"], input[type="CHECKBOX"]',
        ),
      ) as HTMLInputElement[];
      if (inputs.length === 0) continue;

      const rawName = inputs[0].name?.trim() ?? "";
      const baseName = rawName.includes(":")
        ? rawName.split(":")[0].toUpperCase()
        : rawName.toUpperCase();
      if (!baseName) continue;

      if (inputs[0].type.toLowerCase() === "checkbox") {
        gridMulti = true;
      }

      const codes: string[] = [];
      for (let i = 0; i < inputs.length; i++) {
        const input = inputs[i];
        const value = input.value;
        if (!codes.includes(value)) codes.push(value);
        if (!labels[value] && headerCells[i + 1]) {
          const header = headerCells[i + 1]?.textContent?.trim();
          if (header) labels[value] = header;
        }
      }

      statements.push({ name: baseName, rowLabel, codes });
    }

    if (statements.length === 0) return null;

    const statementNames = new Set(statements.map((s) => s.name));
    const isGrid =
      statements.length > 1 &&
      (statementNames.size > 1 || questList.length > 1);
    if (!isGrid) return null;

    const qlabel =
      (
        document.querySelector('input[name="QLABEL"]') as HTMLInputElement | null
      )?.value?.trim().toUpperCase() ??
      questList[0] ??
      statements[0].name;

    const codes = statements[0]?.codes ?? [];
    const gridStatements = statements.map((s) => ({
      name: s.name,
      rowLabel: s.rowLabel,
    }));

    return { name: qlabel, codes, labels, gridStatements, gridMulti };
  });

  if (!result) return null;

  return {
    name: result.name,
    type: "Grid",
    codes: result.codes,
    labels: result.labels,
    gridStatements: result.gridStatements,
    gridMulti: result.gridMulti,
  };
}

async function extractQuestionName(page: Page): Promise<string | null> {
  const nvLabel = await extractNvQuestionLabel(page);
  if (nvLabel) return nvLabel;

  for (const sel of NV_SELECTORS.interview.questionName) {
    const loc = page.locator(sel).first();
    if ((await loc.count()) === 0) continue;
    const tag = await loc.evaluate((el) => (el as HTMLElement).tagName.toLowerCase());
    if (tag === "input" || tag === "textarea") {
      const val = await loc.inputValue().catch(() => "");
      if (val) return val.trim().toUpperCase();
    }
    const dataQ = await loc.getAttribute("data-question");
    if (dataQ) return dataQ.trim().toUpperCase();
    const text = await loc.textContent();
    if (text?.trim()) return text.trim().toUpperCase();
  }

  return null;
}

async function collectSelectCodes(page: Page): Promise<ClassifiedQuestion | null> {
  const selects = page.locator("form#form select, table#example select, select.form-control");
  const count = await selects.count();
  if (count === 0) return null;

  const select = selects.first();
  const options = select.locator("option");
  const optionCount = await options.count();
  const codes: string[] = [];
  const labels: Record<string, string> = {};

  if (optionCount > 12) {
    const bulk = await select.evaluate((el) => {
      const codes: string[] = [];
      const labels: Record<string, string> = {};
      for (const option of Array.from((el as HTMLSelectElement).options)) {
        const value = option.value;
        const text = option.textContent?.trim() ?? value;
        if (!value && !text) continue;
        const code = value || text;
        codes.push(code);
        labels[code] = text;
      }
      return { codes, labels };
    });
    if (bulk.codes.length === 0) return null;
    const name = (await extractQuestionName(page)) ?? "UNKNOWN";
    return { name, type: "Single", codes: bulk.codes, labels: bulk.labels };
  }

  for (let i = 0; i < optionCount; i++) {
    const option = options.nth(i);
    const value = (await option.getAttribute("value")) ?? "";
    const text =
      (await option.textContent({ timeout: 800 }).catch(() => null))?.trim() ??
      value;
    if (!value && !text) continue;
    const code = value || text;
    codes.push(code);
    labels[code] = text;
  }

  if (codes.length === 0) return null;
  const name = (await extractQuestionName(page)) ?? "UNKNOWN";
  return { name, type: "Single", codes, labels };
}

async function collectRadiosViaDom(
  page: Page,
  name: string,
): Promise<ClassifiedQuestion | null> {
  const result = await page.evaluate((questionName) => {
    const q = questionName.toUpperCase();
    const inputs = Array.from(
      document.querySelectorAll(
        `input[type="radio"][name="${q}"], input[type="RADIO"][name="${q}"], input[type="radio"][name="${q.toLowerCase()}"], input[type="RADIO"][name="${q.toLowerCase()}"]`,
      ),
    ) as HTMLInputElement[];
    if (inputs.length === 0) return null;

    const codes: string[] = [];
    const labels: Record<string, string> = {};
    let autosubmitCount = 0;

    for (const input of inputs) {
      const value = input.value || String(codes.length + 1);
      const labelEl = input.id
        ? document.querySelector(`label[for="${input.id}"]`)
        : null;
      const label = labelEl?.textContent?.trim() || value;
      if (!codes.includes(value)) {
        codes.push(value);
        labels[value] = label;
      }
      if (input.getAttribute("data-autosubmit") === "true") {
        autosubmitCount++;
      }
    }

    const autoSubmit =
      autosubmitCount > 0 && inputs.length <= 6;

    return { codes, labels, autoSubmit };
  }, name);

  if (!result || result.codes.length === 0) return null;
  return {
    name,
    type: "Single",
    codes: result.codes,
    labels: result.labels,
    autoSubmit: result.autoSubmit,
  };
}

async function collectCheckboxesViaDom(
  page: Page,
  name: string,
): Promise<ClassifiedQuestion | null> {
  // Use a real function — Playwright 1.6x does not invoke string-form
  // functions with args (returns undefined), which made Multi questions with
  // >8 options (e.g. D0_1B) fall through to Open via the Other textarea.
  const result = await page.evaluate((questionName) => {
    const META = new Set([
      "MAXANSWER",
      "CODEWIDTH",
      "O",
      "OTHER",
      "TEXT",
    ]);
    const inputs = Array.from(
      document.querySelectorAll(
        'form#form input[type="checkbox"], form#form input[type="CHECKBOX"], form#form .funkyradio input',
      ),
    ) as HTMLInputElement[];
    if (inputs.length === 0) return null;

    const q = String(questionName).toUpperCase();
    const codes: string[] = [];
    const labels: Record<string, string> = {};
    let matchedName = false;

    for (const input of inputs) {
      const type = String(input.type || "").toLowerCase();
      if (type && type !== "checkbox") continue;

      const inputName = String(input.name || "").toUpperCase();
      if (!inputName) continue;

      const colon = inputName.indexOf(":");
      if (colon > 0) {
        const prefix = inputName.slice(0, colon);
        const suffix = inputName.slice(colon + 1);
        if (prefix !== q) continue;
        if (META.has(suffix)) continue;
        matchedName = true;
      } else if (inputName === q) {
        matchedName = true;
      } else {
        continue;
      }

      const value = input.value || String(codes.length + 1);
      const labelEl = input.id
        ? document.querySelector(`label[for="${input.id}"]`)
        : null;
      const label = labelEl?.textContent?.trim() || value;
      if (!codes.includes(value)) {
        codes.push(value);
        labels[value] = label;
      }
    }

    if (codes.length === 0) return null;
    if (!matchedName && q && q !== "UNKNOWN") return null;
    return { codes, labels };
  }, name);

  if (!result || result.codes.length === 0) return null;
  return { name, type: "Multi", codes: result.codes, labels: result.labels };
}

async function labelForInput(
  page: Page,
  id: string | null,
  fallback: string,
): Promise<string> {
  if (!id) return fallback;
  const text = await page
    .locator(`label[for="${id}"]`)
    .first()
    .textContent({ timeout: 800 })
    .catch(() => null);
  return text?.trim() || fallback;
}

async function collectRadioCodes(page: Page): Promise<ClassifiedQuestion | null> {
  const name = (await extractQuestionName(page)) ?? "UNKNOWN";
  const viaDom = await collectRadiosViaDom(page, name);
  if (viaDom) return viaDom;

  const radios = page.locator(nvRadioGroupSelector(name));
  const count = await radios.count();
  if (count === 0) {
    const fallback = page.locator(NV_SELECTORS.interview.radio);
    if ((await fallback.count()) === 0) return null;
    if ((await fallback.count()) > 8) {
      const genericName = name;
      return collectRadiosViaDom(page, genericName);
    }
    return collectRadioCodesFromLocator(page, fallback, name);
  }
  if (count > 8) {
    return collectRadiosViaDom(page, name);
  }
  return collectRadioCodesFromLocator(page, radios, name);
}

async function collectRadioCodesFromLocator(
  page: Page,
  radios: ReturnType<Page["locator"]>,
  name: string,
): Promise<ClassifiedQuestion> {
  const count = await radios.count();
  const codes: string[] = [];
  const labels: Record<string, string> = {};
  let autoSubmit = false;
  let autosubmitCount = 0;

  for (let i = 0; i < count; i++) {
    const radio = radios.nth(i);
    const value = (await radio.getAttribute("value")) ?? String(i + 1);
    const id = await radio.getAttribute("id");
    if ((await radio.getAttribute("data-autosubmit")) === "true") {
      autosubmitCount++;
    }
    const label = await labelForInput(page, id, value);
    codes.push(value);
    labels[value] = label;
  }

  autoSubmit = autosubmitCount > 0 && count <= 6;

  return { name, type: "Single", codes, labels, autoSubmit };
}

async function collectCheckboxCodes(
  page: Page,
): Promise<ClassifiedQuestion | null> {
  const name = (await extractQuestionName(page)) ?? "UNKNOWN";
  const viaDom = await collectCheckboxesViaDom(page, name);
  if (viaDom) return viaDom;

  const boxes = page.locator(NV_SELECTORS.interview.checkbox);
  const count = await boxes.count();
  if (count === 0) {
    // Funky Multi may only match via .funkyradio / name prefix.
    return collectCheckboxesViaDom(page, name);
  }
  if (count > 8) {
    return collectCheckboxesViaDom(page, name);
  }

  const codes: string[] = [];
  const labels: Record<string, string> = {};

  for (let i = 0; i < count; i++) {
    const box = boxes.nth(i);
    const value = (await box.getAttribute("value")) ?? String(i + 1).padStart(2, "0");
    const id = await box.getAttribute("id");
    const label = await labelForInput(page, id, value);
    codes.push(value);
    labels[value] = label;
  }

  return { name, type: "Multi", codes, labels };
}

async function collectNvNamedOpen(
  page: Page,
  name: string,
): Promise<ClassifiedQuestion | null> {
  const named = page.locator(
    `input[name="${name}"], input[name="${name.toLowerCase()}"]`,
  );
  if ((await named.count()) === 0) return null;

  const inputName =
    (await named.first().getAttribute("name"))?.toUpperCase() ?? name;
  return {
    name,
    type: "Open",
    codes: [""],
    labels: {},
    inputName,
  };
}

async function collectOpenQuestion(page: Page): Promise<ClassifiedQuestion | null> {
  const name = await extractQuestionName(page);

  // Spontaneous Multi often embeds an Other textarea (QLABEL:O) — never treat
  // those screens as Open when coded funkyradio/checkbox options exist.
  if (name) {
    const codedMulti = await collectCheckboxesViaDom(page, name);
    if (codedMulti) return null;
  }

  if (name) {
    const named = await collectNvNamedOpen(page, name);
    if (named) return named;
  }

  const textareas = page.locator(NV_SELECTORS.interview.textarea);
  const inputs = page.locator(NV_SELECTORS.interview.textInput);
  const nvText = page.locator(NV_SELECTORS.interview.nvTextInput);
  const hasText =
    (await textareas.count()) > 0 ||
    (await inputs.count()) > 0 ||
    (await nvText.count()) > 0;
  if (!hasText) return null;

  const resolvedName = name ?? "UNKNOWN";
  const named = await collectNvNamedOpen(page, resolvedName);
  if (named) return named;

  return {
    name: resolvedName,
    type: "Open",
    codes: [""],
    labels: {},
  };
}

async function collectScaleQuestion(page: Page): Promise<ClassifiedQuestion | null> {
  const scaleRows = page.locator("table.scale tr, table.rating tr, .scale-row");
  const count = await scaleRows.count();
  if (count < 2) return null;

  const firstRow = scaleRows.first();
  const cells = firstRow.locator("td, th");
  const cellCount = await cells.count();
  const codes: string[] = [];
  for (let i = 1; i < cellCount; i++) {
    const text = (await cells.nth(i).textContent())?.trim();
    if (text) codes.push(text);
  }

  if (codes.length === 0) return null;
  const name = (await extractQuestionName(page)) ?? "UNKNOWN";
  return { name, type: "Scale", codes, labels: {} };
}

/** NV icon/tile grid (e.g. INT01 disposition screen). */
async function collectTileCodes(page: Page): Promise<ClassifiedQuestion | null> {
  const tiles = page.locator(
    'form#form div[data-value].tile, form#form div.thumbnail[data-value], form#form div[data-value].thumbnail',
  );
  const count = await tiles.count();
  if (count === 0) return null;

  const codes: string[] = [];
  const labels: Record<string, string> = {};

  for (let i = 0; i < count; i++) {
    const tile = tiles.nth(i);
    const value = (await tile.getAttribute("data-value"))?.trim();
    if (!value) continue;
    const title =
      (await tile.getAttribute("data-original-title"))?.trim() ?? value;
    if (!codes.includes(value)) {
      codes.push(value);
      labels[value] = title;
    }
  }

  if (codes.length === 0) return null;

  const name = (await extractQuestionName(page)) ?? "UNKNOWN";
  const maxAnswer = await page
    .locator(`input[name="${name}:MAXANSWER"], input[name$=":MAXANSWER"]`)
    .first()
    .inputValue()
    .catch(() => "1");
  const type = maxAnswer !== "1" ? "Multi" : "Single";

  return {
    name,
    type,
    codes,
    labels,
    tileSelect: true,
  };
}

/** NV Rev2 pages with QLABEL — prefer name from hidden field over heuristics. */
async function collectNvFormQuestion(page: Page): Promise<ClassifiedQuestion | null> {
  const nvLabel = await extractNvQuestionLabel(page);
  if (!nvLabel) return null;

  const checks = [
    collectTableGridQuestion,
    collectTileCodes,
    collectCheckboxCodes,
    collectRadioCodes,
    collectSelectCodes,
    collectScaleQuestion,
    () => collectNvNamedOpen(page, nvLabel),
    collectOpenQuestion,
  ];

  for (const check of checks) {
    const result = await check(page);
    if (result) {
      return { ...result, name: nvLabel, inputName: result.inputName ?? nvLabel };
    }
  }

  return null;
}

export async function classifyCurrentQuestion(
  page: Page,
): Promise<ClassifiedQuestion | null> {
  const nvForm = await collectNvFormQuestion(page);
  if (nvForm) return nvForm;

  const checks = [
    collectTableGridQuestion,
    collectTileCodes,
    collectCheckboxCodes,
    collectRadioCodes,
    collectSelectCodes,
    collectScaleQuestion,
    collectOpenQuestion,
  ];

  for (const check of checks) {
    const result = await check(page);
    if (result) return result;
  }

  return null;
}

export function toDiscoveredQuestion(c: ClassifiedQuestion): DiscoveredQuestion {
  return {
    name: c.name,
    type: c.type,
    codes: c.codes,
    labels: Object.keys(c.labels).length ? c.labels : undefined,
    statements:
      c.gridStatements && c.gridStatements.length > 0
        ? c.gridStatements
        : undefined,
    gridMulti: c.gridMulti,
  };
}
