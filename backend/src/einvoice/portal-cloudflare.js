export const CLOUDFLARE_TITLE_PATTERN = /Just a moment/i

export function getPortalSelectorWaitMs() {
  const portalWait = Number(process.env.EINVOICE_PORTAL_SELECTOR_WAIT_MS)
  if (portalWait > 0) return portalWait
  const contractWait = Number(process.env.EINVOICE_CONTRACT_SELECTOR_WAIT_MS)
  if (contractWait > 0) return contractWait
  return 60_000
}

export function isCloudflareChallengeTitle(title) {
  return CLOUDFLARE_TITLE_PATTERN.test(String(title ?? ''))
}

export function buildWaitForLoginSelectorsRunCode(selectors, waitMs = getPortalSelectorWaitMs()) {
  return `
const selectors = ${JSON.stringify(selectors)};
const waitMs = ${waitMs};
async function safeTitle() {
  try {
    return await page.title();
  } catch {
    await page.waitForLoadState('domcontentloaded').catch(() => null);
    return '';
  }
}
async function safeHas(selector) {
  try {
    return Boolean(await page.$(selector));
  } catch {
    await page.waitForLoadState('domcontentloaded').catch(() => null);
    return false;
  }
}
await page.waitForLoadState('domcontentloaded');
const deadline = Date.now() + waitMs;
let found = { phone: false, password: false, captcha: false, submit: false };
while (Date.now() < deadline) {
  const title = await safeTitle();
  if (!/Just a moment/i.test(title)) {
    await page.waitForLoadState('domcontentloaded').catch(() => null);
    const carrierTab = await page.$(selectors.carrierTab).catch(() => null);
    if (carrierTab) await carrierTab.click().catch(() => null);
    await page.waitForTimeout(500);
  }
  found = {
    phone: await safeHas(selectors.phone),
    password: await safeHas(selectors.password),
    captcha: await safeHas(selectors.captchaInput),
    submit: await safeHas(selectors.loginButton),
  };
  if (found.phone && found.password && found.captcha && found.submit) break;
  await page.waitForTimeout(1000);
}
const title = await safeTitle();
const cloudflareChallenge = /Just a moment/i.test(title);
const ok = Boolean(found.phone && found.password && found.captcha && found.submit);
return { ok, found, title, cloudflareChallenge };
`.trim()
}
