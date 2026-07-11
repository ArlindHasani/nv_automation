import type { Page } from "playwright";
import { formatQuestId } from "@nv/core";
import { NV_SELECTORS } from "../selectors.js";
import { findFirstVisible } from "../question-classifier.js";

export class NvHomePage {
  constructor(private readonly page: Page) {}

  async waitForHome(timeoutMs = 60_000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (await this.isOnHome()) return;
      await this.page.waitForTimeout(400);
    }
    throw new Error("Timed out waiting for NV interviewer home screen");
  }

  async isOnHome(): Promise<boolean> {
    const startForm = await findFirstVisible(this.page, NV_SELECTORS.home.form);
    const questInput = await findFirstVisible(this.page, NV_SELECTORS.home.questInput);
    return Boolean(startForm && questInput);
  }

  /**
   * Home screen loop: Select Case (ID) → type quest → Start.
   * After the interview ends, NV returns here for the next quest (or EXIT).
   *
   * NV pads the quest and enables #startCase on `keyup`. Playwright `fill()` +
   * `blur()` skips that handler; focusout then writes the unset `qID` and clears
   * the field — so we type keystrokes instead.
   */
  async startCaseByQuest(rawQuest: unknown): Promise<string> {
    const quest = formatQuestId(rawQuest);
    if (!quest) throw new Error("Quest id is empty — check dataset quest column");

    await this.waitForHome();

    const recLabel = this.page.locator(
      'label:has(input[name="nv_manual_type"][value="REC"])',
    );
    if ((await recLabel.count()) > 0) {
      await recLabel.first().click();
    } else {
      const recRadio = this.page.locator(NV_SELECTORS.home.recRadio[0]!);
      if ((await recRadio.count()) > 0) {
        await recRadio.first().check({ force: true }).catch(async () => {
          await recRadio.first().click({ force: true });
        });
      }
    }

    const questInput = await findFirstVisible(this.page, NV_SELECTORS.home.questInput);
    if (!questInput) throw new Error("Quest input (#inputRecTel) not found on home screen");

    await questInput.click();
    await questInput.fill("");
    await questInput.pressSequentially(quest, { delay: 15 });

    const startCase = this.page.locator(NV_SELECTORS.home.startCase[0]!);
    await startCase.waitFor({ state: "visible", timeout: 10_000 });
    await this.page.waitForFunction(
      () => {
        const btn = document.querySelector("#startCase") as HTMLButtonElement | null;
        return Boolean(btn && !btn.disabled);
      },
      undefined,
      { timeout: 10_000 },
    );
    await startCase.click();

    await this.page.waitForLoadState("domcontentloaded");
    await this.page.waitForTimeout(1000);
    return quest;
  }

  async exit(): Promise<void> {
    const exitBtn = await findFirstVisible(this.page, NV_SELECTORS.home.exit);
    if (exitBtn) {
      await exitBtn.click();
      await this.page.waitForLoadState("domcontentloaded");
      return;
    }

    const exitForm = this.page.locator(NV_SELECTORS.home.exitForm[0]!);
    if ((await exitForm.count()) > 0) {
      await exitForm.evaluate((form: HTMLFormElement) => form.submit());
      await this.page.waitForLoadState("domcontentloaded");
    }
  }
}
