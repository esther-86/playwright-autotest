import { InvariantCheck, InvariantResult } from './types';

export const perPageLimitCheck: InvariantCheck = {
  id: 'PER_PAGE_LIMIT',
  name: 'Page Size Upper Bound Invariant',
  description: 'Selecting a page size limit (e.g., View 10) must restrict visible items to <= that limit.',
  run: async (page): Promise<InvariantResult> => {
    // 1. Locate page size / per-page buttons or links (e.g., 10, 25, 50)
    const perPageBtn = page.locator(
      'span.ec_product_page_perpage a, [class*="perpage" i] a, [class*="limit" i] a, a:has-text("10")'
    ).first();

    if (!(await perPageBtn.isVisible({ timeout: 2000 }).catch(() => false))) {
      return { passed: true, status: 'SKIPPED', message: 'No per-page limit controls found on this page.' };
    }

    const limit = 10;

    // 2. Click the "10" per-page limit
    await perPageBtn.click();
    await page.waitForLoadState('networkidle', { timeout: 3000 }).catch(() => {});
    await page.waitForTimeout(1000);

    // 3. Count visible product cards
    const visibleItemCount = await page.locator(
      '.ec_product_li, [role="article"], [role="row"], .product-card'
    ).count();

    // 4. Invariant: Visible items must be <= limit
    if (visibleItemCount > limit) {
      return {
        passed: false,
        status: 'FAIL',
        message: `Bug detected! Selected "View ${limit}", but ${visibleItemCount} items are still rendered on screen!`,
        details: {
          title: `Page Size Upper Bound Violated (Selected View ${limit}, Rendered ${visibleItemCount})`,
          expected: `Selecting View ${limit} must restrict visible product cards to <= ${limit}.`,
          actual: `${visibleItemCount} items rendered on screen (${visibleItemCount} > ${limit}).`,
          severity: 'HIGH',
          reproductionSteps: [
            'Navigate to https://academybugs.com/find-bugs/',
            `Click on "${limit}" in per-page limit controls`,
            'Count visible product cards',
            `Observe ${visibleItemCount} cards are rendered`
          ],
          specSnippet: `const perPage = page.locator('span.ec_product_page_perpage a:has-text("${limit}")').first();
await perPage.click();
await page.waitForTimeout(1000);
const count = await page.locator('.ec_product_li').count();
expect(count).toBeLessThanOrEqual(${limit});`
        },
      };
    }

    return {
      passed: true,
      status: 'PASS',
      message: `Page size respected: ${visibleItemCount} items displayed (<= limit of ${limit}).`,
    };
  },
};
