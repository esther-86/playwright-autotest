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