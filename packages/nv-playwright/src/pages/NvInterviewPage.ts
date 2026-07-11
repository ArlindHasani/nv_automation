import type { Page } from "playwright";
import { codesIncludeOtherSpecify, type ResolvedAnswer } from "@nv/core";
import { NV_SELECTORS } from "../selectors.js";
import {
  applyMultiSelections,
  applyNvGridMultiAnswers,
  selectMultiOption,
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

  /**
   * Fill NV Other/specify box (`QLABEL:O`) after selecting code 98.
   * Prefer the named textarea/input; also sync livespell proxy tied to that field.
   */
  async fillOtherSpecify(text: string, questionName: string): Promise<boolean> {
    const q = questionName.toUpperCase();
    const filled = await this.page
      .evaluate(
        ({ qLabel, value }) => {
          const names = [
            `${qLabel}:O`,
            `${qLabel}:o`,
            `${qLabel.toLowerCase()}:O`,
            `${qLabel.toLowerCase()}:o`,
          ];
          let wrote = false;
          for (const name of names) {
            const field = document.querySelector(
              `textarea[name="${name}"], input[name="${name}"]`,
            ) as HTMLInputElement | HTMLTextAreaElement | null;
            if (!field) continue;
            field.value = value;
            field.dispatchEvent(new Event("input", { bubbles: true }));
            field.dispatchEvent(new Event("change", { bubbles: true }));
            wrote = true;

            // Livespell hides the textarea and shows a contenteditable proxy.
            if (field.id) {
              const proxy = document.getElementById(
                `${field.id}___livespell_proxy`,
              );
              if (proxy) {
                proxy.textContent = value;
                proxy.dispatchEvent(new Event("input", { bubbles: true }));
              }
            }
          }

          // Fallback: Other textarea nested under the 98 funkyradio label.
          if (!wrote) {
            const otherInput = document.querySelector(
              `form#form input[name="${qLabel}:98"], form#form input[value="98"][name^="${qLabel}:"]`,
            ) as HTMLInputElement | null;
            const wrap = otherInput?.closest(".funkyradio-info, .funkyradio");
            const nested = wrap?.querySelector(
              "textarea, input[type='text'], input[type='TEXT']",
            ) as HTMLInputElement | HTMLTextAreaElement | null;
            if (nested) {
              nested.value = value;
              nested.dispatchEvent(new Event("input", { bubbles: true }));
              nested.dispatchEvent(new Event("change", { bubbles: true }));
              wrote = true;
            }
          }

          return wrote;
        },
        { qLabel: q, value: text },
      )
      .catch(() => false);

    if (filled) return true;

    const byName = this.page
      .locator(
        `form#form textarea[name="${q}:O"], form#form textarea[name="${q}:o"], form#form input[name="${q}:O"]`,
      )
      .first();
    if ((await byName.count()) > 0) {
      await byName.fill(text).catch(async () => {
        await byName.evaluate((el, value) => {
          (el as HTMLTextAreaElement).value = value;
          el.dispatchEvent(new Event("input", { bubbles: true }));
          el.dispatchEvent(new Event("change", { bubbles: true }));
        }, text);
      });
      return true;
    }

    return false;
  }

  async applyAnswer(answer: ResolvedAnswer): Promise<void> {
    const current = await this.getCurrentQuestion();
    if (!current) return;

    const otherText =
      answer.openText?.trim() ||
      (codesIncludeOtherSpecify(answer.codes) ? "Other" : undefined);

    switch (current.type) {
      case "Grid": {
        const answers = answer.statementAnswers;
        if (!answers) break;
        if (current.gridMulti) {
          await applyNvGridMultiAnswers(this.page, answers, current.codes);
        } else {
          for (const [questionName, codes] of Object.entries(answers)) {
            const code = codes[0];
            if (code) {
              await selectRadioOption(
                this.page,
                questionName,
                code,
                current.codes,
              );
            }
          }
        }
        break;
      }

      case "Multi":
        if (current.tileSelect) {
          for (const code of answer.codes) {
            const variants = [code];
            if (/^\d+$/.test(code)) {
              variants.push(String(Number(code)), code.padStart(2, "0"));
            }
            let clicked = false;
            for (const value of variants) {
              const tile = this.page
                .locator(
                  `form#form div[data-value="${value}"], form#form [data-value="${value}"]`,
                )
                .first();
              if ((await tile.count()) > 0) {
                await tile.click({ timeout: 5_000 }).catch(async () => {
                  await tile.click({ force: true });
                });
                clicked = true;
                break;
              }
            }
            if (!clicked) {
              await selectMultiOption(
                this.page,
                current.name,
                code,
                current.codes,
              );
            }
          }
        } else {
          await applyMultiSelections(
            this.page,
            current.name,
            answer.codes,
            current.codes,
          );
        }
        if (otherText) {
          await this.fillOtherSpecify(otherText, current.name);
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
            if (otherText) {
              await this.fillOtherSpecify(otherText, current.name);
            }
            break;
          }
        }

        const select = this.page.locator("form#form select, table#example select").first();
        if ((await select.count()) > 0) {
          await select.selectOption(code).catch(async () => {
            await select.selectOption({ label: code });
          });
          if (otherText) {
            await this.fillOtherSpecify(otherText, current.name);
          }
          break;
        }
        await selectRadioOption(this.page, current.name, code, current.codes);
        if (otherText) {
          await this.fillOtherSpecify(otherText, current.name);
        }
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
