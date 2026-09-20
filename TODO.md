# Project Roadmap & TODOs

This document outlines the milestones and technical backlog for evolving **Playwright Autotest** from a deterministic invariant runner into a fully autonomous, dual-agent exploratory QA platform.

---

## 🎯 Milestone Progress Overview

- [x] **Milestone 1: Deterministic Invariant Kernel (MVP)**
- [ ] **Milestone 2: Agent 1 — The Autonomous Explorer**
- [ ] **Milestone 3: Agent 2 — The Clean-Room Reproducer & Delta Debugger (`ddmin`)**
- [ ] **Milestone 4: Test Synthesizer (Auto-Generating Standalone `.spec.ts` Files)**
- [ ] **Milestone 5: Production Hardening & CI Integrations**

---

## 📋 Detailed Task Breakdown

### Milestone 1: Deterministic Invariant Kernel (Completed ✅)
- [x] Core plugin interface (`InvariantCheck`, `InvariantResult`, `InvariantContext`).
- [x] Network interceptor for background JSON sniffing.
- [x] DOM heading & product card fallback seed harvester.
- [x] 7 Universal Invariant modules:
  - [x] `canaryCheck` (Negative UUID boundary test)
  - [x] `identityCheck` (Round-trip seed search)
  - [x] `filterMonotonicityCheck` (Narrowing & reversibility)
  - [x] `sortingOrderCheck` (Bidirectional ASC/DESC numeric & string order)
  - [x] `paginationDisjointnessCheck` (Zero cross-page duplicates)
  - [x] `deepLinkIdempotenceCheck` (URL serialization & reload persistence)
  - [x] `perPageLimitCheck` (Page size upper bound)
- [x] Isolated incognito browser context per check to eliminate state leaks.
- [x] CI exit code integration (`process.exit(1)` on invariant failures).
- [x] Documented audit policy (`.audit-policy.md`).

---

### Milestone 2: Agent 1 — The Autonomous Explorer 🚀
*Goal: Replace hardcoded button finding with an autonomous agent that navigates complex, unmapped websites.*

- [ ] **Accessibility Tree (AXTree) Parser:**
  - [ ] Implement `page.accessibility.snapshot()` parser to extract semantic interactive elements without sending full raw HTML to LLM.
  - [ ] Prune non-interactive leaf nodes to keep token consumption minimal (< 2,000 tokens per screen).
- [ ] **LLM Action Dispatcher:**
  - [ ] Support Gemini 1.5 / Claude 3.5 Sonnet structured tool calling.
  - [ ] Action tools: `click(selector)`, `type(selector, text)`, `select(selector, value)`, `navigate(url)`, `triggerInvariant(name)`.
- [ ] **Action Graph & Memory:**
  - [ ] Maintain an in-memory directed graph of visited states and transitions ($\sigma_0 \xrightarrow{a_1} \sigma_1$).
  - [ ] Detect and break infinite navigation loops (e.g. repeatedly clicking home).
- [ ] **Additional Invariant Rules:**
  - [ ] `cartMutationCheck` (Add to cart must increment count; remove must decrement).
  - [ ] `relationalSymmetryCheck` (Product $\to$ Detail Page $\to$ Breadcrumb return).
  - [ ] `diacriticNormalizationCheck` (Searching `cafe` vs `café` yields equivalent counts).

---

### Milestone 3: Agent 2 — The Clean-Room Reproducer & Delta Debugger 🔬
*Goal: Isolate candidate bugs found by Explorer, eliminate multi-step fluff, and verify repeatability.*

- [ ] **Hierarchical Delta Debugging Engine (`ddmin`):**
  - [ ] Implement the `ddmin` partitioning algorithm to shrink $N$-step traces into minimal 1-2 step repro sequences.
  - [ ] Action dependency graph (ensuring prerequisite inputs are not pruned before their submit buttons).
- [ ] **Clean-Room Verification:**
  - [ ] Spin up isolated incognito browser contexts with empty cache/storage.
  - [ ] Flake filter: Re-run minimal trace 3 times; require 3/3 reproductions to confirm bug.
- [ ] **Artifact Capture:**
  - [ ] Capture full HAR (HTTP Archive) network logs for failing repros.
  - [ ] Capture terminal console logs, network 4xx/5xx responses, and failing screenshots.

---

### Milestone 4: Test Synthesizer (Zero-Dependency Code Generation) 📝
*Goal: Automatically generate clean, human-readable Playwright test files from confirmed bugs.*

- [ ] **Playwright `.spec.ts` Code Generator:**
  - [ ] Convert `Action[]` traces directly into idiomatic Playwright TypeScript code:
    ```typescript
    await page.goto(url);
    await page.locator(selector).click();
    expect(count).toBeLessThanOrEqual(limit);
    ```
  - [ ] Format output with Prettier for clean developer handover.
- [ ] **Markdown Bug Report Generator:**
  - [ ] Export GitHub/Jira ready issue markdown with summary, reproduction steps, expected vs. actual behavior, and embedded screenshots.

---

### Milestone 5: Production Hardening & CI/CD 🛡️
*Goal: Make the system resilient to complex production edge cases.*

- [ ] **Intentional Asymmetry Guards:**
  - [ ] Sponsored items classifier (strips `[aria-label*="sponsored" i]` cards before Identity checks).
  - [ ] "Did you mean?" fuzzy search remapper.
- [ ] **Session & Rate-Limit Awareness:**
  - [ ] Intercept HTTP 429 (Too Many Requests) and implement automatic exponential backoff.
  - [ ] Support authenticated sessions via saved storage state (`storageState.json`).
- [ ] **GitHub Actions Workflow:**
  - [ ] `.github/workflows/invariant-test.yml` scheduled to run nightly or on pull requests against staging environments.
