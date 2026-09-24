# Playwright Autotest

> **Autonomous web QA testing using Metamorphic Invariants and Dynamic Seed Harvesting.**  
> Tests the "laws of physics" of websites (search, filters, sorting, pagination, cart state transitions) without needing hardcoded test data or pre-existing database knowledge.

---

## 🚀 Setup from Scratch (Clean Clone)

### 1. Install Node Dependencies & Playwright Chromium
```bash
npm install
npx playwright install chromium
```

### 2. Set Up Python Virtual Environment (For Streaming Agent)
```bash
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
```

---

## ⚡ How to Run

Configure the target website in `.env`:
```bash
TARGET_URL=https://academybugs.com/find-bugs/
```

### Option A: Run the Invariant Checklist (Deterministic)
Runs all 9 mathematical invariants on the configured page:
```bash
# Run headless (fast)
npm test

# Run headed (watch the browser live)
npm run test:headed
```

### Option B: Run Autonomous Explorer (Agent 1)
Navigates through the site, deduplicates archetypes, and reports candidate bugs:
```bash
npm run explore

# Watch the autonomous explorer live
npm run explore:headed
```

### Option C: Run the Live Antigravity Streaming Agent
Streams internal reasoning and tool calls in real time using the official SDK:
```bash
npm run agent:stream
```

### Option D: Judge Every Journey Action with an LLM

Stage 2 can capture the page before and after every discovered action and ask a
multimodal model for a conservative, evidence-backed bug assessment. Configure
the switch and provider in `.env`:

```bash
LLM_JUDGE_ENABLED=true
LLM_PROVIDER=gemini
LLM_JUDGE_MODEL=gemini-2.5-flash
GEMINI_API_KEY=your-key
LLM_JUDGE_MIN_CONFIDENCE=0.8
LLM_JUDGE_SCREENSHOTS=true
```

OpenAI and local Ollama are also supported:

```bash
# Hosted OpenAI
LLM_PROVIDER=openai
LLM_JUDGE_MODEL=gpt-4.1-mini
OPENAI_API_KEY=your-key

# Or local Ollama with a vision-capable model
LLM_PROVIDER=ollama
LLM_JUDGE_MODEL=llava
OLLAMA_BASE_URL=http://localhost:11434
```

Then run both stages:

```bash
npm run url:explore
npm run journeys:explore
```

Set `LLM_JUDGE_ENABLED=false` to use deterministic invariant checks only. LLM
findings are deliberately labeled as candidates and packaged with the existing
Playwright trace and reproduction artifacts.

Each assessment also receives action-scoped network evidence for documents,
XHR, fetch, WebSocket/EventSource traffic, HTTP error responses, and transport
failures. Credentials and query-string values are removed before URLs are sent
to the model. Unrelated telemetry failures are explicitly excluded from the
bug criteria.

Prompt-size limits for accessibility text, visible text, controls, network
events, and repair input are maintained in `config/llm-judge.json`. The default
budget is intentionally small enough for local models with a 4096-token context.

Gemini REST configuration is maintained in `config/llm-providers.json`. Change
`gemini.apiVersion` to `v1` or `v1beta` there; the judge, action discovery, and
brain integrations all use the same configured version and model defaults.

All explicit browser time bounds are configured in `config/timing.json` and
consumed through `src/timing.ts`; runtime code should not contain numeric
Playwright timeouts or direct fixed sleeps.

---

## 📌 Short Summary: How It Works

1. **Passive Observation (Seed Harvesting):** The runner loads the page and sniffs background network JSON and headings to grab real, live item names (seeds) without hardcoding.
2. **Universal Invariant Checklist:** Executes 9 mathematical checks:
   - **Canary Check:** Searches a random UUID $\to$ asserts clean zero-state (no 500 error or crash).
   - **Identity Check:** Searches a harvested item $\to$ asserts it appears on Page 1.
   - **Filter Monotonicity:** Applying a filter must shrink or preserve counts; unchecking must restore them.
   - **Sorting Monotonicity:** Ascending sorts must be non-decreasing ($p_i \le p_{i+1}$); Descending must be non-increasing.
   - **Pagination Disjointness:** Page 1 items must never repeat on Page 2 ($\text{Page}_1 \cap \text{Page}_2 = \emptyset$).
   - **Deep-Link Idempotence:** Reloading the URL preserves the exact same state without dropping parameters.
   - **Page Size Bound:** Selecting "View 10" ensures $\le 10$ items are rendered.
   - **Cart State Transition:** Tests full CRUD lifecycle: `Add` $\to$ `View` $\to$ `Arithmetic` $\to$ `Remove`.
   - **Boundary Value Analysis:** Tests `-1`, `0`, and `99999999` overflow inputs on forms.
3. **Graceful Degradation:** If a site lacks a feature (e.g. no search bar), that check reports `SKIPPED` rather than failing.

---

## 📁 Key Documentation & Specs

* **[`TODO.md`](./TODO.md)** — Prioritized engineering roadmap and backlog across all 5 milestones.
* **[`AGENTS.md`](./AGENTS.md)** — Full specification for the dual-agent architecture (Explorer Scout vs. Reproducer Scientist) and delta debugging (`ddmin`).
* **[`ARCHITECTURE.md`](./ARCHITECTURE.md)** — Theoretical foundations, mathematical invariant proofs, and discovery pipeline.
* **[`.audit-policy.md`](./.audit-policy.md)** — Operational boundaries and threat model for automated AI auditors (Codex, etc.).
