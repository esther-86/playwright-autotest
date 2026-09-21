import { InvariantCheck, InvariantResult } from './types';

/**
 * Universal Filter Monotonicity & Reversibility Invariant:
 * 1. Monotonicity: Applying an additional filter/facet must narrow or maintain the result set:
 *    |Filtered(S)| <= |S|.
 * 2. Reversibility: Removing or toggling off the applied filter must restore the original set:
 *    |Unfiltered(S)| == |Initial(S)|.
 */
export const filterMonotonicityCheck: InvariantCheck = {
  id: 'FILTER_MONOTONICITY',
  name: 'Filter Monotonicity & Reversibility Invariant',
  description: 'Applying a filter must narrow or preserve result counts (<= initial). Unchecking must restore original count.',
  run: async (page, context): Promise<InvariantResult> => {
    // Locate filter checkbox or link facet
    const filterSelector = context.targetSelector || 'aside input[type="checkbox"]:not(:checked), [role="filter"] input[type="checkbox"]:not(:checked), aside a[href*="filter" i], aside a[href*="price" i]';
    const filterCtrl = page.locator(filterSelector).first();

    const getItemCount = async (): Promise<number> => {
      const badge = page.locator('[data-testid*="count"], [aria-live="polite"], .results-count').first();
      if (await badge.isVisible().catch(() => false)) {
        const text = await badge.innerText();
        const num = text.match(/\b\d+[\d,]*\b/);
        if (num) return parseInt(num[0].replace(/,/g, ''), 10);
      }
      return await page.locator('[role="article"], [role="row"], [role="listitem"], .card, [class*="product" i], tr, li').count();
    };

    const initialCount = await getItemCount();

    if (await filterCtrl.isVisible({ timeout: 1500 }).catch(() => false)) {
      const isCheckbox = await filterCtrl.evaluate((el: HTMLElement) => el.tagName.toLowerCase() === 'input');

      if (isCheckbox) {
        await filterCtrl.check();
        await page.waitForLoadState('networkidle', { timeout: 3000 }).catch(() => {});
        const filteredCount = await getItemCount();

        if (filteredCount > initialCount) {
          return {
            passed: false,
            status: 'FAIL',
            message: `Filter violated monotonicity! Count increased from ${initialCount} to ${filteredCount}.`,
            details: {
              title: 'Filter Application Increased Total Result Count',
              expected: 'Applying a filter constraint must narrow or maintain candidate result count.',
              actual: `Item count expanded from ${initialCount} to ${filteredCount}.`,
              severity: 'HIGH',
              reproductionSteps: [
                `Navigate to ${page.url()}`,
                'Select filter checkbox',
                'Observe result count increased'
              ],
              specSnippet: `const initial = await page.locator('[role="article"], .card').count();
await page.locator('${filterSelector}').first().check();
await page.waitForTimeout(1000);
const filtered = await page.locator('[role="article"], .card').count();
expect(filtered).toBeLessThanOrEqual(initial);`
            }
          };
        }

        await filterCtrl.uncheck();
        await page.waitForLoadState('networkidle', { timeout: 3000 }).catch(() => {});
        const restoredCount = await getItemCount();

        if (restoredCount !== initialCount) {
          return {
            passed: false,
            status: 'FAIL',
            message: `Filter reversibility failed! Expected ${initialCount}, got ${restoredCount}.`,
          };
        }
      } else {
        // Link-based facet
        const initialUrl = page.url();
        await filterCtrl.click();
        await page.waitForLoadState('domcontentloaded', { timeout: 3000 }).catch(() => {});
        await page.waitForTimeout(1000);

        const filteredCount = await getItemCount();
        const newUrl = page.url();

        if (filteredCount >= initialCount && filteredCount > 0 && newUrl === initialUrl) {
          return {
            passed: false,
            status: 'FAIL',
            message: `Filter facet is completely inoperative: clicked facet link, but catalog remained at ${filteredCount} items without filtering!`,
            details: {
              title: 'Filter Facet Link Is Inoperative (0 State Change)',
              expected: 'Clicking filter facet link must narrow results or update URL.',
              actual: `Clicking facet link left view unchanged at ${filteredCount} items.`,
              severity: 'MEDIUM',
              reproductionSteps: [
                `Navigate to ${page.url()}`,
                'Click on filter facet link',
                'Observe catalog results and URL do not update'
              ],
              specSnippet: `const initial = await page.locator('[role="article"], .card').count();
await page.locator('${filterSelector}').first().click();
await page.waitForLoadState('domcontentloaded');
const filtered = await page.locator('[role="article"], .card').count();
expect(filtered).toBeLessThan(initial);`
            },
          };
        }
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
