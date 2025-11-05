import dotenv from 'dotenv';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { z } from 'zod';
import { Ref } from './memory';

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

const PlanSchema = z.object({
  action: z.enum(['click', 'type', 'press']).describe('User-intended action'),
  ref: z.object({
    role: z.string(),
    name: z.string().optional(),
    description: z.string().optional(),
  }).describe('Element reference via ARIA role and accessible name'),
  value: z.string().optional().describe('Text to type or key to press depending on action'),
});
export type ActionPlan = z.infer<typeof PlanSchema>;

export async function planFromInstruction(instruction: string, axTree: any): Promise<ActionPlan> {
  const simplified = simplifyAxTree(axTree);
  const items = collectInteractiveNodes(simplified, []).slice(0, 4000); // cap to keep prompt reasonable

  const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });

  const prompt = `You are mapping a natural language instruction to a web element using the accessibility tree. \n\nInstruction: "${instruction}"\n\nYou will receive a list of interactive nodes with their roles and accessible names. Choose the best match and output strict JSON with: { action, ref: { role, name?, description? }, value? }.\n- Use action=click for navigation or taps.\n- Use action=type for text entry, and set value to the text to type when instruction contains text in quotes or after words like \"type\", \"enter\".\n- Use action=press if the instruction is to press a key (e.g., Enter).\n- Prefer exact name matches; otherwise, use closest semantic.\n- If multiple candidates exist, choose the most prominent (e.g., primary button).\nReturn JSON only.`;

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
  const plan = PlanSchema.parse(parsed);
  return plan;
}
