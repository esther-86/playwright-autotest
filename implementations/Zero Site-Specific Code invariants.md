# Implementation Plan: Neutral Metamorphic QA Method Framework & LLM Runtime Engine

## Problem Statement & User Direction
The existing invariant implementations had begun hardcoding selectors and patterns tailored specifically to `academybugs.com` (e.g., `#manufacturer-bug`, `dark-grey-jeans`, `twitter.cointent`, `dnk-yellow-shoes`).
As directed by the user:
> *"The invariants are starting to shape itself to the tested site instead of being neutral... Maybe an LLM need to see which invariant should be done on the site and write specific test during runtime, but don't commit the specific test. This repo should only be the method, not the actual test code..."*

The repository must remain strictly a **site-agnostic metamorphic testing framework** (the "method"), while an **LLM-driven hypothesis and test synthesizer** reasons about the target page at runtime, binds universal invariants to discovered UI semantics, and writes standalone reproduction specs into `queue/BUG-XXX/repro.spec.ts` without committing any site-specific test code to the repository.

---

## User Review Required

> [!IMPORTANT]
> **Complete Neutralization of Invariants**: All 11+ invariant modules in `src/invariants/` will be stripped of any site-specific URLs, classes, or domain strings (`academybugs`, `dnk`, `jeans`, etc.). They will become pure mathematical and behavioral relations operating over abstract semantic roles (e.g. `combobox[sort]`, `form`, `table[price]`, `a[href]`).
>
> **LLM Runtime Invariant Selector & Synthesizer**: At runtime, the LLM Brain inspects the accessibility tree and DOM, identifies which universal invariants are testable on the active page archetype, and parameterizes the invariant probes dynamically.
>
> **Queue Isolation**: Discovered bugs and synthesized reproduction specs live strictly in `queue/BUG-XXX/repro.spec.ts` (gitignored), ensuring the repository only contains the method and no specific tests.

---

## Architecture: Method vs. Runtime Execution

```mermaid
flowchart TD
    subgraph Repo: The Method (Site-Agnostic, Committed)
        AX["src/observer/treeParser.ts (Semantic Element Harvester)"]
        INV["src/invariants/ (Neutral Mathematical & Behavioral Properties)"]
        INV --> ARITH["arithmetic.ts (Sum == Total)"]
        INV --> MONO["monotonicity.ts (Sort Order x_i <= x_i+1)"]
        INV --> CARD["cardinality.ts (View K => Count <= K)"]
        INV --> MUT["mutationPersistence.ts (Input V => Stored V)"]
        INV --> LIVE["liveness.ts (No crash/freeze/unhandled errors)"]
        INV --> FIN["responseFinality.ts (Spinners resolve < T)"]
        INV --> REACH["reachability.ts (HTTP 2xx/3xx)"]
        INV --> SYNTAX["uriSyntax.ts (RFC URI & Provider Syntax)"]
        INV --> GEOM["layoutGeometry.ts (Non-collision & Alignment)"]
        INV --> CONTENT["contentIntegrity.ts (Anti-Placeholder & Typography)"]
        INV --> ACTION["actionMutation.ts (No Dead Buttons / State Delta > 0)"]
    end

    subgraph Runtime: LLM Agent & Execution (Ephemeral)
        LLM["src/brain/ (LLM Invariant Hypothesis Generator)"]
        EXP["src/explorer.ts (Scout Harness)"]
        
        EXP -->|Observes Page| AX
        AX -->|Interactive Controls| LLM
        LLM -->|Selects & Parametrizes Invariants| INV
        INV -->|Failure Detected| QUEUE["src/queue/bugQueue.ts"]
    end

    subgraph Output Artifacts (queue/ - Ignored by Git)
        QUEUE --> QDIR["queue/BUG-XXX/"]
        QDIR --> META["metadata.json"]
        QDIR --> REP["report.md"]
        QDIR --> SPEC["repro.spec.ts (Runtime Playwright Script)"]
        QDIR --> TRACE["trace.zip"]
    end
```

---

## Proposed Changes

### 1. Neutralize Invariant Modules (`src/invariants/`)

Remove all site-specific hardcoding from all invariant modules:

#### [MODIFY] [`src/invariants/types.ts`](file:///Users/huonglai/Desktop/WORKING/playwright-autotest/src/invariants/types.ts)
- Add generic parameter support so invariants accept abstract options, targets, and bounds provided by the LLM / Observer.

#### [MODIFY] [`src/invariants/cartArithmetic.ts`](file:///Users/huonglai/Desktop/WORKING/playwright-autotest/src/invariants/cartArithmetic.ts) $\to$ Rename concept to Generic Financial / Arithmetic Invariant
- Scans any table, cart, invoice, or receipt container for item prices, quantity columns, tax/shipping lines, and total lines using general currency regex `[$€£¥]?\s*\d+(\.\d{2})?`.
- Asserts $\sum (\text{item prices}) + \text{known fees} == \text{Grand Total}$ without hardcoded selectors.

#### [MODIFY] [`src/invariants/cartQuantityMutation.ts`](file:///Users/huonglai/Desktop/WORKING/playwright-autotest/src/invariants/cartQuantityMutation.ts) $\to$ Generic Mutation Persistence Invariant
- Finds numeric inputs (quantity, count, counter controls) or form fields, applies boundary mutation $K$, submits, and verifies input state is retained rather than silently reset.

#### [MODIFY] [`src/invariants/uiThreadLiveness.ts`](file:///Users/huonglai/Desktop/WORKING/playwright-autotest/src/invariants/uiThreadLiveness.ts) $\to$ Generic UI Liveness & Uncaught Error Guard
- Attaches Playwright listeners for `pageerror`, unhandled rejections, and monitors for high-z-index full-screen blocker overlays or UI freezes after interacting with dropdowns, buttons, and form submissions. No site-specific selectors.

#### [MODIFY] [`src/invariants/responseFinality.ts`](file:///Users/huonglai/Desktop/WORKING/playwright-autotest/src/invariants/responseFinality.ts) $\to$ Generic Asynchronous Finality Invariant
- Generic query for `[aria-busy="true"]`, elements matching spinner/loading/skeleton patterns. Asserts all loaders resolve in $< 3500\text{ms}$.

#### [MODIFY] [`src/invariants/brokenLinkReachability.ts`](file:///Users/huonglai/Desktop/WORKING/playwright-autotest/src/invariants/brokenLinkReachability.ts) $\to$ Generic Hyperlink Reachability Invariant
- Samples anchor links on the current page and verifies response statuses are $< 400$.

#### [MODIFY] [`src/invariants/outboundUriSyntax.ts`](file:///Users/huonglai/Desktop/WORKING/playwright-autotest/src/invariants/outboundUriSyntax.ts) $\to$ Generic Outbound URI Syntax Invariant
- Extracts external outgoing links (social sharing, integrations, external domains) and parses against RFC 3986. Flags invalid TLDs (e.g. `.cointent`) and malformed URL schemes.

#### [MODIFY] [`src/invariants/visualGeometry.ts`](file:///Users/huonglai/Desktop/WORKING/playwright-autotest/src/invariants/visualGeometry.ts) $\to$ Generic Visual Layout Invariant
- Non-collision: Verifies floating/sidebar containers do not overlap fixed footers or headers ($Y_1 + H_1 \le Y_2$).
- Form alignment: Parallel sequential input labels in single-column forms must have collinear left margins ($|X_a - X_b| \le 3\text{px}$).
- Button text alignment: Computes text bounding box within button borders to flag severe offsets ($> 15\text{px}$).
- Image rendering: Flags images with natural dimensions of 0 or aspect-ratio letterboxing $> 40\text{px}$.

#### [MODIFY] [`src/invariants/contentIntegrity.ts`](file:///Users/huonglai/Desktop/WORKING/playwright-autotest/src/invariants/contentIntegrity.ts) $\to$ Generic Content Integrity Invariant
- Anti-Placeholder: Uses a standard Latin dictionary / n-gram detector (`lorem ipsum`, `curabitur`, `dolor sit`) to flag untranslated dummy copy.
- Typography & Kerning: Identifies stray internal spaces inside common English words (`Stor e`, `Shoe s`).
- Encoding Mojibake: Checks text nodes and tooltips for `\uFFFD`, raw HTML entities (`&#`), or unprintable UTF byte sequences.

#### [MODIFY] [`src/invariants/interactiveActionIntegrity.ts`](file:///Users/huonglai/Desktop/WORKING/playwright-autotest/src/invariants/interactiveActionIntegrity.ts) $\to$ Generic Action Mutation & Error Invariant
- Dead Action Detector: Clicks interactive elements (buttons, links with action roles); asserts that at least one state change occurs (URL change, DOM mutation, or network request dispatch). Flags `href="#"` dead actions.
- Submission Error Guard: Asserts form submits do not return 500 error pages.
- Media Element Guard: Verifies `<video>` elements contain valid source streams and do not render empty black frames.

---

### 2. LLM-Driven Runtime Invariant Selection & Synthesis (`src/brain/`)

#### [MODIFY] [`src/brain/types.ts`](file:///Users/huonglai/Desktop/WORKING/playwright-autotest/src/brain/types.ts)
- Extend `BrainDecision` to allow the LLM to inspect page elements and declare:
  ```typescript
  export type BrainDecision =
    | { action: 'CLICK'; target: string; reason: string }
    | { action: 'TYPE'; target: string; text: string; reason: string }
    | { action: 'TEST_INVARIANT'; invariantId: string; targetSelector?: string; params?: Record<string, any>; reason: string }
    | { action: 'NAVIGATE'; url: string; reason: string }
    | { action: 'STOP'; reason: string };
  ```

#### [MODIFY] [`src/brain/index.ts`](file:///Users/huonglai/Desktop/WORKING/playwright-autotest/src/brain/index.ts)
- Equip the LLM Brain (supporting Gemini, OpenAI, Ollama, and an improved Autonomous Rule-Based Scout) to examine any target page, identify which universal invariants apply to the controls present, and dispatch parameterized tests.

---

### 3. Queue & Artifact Engine (`src/queue/bugQueue.ts`)

#### [MODIFY] [`.gitignore`](file:///Users/huonglai/Desktop/WORKING/playwright-autotest/.gitignore)
- Ensure `queue/` is ignored by git so runtime reproduction tests and traces are strictly local artifacts and never committed to the repository.

#### [MODIFY] [`src/queue/bugQueue.ts`](file:///Users/huonglai/Desktop/WORKING/playwright-autotest/src/queue/bugQueue.ts)
- Writes reproduction specs only to `queue/BUG-XXX/repro.spec.ts`.
- Ensures zero test code is generated in `tests/` or committed to `src/`.

---

## Verification Plan

### Automated Tests
1. **Repository Neutrality Verification**:
   - Grep search `src/invariants/` and `src/explorer.ts` for any domain-specific strings (`academybugs`, `dark-grey-jeans`, `dnk-yellow-shoes`, `manufacturer-bug`, `cointent`, `Yelow`). Confirm 0 matches.
2. **Runtime Execution**:
   - Run the explorer against the target:
     ```bash
     npm run explore
     ```
   - Verify that:
     - The explorer visits the site autonomously.
     - The LLM / Brain selects and parameterizes invariants based on observed DOM semantics.
     - Found bugs are saved to `queue/BUG-XXX/repro.spec.ts` along with `metadata.json`, `report.md`, and `trace.zip`.
     - Git status confirms that no runtime test files are committed to the codebase.
