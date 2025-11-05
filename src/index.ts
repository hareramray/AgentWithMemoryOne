#!/usr/bin/env node
import 'dotenv/config';
import { Command } from 'commander';
<<<<<<< HEAD
import { appendAction, getSnapshot, saveSnapshot, getCachedPlan, cachePlan, toSteps, Step } from './memory';
import { captureAccessibilitySnapshot, openPage } from './accessibility';
import { planFromInstruction } from './llm';
import { performPlannedAction } from './actions';
import { executeToolCall, ToolCall } from './tools';
import { preflightDismiss } from './preflight';
import fs from 'fs';
=======
import { appendAction, getSnapshot, saveSnapshot, getCachedPlan, cachePlan } from './memory';
import { captureAccessibilitySnapshot, openPage } from './accessibility';
import { planFromInstruction } from './llm';
import { performPlannedAction } from './actions';
>>>>>>> 97dfd982b80a2c7e685e2aae966e02be7af3c0ca

const program = new Command();
program
  .name('agent-with-memory-one')
  .description('Capture accessibility tree, use Gemini 2.5 Pro to plan, and execute actions via Playwright with memory.')
  .version('0.1.0');

program
  .command('snapshot')
  .description('Capture and store the accessibility tree for a URL')
  .argument('<url>', 'Target page URL')
  .action(async (url: string) => {
    const snap = await captureAccessibilitySnapshot(url);
    saveSnapshot(url, snap);
    console.log(`Snapshot captured for ${url} at ${new Date(snap.timestamp).toISOString()}`);
  });

program
  .command('run')
  .description('Execute an instruction on a URL, using stored accessibility tree when available')
  .argument('<url>', 'Target page URL')
  .argument('<instruction>', 'Natural language instruction in quotes')
  .option('--fresh', 'Refresh the accessibility snapshot before planning', false)
  .option('--no-cache', 'Do not use cached plan for this instruction')
  .option('--refresh-plan', 'Force refresh plan from LLM and update cache', false)
  .option('--no-fallback', 'Do not fallback to LLM if cached plan fails')
  .action(async (url: string, instruction: string, opts: { fresh?: boolean; cache?: boolean; refreshPlan?: boolean; fallback?: boolean }) => {
    let snap = !opts.fresh ? getSnapshot(url) : undefined;
    if (!snap) {
      console.log('No stored snapshot found or --fresh specified; capturing a new one...');
      snap = await captureAccessibilitySnapshot(url);
      saveSnapshot(url, snap);
    }

    // Use cached plan if available and not disabled
<<<<<<< HEAD
    let planOrSteps = (!opts.refreshPlan && opts.cache !== false) ? getCachedPlan(url, instruction) : undefined;
    if (planOrSteps) {
      console.log('Using cached plan:', planOrSteps);
    } else {
      planOrSteps = await planFromInstruction(instruction, snap.axTree);
      console.log('Plan:', planOrSteps);
      cachePlan(url, instruction, planOrSteps as any);
=======
    let plan = (!opts.refreshPlan && opts.cache !== false) ? getCachedPlan(url, instruction) : undefined;
    if (plan) {
      console.log('Using cached plan:', plan);
    } else {
      plan = await planFromInstruction(instruction, snap.axTree);
      console.log('Plan:', plan);
      cachePlan(url, instruction, plan);
>>>>>>> 97dfd982b80a2c7e685e2aae966e02be7af3c0ca
    }

    const { browser, page } = await openPage(url);
    try {
<<<<<<< HEAD
      // Best-effort dismiss common interstitials/banners
      await preflightDismiss(page);

      // Convert to steps and append heuristic submit if implied
      let steps: Step[] = toSteps(planOrSteps as any);
      const lower = instruction.toLowerCase();
      const last = steps[steps.length - 1];
      const impliesSubmit = lower.includes('press enter') || lower.includes('hit enter') || lower.includes('then do a search') || lower.includes('then search') || lower.includes('and search') || (last?.action === 'type' && /\bsearch\b/.test(lower));
      if (impliesSubmit) {
        steps = [...steps, { action: 'press', value: 'Enter', ref: (last && last.ref) ? last.ref : undefined }];
      }

      // Execute sequentially
      const initialUrl = page.url();
      for (let i = 0; i < steps.length; i++) {
        const s = steps[i];
        const rec = await performPlannedAction(page, url, { action: s.action, ref: (s.ref as any) || (steps[0].ref as any), value: s.value });
        appendAction(url, rec);
        if (rec.outcome !== 'success') {
          console.error(`Step ${i + 1} failed:`, rec.error);
          if ((opts.fallback !== false) && (!opts.refreshPlan)) {
            console.log('Falling back to LLM to refresh plan...');
            const fresh = await planFromInstruction(instruction, snap!.axTree);
            console.log('Refreshed plan:', fresh);
            cachePlan(url, instruction, fresh);
            // Re-run fresh as steps
            steps = toSteps(fresh as any);
            i = -1; // restart loop from beginning
            continue;
          } else {
            process.exitCode = 1;
            break;
          }
        }
      }

      // If instruction implies search/navigation, wait for a URL change or network idle
      const impliesNav = /\bsearch\b|\bnavigate\b|\bgo to\b|\bopen\b/.test(lower);
      if (impliesNav) {
        try {
          await page.waitForURL((u: any) => String(u) !== initialUrl, { timeout: 10000 });
        } catch {
          await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
        }
      }

      // After success, cache the final steps so next call is memory-only
      cachePlan(url, instruction, { steps });
    } finally {
      await browser.close();
    }
  });

program
  .command('tool')
  .description('Execute a direct tool call for Playwright actions using a JSON payload')
  .argument('<url>', 'Target page URL')
  .argument('<toolJson>', 'JSON like {"name":"playwright.click","params":{"ref":{"role":"button","name":"Sign in"}}}')
  .option('--file <path>', 'Read tool JSON from a file instead of CLI argument')
  .action(async (url: string, toolJson: string, opts: { file?: string }) => {
    let call: ToolCall;
    try {
      const raw = opts.file ? fs.readFileSync(opts.file, 'utf-8') : toolJson;
      call = JSON.parse(raw) as ToolCall;
    } catch (e) {
      console.error('Invalid tool JSON:', e);
      process.exitCode = 1;
      return;
    }

    // Ensure snapshot exists (optional, helps align with memory model)
    let snap = getSnapshot(url);
    if (!snap) {
      console.log('No stored snapshot found; capturing one...');
      snap = await captureAccessibilitySnapshot(url);
      saveSnapshot(url, snap);
    }

    const { browser, page } = await openPage(url);
    try {
      const rec = await executeToolCall(page, url, '[tool]', call);
      appendAction(url, rec);
      if (rec.outcome === 'success') {
        console.log('Tool action success');
      } else {
        console.error('Tool action failed:', rec.error);
        process.exitCode = 1;
      }
    } finally {
      await browser.close();
    }
  });

program
  .command('tools')
  .description('Execute a batch of Playwright tool calls from a JSON array or file')
  .argument('<url>', 'Target page URL')
  .argument('<toolsJson>', 'JSON array of tool calls or object { calls: [...] }')
  .option('--file <path>', 'Read tools JSON from a file instead of CLI argument')
  .option('--continue-on-error', 'Continue executing remaining calls even if one fails')
  .action(async (url: string, toolsJson: string, opts: { file?: string; continueOnError?: boolean }) => {
    // Parse input
    let raw: string;
    try {
      raw = opts.file ? fs.readFileSync(opts.file, 'utf-8') : toolsJson;
    } catch (e) {
      console.error('Failed to read tools JSON file:', e);
      process.exitCode = 1;
      return;
    }

    let obj: any;
    try {
      obj = JSON.parse(raw);
    } catch (e) {
      console.error('Invalid tools JSON:', e);
      process.exitCode = 1;
      return;
    }

    const calls: ToolCall[] = Array.isArray(obj) ? obj : Array.isArray(obj?.calls) ? obj.calls : [];
    if (!Array.isArray(calls) || calls.length === 0) {
      console.error('No tool calls provided. Expect a JSON array or { calls: [...] }');
      process.exitCode = 1;
      return;
    }

    // Ensure snapshot exists for URL
    let snap = getSnapshot(url);
    if (!snap) {
      console.log('No stored snapshot found; capturing one...');
      snap = await captureAccessibilitySnapshot(url);
      saveSnapshot(url, snap);
    }

    const { browser, page } = await openPage(url);
    try {
      for (let i = 0; i < calls.length; i++) {
        const call = calls[i];
        console.log(`Executing [${i + 1}/${calls.length}]`, call);
        const rec = await executeToolCall(page, url, '[tool-batch]', call);
        appendAction(url, rec);
        if (rec.outcome !== 'success') {
          console.error(`Step ${i + 1} failed:`, rec.error);
          if (!opts.continueOnError) {
            process.exitCode = 1;
            break;
          }
=======
      let rec = await performPlannedAction(page, url, plan);
      appendAction(url, rec);
      if (rec.outcome === 'success') {
        console.log('Action success');
      } else {
        console.error('Action failed:', rec.error);
        // Optional fallback to LLM if cached plan failed
        if ((opts.fallback !== false) && (!opts.refreshPlan)) {
          console.log('Falling back to LLM to refresh plan...');
          const freshPlan = await planFromInstruction(instruction, snap!.axTree);
          console.log('Refreshed plan:', freshPlan);
          cachePlan(url, instruction, freshPlan);
          rec = await performPlannedAction(page, url, freshPlan);
          appendAction(url, rec);
          if (rec.outcome === 'success') {
            console.log('Action success after fallback');
          } else {
            console.error('Action still failed after fallback:', rec.error);
            process.exitCode = 1;
          }
        } else {
          process.exitCode = 1;
>>>>>>> 97dfd982b80a2c7e685e2aae966e02be7af3c0ca
        }
      }
    } finally {
      await browser.close();
    }
  });

program.parseAsync(process.argv);
