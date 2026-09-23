import { InvariantCheck, InvariantResult } from './types';
import { settlePage, timing } from '../timing';

/**
 * Universal Page Size Upper Bound Invariant:
 * Selecting a collection upper bound limit K (e.g. View 10, 24, 50 items per page)
 * must constrain the number of rendered items in the collection to N <= K.
 */
export const perPageLimitCheck: InvariantCheck = {
  id: 'CARDINALITY_UPPER_BOUND',
  name: 'Page Size Cardinality Upper Bound Invariant',
  description: 'Selecting a page size limit K must restrict visible items in collection to <= K.',
  applicableArchetypes: ['/catalog', '/search', '/products', '/items', '/find-bugs'],
  run: async (page, context): Promise<InvariantResult> => {
    const targetLimit = context.params?.limit || 10;
    const limitSelector = context.targetSelector || `[class*="perpage" i] a, [class*="limit" i] a, a:has-text("${targetLimit}")`;
    const perPageBtn = page.locator(limitSelector).first();

    if (!(await perPageBtn.isVisible({ timeout: timing.visibilityMs }).catch(() => false))) {
      return { passed: true, status: 'SKIPPED', message: 'No per-page cardinality controls found on this page.' };
    }

    // Click the limit option
    await perPageBtn.click();
    await settlePage(page);

    // Count visible collection items
    const itemCardSelector = '[role="article"], [role="listitem"], [role="row"], .card, [class*="product" i]';
    const visibleItemCount = await page.locator(itemCardSelector).count();

    // Cardinality Invariant: N <= K
    if (visibleItemCount > targetLimit) {
      return {
        passed: false,
        status: 'FAIL',
        message: `Cardinality upper bound violated: Selected View ${targetLimit}, but ${visibleItemCount} items are rendered on screen (${visibleItemCount} > ${targetLimit})!`,
        details: {
          title: `Page Size Upper Bound Violated (Selected View ${targetLimit}, Rendered ${visibleItemCount})`,
          expected: `Selecting View ${targetLimit} must restrict visible cards to <= ${targetLimit}.`,
          actual: `${visibleItemCount} items rendered on screen (${visibleItemCount} > ${targetLimit}).`,
          severity: 'HIGH',
          reproductionSteps: [
            `Navigate to ${page.url()}`,
            `Click on "${targetLimit}" in per-page limit controls`,
            'Count visible collection cards',
            `Observe ${visibleItemCount} items are rendered`
          ],
          specSnippet: `const perPage = page.locator('${limitSelector}').first();
await perPage.click();
await page.waitForLoadState('networkidle');
const count = await page.locator('${itemCardSelector}').count();
expect(count).toBeLessThanOrEqual(${targetLimit});`
        },
      };
    }

    return {
      passed: true,
      status: 'PASS',
      message: `Cardinality respected: ${visibleItemCount} items displayed (<= limit of ${targetLimit}).`,
    };
  },
};
