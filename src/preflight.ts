import { Page } from 'playwright';

const BUTTON_PATTERNS = [
  /i agree/i,
  /accept all/i,
  /reject all/i,
  /no thanks/i,
  /not now/i,
  /close/i,
  /dismiss/i,
  /continue/i,
  /not interested/i,
];

export async function preflightDismiss(page: Page) {
  try {
    for (const pattern of BUTTON_PATTERNS) {
      const btn = page.getByRole('button', { name: pattern });
      const link = page.getByRole('link', { name: pattern });
      try {
        if (await btn.isVisible({ timeout: 500 }).catch(() => false)) {
          await btn.click({ timeout: 1000 }).catch(() => {});
        }
      } catch {}
      try {
        if (await link.isVisible({ timeout: 500 }).catch(() => false)) {
          await link.click({ timeout: 1000 }).catch(() => {});
        }
      } catch {}
    }
    // Try common consent iframes (YouTube/Google)
    for (const frame of page.frames()) {
      try {
        const fbtn = frame.getByRole('button', { name: /I agree|Accept all|Reject all|No thanks|Continue/i });
        if (await fbtn.isVisible({ timeout: 300 }).catch(() => false)) {
          await fbtn.click({ timeout: 1000 }).catch(() => {});
        }
      } catch {}
    }
  } catch {
    // best-effort only
  }
}
