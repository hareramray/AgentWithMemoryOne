import dotenv from 'dotenv';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { z } from 'zod';

dotenv.config();

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-pro';

if (!GEMINI_API_KEY) {
  console.warn('GEMINI_API_KEY is not set. Please set it in .env');
}

export type SimplifiedAxNode = {
  role?: string;
  name?: string;
  description?: string;
  value?: string | number | boolean | null;
  checked?: boolean;
  focused?: boolean;
  disabled?: boolean;
  children?: SimplifiedAxNode[];
};

export function simplifyAxTree(axTree: any): SimplifiedAxNode {
  if (!axTree || typeof axTree !== 'object') return {};
  const { role, name, description, value, checked, focused, disabled, children } = axTree as any;
  return {
    role,
    name,
    description,
    value: value ?? null,
    checked,
    focused,
    disabled,
    children: Array.isArray(children) ? children.map(simplifyAxTree) : undefined,
  };
}

function collectInteractiveNodes(root: SimplifiedAxNode, out: SimplifiedAxNode[] = []): SimplifiedAxNode[] {
  const roles = new Set([
    'button', 'link', 'textbox', 'combobox', 'menuitem', 'listitem', 'img', 'switch', 'checkbox', 'radio', 'tab', 'option', 'listbox', 'slider', 'spinbutton', 'searchbox', 'heading', 'paragraph', 'cell', 'row', 'columnheader', 'rowheader', 'navigation', 'main', 'article'
  ]);
  const queue: SimplifiedAxNode[] = [root];
  while (queue.length) {
    const n = queue.shift()!;
    if (n.role && (n.name || roles.has(n.role))) {
      out.push({ role: n.role, name: n.name, description: n.description, value: n.value, checked: n.checked, focused: n.focused, disabled: n.disabled });
    }
    if (n.children) queue.push(...n.children);
  }
  return out;
}

const SinglePlanSchema = z.object({
  action: z.enum(['click', 'type', 'press']).describe('User-intended action'),
  ref: z.object({
    role: z.string(),
    name: z.string().optional(),
    description: z.string().optional(),
  }).optional().describe('Element reference via ARIA role and accessible name'),
  value: z.string().optional().describe('Text to type or key to press depending on action'),
});

const StepsSchema = z.object({
  steps: z.array(SinglePlanSchema).min(1),
});

export type ActionPlan = z.infer<typeof SinglePlanSchema> | z.infer<typeof StepsSchema>;

export async function planFromInstruction(instruction: string, axTree: any): Promise<ActionPlan> {
  const simplified = simplifyAxTree(axTree);
  const items = collectInteractiveNodes(simplified, []).slice(0, 4000); // cap to keep prompt reasonable

  const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });

  const prompt = `You are mapping a natural language instruction to web actions using the accessibility tree. \n\nInstruction: "${instruction}"\n\nReturn STRICT JSON only in one of two forms:\n1) { "steps": [ { "action": "click|type|press", "ref": { "role": "...", "name?": "..." }, "value?": "..." }, ... ] } for multi-step intents (e.g., type then press Enter)\n2) { "action": "click|type|press", "ref": { "role": "...", "name?": "..." }, "value?": "..." } for single-step intents.\n\nGuidelines:\n- Use action=type for text entry; put the text into value.\n- Use action=press for keypresses like Enter.\n- Prefer exact accessible name matches; otherwise use the closest semantic.\n- Choose the most prominent element if multiple candidates exist.\n- Do not include any commentary, only the JSON.`;

  const nodesJson = JSON.stringify(items);
  const input = `${prompt}\n\nInteractiveNodes: ${nodesJson}`;

  const resp = await model.generateContent({ contents: [{ role: 'user', parts: [{ text: input }] }] });
  const text = resp.response.text().trim();

  // Try to extract JSON robustly: handle fenced code blocks and stray text
  let candidate = text;
  const fenceMatch = candidate.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenceMatch && fenceMatch[1]) {
    candidate = fenceMatch[1].trim();
  }
  // Slice to the outermost JSON braces if extra text remains
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  const jsonText = start >= 0 && end > start ? candidate.slice(start, end + 1) : candidate;

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch (e) {
    throw new Error(`Gemini returned non-JSON or malformed output: ${text}`);
  }
  // Try steps first, then single
  try {
    const stepsPlan = StepsSchema.parse(parsed);
    return stepsPlan;
  } catch {
    const singlePlan = SinglePlanSchema.parse(parsed);
    return singlePlan;
  }
}
 
