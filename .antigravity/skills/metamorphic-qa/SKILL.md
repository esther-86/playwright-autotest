---
name: metamorphic-qa
description: Autonomous oracle-free exploratory web testing using universal metamorphic invariants, boundary value analysis, state transitions, and archetype deduplication. Use whenever the user asks to test, audit, or find bugs on any website.
---

# Metamorphic QA & Autonomous Web Testing Skill

This skill guides you to perform autonomous, oracle-free exploratory testing on any website by asserting on mathematical and behavioral **invariants** instead of hardcoded data.

---

## 1. Core Testing Principles

1. **Equivalence Partitioning (Archetype Deduplication):**
   * Do NOT test 18 identical products. Testing one `/store/:slug` tests the entire product template.
   * Prioritize unexplored archetypes: Catalog $\to$ Product Detail $\to$ Cart $\to$ Checkout $\to$ Search $\to$ Account.

2. **The 7 Universal Web Invariants:**
   * **Canary / Resilience:** Type a random UUID into search/forms $\to$ must return clean zero-state, never a 500 error or blank screen.
   * **Identity Round-Trip:** Search for a real item harvested from the page $\to$ must appear on Page 1.
   * **Filter Monotonicity:** Applying a filter must narrow count ($C_1 \le C_0$); unchecking must restore count ($C_2 == C_0$).
   * **Sorting Monotonicity:** Ascending sorts must be non-decreasing ($p_i \le p_{i+1}$); Descending must be non-increasing.
   * **Pagination Disjointness:** Page 1 items must never repeat on Page 2 ($\text{Page}_1 \cap \text{Page}_2 = \emptyset$).
   * **Page Size Upper Bound:** Selecting "View 10" must render $\le 10$ cards.
   * **Deep-Link Idempotence:** Hard reload must preserve the exact state and URL parameters.

3. **Boundary Value Analysis (BVA):**
   * On numeric inputs (quantity, price, limits): test `-1` (negative), `0` (zero), and `99999999` (overflow).
   * On text inputs: test empty string `""` and `1,000` characters overflow.
   * Assert graceful validation without `NaN`, negative pricing, or 500 crashes.

4. **State Transition & CRUD Lifecycle:**
   * State 0: Empty $\to$ State 1: Add Item $\to$ State 2: Update Quantity $\to$ State 3: Delete $\to$ State 0: Reset.
   * Arithmetic check: Subtotal must strictly equal $\sum (\text{Price} \times \text{Quantity})$.

---

## 2. Autonomous Execution Flow

When given a URL to test:
1. **Observe & Dismiss:** Navigate to the URL and dismiss cookie banners or popups.
2. **Harvest Seeds:** Read visible item names, SKUs, and prices to use as real test inputs.
3. **Execute Invariant Probes:** Run Canary, Filter, Sorting, and Boundary checks on the page.
4. **Follow State Transitions:** Add an item to cart, verify arithmetic, change quantity, and delete.
5. **Output Minimal Repro:** For every bug detected, output a standalone, 10-line Playwright test file.
