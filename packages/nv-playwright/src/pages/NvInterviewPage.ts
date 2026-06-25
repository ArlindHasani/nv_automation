import type { Page } from "playwright";
import type { ResolvedAnswer } from "@nv/core";
import { NV_SELECTORS } from "../selectors.js";
import {
  selectCheckboxOption,
  selectRadioOption,
} from "../nv-input-actions.js";
import {
  classifyCurrentQuestion,
  findFirstVisible,
  type ClassifiedQuestion,
} from "../question-classifier.js";

export class NvInterviewPage {
  constructor(private readonly page: Page) {}

  async getCurrentQuestion(): Promise<ClassifiedQuestion | null> {
    return classifyCurrentQuestion(this.page);
  }

  async fillOpenText(text: string, inputName?: string): Promise<boolean> {
    const name = inputName?.toUpperCase();

    if (name) {
      const filled = await this.page
        .evaluate(
          ({ fieldName, value }) => {
            const input = document.querySelector(
              `input[name="${fieldName}"], input[name="${fieldName.toLowerCase()}"]`,
            ) as HTMLInputElement | null;
            if (input) {
              input.value = value;
              input.dispatchEvent(new Event("input", { bubbles: true }));
              input.dispatchEvent(new Event("change", { bubbles: true }));
            }

            const proxy = document.querySelector(
              '[id^="livespell__input"][contenteditable="plaintext-only"], [id^="livespell__input"][contenteditable="true"]',
            ) as HTMLElement | null;
            if (proxy) {
              proxy.textContent = value;
              proxy.dispatchEvent(new Event("input", { bubbles: true }));
            }

            return Boolean(input || proxy);
          },
          { fieldName: name, value: text },
        )
        .catch(() => false);
      if (filled) return true;
    }

    const textarea = this.page.locator(NV_SELECTORS.interview.textarea).first();
    if ((await textarea.count()) > 0) {
      await textarea.fill(text);
      return true;
    }

    for (const sel of [
      NV_SELECTORS.interview.nvTextInput,
      NV_SELECTORS.interview.textInput,
    ]) {
      const input = this.page.locator(sel).first();
      if ((await input.count()) > 0) {
        await input.fill(text).catch(async () => {
          await input.evaluate((el, value) => {
            (el as HTMLInputElement).value = value;
          }, text);
        });
        return true;
      }
    }

    return false;
  }

  async applyAnswer(answer: ResolvedAnswer): Promise<void> {
    const current = await this.getCurrentQuestion();
    if (!current) return;

    switch (current.type) {
      case "Multi":
        for (const code of answer.codes) {
          await selectCheckboxOption(
            this.page,
            current.name,
            code,
            current.codes,
          );
        }
        break;

      case "Open":
        if (answer.openText !== undefined) {
          await this.fillOpenText(answer.openText, current.inputName ?? current.name);
        }
        break;

      case "Scale":
      case "Single":
      default: {
        const code = answer.codes[0];
        if (!code) break;

        if (current.tileSelect) {
          const tile = this.page
            .locator(`form#form div[data-value="${code}"]`)
            .first();
          if ((await tile.count()) > 0) {
            await tile.click();
            break;
          }
        }

        const select = this.page.locator("form#form select, table#example select").first();
        if ((await select.count()) > 0) {
          await select.selectOption(code).catch(async () => {
            await select.selectOption({ label: code });
          });
          break;
        }
        await selectRadioOption(this.page, current.name, code, current.codes);
        break;
      }
    }
  }

  async clickNext(): Promise<void> {
    const next = await findFirstVisible(this.page, NV_SELECTORS.interview.nextButton);
    if (!next) throw new Error("Next button not found");
    await next.click();
  }

  async waitForQuestionChange(
    previousName: string,
    timeoutMs = 15000,
  ): Promise<string | null> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      await this.page.waitForTimeout(500);
      const current = await this.getCurrentQuestion();
      if (current && current.name !== previousName) {
        return current.name;
      }
    }
    return null;
  }

  async hasErrorBanner(): Promise<boolean> {
    for (const sel of NV_SELECTORS.interview.errorBanner) {
      const loc = this.page.locator(sel).first();
      if ((await loc.count()) > 0 && (await loc.isVisible().catch(() => false))) {
        return true;
      }
    }
    return false;
  }
}
