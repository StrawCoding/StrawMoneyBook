#!/usr/bin/env node
/**
 * Web captures: StrawMB preview app + Finch Play Store listing.
 */
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SHOT = path.join(__dirname, '..', 'screenshots');
const NOTES = path.join(__dirname, '..', 'web-flow-notes.json');

async function shot(page, name) {
  const file = path.join(SHOT, `${name}.png`);
  await page.screenshot({ path: file, fullPage: false });
  return path.basename(file);
}

async function main() {
  await mkdir(SHOT, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    locale: 'zh-TW',
  });
  const page = await context.newPage();
  const log = [];

  // Finch — Google Play (TW)
  await page.goto('https://play.google.com/store/apps/details?id=com.xinran.finch&hl=zh_TW', {
    waitUntil: 'domcontentloaded',
    timeout: 60000,
  });
  await page.waitForTimeout(2500);
  log.push({ app: 'finch', step: 'play_store', file: await shot(page, 'finch_01_play_store') });

  // StrawMB web preview — home after onboarding bypass via localStorage hack if possible
  await page.goto('https://www.strawmb.com/preview/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(1500);
  log.push({ app: 'strawmb_web', step: 'preview_landing', file: await shot(page, 'strawmb_web_01_preview') });

  await browser.close();
  await writeFile(
    NOTES,
    JSON.stringify({ captured_at: new Date().toISOString(), shots: log }, null, 2),
    'utf8',
  );
  console.log('Web captures done:', log.length);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
