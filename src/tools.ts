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
        const loc = byRole(page, call.params.ref);
        await loc.waitFor({ state: 'visible', timeout: 15000 });
        await loc.click();
        return { timestamp: start, instruction, ref: call.params.ref, action: 'click', outcome: 'success' };
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
