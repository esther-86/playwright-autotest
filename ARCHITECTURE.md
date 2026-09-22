# Architecture & Design Blueprint: Metamorphic & Invariant Web Testing

## 1. The Core Paradigm: Dissolving the Test Oracle Problem

Traditional QA fails on arbitrary or production websites due to the **Test Oracle Problem**: when you do not know the underlying database ground truth, you cannot write static assertions:
$$f(x) == y$$

Writing tests this way requires hardcoded seed scripts (e.g., `search("iPhone 15") -> assert price == 999`), which rapidly rot as data changes, seasons shift, or environments get wiped.

Instead of asserting on exact values, this system asserts on the **mathematical and behavioral invariants of the web**:
$$f(x) \sim f(x') \quad \text{or} \quad f^{-1}(f(x)) == x$$

By testing the **laws of physics of user interfaces**, an autonomous agent can test any website (SaaS, e-commerce, media, social platforms, internal tools) with zero prior knowledge of the database.

---

## 2. The Formal Grammar of Universal Web Invariants

Every web capability corresponds to an algebraic invariant property over state transitions $\sigma \xrightarrow{\alpha} \sigma'$:

| Invariant Name | Mathematical Formulation | What It Verifies | Real-World Bug Caught |
| :--- | :--- | :--- | :--- |
| **1. Identity / Round-Trip** | $\forall e \in \mathcal{E}, \; e \in \text{Results}(\text{Query}(e.\text{title}))$ | An item harvested live on the page must appear when searched. | Broken search indexing, bad tokenization, search cache desync. |
| **2. Relational Symmetry** | $A \xrightarrow{\text{has}} B \implies A \in \text{Collection}(B)$ | Clicking a brand, tag, or category must list the parent item. | Broken foreign key lookups, orphan data records. |
| **3. Negative Canary** | $f(\text{UUID}_{\text{rand}}) \to \text{EmptyState} \wedge \text{HTTP}_{2\text{xx}}$ | Searching impossible garbage must return clean zero-state. | 500 server errors, unhandled React exceptions, blank white screens. |
| **4. Filter Monotonicity** | $\mathcal{F}_1 \subseteq \mathcal{F}_2 \implies \|\text{Results}(\mathcal{F}_2)\| \le \|\text{Results}(\mathcal{F}_1)\|$ | Adding filter criteria must narrow or preserve result counts. | Boolean logic inversion (backend executing OR instead of AND). |
| **5. Filter Reversibility** | $\text{Results}(\mathcal{F} \setminus \{f\}) \equiv \text{Results}_{\text{pre-}f}$ | Removing a filter must restore the exact previous count. | Leaking state in client memory, sticky URL parameters. |
| **6. Sorting Monotonicity** | $\forall i < j, \; \text{Compare}(r_i, r_j, \text{dir}) \le 0$ | Ascending/Descending sorts must preserve monotonic ordering. | Lexicographical sorting on numeric values (`"100" < "25"`). |
| **7. Page Size Upper Bound** | $\text{VisibleCards} \le \text{Limit}$ | Selecting "View 10" must render $\le 10$ cards. | Broken per-page limits, unpaginated JSON dumps. |
| **8. Pagination Disjointness** | $\text{Page}_i \cap \text{Page}_j = \emptyset \quad (\forall i \neq j)$ | An item on Page 1 must never repeat on Page 2. | SQL offset off-by-one errors, unstable pagination ordering. |
| **9. Refresh Idempotence** | $\text{State}(\text{Reload}(\text{URL})) \cong \text{State}(\text{Original})$ | Reloading or deep-linking must render the exact same state. | State stored only in ephemeral component memory instead of URL. |

---

## 3. Dynamic Discovery: The "Read First, Test Second" Pipeline

Before testing an arbitrary site, the system passively observes to build a runtime entity graph:

```
[Target Site] 
     │
     ▼ (Passive Observation)
[1. Network Interception] ──► Parse API JSON responses (extract field names, IDs, enums)
[2. DOM Role Induction]   ──► Classify UI patterns (Data Tables, Search, Filter Panels, Feeds, Detail Cards)
[3. Seed Harvester]       ──► Extract real entities (names, prices, SKUs, dates, status badges)
     │
     ▼
[Dynamic Invariant Engine] ──► Generate & run property-based checks
```

1. **Network Sniffing over DOM Scraping:** Modern SPAs fetch JSON in the background. Sniffing `application/json` payloads extracts clean entity names, prices, and IDs without being fooled by CSS changes or minified DOM trees.
2. **Accessibility Tree (AXTree) Role Induction:** Standard ARIA roles translate messy HTML into clean semantics:
   - `role="searchbox"` / `input[type="search"]` $\to$ Search input
   - `role="table"` / `role="grid"` / `role="row"` $\to$ Tabular data
   - `role="combobox"` / `input[type="checkbox"]` $\to$ Faceted filters
   - `role="button"` / `a[rel="next"]` $\to$ Pagination

---

## 4. The Multi-Agent Architecture: Explorer vs. Reproducer

Exploratory AI agents can be noisy and multi-step. Production test suites require deterministic, flake-free, minimal reproductions.

```
┌───────────────────────────────────────────────────────────┐
│                    AGENT 1: THE EXPLORER                  │
│  - Traverses the DOM / API                                │
│  - Harvests entities & detects page archetypes            │
│  - Applies Invariant Tests (Metamorphic / Negative / etc.)│
│  - Emits: PotentialBug { invariant, steps[], expected }  │
└─────────────────────────────┬─────────────────────────────┘
                              │
                              ▼
┌───────────────────────────────────────────────────────────┐
│                   AGENT 2: THE REPRODUCER                 │
│  - Starts in a fresh, isolated browser context (incognito)│
│  - Minifies the step trace (deltas, removes fluff)        │
│  - Attempts to trigger the exact invariant violation      │
│  - Emits: ReproResult (Confirmed / Flake / Fixed)         │
└─────────────────────────────┬─────────────────────────────┘
                              │ Confirmed
                              ▼
┌───────────────────────────────────────────────────────────┐
│                 SYNTHESIS & REPORT ENGINE                 │
│  - Captures: Console errors, network payloads, HAR file   │
│  - Generates a standalone, runnable Playwright script     │
│  - Outputs clean bug ticket with expected vs actual       │
└───────────────────────────────────────────────────────────┘
```

### Hierarchical Delta Debugging (`ddmin`)
When the Explorer discovers a bug after 25 actions, the Reproducer uses Delta Debugging:
1. Prunes sub-sequences of steps.
2. Replays the pruned sequence in a clean-room browser context (zero cache, empty storage).
3. Strips irrelevant exploration steps (e.g., clicking around the nav bar) to isolate the **1-minimal action sequence** that triggers the failure.
4. Generates a standalone, 10-line `repro.spec.ts` Playwright test that engineers can run locally with zero dependencies.

---

## 5. Production Guardrails: Handling "Intentional Asymmetry"

Real-world websites frequently violate pure math for business or UX reasons:

1. **Sponsored / Ad Injections:** Searching for "Nike" returns an Adidas shoe at slot 1.
   - *Guard:* Filter out containers marked `aria-label="sponsored"`, `rel="sponsored"`, or `data-ad` before evaluating the Identity invariant.
2. **Fuzzy Search & Typo Fallbacks:** Searching a precise term displays "Showing results for...".
   - *Guard:* Inspect for did-you-mean microcopy and remap the comparison token.
3. **Eventual Consistency:** Creating an entity in a CQRS microservice backend might not instantly appear in read queries.
   - *Guard:* Bounded exponential backoff (up to 3 seconds) for state mutations before flagging an invariant violation.

---

## 6. Site-Agnostic Statistical & Topological Clustering Architecture

To maintain universal autonomy across any domain (e-commerce, SaaS, GitHub, CRM, blogs) and any human language without static test scripts:

1. **Topology-Driven Container Induction:**
   Repeated item containers (cards, data tables, feeds) are detected purely through structural topology (a parent element containing $\ge 3$ sibling children sharing uniform tags with interactables). Never relies on hardcoded CSS classes (no `.product-card`, `.ec_product_li`).

2. **Mathematical Separation of Titles vs. Action Controls:**
   Distinguishes unique entity identifiers from repeated action controls without keyword blacklists using text frequency across sibling elements:
   $$\text{Freq}(t) = \frac{\sum_{i=1}^N \mathbf{1}(t \in C_i)}{N}$$
   - Entity Titles have frequency $\text{Freq}(t) \le \frac{1}{N}$ (unique per card) combined with semantic heading tags (`h1`–`h6`, `[role="heading"]`).
   - Action Controls and badges have frequency $\text{Freq}(t) \ge \frac{2}{N}$ (repeated across sibling cards).

3. **Dynamic Action-Signature Family Clustering:**
   Sibling cards are clustered into distinct functional families by their primary action control's accessible label (e.g. Family `"ADD TO CART"`, Family `"SELECT OPTIONS"`, Family `"Star"`, Family `"Edit"`).

4. **Cross-Card Action Diversification ("Don't do the same thing for each product"):**
   For each detected card family, distinct actions are allocated across different products:
   - Product 1 in family tests **Detail Navigation**.
   - Product 2 in family tests the **Primary Action Control**.
   - Subsequent products in that family avoid redundant tests.
   - Single-product families test their action directly without being skipped.

