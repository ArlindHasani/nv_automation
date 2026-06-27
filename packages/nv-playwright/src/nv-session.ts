import type { Page } from "playwright";
import { NV_SELECTORS } from "./selectors.js";
import { findFirstVisible } from "./question-classifier.js";

/** Derive NV Rev2 base URL (directory containing start.php / end.php). */
export function nvBaseUrl(liveLink: string): string {
  try {
    const url = new URL(liveLink);
    const path = url.pathname;
    if (path.includes("/")) {
      const dir = path.substring(0, path.lastIndexOf("/") + 1);
      return `${url.origin}${dir}`;
    }
    return `${url.origin}/nv_rev2/`;
  } catch {
    return liveLink.replace(/[^/]+$/, "");
  }
}

export function nvEndUrl(liveLink: string): string {
  return new URL("end.php", nvBaseUrl(liveLink)).toString();
}

/** Tear down NV session and return to login screen. */
export async function killSession(page: Page, liveLink: string): Promise<void> {
  try {
    const exitBtn = await findFirstVisible(page, NV_SELECTORS.home.exit);
    if (exitBtn) {
      await exitBtn.click();
      await page.waitForLoadState("domcontentloaded", { timeout: 15_000 }).catch(() => {});
      return;
    }
  } catch {
    // fall through to direct navigation
  }

  try {
    await page.goto(nvEndUrl(liveLink), {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });
  } catch {
    // session may already be dead
  }
}

export async function isOnLoginScreen(page: Page): Promise<boolean> {
  const station = await findFirstVisible(page, NV_SELECTORS.login.station);
  return Boolean(station);
}
