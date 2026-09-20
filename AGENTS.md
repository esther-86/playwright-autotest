# Multi-Agent Architecture Specification

This document details the design, role separation, system prompts, schemas, and communication protocols for the dual-agent autonomous QA engine.

```
┌───────────────────────────────────────────────────────────┐
│                    AGENT 1: THE EXPLORER                  │
│  Role: Scout & Hypothesis Generator                       │
│  - Traverses the page using accessibility trees           │
│  - Dynamically harvests seeds from network & DOM          │
│  - Triggers metamorphic invariants                        │
│  - Output: CandidateBugReport (Unminified 20+ step trace) │
└─────────────────────────────┬─────────────────────────────┘
                              │
                              ▼
┌───────────────────────────────────────────────────────────┐
│                   AGENT 2: THE REPRODUCER                 │
│  Role: Clean-Room Scientist & Delta Debugger              │
│  - Starts in isolated, fresh incognito browser context    │
│  - Executes Hierarchical Delta Debugging (ddmin)          │
│  - Strips unnecessary steps (25 steps -> 2 steps)         │
│  - Flake verification: 3/3 clean executions               │
│  - Output: ConfirmedBugReport (Minimal Action Trace)      │
└─────────────────────────────┬─────────────────────────────┘
                              │
                              ▼
┌───────────────────────────────────────────────────────────┐
│                 SYNTHESIS & REPORT ENGINE                 │
│  - Generates standalone, zero-dependency Playwright test  │
│  - Generates GitHub/Jira Markdown bug ticket with HAR     │
└───────────────────────────────────────────────────────────┘
```

---

## 1. Agent 1: The Explorer (The Scout)

### Purpose
The Explorer acts as an untethered, curious user. Its objective is **coverage and seed discovery**: traversing deep into the website, harvesting entities, and evaluating invariants whenever relevant UI controls are encountered.

### System Prompt Specification
```markdown
You are an expert Autonomous Web QA Explorer.
Your goal is to explore the target website, discover new pages and features, harvest valid entity seeds (names, prices, SKUs, categories), and test the fundamental invariants of the web.

Rules:
1. Prioritize exploring diverse page archetypes: Catalogs, Data Tables, Detail Cards, Search Views, Forms.
2. Whenever you encounter a search bar, test Identity and Canary invariants.
3. Whenever you encounter filter facets, test Filter Monotonicity.
4. Whenever you encounter sorting controls, test Bidirectional Sorting Monotonicity.
5. Record every action you take into your Action Trace.
6. If an invariant evaluation returns a failure, emit a CandidateBugReport and continue exploring.
```

### Action Dispatch Schema
The Explorer communicates with the browser via structured tools:
```typescript
export type ExplorerAction =
  | { type: 'CLICK'; selector: string; description: string }
  | { type: 'TYPE'; selector: string; text: string }
  | { type: 'SELECT'; selector: string; value: string }
  | { type: 'NAVIGATE'; url: string }
  | { type: 'EVALUATE_INVARIANT'; invariantId: string; params?: Record<string, any> };
```

### Output Schema: `CandidateBugReport`
When an invariant fails, the Explorer emits:
```typescript
export interface CandidateBugReport {
  id: string;
  timestamp: string;
  targetUrl: string;
  invariantId: string;
  invariantName: string;
  expectedBehavior: string;
  observedBehavior: string;
  rawTrace: ExplorerAction[]; // Unminified, e.g. 20-30 steps
  harvestedSeeds: string[];
  screenshotBase64?: string;
}
```

---

## 2. Agent 2: The Reproducer (The Clean-Room Scientist)

### Purpose
The Explorer's traces are noisy, full of dead ends, backtracking, and unrelated clicks. Developers will reject a 25-step bug report.

The Reproducer's objective is **isolation, flake verification, and delta minimization**:
1. **Clean-Room Sandbox:** Launches a fresh incognito browser profile (`storageState: undefined`, clean cookies, clean cache).
2. **Delta Debugging (`ddmin`):** Systematically strips out unnecessary steps to find the **1-minimal reproduction sequence**.
3. **Flake Elimination:** Verifies the minimal sequence repeats 3/3 times before confirming.

### System Prompt Specification
```markdown
You are a Rigorous Clean-Room QA Reproducer.
You receive a noisy, multi-step CandidateBugReport from the Explorer.

Your tasks:
1. Replay the candidate bug in a pristine, isolated incognito browser session.
2. Apply Hierarchical Delta Debugging to discard every step that is not strictly necessary to trigger the failure.
3. Verify that the bug is deterministic by reproducing it 3 consecutive times.
4. Output the minimal action trace, HAR network log, and console error traces.
```

### Trace Minimization Algorithm (`ddmin`)
```typescript
export async function deltaDebugTrace(
  trace: ExplorerAction[],
  testFn: (subTrace: ExplorerAction[]) => Promise<boolean>
): Promise<ExplorerAction[]> {
  let current = [...trace];
  let n = 2; // Partition granularity

  while (current.length >= 2) {
    const subsets = splitTrace(current, n);
    let reduced = false;

    for (const subset of subsets) {
      // Candidate trace without the current subset
      const candidate = current.filter(step => !subset.includes(step));
      
      // Ensure prerequisite integrity (e.g. don't click submit if input typing was removed)
      if (isValidActionDependency(candidate)) {
        const stillFails = await testFn(candidate);
        if (stillFails) {
          current = candidate;
          n = Math.max(n - 1, 2);
          reduced = true;
          break;
        }
      }
    }

    if (!reduced) {
      if (n === current.length) break;
      n = Math.min(n * 2, current.length);
    }
  }

  return current;
}
```

### Output Schema: `ConfirmedBugReport`
```typescript
export interface ConfirmedBugReport {
  id: string;
  confirmedAt: string;
  targetUrl: string;
  invariantId: string;
  title: string;
  reproRate: '3/3' | 'FLAKY';
  minimalTrace: ExplorerAction[]; // Shrunk to 2-3 essential steps
  generatedPlaywrightSpec: string;
  consoleErrors: string[];
  failedNetworkRequests: { url: string; status: number }[];
}
```

---

## 3. The Test Synthesizer (Artifact Generation)

Once the Reproducer confirms a bug, the Synthesizer outputs a standalone, executable Playwright test script:

```typescript
// artifacts/repro-PER_PAGE_LIMIT-20260919.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Metamorphic Invariant Failure: Page Size Upper Bound', () => {
  test('Selecting View 10 must restrict visible items to <= 10', async ({ page }) => {
    // 1. Navigate
    await page.goto('https://academybugs.com/find-bugs/');
    await page.waitForLoadState('networkidle');

    // 2. Minimal action sequence
    const perPage10 = page.locator('span.ec_product_page_perpage a:has-text("10")').first();
    await perPage10.click();
    await page.waitForTimeout(1000);

    // 3. Invariant Assertion
    const visibleCards = await page.locator('.ec_product_li').count();
    
    // Observed: 18 items displayed
    expect(visibleCards).toBeLessThanOrEqual(10);
  });
});
```

---

## 4. Orchestration & Implementation Strategy

For local execution and cost efficiency:
* **Option A: Pure Code Harness (No LLM for Reproducer):**
  The Explorer can use an LLM for creative navigation, but the **Reproducer runs 100% deterministically in code** using Playwright and the `ddmin` partitioning algorithm. This keeps reproduction instantaneous and free of token costs.
* **Option B: LangGraph / StateGraph Orchestration:**
  If multi-agent LLM negotiation is desired, use a state graph with nodes `Explorer -> InvariantQueue -> Reproducer -> Synthesizer`.
