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
      const names = [
        `${questionName}:${code}`,
        questionName,
        `${questionName.toLowerCase()}:${code}`,
        questionName.toLowerCase(),
      ];
      let input: HTMLInputElement | null = null;
      for (const candidateName of names) {
        const candidate = document.querySelector(
          `${selector}[name="${candidateName}"][value="${code}"], ${selector}[name="${candidateName}"]`,
        ) as HTMLInputElement | null;
        if (!candidate || candidate.tagName !== "INPUT") continue;
        if (
          candidateName === `${questionName}:${code}` ||
          candidateName === `${questionName.toLowerCase()}:${code}` ||
          String(candidate.value) === String(code)
        ) {
          input = candidate;
          break;
        }
      }
      if (!input) return false;
      const label = input.id
        ? document.querySelector(`label[for="${input.id}"]`)
        : null;
      const parentLabel =
        input.parentElement?.tagName === "LABEL" ? input.parentElement : null;
      const funky = input.closest(".funkyradio, .radio, .checkbox, .form-check");
      const funkyLabel = funky?.querySelector("label") ?? null;
      const clickTarget = label || parentLabel || funkyLabel || input;
      (clickTarget as HTMLElement).click();
      if (!input.checked) {
        input.checked = true;
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
      }
      return !!input.checked;
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
      const scoped: HTMLInputElement[] = [];
      const valueMatched: HTMLInputElement[] = [];
      for (const input of inputs) {
        const matchesValue =
          values.includes(input.value) ||
          values.includes(String(Number(input.value)));
        if (!matchesValue) continue;
        valueMatched.push(input);
        const inputName = String(input.name || "").toUpperCase();
        const nameOk =
          inputName === q ||
          inputName === `${q}:${String(input.value || "").toUpperCase()}` ||
          inputName.startsWith(`${q}:`);
        if (nameOk) scoped.push(input);
      }
      const pool = scoped.length > 0 ? scoped : valueMatched;
      let target: HTMLInputElement | null = null;
      for (const input of pool) {
        if (input.id === `${qName}_${values[0]}`) {
          target = input;
          break;
        }
      }
      if (!target) target = pool[0] ?? null;
      if (!target) {
        for (const input of pool) {
          if (input.id?.toUpperCase().startsWith(`${q}:${values[0]}`)) {
            target = input;
            break;
          }
        }
      }
      if (!target) return false;
      const label = target.id
        ? document.querySelector(`label[for="${target.id}"]`)
        : null;
      const parentLabel =
        target.parentElement?.tagName === "LABEL" ? target.parentElement : null;
      const funky = target.closest(".funkyradio, .radio, .checkbox, .form-check");
      const funkyLabel = funky?.querySelector("label") ?? null;
      const clickTarget = label || parentLabel || funkyLabel || target;
      (clickTarget as HTMLElement).click();
      if (!target.checked) {
        target.checked = true;
        target.dispatchEvent(new Event("input", { bubbles: true }));
        target.dispatchEvent(new Event("change", { bubbles: true }));
      }
      return !!target.checked;
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

/**
 * Check all Multi codes in one DOM pass.
 * Prefer setting `checked` directly — label clicks on some NV funkyradio skins
 * can behave like exclusive radios and leave only the last option selected.
 */
export async function applyMultiSelections(
  page: Page,
  questionName: string,
  codes: string[],
  knownValues?: string[],
): Promise<void> {
  if (codes.length === 0) return;

  const payload = codes.map((code) => ({
    code,
    variants: codeVariants(code, knownValues),
  }));

  // Keep this evaluate flat (no nested named/const fns). tsx injects
  // `__name(...)` into nested functions; Playwright serializes that into the
  // page where `__name` does not exist → ReferenceError on live workers.
  const result = await page.evaluate(
    ({ qName, items }) => {
      const q = String(qName).toUpperCase();
      const qLower = q.toLowerCase();
      const missing: string[] = [];
      const checkedValues: string[] = [];

      for (const item of items) {
        let input: HTMLInputElement | null = null;
        for (const value of item.variants) {
          input = document.querySelector(
            `form#form input[name="${q}:${value}"], form#form input[name="${qLower}:${value}"]`,
          ) as HTMLInputElement | null;
          if (input) break;
          input = document.querySelector(
            `form#form input[name="${q}"][value="${value}"], form#form input[name="${qLower}"][value="${value}"]`,
          ) as HTMLInputElement | null;
          if (input) break;
        }
        if (!input) {
          missing.push(item.code);
          continue;
        }

        const type = String(input.type || "").toLowerCase();
        const inputName = String(input.name || "").toUpperCase();
        // Shared-name radios are exclusive (last click wins). Unique
        // QUESTION:code names can each stay checked independently.
        if (type === "radio" && inputName === q) {
          missing.push(item.code);
          continue;
        }

        input.checked = true;
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
        if (input.checked) checkedValues.push(String(input.value));
      }

      const scoped = Array.from(
        document.querySelectorAll("form#form input"),
      ) as HTMLInputElement[];
      let totalChecked = 0;
      for (const input of scoped) {
        if (!input.checked) continue;
        const name = String(input.name || "").toUpperCase();
        if (name !== q && !name.startsWith(`${q}:`)) continue;
        const type = String(input.type || "").toLowerCase();
        if (type === "checkbox" || (type === "radio" && name.startsWith(`${q}:`))) {
          totalChecked += 1;
        }
      }

      return { missing, checkedValues, totalChecked };
    },
    { qName: questionName, items: payload },
  );

  if (result.totalChecked >= codes.length && result.missing.length === 0) {
    return;
  }

  // Fallback: per-code selectMultiOption for any still missing.
  for (const code of codes) {
    const variants = codeVariants(code, knownValues);
    const already = variants.some((v) => result.checkedValues.includes(v));
    if (already) continue;
    await selectMultiOption(page, questionName, code, knownValues);
  }

  const verify = await page.evaluate(
    ({ qName, wanted }) => {
      const q = String(qName).toUpperCase();
      const checked = new Set<string>();
      const types: string[] = [];
      const inputs = Array.from(
        document.querySelectorAll("form#form input"),
      ) as HTMLInputElement[];
      for (const input of inputs) {
        const name = String(input.name || "").toUpperCase();
        if (name !== q && !name.startsWith(`${q}:`)) continue;
        types.push(String(input.type || ""));
        if (input.checked) checked.add(String(input.value));
      }
      const unresolved: string[] = [];
      for (const code of wanted) {
        const variants = [code];
        if (/^\d+$/.test(code)) {
          variants.push(String(Number(code)), code.padStart(2, "0"));
        }
        let found = false;
        for (const v of variants) {
          if (checked.has(v)) {
            found = true;
            break;
          }
        }
        if (!found) unresolved.push(code);
      }
      return { checkedCount: checked.size, unresolved, types };
    },
    { qName: questionName, wanted: codes },
  );

  if (verify.unresolved.length > 0) {
    const radioOnly = verify.types.every(
      (t) => String(t).toLowerCase() === "radio",
    );
    throw new Error(
      radioOnly
        ? `Multi '${questionName}' only has radio inputs — cannot select ${codes.join(",")}`
        : `Multi '${questionName}' failed to check: ${verify.unresolved.join(",")} (checked ${verify.checkedCount}/${codes.length})`,
    );
  }
}

/**
 * Select one Multi option. NV spontaneous multi often uses per-code names
 * (`D0_1B:03`) like grid cells — try that first, then shared-name checkbox,
 * funkyradio labels, and loose DOM fallback. Never use radios for Multi.
 */
export async function selectMultiOption(
  page: Page,
  questionName: string,
  code: string,
  knownValues?: string[],
): Promise<void> {
  const variants = codeVariants(code, knownValues);

  // Prefer QUESTION:code inputs (spontaneous Multi / funkyradio).
  for (const value of variants) {
    try {
      await selectNvGridCheckbox(page, questionName, value, knownValues);
      return;
    } catch {
      // fall through
    }
  }

  for (const value of variants) {
    const tile = page
      .locator(
        `form#form div[data-value="${value}"], form#form div.thumbnail[data-value="${value}"], form#form [data-value="${value}"]`,
      )
      .first();
    if ((await tile.count()) > 0) {
      await tile.scrollIntoViewIfNeeded().catch(() => {});
      await tile.click({ timeout: 5_000 }).catch(async () => {
        await tile.click({ force: true, timeout: 5_000 });
      });
      return;
    }
  }

  try {
    await selectInputOption(page, "checkbox", questionName, code, knownValues);
    return;
  } catch {
    // fall through — never use radios for Multi (exclusive / last-wins).
  }

  // Click visible label text (e.g. "03 - Claude (Anthropic)").
  for (const value of variants) {
    const byFor = page.locator(
      `form#form label[for="${questionName}:${value}"], form#form label[for^="${questionName}:${value}_"], form#form label[for*="${questionName}_${value}" i]`,
    );
    if ((await byFor.count()) > 0) {
      await byFor.first().click({ timeout: 5_000 });
      return;
    }

    const byText = page
      .locator("form#form label, form#form .funkyradio label")
      .filter({ hasText: new RegExp(`^\\s*${value}\\b`) })
      .first();
    if ((await byText.count()) > 0) {
      await byText.scrollIntoViewIfNeeded().catch(() => {});
      await byText.click({ timeout: 5_000 });
      return;
    }
  }

  // Last resort: force-check matching checkbox via DOM (no radio).
  const clicked = await page.evaluate(
    ({ qName, values }) => {
      const inputs = Array.from(
        document.querySelectorAll("form#form input"),
      ) as HTMLInputElement[];
      const q = String(qName).toUpperCase();
      for (const input of inputs) {
        const type = String(input.type || "").toLowerCase();
        if (type && type !== "checkbox") continue;
        const name = String(input.name || "").toUpperCase();
        const val = String(input.value || "");
        const valNum = String(Number(val));
        const valueMatch = values.includes(val) || values.includes(valNum);
        if (!valueMatch) continue;
        if (name && name !== q && !name.startsWith(`${q}:`)) continue;
        input.checked = true;
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
        return !!input.checked;
      }
      return false;
    },
    { qName: questionName, values: variants },
  );
  if (clicked) return;

  throw new Error(`Multi option not found: ${questionName}=${code}`);
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
  // Pass QLABEL + code (not the already-joined field name) so DOM helpers
  // can resolve both shared-name and QUESTION:code spontaneous Multi inputs.
  if (await clickInputViaDom(page, "checkbox", base, column)) return;

  const selector = `input[type="checkbox"][name="${fieldName}"], input[type="CHECKBOX"][name="${fieldName}"]`;
  const input = page.locator(selector).first();
  if ((await input.count()) === 0) {
    throw new Error(`Grid checkbox not found: ${fieldName}`);
  }

  const id = await input.getAttribute("id");
  if (id) {
    const label = page.locator(`label[for="${id}"]`).first();
    if ((await label.count()) > 0) {
      await label.click({ timeout: 5_000 }).catch(() => {});
      if (await isChecked(page, selector)) return;
    }
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

  const missing = await page.evaluate(({ gridEntries }) => {
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
          input.parentElement?.tagName === "LABEL" ? input.parentElement : null;
        if (!input.checked) {
          (label || input).click();
        }
        if (!input.checked) {
          input.checked = true;
        }
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
      }
    }
    return notFound;
  }, { gridEntries: entries });

  if (missing.length > 0) {
    throw new Error(`Grid checkbox not found: ${missing.join(", ")}`);
  }

  const stillUnchecked = await page.evaluate((gridEntries) => {
    const bad: string[] = [];
    for (const [question, codes] of gridEntries) {
      for (const code of codes) {
        const fieldName = `${question}:${code}`;
        const input = document.querySelector(
          `input[type="checkbox"][name="${fieldName}"], input[type="CHECKBOX"][name="${fieldName}"]`,
        ) as HTMLInputElement | null;
        if (!input || !input.checked) bad.push(fieldName);
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
    for (const [question, codes] of gridEntries) {
      for (const code of codes) {
        const fieldName = `${question}:${code}`;
        const input = document.querySelector(
          `input[type="checkbox"][name="${fieldName}"], input[type="CHECKBOX"][name="${fieldName}"]`,
        ) as HTMLInputElement | null;
        if (!input || !input.checked) bad.push(fieldName);
      }
    }
    return bad;
  }, entries);

  if (remaining.length > 0) {
    throw new Error(`Grid checkbox not checked: ${remaining.join(", ")}`);
  }
}

/** Statement names in a radio grid that still have no selected answer. */
export async function unansweredGridRadioStatements(
  page: Page,
  statementNames: string[],
): Promise<string[]> {
  if (statementNames.length === 0) return [];
  return page.evaluate((names) => {
    const unanswered: string[] = [];
    for (const raw of names) {
      const q = String(raw).toUpperCase();
      const qLower = q.toLowerCase();
      const inputs = Array.from(
        document.querySelectorAll(
          `form#form input[type="radio"][name="${q}"], form#form input[type="RADIO"][name="${q}"], form#form input[type="radio"][name^="${q}:"], form#form input[type="RADIO"][name^="${q}:"], form#form input[type="radio"][name="${qLower}"], form#form input[type="RADIO"][name="${qLower}"]`,
        ),
      ) as HTMLInputElement[];
      if (inputs.length === 0) {
        unanswered.push(raw);
        continue;
      }
      if (!inputs.some((input) => input.checked)) unanswered.push(raw);
    }
    return unanswered;
  }, statementNames);
}

/** How many Multi options are currently checked for a question. */
export async function countCheckedMultiOptions(
  page: Page,
  questionName: string,
): Promise<number> {
  return page.evaluate((qName) => {
    const q = String(qName).toUpperCase();
    const inputs = Array.from(
      document.querySelectorAll("form#form input"),
    ) as HTMLInputElement[];
    let count = 0;
    for (const input of inputs) {
      if (!input.checked) continue;
      const name = String(input.name || "").toUpperCase();
      if (name !== q && !name.startsWith(`${q}:`)) continue;
      const type = String(input.type || "").toLowerCase();
      if (type === "checkbox" || (type === "radio" && name.startsWith(`${q}:`))) {
        count += 1;
      }
    }
    return count;
  }, questionName);
}
