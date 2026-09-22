# Agent Communication & Build Rules

## 1. Communication Style
- **Strictly ONE concept at a time**: Never explain multiple ideas, steps, or components in a single response.
- **Bite-sized format**: Keep explanations concise (2–4 sentences or one small snippet).
- **Interactive pacing**: Always pause and check for user understanding before moving to the next concept.
- **Ask 1 question at a time**: If clarifying or soliciting input, ask strictly one question at a time.
- **No walls of text**: Avoid overwhelming multi-step overviews unless explicitly requested.

## 2. Daily Logging & Redaction Standard
- **Per-day log file**: Whenever building features, log structured execution events to `logs/YYYY-MM-DD.log`.
- **PII & credential redaction**: Automatically redact passwords, API keys, tokens, emails, and card numbers.
- **Agent diagnostics**: Logs must contain enough context (timestamps, action, target selector, URL, duration, stack traces) for an AI agent to diagnose where the execution was stuck or errored.

## 3. Playwright Best Practices
- **No hardcoded sleeps/timeouts**: Never use `page.waitForTimeout()`. Rely strictly on Playwright's built-in auto-waiting and web-first assertions (`expect(locator).toBeVisible()`, `expect(locator).toHaveText()`).
- **Resilient locators**: Prioritize user-facing accessibility locators (`page.getByRole()`, `page.getByText()`, `page.getByLabel()`) over fragile CSS classes or XPath.
- **Explicit state & network waiting**: When waiting for async reactions, use targeted conditions like `page.waitForResponse()`, `page.waitForURL()`, or locator state transitions instead of arbitrary delays.
- **Isolated test contexts**: Always execute tests in clean-room browser contexts (`browser.newContext()`) with independent storage and cookies to prevent state bleeding.

## 4. Single Centralized Configuration Standard
- **Single Source of Truth**: All environment variables and configuration must be declared and accessed strictly through `src/config.ts`.
- **No Duplicate Config Readers**: Never add ad-hoc config readers, custom `.env` parsers, or duplicate configuration interfaces in feature files.
- **Consistent Consumption**: All runners, brains, observers, and explorers must import `config` (or `AppConfig`) directly from `src/config.ts`.

## 5. Site-Agnostic Statistical & Topological Clustering Architecture
- **Zero Site-Specific & Language-Dependent Regexes**: Never hardcode domain terms, action verbs, button texts, or badge words (e.g. `add to cart`, `select options`, `login for pricing`, `buy`, `sale`, `new`, `out of stock`) in discovery or exploration code. Logic must operate identically across any domain (e-commerce, SaaS, GitHub, CRM, media) and language (English, German, French, Japanese).
- **DOM Topology-Driven Container Induction**: Detect repeated collections (cards, data rows, feed entries) purely through DOM structural topology (e.g. $\ge 3$ sibling elements sharing uniform tags containing interactables), never via framework- or site-specific CSS classes (no `.product-item`, `.ec_product_li`).
- **Statistical Separation of Titles vs. Action Controls**: Distinguish entity titles from repeated action controls mathematically using text frequency distribution across sibling elements ($1/N$ for unique entity identifiers vs. $\ge 2/N$ for repeated action labels / badges) combined with semantic HTML heading tags (`h1`–`h6`, `[role="heading"]`).
- **Dynamic Action-Signature Family Clustering**: Group sibling cards into distinct functional families based on their primary action control's accessible label (e.g. Family `"ADD TO CART"`, Family `"SELECT OPTIONS"`, Family `"Star"`, Family `"Edit"`).
- **Cross-Card Action Diversification**: For each detected card family, distribute distinct test actions across different entities on the screen:
  - Product 1 in family tests **Detail Navigation**.
  - Product 2 in family tests the **Primary Action Control**.
  - Subsequent products in the same family must not perform redundant duplicate tests.
  - Single-entity families must directly test their unique action without being discarded.

