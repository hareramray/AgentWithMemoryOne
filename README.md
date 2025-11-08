# Agent With Memory (Playwright + Gemini/OpenAI)

Capture a page's accessibility tree, use Gemini or OpenAI to map natural language instructions to element refs (role/name), execute actions via Playwright, and store memory for reuse across runs.

## Features

- Snapshot and persist the accessibility (AX) tree per URL
- Use Gemini 2.5 Pro to select an element "ref" (role/name) from the AX tree based on your instruction
- Execute actions in Playwright (click, type, press)
- Append action history and reuse the stored snapshot in future runs

## Requirements

- Node.js 18+ (for native `fetch` and modern Playwright)
- A Google AI Studio API key (for Gemini), or an OpenAI API key (for OpenAI)

## Setup

1. Copy `.env.example` to `.env` and fill in your API key(s). If you do nothing, the default provider is OpenAI:

```
# One of: gemini | openai
LLM_PROVIDER=openai

# Gemini settings
GEMINI_API_KEY=your_gemini_key
GEMINI_MODEL=gemini-2.5-pro

# OpenAI settings
OPENAI_API_KEY=your_openai_key
OPENAI_MODEL=gpt-4o-mini

HEADLESS=true
NAVIGATION_TIMEOUT_MS=30000
```

2. Install dependencies:

```powershell
# In Windows PowerShell
npm install
```

3. Download Playwright browsers (happens automatically on first install via `prepare`):

```powershell
npm run prepare
```

4. Build the project:

```powershell
npm run build
```

## Usage

Two main commands: `snapshot` and `run`.

- Capture the AX tree for a URL and store it in `data/memory.json`:

```powershell
node dist/index.js snapshot "https://example.com"
```

- Execute a natural language instruction on a URL. By default, it reuses the stored snapshot if available. Add `--fresh` to recapture first.

```powershell
# Click a primary button
node dist/index.js run "https://example.com" "click the Sign in button"

# Type into a field
node dist/index.js run "https://example.com/login" "type \"user@example.com\" into the Email textbox"

# Force refresh the snapshot
node dist/index.js run "https://example.com" "open the Pricing page" --fresh
```

On each run, the tool:

1. Loads an existing AX snapshot for the URL (or captures a new one)
2. Checks the plan cache for this URL + instruction; if present, uses it to avoid an LLM call
3. Otherwise, asks the selected LLM (Gemini or OpenAI) to plan the action(s). The model may return a single action or a multi-step plan: `{ steps: [...] }`
4. Executes steps sequentially via Playwright (click/type/press)
5. Caches the final steps so next runs are memory-only (no LLM)
6. Appends the action record(s) to memory

### Auto-submit after typing

When your instruction implies submission (e.g., includes phrases like "press enter", "then do a search", or just "search" after a type), the agent will automatically press Enter after typing. This avoids additional LLM calls for common flows like search boxes.

To force only typing without submitting, avoid those keywords, e.g.:

```powershell
node dist/index.js run "https://google.com" 'type "OpenAI" into the searchbox'
```

### Direct tool calls (no LLM)

You can execute Playwright actions through a structured tool-call interface. This avoids any LLM usage and lets you provide the ref directly.

Examples:

```powershell
# Click a button by role/name
node dist/index.js tool "https://example.com" '{"name":"playwright.click","params":{"ref":{"role":"button","name":"Sign in"}}}'

# Type into a textbox (combobox/textbox role)
node dist/index.js tool "https://google.com" '{"name":"playwright.type","params":{"ref":{"role":"combobox","name":"Search"},"value":"OpenAI"}}'

# Press a key (e.g., Enter)
node dist/index.js tool "https://google.com" '{"name":"playwright.press","params":{"value":"Enter"}}'
```

The tool call execution records in memory just like `run`, and ensures a snapshot exists for the URL.

### Batch tool calls (sequence)

Run a list of tool calls in order. This is useful for multi-step flows like type-then-press.

```powershell
# tools-example.json (array form)
[
	{"name":"playwright.type","params":{"ref":{"role":"combobox","name":"Search"},"value":"OpenAI"}},
	{"name":"playwright.press","params":{"value":"Enter"}}
]

# Execute the batch
node dist/index.js tools "https://google.com" placeholder --file tools-example.json

# Continue even if one step fails
node dist/index.js tools "https://example.com" placeholder --file tools-example.json --continue-on-error
```

You can also wrap the list as `{ "calls": [ ... ] }`.

## Memory-first flow

- First time you run a new instruction on a URL, the LLM produces a plan. The agent executes it and saves the resulting step list in memory.
- Next time you run the same instruction, the agent finds the saved steps and executes directly from memory—no LLM call.
- If a step fails (page changed), by default it will try refreshing the plan once via the LLM and update the cache. Disable this with `--no-fallback`.

## Memory layout

Memory is persisted to `data/memory.json` with two sections:

- `snapshots[url]`: the last captured AX tree for that URL
- `actions[url]`: an array of action records (plan, result)
- `plans[url][normalizedInstruction]`: cached plan returned by the LLM (Gemini or OpenAI), reused on subsequent runs

You can safely delete `data/memory.json` to start fresh.

## Notes and limitations

- The AX-based refs are `{ role, name }` pairs, which are stable and human-readable. They are not the MCP tool's ephemeral element `ref` strings; instead, Playwright resolves them at runtime.
- If a page changes significantly, an old snapshot may be misleading. Use `--fresh` to recapture before planning.
- Provider selection: set `LLM_PROVIDER=gemini` (default) or `LLM_PROVIDER=openai`.
- For Gemini, default model is `gemini-2.5-pro`; override with `GEMINI_MODEL` as needed.
- For OpenAI, default model is `gpt-4o-mini`; override with `OPENAI_MODEL`.

### Caching behavior and flags

- By default, the agent reuses a cached plan for the same URL + instruction to avoid LLM costs.
- Disable the cache for a single run:

```powershell
node dist/index.js run "https://example.com" "click the Login button" --no-cache
```

- Force refresh a plan from the LLM and update the cache:

```powershell
node dist/index.js run "https://example.com" "click the Login button" --refresh-plan
```

- If a cached plan fails (e.g., page changed), the agent falls back to the LLM once by default. Disable fallback with:

```powershell
node dist/index.js run "https://example.com" "click the Login button" --no-fallback
```

## Troubleshooting

- If Playwright can't find the element, try refining the instruction to include the visible button/link text, or use `--fresh` to resnapshot.
- Ensure Node.js 18+ is used. For Windows PowerShell, run commands exactly as shown above with quotes.
- If Gemini returns non-JSON, the tool will report an error. Re-run with a clearer instruction.

## License

MIT
