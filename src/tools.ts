import { Page } from 'playwright';
import { Ref, ActionRecord } from './memory';

export type ToolCall =
  | { name: 'playwright.click'; params: { ref: Ref } }
  | { name: 'playwright.type'; params: { ref: Ref; value: string } }
  | { name: 'playwright.press'; params: { value: string; ref?: Ref } };

function byRole(page: Page, ref: Ref) {
  const options: any = {};
  if (ref.name) options.name = ref.name;
  return page.getByRole(ref.role as any, options);
}

export async function executeToolCall(page: Page, url: string, instruction: string, call: ToolCall): Promise<ActionRecord> {
  const start = Date.now();
  try {
    switch (call.name) {
      case 'playwright.click': {
        const ref = call.params.ref;
        let loc = byRole(page, ref);
        try {
          await loc.waitFor({ state: 'visible', timeout: 8000 });
        } catch {
          // Try to bring into view and retry
          try { await loc.scrollIntoViewIfNeeded(); } catch {}
          try { await loc.waitFor({ state: 'visible', timeout: 4000 }); } catch {}
        }
        // If still not visible/clickable, attempt generic, non site-specific fallbacks
        let clicked = false;
        if (!(await loc.isVisible().catch(() => false))) {
          const name = ref.name;
          if (name) {
            // 1) aria-label or title match
            const byAttr = page.locator(`[aria-label="${name}"] , [title="${name}"]`).first();
            if (await byAttr.isVisible().catch(() => false)) {
              await byAttr.click().catch(() => {});
              clicked = true;
            }
            // 2) getByLabel / getByPlaceholder (common for inputs/buttons)
            if (!clicked) {
              const byLabel = page.getByLabel(name).first();
              if (await byLabel.isVisible().catch(() => false)) {
                await byLabel.click().catch(() => {});
                clicked = true;
              }
            }
            if (!clicked) {
              const byPlaceholder = page.getByPlaceholder(name).first();
              if (await byPlaceholder.isVisible().catch(() => false)) {
                await byPlaceholder.click().catch(() => {});
                clicked = true;
              }
            }
            // 3) Clickable elements with the exact visible text
            if (!clicked) {
              const clickable = page.locator('button, [role="button"], a, [role="link"], [type="submit"], [role="menuitem"], [role="option"], [role="tab"]').filter({ hasText: name }).first();
              if (await clickable.isVisible().catch(() => false)) {
                await clickable.click().catch(() => {});
                clicked = true;
              }
            }
            // 4) As a last resort: find text anywhere, then click nearest clickable ancestor
            if (!clicked) {
              const textLoc = page.getByText(name, { exact: true }).first();
              if (await textLoc.isVisible().catch(() => false)) {
                const ancestor = textLoc.locator('xpath=ancestor-or-self::*[self::button or @role="button" or self::a or @role="link" or @role="menuitem" or @role="tab"][1]');
                if (await ancestor.isVisible().catch(() => false)) {
                  await ancestor.click().catch(() => {});
                  clicked = true;
                }
              }
            }
          }
        }
        if (!clicked) {
          await loc.click();
        }
        return { timestamp: start, instruction, ref, action: 'click', outcome: 'success' };
      }
      case 'playwright.type': {
        const { ref, value } = call.params;
        if (!value) throw new Error('Missing value for playwright.type');
        const loc = byRole(page, ref);
        await loc.waitFor({ state: 'visible', timeout: 15000 });
        try {
          await loc.fill('');
          await loc.type(value);
        } catch {
          await loc.click();
          await page.keyboard.type(value);
        }
        return { timestamp: start, instruction, ref, action: 'type', value, outcome: 'success' };
      }
      case 'playwright.press': {
        const { value, ref } = call.params;
        if (!value) throw new Error('Missing value for playwright.press');
        if (ref) {
          const loc = byRole(page, ref);
          try {
            await loc.waitFor({ state: 'visible', timeout: 5000 });
            await loc.click({ trial: true }).catch(() => {});
            await loc.focus().catch(() => {});
          } catch {
            // ignore focusing failures
          }
        }
        await page.keyboard.press(value);
        return { timestamp: start, instruction, ref: ref ?? { role: 'document' }, action: 'press', value, outcome: 'success' };
      }
      default:
        throw new Error(`Unsupported tool: ${(call as any).name}`);
    }
  } catch (error: any) {
    const base: Partial<ActionRecord> = { timestamp: start, instruction, outcome: 'failure', error: String(error?.message ?? error) } as any;
    if (call.name === 'playwright.click') {
      return { ...(base as any), ref: call.params.ref, action: 'click' };
    }
    if (call.name === 'playwright.type') {
      return { ...(base as any), ref: call.params.ref, action: 'type', value: call.params.value };
    }
    return { ...(base as any), ref: { role: 'document' }, action: 'press', value: (call as any).params?.value } as ActionRecord;
  }
}
