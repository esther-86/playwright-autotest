import { chromium } from 'playwright';
import assert from 'node:assert';
import { discoverScreenActions } from '../src/tree-explorer/discovery';
import { computeStateFingerprint } from '../src/tree-explorer/fingerprint';

/**
 * Test: Phase 1 Discovery on AcademyBugs
 *
 * Verifies that Phase 1 root state discovery on https://academybugs.com/find-bugs/
 * produces exactly the expected 20 actions covering:
 * - Cookie banner buttons
 * - Per-page pagination limits
 * - Dynamic <select> sorting options
 * - Dynamic card family clustering & cross-card action diversification:
 *   - "ADD TO CART" family (DNK Yellow Shoes & Dark Grey Jeans)
 *   - "Login for Pricing" family (Dark Blue Denim Jeans)
 *   - "Select Options" family (Fall Coat & Denim Coat)
 */
async function runDiscoveryTest() {
  const targetUrl = process.env.TARGET_URL || 'https://academybugs.com/find-bugs/';
  const headless = process.env.HEADLESS === 'true'; // Supports headed/headless
  const maxBreadth = parseInt(process.env.MAX_BREADTH_PER_SCREEN || '50', 10);
  const excludedPatterns = ['cookie-policy', 'privacy-policy', 'terms'];
  const includeMenuHeaderFooter = false;

  console.log('='.repeat(60));
  console.log('🧪 RUNNING DISCOVERY VERIFICATION TEST');
  console.log(`🌐 Target URL:                ${targetUrl}`);
  console.log(`🖥 Headless:                  ${headless}`);
  console.log(`📐 Max Breadth Per Screen:    ${maxBreadth}`);
  console.log('='.repeat(60));

  const browser = await chromium.launch({ headless });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded' });
    const rootFingerprint = await computeStateFingerprint(page);

    const actions = await discoverScreenActions(
      page,
      maxBreadth,
      includeMenuHeaderFooter,
      excludedPatterns
    );

    console.log(`\n[Phase 1: Initializing Root State]`);
    console.log(`Root state initialized (${rootFingerprint}). Discovered ${actions.length} initial actions:`);
    actions.forEach((a, i) => console.log(`  ${i + 1}. [${a.category}] ${a.description}`));

    const expectedActions = [
      { category: 'STATE_MUTATION', description: 'Click button "Functional only"' },
      { category: 'STATE_MUTATION', description: 'Click button "Accept cookies"' },
      { category: 'PAGINATION', description: 'Select page or per-page limit "10"' },
      { category: 'PAGINATION', description: 'Select page or per-page limit "25"' },
      { category: 'PAGINATION', description: 'Select page or per-page limit "50"' },
      { category: 'SORTING', description: 'Sort by "Default Sorting"' },
      { category: 'SORTING', description: 'Sort by "Price Low-High"' },
      { category: 'SORTING', description: 'Sort by "Price High-Low"' },
      { category: 'SORTING', description: 'Sort by "Title A-Z"' },
      { category: 'SORTING', description: 'Sort by "Title Z-A"' },
      { category: 'SORTING', description: 'Sort by "Newest"' },
      { category: 'SORTING', description: 'Sort by "Oldest"' },
      { category: 'SORTING', description: 'Sort by "Best Rating"' },
      { category: 'SORTING', description: 'Sort by "Most Viewed"' },
      { category: 'NAVIGATION', description: 'View details for "DNK Yellow Shoes"' },
      { category: 'STATE_MUTATION', description: 'Perform "ADD TO CART" on "Dark Grey Jeans"' },
      {
        category: 'NAVIGATION',
        description: 'View details for item with "Login for Pricing" ("Dark Blue Denim Jeans")',
      },
      {
        category: 'STATE_MUTATION',
        description: 'Perform "Login for Pricing" on "Dark Blue Denim Jeans"',
      },
      {
        category: 'NAVIGATION',
        description: 'View details for item with "Select Options" ("Fall Coat")',
      },
      {
        category: 'STATE_MUTATION',
        description: 'Perform "Select Options" on "Denim Coat"',
      },
    ];

    assert.strictEqual(
      actions.length,
      expectedActions.length,
      `Expected ${expectedActions.length} actions, but got ${actions.length}`
    );

    for (let i = 0; i < expectedActions.length; i++) {
      assert.strictEqual(
        actions[i].category,
        expectedActions[i].category,
        `Action ${i + 1} category mismatch: expected [${expectedActions[i].category}], got [${actions[i].category}]`
      );
      assert.strictEqual(
        actions[i].description,
        expectedActions[i].description,
        `Action ${i + 1} description mismatch: expected "${expectedActions[i].description}", got "${actions[i].description}"`
      );
    }

    console.log('\n✅ All 20 actions successfully verified against Phase 1 expectations!\n');
  } finally {
    await context.close();
    await browser.close();
  }
}

if (require.main === module) {
  runDiscoveryTest().catch((err) => {
    console.error('❌ Test failed with error:', err);
    process.exit(1);
  });
}
