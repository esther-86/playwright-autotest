# Playwright Autotest: Metamorphic & Invariant Testing Engine

An autonomous, oracle-free web testing framework powered by **Dynamic Seed Harvesting** and **Universal Web Invariants**.

Traditional automated testing breaks because it relies on hardcoded data ($f(x) == y$). This engine tests the **laws of physics of user interfaces** ($f(x) \sim f(x')$):
* **Zero test data scripts required:** Passively harvests live seeds from network JSON and the DOM.
* **Works on any website:** E-commerce, SaaS dashboards, internal tools, and media platforms.
* **Extensible plugin architecture:** Every invariant is an isolated, plug-and-play module.

---

## 🚀 Quick Start

### 1. Installation
```bash
git clone <repo-url>
cd playwright-autotest
npm install
npx playwright install chromium
```

### 2. Configure Target Site
Set the URL of any website you want to test in `.env`:
```env
TARGET_URL=https://academybugs.com/find-bugs/
HEADLESS=true
```

### 3. Run the Tests
```bash
# Run headless
npm test

# Run with visible browser window
npm run test:headed
```

---

## 📋 The Invariant Checklist

All invariants are defined in `src/invariants/` and registered in `src/invariants/index.ts`:

| Invariant | Description | Verification Logic |
| :--- | :--- | :--- |
| **`canaryCheck`** | Negative Boundary / Canary | Queries a random UUID; asserts HTTP 200, clean zero-state, no 500 error or blank screen. |
| **`identityCheck`** | Round-Trip Identity | Searches for a harvested real item; asserts it appears in the results. |
| **`filterMonotonicityCheck`** | Filter Monotonicity & Reversibility | Applying a filter must narrow count ($C_1 \le C_0$); unchecking must restore count ($C_2 == C_0$). |
| **`sortingOrderCheck`** | Bidirectional Sorting Monotonicity | Ascending sorts verify $p_i \le p_{i+1}$; Descending sorts verify $p_i \ge p_{i+1}$. |
| **`paginationDisjointnessCheck`** | Pagination Set Disjointness | Asserts that items displayed on Page 1 never repeat on Page 2 ($\text{Page}_1 \cap \text{Page}_2 = \emptyset$). |
| **`deepLinkIdempotenceCheck`** | Deep-Link & Refresh Idempotence | Hard reloads the page; asserts state is fully retained and parameters are not dropped. |
| **`perPageLimitCheck`** | Page Size Upper Bound | Selecting "View 10" asserts that rendered items $\le 10$. |

---

## 📁 Project Structure

```text
playwright-autotest/
├── ARCHITECTURE.md              # In-depth architectural blueprint & mathematical formulation
├── README.md                    # Quickstart and usage guide
├── .env                         # Target URL and runtime options
├── package.json                 # Scripts and dependencies
├── tsconfig.json                # TypeScript configuration
└── src/
    ├── runner.ts                # Main orchestrator: harvests seeds & executes checklist
    └── invariants/
        ├── types.ts             # Standard InvariantCheck interface
        ├── index.ts             # Invariant checklist registry
        ├── canary.ts            # Check 1: Negative UUID canary
        ├── identity.ts          # Check 2: Harvested seed search
        ├── filterMonotonicity.ts# Check 3: Conjunction and reversibility
        ├── sortingOrder.ts      # Check 4: Ascending / Descending order
        ├── paginationDisjointness.ts # Check 5: Disjoint pages
        ├── deepLinkIdempotence.ts    # Check 6: URL state retention
        └── perPageLimit.ts      # Check 7: Page size bound
```

---

## 🛠️ Adding a New Invariant Check

To add a new test, implement the `InvariantCheck` contract in `src/invariants/`:

```typescript
import { InvariantCheck, InvariantResult } from './types';

export const myCustomCheck: InvariantCheck = {
  id: 'MY_CUSTOM_CHECK',
  name: 'My Custom Invariant Check',
  description: 'Explain the invariant property being verified.',
  run: async (page, context): Promise<InvariantResult> => {
    // 1. Locate controls
    // 2. Perform actions
    // 3. Assert invariant
    return { passed: true, status: 'PASS', message: 'Invariant verified.' };
  },
};
```

Then register it in `src/invariants/index.ts`:
```typescript
export const invariantChecklist: InvariantCheck[] = [
  // ...
  myCustomCheck,
];
```

---

## 📖 Deep Dive
For full architectural details, multi-agent explorer/reproducer design, and delta debugging (`ddmin`), read [`ARCHITECTURE.md`](./ARCHITECTURE.md).
