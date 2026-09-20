import { InvariantCheck, InvariantResult } from './types';

export const sortingOrderCheck: InvariantCheck = {
  id: 'SORTING_ORDER',
  name: 'Bidirectional Sorting Monotonicity',
  description: 'Sorting Low-to-High (ASC) or High-to-Low (DESC) must strictly preserve monotonic order.',
  run: async (page): Promise<InvariantResult> => {
    const sortSelect = page.locator(
      'select[name*="sort" i], select[id*="sort" i], select.ec_sort_menu, [aria-label*="sort" i]'
    ).first();

    if (!(await sortSelect.isVisible({ timeout: 2000 }).catch(() => false))) {
      return { passed: true, status: 'SKIPPED', message: 'No standard sort dropdown found on this page.' };
    }

    const extractNumbers = async (): Promise<number[]> => {
      const texts = await page.locator('.ec_product_li, [role="row"], [role="article"], tr, li').allInnerTexts();
      const nums: number[] = [];
      for (const t of texts) {
        const match = t.match(/\$?(\d+(?:\.\d{1,2})?)/);
        if (match) nums.push(parseFloat(match[1]));
      }
      return nums;
    };

    let testedDirections = 0;

    // 1. Test ASC
    try {
      const selected = await sortSelect.selectOption({ label: /(low.*high|asc|cheapest|oldest)/i });
      if (selected.length > 0) {
        await page.waitForLoadState('networkidle', { timeout: 3000 }).catch(() => {});
        const ascValues = await extractNumbers();

        if (ascValues.length > 1) {
          testedDirections++;
          for (let i = 0; i < ascValues.length - 1; i++) {
            if (ascValues[i] > ascValues[i + 1]) {
              return {
                passed: false,
                status: 'FAIL',
                message: `Ascending sort failed! Index ${i} ($${ascValues[i]}) > Index ${i + 1} ($${ascValues[i + 1]}).`,
              };
            }
          }
        }
      }
    } catch {
      // Option not available
    }

    // 2. Test DESC
    try {
      const selected = await sortSelect.selectOption({ label: /(high.*low|desc|expensive|newest)/i });
      if (selected.length > 0) {
        await page.waitForLoadState('networkidle', { timeout: 3000 }).catch(() => {});
        const descValues = await extractNumbers();

        if (descValues.length > 1) {
          testedDirections++;
          for (let i = 0; i < descValues.length - 1; i++) {
            if (descValues[i] < descValues[i + 1]) {
              return {
                passed: false,
                status: 'FAIL',
                message: `Descending sort failed! Index ${i} ($${descValues[i]}) < Index ${i + 1} ($${descValues[i + 1]}).`,
              };
            }
          }
        }
      }
    } catch {
      // Option not available
    }

    if (testedDirections === 0) {
      return {
        passed: true,
        status: 'SKIPPED',
        message: 'Sort control found, but no matching ASC/DESC price options could be selected.',
      };
    }

    return {
      passed: true,
      status: 'PASS',
      message: `Sorting controls obey monotonic ordering properties (${testedDirections} directions verified).`,
    };
  },
};
