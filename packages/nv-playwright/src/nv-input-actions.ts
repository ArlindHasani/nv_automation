import type { Page } from "playwright";
import {
  nvCheckboxSelector,
  nvRadioSelector,
} from "./selectors.js";

async function isChecked(page: Page, selector: string): Promise<boolean> {
  return page.locator(selector).first().isChecked().catch(() => false);
}

function codeVariants(code: string, knownValues?: string[]): string[] {
  const set = new Set<string>([code]);
  if (/^\d+$/.test(code)) {
    const n = Number(code);
    set.add(String(n));
    set.add(String(n).padStart(2, "0"));
  }
  if (knownValues) {
    for (const kv of knownValues) {
      if (Number(kv) === Number(code) || kv === code) {
        set.add(kv);
      }
    }
  }
  return [...set];
}

/** Map dataset / definition codes to NV grid column ids (e.g. "01" → "1" for BE151:1). */
export function resolveGridColumnCode(
  code: string,
  availableCodes: string[],
): string {
  const trimmed = String(code).trim();
  if (availableCodes.includes(trimmed)) return trimmed;

  if (/^\d+$/.test(trimmed)) {
    const asNum = String(Number(trimmed));
    if (availableCodes.includes(asNum)) return asNum;
    const padded = trimmed.padStart(2, "0");
    if (availableCodes.includes(padded)) return padded;
    for (const candidate of availableCodes) {
      if (Number(candidate) === Number(trimmed)) return candidate;
    }
  }

  return trimmed;
}

export function normalizeGridStatementCodes(
  codes: string[],
  availableCodes: string[],
): string[] {
  const normalized: string[] = [];
  for (const code of codes) {
    const resolved = resolveGridColumnCode(code, availableCodes);
    if (!normalized.includes(resolved)) normalized.push(resolved);
  }
  return normalized;
}

async function clickInputViaDom(
  page: Page,
  kind: "radio" | "checkbox",
  name: string,
  value: string,
): Promise<boolean> {
  return page.evaluate(
    ({ inputKind, questionName, code }) => {
      const selector =
        inputKind === "radio"
          ? 'input[type="radio"], input[type="RADIO"]'
          : 'input[type="checkbox"], input[type="CHECKBOX"]';
      const input = document.querySelector(
        `${selector}[name="${questionName}"][value="${code}"], ${selector}[name="${questionName.toLowerCase()}"][value="${code}"]`,
      ) as HTMLInputElement | null;
      if (!input) return false;

      const label = input.id
        ? (document.querySelector(`label[for="${input.id}"]`) as HTMLElement | null)
        : null;
      const parentLabel =
        input.parentElement?.tagName === "LABEL"
          ? (input.parentElement as HTMLElement)
          : null;
      const funky = input.closest(".funkyradio, .radio, .checkbox, .form-check");
      const clickTarget =
        label ??
        parentLabel ??
        (funky?.querySelector("label") as HTMLElement | null) ??
        input;

      clickTarget.click();
      if (!input.checked) {
        input.checked = true;
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
      }
      return input.checked;
    },
    { inputKind: kind, questionName: name, code: value },
  );
}

async function clickInputLoose(
  page: Page,
  kind: "radio" | "checkbox",
  questionName: string,
  code: string,
  knownValues?: string[],
): Promise<boolean> {
  const variants = codeVariants(code, knownValues);
  return page.evaluate(
    ({ inputKind, qName, values }) => {
      const selector =
        inputKind === "radio"
          ? 'input[type="radio"], input[type="RADIO"]'
          : 'input[type="checkbox"], input[type="CHECKBOX"]';
      const inputs = Array.from(
        document.querySelectorAll(selector),
      ) as HTMLInputElement[];
      const q = qName.toUpperCase();

      const matches = (input: HTMLInputElement) =>
        values.includes(input.value) ||
        values.includes(String(Number(input.value)));

      const scoped = inputs.filter(
        (input) =>
          input.name.toUpperCase() === q &&
          matches(input),
      );
      const pool = scoped.length > 0 ? scoped : inputs.filter(matches);

      const target =
        pool.find((el) => el.id === `${qName}_${values[0]}`) ??
        pool[0];
      if (!target) return false;

      const label = target.id
        ? (document.querySelector(`label[for="${target.id}"]`) as HTMLElement | null)
        : null;
      const parentLabel =
        target.parentElement?.tagName === "LABEL"
          ? (target.parentElement as HTMLElement)
          : null;
      const funky = target.closest(".funkyradio, .radio, .checkbox, .form-check");
      const clickTarget =
        label ??
        parentLabel ??
        (funky?.querySelector("label") as HTMLElement | null) ??
        target;

      clickTarget.click();
      if (!target.checked) {
        target.checked = true;
        target.dispatchEvent(new Event("input", { bubbles: true }));
        target.dispatchEvent(new Event("change", { bubbles: true }));
      }
      return target.checked;
    },
    { inputKind: kind, qName: questionName, values: variants },
  );
}

async function selectInputOption(
  page: Page,
  kind: "radio" | "checkbox",
  questionName: string,
  code: string,
  knownValues?: string[],
): Promise<void> {
  const name = questionName.toUpperCase();
  const selectorFn = kind === "radio" ? nvRadioSelector : nvCheckboxSelector;

  for (const value of codeVariants(code, knownValues)) {
    const selector = selectorFn(name, value);
    const input = page.locator(selector).first();
    if ((await input.count()) === 0) continue;

    const id = await input.getAttribute("id");
    if (id) {
      const label = page.locator(`label[for="${id}"]`).first();
      if ((await label.count()) > 0) {
        await label.click({ timeout: 5_000 }).catch(() => {});
        if (await isChecked(page, selector)) return;
      }
    }

    if (
      await input.evaluate((el) => el.parentElement?.tagName === "LABEL")
    ) {
      await input.locator("xpath=..").click({ timeout: 5_000 }).catch(() => {});
      if (await isChecked(page, selector)) return;
    }

    if (await clickInputViaDom(page, kind, name, value)) return;

    const visible = await input.isVisible().catch(() => false);
    if (visible) {
      await input.check({ timeout: 5_000 });
      return;
    }

    await input.check({ force: true, timeout: 5_000 });
    return;
  }

  if (await clickInputLoose(page, kind, name, code, knownValues)) return;

  throw new Error(
    `${kind === "radio" ? "Radio" : "Checkbox"} option not found: ${name}=${code}`,
  );
}

/** Select a radio — NV often hides inputs; click label / funkyradio wrapper. */
export async function selectRadioOption(
  page: Page,
  questionName: string,
  code: string,
  knownValues?: string[],
): Promise<void> {
  return selectInputOption(page, "radio", questionName, code, knownValues);
}

/** Toggle a checkbox — same hidden-input pattern as radios. */
export async function selectCheckboxOption(
  page: Page,
  questionName: string,
  code: string,
  knownValues?: string[],
): Promise<void> {
  return selectInputOption(page, "checkbox", questionName, code, knownValues);
}

/** NV table grid checkbox — field name is QUESTION:code (e.g. BE151:1). */
export async function selectNvGridCheckbox(
  page: Page,
  questionName: string,
  code: string,
  knownValues?: string[],
): Promise<void> {
  const base = questionName.toUpperCase();
  const column = resolveGridColumnCode(code, knownValues ?? []);
  const fieldName = `${base}:${column}`;
  if (await clickInputViaDom(page, "checkbox", fieldName, column)) return;

  const selector = `input[type="checkbox"][name="${fieldName}"], input[type="CHECKBOX"][name="${fieldName}"]`;
  const input = page.locator(selector).first();
  if ((await input.count()) === 0) {
    throw new Error(`Grid checkbox not found: ${fieldName}`);
  }

  if (await input.evaluate((el) => el.parentElement?.tagName === "LABEL")) {
    await input.locator("xpath=..").click({ timeout: 5_000 }).catch(() => {});
    if (await isChecked(page, selector)) return;
  }

  await input.check({ force: true, timeout: 5_000 });
  await input.evaluate((el) => {
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

/** Apply all checkbox-grid statement answers in one DOM pass (NV table#example). */
export async function applyNvGridMultiAnswers(
  page: Page,
  answers: Record<string, string[]>,
  availableCodes: string[],
): Promise<void> {
  await page.locator("table#example").scrollIntoViewIfNeeded().catch(() => {});

  const entries = Object.entries(answers).map(([question, codes]) => [
    question.toUpperCase(),
    normalizeGridStatementCodes(codes, availableCodes),
  ]) as Array<[string, string[]]>;

  const missing = await page.evaluate(
    ({ gridEntries, available }) => {
      const notFound: string[] = [];

      for (const [question, codes] of gridEntries) {
        for (const code of codes) {
          const fieldName = `${question}:${code}`;
          const input = document.querySelector(
            `input[type="checkbox"][name="${fieldName}"], input[type="CHECKBOX"][name="${fieldName}"]`,
          ) as HTMLInputElement | null;
          if (!input) {
            notFound.push(fieldName);
            continue;
          }

          const label =
            input.parentElement?.tagName === "LABEL"
              ? (input.parentElement as HTMLElement)
              : null;

          if (!input.checked) {
            (label ?? input).click();
          }
          if (!input.checked) {
            input.checked = true;
          }
          input.dispatchEvent(new Event("input", { bubbles: true }));
          input.dispatchEvent(new Event("change", { bubbles: true }));
        }
      }

      return notFound;
    },
    { gridEntries: entries, available: availableCodes },
  );

  if (missing.length > 0) {
    throw new Error(`Grid checkbox not found: ${missing.join(", ")}`);
  }

  const stillUnchecked = await page.evaluate((gridEntries) => {
    const bad: string[] = [];
    for (const [question, codes] of gridEntries as Array<[string, string[]]>) {
      for (const code of codes) {
        const fieldName = `${question}:${code}`;
        const input = document.querySelector(
          `input[type="checkbox"][name="${fieldName}"], input[type="CHECKBOX"][name="${fieldName}"]`,
        ) as HTMLInputElement | null;
        if (!input?.checked) bad.push(fieldName);
      }
    }
    return bad;
  }, entries);

  for (const fieldName of stillUnchecked) {
    const [question, code] = fieldName.split(":");
    if (!question || !code) continue;
    await selectNvGridCheckbox(page, question, code, availableCodes);
  }

  const remaining = await page.evaluate((gridEntries) => {
    const bad: string[] = [];
    for (const [question, codes] of gridEntries as Array<[string, string[]]>) {
      for (const code of codes) {
        const fieldName = `${question}:${code}`;
        const input = document.querySelector(
          `input[type="checkbox"][name="${fieldName}"], input[type="CHECKBOX"][name="${fieldName}"]`,
        ) as HTMLInputElement | null;
        if (!input?.checked) bad.push(fieldName);
      }
    }
    return bad;
  }, entries);

  if (remaining.length > 0) {
    throw new Error(`Grid checkbox not checked: ${remaining.join(", ")}`);
  }
}
