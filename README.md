# Playwright Autotest

> **Autonomous web QA testing using Metamorphic Invariants and Dynamic Seed Harvesting.**  
> Tests the "laws of physics" of websites (search, filters, sorting, pagination) without needing hardcoded test data or pre-existing database knowledge.

---

## ⚡ How to Run

### 1. Set the website you want to test
Edit `.env` (or leave default):
```bash
TARGET_URL=https://academybugs.com/find-bugs/
```

### 2. Run the tests
From `/Users/huonglai/Desktop/WORKING/playwright-autotest`:

```bash
# Run headless (fast)
npm test

# Run headed (watch the browser live)
npm run test:headed
```

---

## 📌 Short Summary: How It Works

1. **Passive Observation (Seed Harvesting):** The runner loads the page and sniffs background network JSON and headings to grab real, live item names (seeds) without hardcoding.
2. **Universal Invariant Checklist:** Executes 7 mathematical checks:
   - **Canary Check:** Searches a random UUID $\to$ asserts clean zero-state (no 500 error or crash).
   - **Identity Check:** Searches a harvested item $\to$ asserts it appears on Page 1.
   - **Filter Monotonicity:** Applying a filter must shrink or preserve counts; unchecking must restore them.
   - **Sorting Monotonicity:** Ascending sorts must be non-decreasing ($p_i \le p_{i+1}$); Descending must be non-increasing.
   - **Pagination Disjointness:** Page 1 items must never repeat on Page 2 ($\text{Page}_1 \cap \text{Page}_2 = \emptyset$).
   - **Deep-Link Idempotence:** Reloading the URL preserves the exact same state without dropping parameters.
   - **Page Size Bound:** Selecting "View 10" ensures $\le 10$ items are rendered.
3. **Graceful Degradation:** If a site lacks a feature (e.g. no search bar), that check reports `SKIPPED` rather than failing.

---

## 📁 Key Documentation & Specs

* **[`TODO.md`](./TODO.md)** — Prioritized engineering roadmap and backlog across all 5 milestones.
* **[`AGENTS.md`](./AGENTS.md)** — Full specification for the dual-agent architecture (Explorer Scout vs. Reproducer Scientist) and delta debugging (`ddmin`).
* **[`ARCHITECTURE.md`](./ARCHITECTURE.md)** — Theoretical foundations, mathematical invariant proofs, and discovery pipeline.
* **[`.audit-policy.md`](./.audit-policy.md)** — Operational boundaries and threat model for automated AI auditors (Codex, etc.).