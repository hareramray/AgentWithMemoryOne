import { Page } from 'playwright';
import { ActionRecord, Ref } from './memory';
import { executeToolCall, ToolCall } from './tools';

export async function performPlannedAction(page: Page, url: string, plan: { action: 'click'|'type'|'press'; ref: Ref; value?: string }): Promise<ActionRecord> {
  // Route the plan through the tool-call layer for consistency and observability
  let call: ToolCall;
  if (plan.action === 'click') {
    call = { name: 'playwright.click', params: { ref: plan.ref } };
  } else if (plan.action === 'type') {
    call = { name: 'playwright.type', params: { ref: plan.ref, value: plan.value || '' } };
  } else if (plan.action === 'press') {
    call = { name: 'playwright.press', params: { value: plan.value || 'Enter', ref: plan.ref } };
  } else {
    throw new Error(`Unsupported action: ${plan.action}`);
  }
  return executeToolCall(page, url, plan.action === 'type' && plan.value ? `[type] ${plan.value}` : `[${plan.action}]`, call);
}
