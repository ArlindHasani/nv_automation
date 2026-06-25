import type { Page } from "playwright";
import type { DataRow, ProjectConfig } from "@nv/core";
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
    group: map.group ? get("group") : undefined,
    mode: config.mode,
  };
}

async function fillField(
  page: Page,
  selectors: readonly string[],
  value: string,
): Promise<boolean> {
  const loc = await findFirstVisible(page, selectors);
  if (!loc) return false;
  await loc.fill(value);
  return true;
}

async function selectField(
  page: Page,
  selectors: readonly string[],
  value: string,
): Promise<boolean> {
  const loc = await findFirstVisible(page, selectors);
  if (!loc) return false;
  await loc.selectOption({ label: value }).catch(async () => {
    await loc.selectOption(value);
  });
  return true;
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

  async login(credentials: LoginCredentials): Promise<void> {
    await fillField(this.page, NV_SELECTORS.login.station, credentials.station);
    await fillField(this.page, NV_SELECTORS.login.password, credentials.password);
    await fillField(this.page, NV_SELECTORS.login.id, credentials.id);

    const submit = await findFirstVisible(this.page, NV_SELECTORS.login.submit);
    if (submit) await submit.click();

    await this.page.waitForTimeout(2000);

    if (credentials.project) {
      await selectField(this.page, NV_SELECTORS.login.project, credentials.project);
    }
    if (credentials.group) {
      await selectField(this.page, NV_SELECTORS.login.group, credentials.group);
    }
    if (credentials.mode) {
      await selectField(this.page, NV_SELECTORS.login.mode, credentials.mode);
    }

    const submit2 = await findFirstVisible(this.page, NV_SELECTORS.login.submit);
    if (submit2) await submit2.click();

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
