import { Page } from 'playwright';
import { ActionRecord, Ref } from './memory';

function byRole(page: Page, ref: Ref) {
  const options: any = {};
  if (ref.name) options.name = ref.name;
  return page.getByRole(ref.role as any, options);
}

export async function performPlannedAction(page: Page, url: string, plan: { action: 'click'|'type'|'press'; ref: Ref; value?: string }): Promise<ActionRecord> {
  const start = Date.now();
  try {
    if (plan.action === 'press') {
      if (!plan.value) throw new Error('Missing key value to press');
      await page.keyboard.press(plan.value);
      return { timestamp: start, instruction: '[press] ' + plan.value, ref: plan.ref, action: 'press', value: plan.value, outcome: 'success' };
    }

    const locator = byRole(page, plan.ref);
    await locator.waitFor({ state: 'visible', timeout: 15000 });

    if (plan.action === 'click') {
      await locator.click();
      return { timestamp: start, instruction: '[click]', ref: plan.ref, action: 'click', outcome: 'success' };
    }

    if (plan.action === 'type') {
      if (!plan.value) throw new Error('Missing text value to type');
      // If element is not editable, try to focus then type
      try {
        await locator.fill('');
        await locator.type(plan.value);
      } catch {
        await locator.click();
        await page.keyboard.type(plan.value);
      }
      return { timestamp: start, instruction: '[type] ' + plan.value, ref: plan.ref, action: 'type', value: plan.value, outcome: 'success' };
    }

    throw new Error(`Unsupported action: ${plan.action}`);
  } catch (error: any) {
    return {
      timestamp: start,
      instruction: '[error] ' + String(error?.message ?? error),
      ref: plan.ref,
      action: plan.action,
      value: plan.value,
      outcome: 'failure',
      error: String(error?.message ?? error),
    };
  }
}
