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

/**
 * Tear down NV session via end.php (works mid-interview and on home).
 * EXIT only exists on the home screen — prefer the endpoint.
 */
export async function killSession(page: Page, liveLink: string): Promise<void> {
  const endUrl = nvEndUrl(liveLink);
  try {
    await page.goto(endUrl, {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });
  } catch {
    try {
      const exitBtn = await findFirstVisible(page, NV_SELECTORS.home.exit);
      if (exitBtn) {
        await exitBtn.click();
        await page
          .waitForLoadState("domcontentloaded", { timeout: 15_000 })
          .catch(() => {});
      }
    } catch {
      // session may already be dead
    }
  }

  // end.php can leave a transitional page; wait for login chrome before re-auth.
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (await isOnLoginScreen(page)) return;
    await page.waitForTimeout(300);
  }
}

export async function isOnLoginScreen(page: Page): Promise<boolean> {
  const station = await findFirstVisible(page, NV_SELECTORS.login.station);
  return Boolean(station);
}
