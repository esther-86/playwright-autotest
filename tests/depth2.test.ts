import { chromium } from 'playwright';
import assert from 'node:assert';
import { discoverScreenActions } from '../src/tree-explorer/discovery';
import { computeStateFingerprint } from '../src/tree-explorer/fingerprint';
import { executeDepthStep } from '../src/tree-explorer/executor';

/**
 * Test: Depth 2 State Transition and Discovery
 *
 * Verifies that transitioning to Depth 2 (e.g. via 'View details for "DNK Yellow Shoes"')
 * discovers actions on the product detail page, including dynamic action clusters and social shares:
 * - Perform "X" on "item #2"
 * - Perform "Email" on "item #3"
 * - Perform "Pinterest" on "item #4"
 * - Perform "LinkedIn" on "item #5"
 * - Perform "MySpace" on "item #6"
 */
async function runDepth2Test() {
  const targetUrl = process.env.TARGET_URL || 'https://academybugs.com/find-bugs/';
  const headless = process.env.HEADLESS === 'true';
  const maxBreadth = parseInt(process.env.MAX_BREADTH_PER_SCREEN || '50', 10);
  const excludedPatterns = ['cookie-policy', 'privacy-policy', 'terms'];

  console.log('='.repeat(60));
  console.log('🧪 RUNNING DEPTH 2 STATE TRANSITION & DISCOVERY TEST');
  console.log(`🌐 Root URL:                 ${targetUrl}`);
  console.log(`🖥 Headless:                 ${headless}`);
  console.log(`📐 Max Breadth Per Screen:   ${maxBreadth}`);
  console.log('='.repeat(60));

  const browser = await chromium.launch({ headless });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    // 1. Root State Setup
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded' });
    const rootFingerprint = await computeStateFingerprint(page);
    const rootActions = await discoverScreenActions(page, maxBreadth, false, excludedPatterns);

    console.log(`\n[Depth 1] Root State: ${rootFingerprint}`);
    console.log(`Discovered ${rootActions.length} initial actions.`);

    // Find the navigation action for DNK Yellow Shoes
    const detailAction = rootActions.find((a) =>
      a.description.includes('DNK Yellow Shoes')
    );
    assert.ok(detailAction, 'Could not find "DNK Yellow Shoes" action in root actions');

    console.log(`\n▶ [Depth 1] Executing transition: "${detailAction.description}"`);
    const { nextFingerprint, transitioned, error } = await executeDepthStep(
      page,
      detailAction,
      rootFingerprint
    );

    assert.ifError(error);
    assert.strictEqual(transitioned, true, 'Expected action to cause state transition');
    console.log(`✨ Transitioned to Depth 2 state: ${nextFingerprint}`);
    assert.ok(
      page.url().includes('dnk-yellow-shoes'),
      `Expected URL to contain "dnk-yellow-shoes", got: ${page.url()}`
    );

    // 2. Discover Actions in Depth 2 State
    const depth2Actions = await discoverScreenActions(page, maxBreadth, false, excludedPatterns);
    console.log(`\nDiscovered ${depth2Actions.length} actions in Depth 2 state:`);
    depth2Actions.forEach((a, i) => console.log(`  |_ ${i + 1}. [${a.category}] ${a.description}`));

    // 3. Verify Key Depth 2 Actions Exist
    const expectedSubstrings = [
      'Perform "X" on "item #2"',
      'View details for item with "Email" ("item #3")',
      'Perform "Email" on "item #3"',
      'View details for item with "Pinterest" ("item #4")',
      'Perform "Pinterest" on "item #4"',
      'View details for item with "LinkedIn" ("item #5")',
      'Perform "LinkedIn" on "item #5"',
      'View details for item with "MySpace" ("item #6")',
      'Perform "MySpace" on "item #6"',
    ];

    for (const expected of expectedSubstrings) {
      const match = depth2Actions.find((a) => a.description.includes(expected));
      assert.ok(
        match,
        `Expected Depth 2 action containing '${expected}' was not found in discovered actions.`
      );
      console.log(`  ✔ Verified Depth 2 action: [${match.category}] ${match.description}`);
    }

    // 4. Verify Depth 2 "ADD TO CART" button locator is valid
    const addToCartAction = depth2Actions.find((a) => a.description.includes('ADD TO CART'));
    assert.ok(addToCartAction, 'Expected "ADD TO CART" action on Depth 2 product page');
    const addToCartLocator = page.locator(addToCartAction.locator).first();
    const isVisible = await addToCartLocator.isVisible();
    assert.strictEqual(isVisible, true, 'Expected ADD TO CART button locator to be visible');
    console.log(`  ✔ Verified "ADD TO CART" button locator is visible and valid`);

    console.log('\n✅ All Depth 2 transition and discovery assertions passed successfully!\n');
  } finally {
    await context.close();
    await browser.close();
  }
}

if (require.main === module) {
  runDepth2Test().catch((err) => {
    console.error('❌ Depth 2 Test failed with error:', err);
    process.exit(1);
  });
}
