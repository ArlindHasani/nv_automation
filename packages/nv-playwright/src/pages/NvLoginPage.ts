import type { Locator, Page } from "playwright";
import type { DataRow, ProjectConfig, WorkerProfile } from "@nv/core";
import { NV_SELECTORS } from "../selectors.js";
import { findFirstVisible } from "../question-classifier.js";

export interface LoginCredentials {
  station: string;
  password: string;
  id: string;
  project: string;
  group?: string;
  mode?: string;
}

/** Map UI / config labels to NV `<option value>`. */
const MODE_VALUES: Record<string, string> = {
  freestyle: "freestyle",
  predictive: "pd",
  power: "power",
  "manual (with phone)": "manualp",
  "manual (with voiso)": "manualv",
  manual: "manual",
  completamento: "completion",
  completion: "completion",
  allungamento: "stretching",
  stretching: "stretching",
  c2: "c2",
  cloning: "cloning",
};

/** @deprecated Live workers use loginWithProfile instead. */
export function credentialsFromDataRow(
  row: DataRow,
  config: ProjectConfig,
): LoginCredentials {
  const map = config.savFieldMap;
  const get = (key: keyof typeof map): string => {
    const field = map[key];
    if (!field) return "";
    const val = row[field];
    return val !== undefined && val !== null ? String(val) : "";
  };

  return {
    station: get("station"),
    password: get("password"),
    id: get("id"),
    project: get("project"),
    mode: config.mode,
  };
}

async function fillField(
  page: Page,
  selectors: readonly string[],
  value: string,
): Promise<Locator | null> {
  const loc = await findFirstVisible(page, selectors);
  if (!loc) return null;
  await loc.fill(value);
  return loc;
}

async function selectField(
  page: Page,
  selectors: readonly string[],
  value: string,
): Promise<boolean> {
  const loc = await findFirstVisible(page, selectors);
  if (!loc) return false;
  await loc.selectOption({ value }).catch(async () => {
    await loc.selectOption({ label: value }).catch(async () => {
      await loc.selectOption(value);
    });
  });
  return true;
}

function resolveModeValue(mode: string): string {
  const key = mode.trim().toLowerCase();
  return MODE_VALUES[key] ?? key;
}

async function readLoginError(page: Page): Promise<string | null> {
  const error = page.locator(".login_result .error").first();
  if ((await error.count()) === 0) return null;
  const text = (await error.innerText().catch(() => "")).trim();
  return text || null;
}

async function assertNoLoginError(page: Page): Promise<void> {
  const text = await readLoginError(page);
  if (text) throw new Error(`NV login error: ${text}`);
}

async function waitForVisible(
  page: Page,
  selectors: readonly string[],
  label: string,
  timeoutMs = 45_000,
): Promise<Locator> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await assertNoLoginError(page);
    const loc = await findFirstVisible(page, selectors);
    if (loc) return loc;
    await page.waitForTimeout(250);
  }
  throw new Error(`${label} did not become visible after login step`);
}

async function triggerFieldCommit(loc: Locator): Promise<void> {
  await loc.evaluate((el) => {
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await loc.blur();
}

export class NvLoginPage {
  constructor(private readonly page: Page) {}

  async goto(loginUrl: string): Promise<void> {
    await this.page.goto(loginUrl, {
      waitUntil: "load",
      timeout: 60_000,
    });
    await this.page.waitForLoadState("domcontentloaded");
  }

  /**
   * NV reveals `.group-project` and fills `#inputProject` after station/password
   * succeed and the interviewer ID (s_ini) is accepted.
   */
  async waitForProjectDropdown(timeoutMs = 45_000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      await assertNoLoginError(this.page);
      const project = await findFirstVisible(this.page, NV_SELECTORS.login.project);
      if (project) {
        const count = await this.page.locator("#inputProject option").count();
        const usable = await this.page
          .locator("#inputProject option")
          .evaluateAll((opts) =>
            opts.some((o) => {
              const el = o as HTMLOptionElement;
              return Boolean(el.value?.trim()) && !el.disabled;
            }),
          );
        if (count >= 1 && usable) return;
      }
      await this.page.waitForTimeout(300);
    }
    throw new Error("Project dropdown did not load after login credentials");
  }

  async waitForModeReady(modeValue: string, timeoutMs = 30_000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      await assertNoLoginError(this.page);
      const mode = await findFirstVisible(this.page, NV_SELECTORS.login.mode);
      if (mode) {
        const enabled = await this.page
          .locator(`#inputMode option[value="${modeValue}"]`)
          .evaluateAll((opts) =>
            opts.some((o) => !(o as HTMLOptionElement).disabled),
          );
        if (enabled) return;
        // Freestyle may appear under label even if value lookup differs.
        const byLabel = await mode
          .locator("option:not([disabled])")
          .evaluateAll((opts) => opts.map((o) => (o as HTMLOptionElement).value));
        if (byLabel.includes(modeValue)) return;
      }
      await this.page.waitForTimeout(250);
    }
    throw new Error(`Mode "${modeValue}" did not become available after project selection`);
  }

  /**
   * Progressive NV15 login:
   * station + password → wait for ID → ID → wait for project → project
   * → wait for mode → mode → wait for submit → submit.
   */
  async loginWithProfile(
    profile: WorkerProfile,
    config: ProjectConfig,
  ): Promise<void> {
    const station = await fillField(
      this.page,
      NV_SELECTORS.login.station,
      profile.station,
    );
    if (!station) throw new Error("Station field not found on login page");

    const password = await fillField(
      this.page,
      NV_SELECTORS.login.password,
      profile.password,
    );
    if (!password) throw new Error("Password field not found on login page");
    await triggerFieldCommit(password);

    // Station/password AJAX unlocks `.nv_successfulLogin` / `#inputID`.
    let idField: Locator;
    try {
      idField = await waitForVisible(
        this.page,
        NV_SELECTORS.login.id,
        "Interviewer ID (s_ini)",
        12_000,
      );
    } catch {
      // Some NV builds validate on Enter rather than blur.
      await password.press("Enter");
      idField = await waitForVisible(
        this.page,
        NV_SELECTORS.login.id,
        "Interviewer ID (s_ini)",
      );
    }
    await idField.fill(profile.callerId);
    await triggerFieldCommit(idField);

    await this.waitForProjectDropdown();

    const projectId = config.nvProjectId?.trim();
    if (projectId) {
      const selected = await selectField(
        this.page,
        NV_SELECTORS.login.project,
        projectId,
      );
      if (!selected) throw new Error(`Could not select project "${projectId}"`);
      const projectLoc = await findFirstVisible(this.page, NV_SELECTORS.login.project);
      if (projectLoc) await triggerFieldCommit(projectLoc);
    }

    const group = profile.group ?? config.nvGroup?.trim();
    if (group) {
      await waitForVisible(this.page, NV_SELECTORS.login.group, "Group", 15_000).catch(
        () => null,
      );
      await selectField(this.page, NV_SELECTORS.login.group, group);
    }

    const modeLabel = config.mode ?? "Freestyle";
    const modeValue = resolveModeValue(modeLabel);
    await this.waitForModeReady(modeValue);
    const modeSelected = await selectField(
      this.page,
      NV_SELECTORS.login.mode,
      modeValue,
    );
    if (!modeSelected) {
      const byLabel = await selectField(
        this.page,
        NV_SELECTORS.login.mode,
        modeLabel,
      );
      if (!byLabel) throw new Error(`Could not select mode "${modeLabel}"`);
    }

    const submit = await waitForVisible(
      this.page,
      NV_SELECTORS.login.submit,
      "Login submit button",
    );
    await submit.click();

    await this.page.waitForLoadState("domcontentloaded");
    await this.page.waitForTimeout(1500);
  }

  /** Legacy row-based login — kept for parity-test tooling. */
  async login(credentials: LoginCredentials): Promise<void> {
    const station = await fillField(
      this.page,
      NV_SELECTORS.login.station,
      credentials.station,
    );
    if (!station) throw new Error("Station field not found on login page");

    const password = await fillField(
      this.page,
      NV_SELECTORS.login.password,
      credentials.password,
    );
    if (!password) throw new Error("Password field not found on login page");
    await triggerFieldCommit(password);

    const idField = await waitForVisible(
      this.page,
      NV_SELECTORS.login.id,
      "Interviewer ID (s_ini)",
    );
    await idField.fill(credentials.id);
    await triggerFieldCommit(idField);

    await this.waitForProjectDropdown();

    if (credentials.project) {
      await selectField(this.page, NV_SELECTORS.login.project, credentials.project);
      const projectLoc = await findFirstVisible(this.page, NV_SELECTORS.login.project);
      if (projectLoc) await triggerFieldCommit(projectLoc);
    }
    if (credentials.group) {
      await selectField(this.page, NV_SELECTORS.login.group, credentials.group);
    }
    if (credentials.mode) {
      const modeValue = resolveModeValue(credentials.mode);
      await this.waitForModeReady(modeValue);
      const ok = await selectField(this.page, NV_SELECTORS.login.mode, modeValue);
      if (!ok) {
        await selectField(this.page, NV_SELECTORS.login.mode, credentials.mode);
      }
    }

    const submit2 = await waitForVisible(
      this.page,
      NV_SELECTORS.login.submit,
      "Login submit button",
    );
    await submit2.click();

    await this.page.waitForLoadState("domcontentloaded");
  }

  async openTestLink(testLink: string): Promise<void> {
    if (testLink) {
      await this.page.goto(testLink, {
        waitUntil: "domcontentloaded",
        timeout: 60000,
      });
    }
  }
}
