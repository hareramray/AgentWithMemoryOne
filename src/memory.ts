import fs from 'fs';
import path from 'path';

export type Ref = {
  role: string;
  name?: string;
  description?: string;
};

export type ActionRecord = {
  timestamp: number;
  instruction: string;
  ref: Ref;
  action: 'click' | 'type' | 'press';
  value?: string;
  outcome: 'success' | 'failure';
  error?: string;
};

export type SnapshotRecord = {
  url: string;
  timestamp: number;
  axTree: any;
};

export type CachedPlan = {
  timestamp: number;
  plan: {
    action: 'click' | 'type' | 'press';
    ref: Ref;
    value?: string;
  };
};

export type MemoryData = {
  snapshots: Record<string, SnapshotRecord>; // key by URL
  actions: Record<string, ActionRecord[]>;   // key by URL
  plans: Record<string, Record<string, CachedPlan>>; // plans[url][normalizedInstruction]
};

const DATA_DIR = path.resolve(process.cwd(), 'data');
const MEMORY_FILE = path.join(DATA_DIR, 'memory.json');

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function defaultMemory(): MemoryData {
  return { snapshots: {}, actions: {}, plans: {} };
}

export function loadMemory(): MemoryData {
  ensureDataDir();
  if (!fs.existsSync(MEMORY_FILE)) return defaultMemory();
  try {
    const raw = fs.readFileSync(MEMORY_FILE, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<MemoryData>;
    // Ensure backward-compatible shape
    return {
      snapshots: parsed.snapshots ?? {},
      actions: parsed.actions ?? {},
      plans: parsed.plans ?? {},
    };
  } catch (e) {
    console.warn('Failed to load memory.json, starting fresh:', e);
    return defaultMemory();
  }
}

export function saveMemory(mem: MemoryData) {
  ensureDataDir();
  fs.writeFileSync(MEMORY_FILE, JSON.stringify(mem, null, 2), 'utf-8');
}

export function saveSnapshot(url: string, snapshot: SnapshotRecord) {
  const mem = loadMemory();
  mem.snapshots[url] = snapshot;
  saveMemory(mem);
}

export function getSnapshot(url: string): SnapshotRecord | undefined {
  const mem = loadMemory();
  return mem.snapshots[url];
}

export function appendAction(url: string, rec: ActionRecord) {
  const mem = loadMemory();
  if (!mem.actions[url]) mem.actions[url] = [];
  mem.actions[url].push(rec);
  saveMemory(mem);
}

export function normalizeInstruction(instr: string): string {
  return instr
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function cachePlan(url: string, instruction: string, plan: { action: 'click'|'type'|'press'; ref: Ref; value?: string }) {
  const mem = loadMemory();
  if (!mem.plans) (mem as any).plans = {} as MemoryData['plans'];
  if (!mem.plans[url]) mem.plans[url] = {};
  const key = normalizeInstruction(instruction);
  mem.plans[url][key] = { timestamp: Date.now(), plan };
  saveMemory(mem);
}

export function getCachedPlan(url: string, instruction: string): { action: 'click'|'type'|'press'; ref: Ref; value?: string } | undefined {
  const mem = loadMemory();
  const entry = mem.plans?.[url]?.[normalizeInstruction(instruction)];
  return entry?.plan;
}
