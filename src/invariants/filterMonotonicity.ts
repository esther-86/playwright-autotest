import { InvariantCheck, InvariantResult } from './types';

export const filterMonotonicityCheck: InvariantCheck = {
  id: 'FILTER_MONOTONICITY',
  name: 'Filter Monotonicity & Reversibility',
  description: 'Applying a filter must narrow or preserve result counts (<= initial). Unchecking must restore original count.',
  run: async (page): Promise<InvariantResult> => {
    // 1. Locate an unselected filter checkbox, toggle, or facet link
    const filterCheckbox = page.locator(
      'aside input[type="checkbox"]:not(:checked), [role="filter"] input[type="checkbox"]:not(:checked), input[type="checkbox"]:not(:checked)'
    ).first();

    const priceFilterLink = page.locator(
      'aside .ec_price_filter a, .academy-store-menu-link, aside a[href*="price" i], aside a:has-text("$")'
    ).first();

    const getItemCount = async (): Promise<number> => {
      const badge = page.locator('[data-testid*="count"], [aria-live="polite"], .results-count').first();
      if (await badge.isVisible().catch(() => false)) {
        const text = await badge.innerText();
        const num = text.match(/\b\d+[\d,]*\b/);
        if (num) return parseInt(num[0].replace(/,/g, ''), 10);
      }
      return await page.locator('.ec_product_li, [role="row"], [role="article"], li.product').count();
    };

    const initialCount = await getItemCount();

    if (await filterCheckbox.isVisible({ timeout: 1500 }).catch(() => false)) {
      await filterCheckbox.check();
      await page.waitForLoadState('networkidle', { timeout: 3000 }).catch(() => {});
      const filteredCount = await getItemCount();

      if (filteredCount > initialCount) {
        return {
          passed: false,
          status: 'FAIL',
          message: `Filter violated monotonicity! Count increased from ${initialCount} to ${filteredCount}.`,
        };
      }

      await filterCheckbox.uncheck();
      await page.waitForLoadState('networkidle', { timeout: 3000 }).catch(() => {});
      const restoredCount = await getItemCount();

      if (restoredCount !== initialCount) {
        return {
          passed: false,
          status: 'FAIL',
          message: `Filter reversibility failed! Expected ${initialCount}, got ${restoredCount}.`,
        };
      }
    } else if (await priceFilterLink.isVisible({ timeout: 1500 }).catch(() => false)) {
      // Test link-based price filter facet
      const initialUrl = page.url();
      await priceFilterLink.click();
      await page.waitForLoadState('domcontentloaded', { timeout: 3000 }).catch(() => {});
      await page.waitForTimeout(1000);

      const filteredCount = await getItemCount();
      const newUrl = page.url();

      // If clicking price filter reloads the exact same page with 0 count reduction
      if (filteredCount >= initialCount && filteredCount > 0 && (newUrl === initialUrl || !newUrl.includes('price'))) {
        return {
          passed: false,
          status: 'FAIL',
          message: `Price filter is completely inoperative: clicked filter tier, but catalog remained at ${filteredCount} items without filtering!`,
          details: {
            title: 'Price Range Filter Is Inoperative / Reloads Unfiltered Page',
            expected: 'Selecting a price range must filter the catalog ($C_{\\text{filtered}} < C_{\\text{initial}}$).',
            actual: `Clicking price filter left catalog unchanged at ${filteredCount} items.`,
            severity: 'MEDIUM',
            reproductionSteps: [
              'Navigate to https://academybugs.com/find-bugs/',
              'Locate the Filter by Price section in the sidebar',
              'Click on any price range link',
              'Observe that the catalog is not filtered'
            ],
            specSnippet: `const initialCount = await page.locator('.ec_product_li').count();
await page.locator('aside a:has-text("$")').first().click();
await page.waitForLoadState('domcontentloaded');
const filteredCount = await page.locator('.ec_product_li').count();
expect(filteredCount).toBeLessThan(initialCount);`
          },
        };
      }
    } else {
      return { passed: true, status: 'SKIPPED', message: 'No filter controls found on this page.' };
    }

    return {
      passed: true,
      status: 'PASS',
      message: `Filter obeyed monotonicity (${initialCount} items).`,
    };
  },
};
