import { chromium, Browser, Page } from 'playwright';
import dotenv from 'dotenv';
import { SnapshotRecord } from './memory';

dotenv.config();

const HEADLESS = (process.env.HEADLESS ?? 'true').toLowerCase() !== 'false';
const NAVIGATION_TIMEOUT_MS = parseInt(process.env.NAVIGATION_TIMEOUT_MS || '30000', 10);

export async function openPage(url: string): Promise<{ browser: Browser; page: Page }> {
  const browser = await chromium.launch({ headless: HEADLESS });
  const context = await browser.newContext();
  const page = await context.newPage();
  page.setDefaultNavigationTimeout(NAVIGATION_TIMEOUT_MS);
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForLoadState('networkidle');
  return { browser, page };
}

export async function captureAccessibilitySnapshot(url: string): Promise<SnapshotRecord> {
  const { browser, page } = await openPage(url);
  try {
    const axTree = await page.accessibility.snapshot({ interestingOnly: false });
    return { url, timestamp: Date.now(), axTree };
  } finally {
    await browser.close();
  }
}
