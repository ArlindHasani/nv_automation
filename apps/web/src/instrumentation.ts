export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { ensurePlaywrightBrowsersEnv } = await import("@nv/core");
    ensurePlaywrightBrowsersEnv();
  }
}
