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
      const funky = input.closest(".funkyradio, .radio, .checkbox, .form-check");
      const clickTarget =
        label ??
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
      const funky = target.closest(".funkyradio, .radio, .checkbox, .form-check");
      const clickTarget =
        label ??
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
