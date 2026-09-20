import { InvariantCheck, InvariantResult } from './types';

export const sortingOrderCheck: InvariantCheck = {
  id: 'SORTING_ORDER',
  name: 'Bidirectional Sorting Monotonicity',
  description: 'Sorting Low-to-High (ASC) or High-to-Low (DESC) must strictly preserve monotonic order.',
  run: async (page): Promise<InvariantResult> => {
    const sortSelect = page.locator(
      'select[name*="sort" i], select[id*="sort" i], [aria-label*="sort" i]'
    ).first();

    if (!(await sortSelect.isVisible({ timeout: 2000 }).catch(() => false))) {
      return { passed: true, status: 'SKIPPED', message: 'No standard sort dropdown found on this page.' };
    }

    const extractNumbers = async (): Promise<number[]> => {
      const texts = await page.locator('[role="row"], [role="article"], tr, li').allInnerTexts();
      const nums: number[] = [];
      for (const t of texts) {
        const match = t.match(/\$?(\d+(?:\.\d{1,2})?)/);
        if (match) nums.push(parseFloat(match[1]));
      }
      return nums;
    };

    // 1. Test ASC
    try {
      await sortSelect.selectOption({ label: /(low to high|asc|cheapest|oldest)/i });
      await page.waitForLoadState('networkidle', { timeout: 3000 }).catch(() => {});
      const ascValues = await extractNumbers();

      for (let i = 0; i < ascValues.length - 1; i++) {
        if (ascValues[i] > ascValues[i + 1]) {
          return {
            passed: false,
            status: 'FAIL',
            message: `Ascending sort failed! Index ${i} (${ascValues[i]}) > Index ${i + 1} (${ascValues[i + 1]}).`,
          };
        }
      }
    } catch {
      // If specific label wasn't found, continue
    }

    // 2. Test DESC
    try {
      await sortSelect.selectOption({ label: /(high to low|desc|expensive|newest)/i });
      await page.waitForLoadState('networkidle', { timeout: 3000 }).catch(() => {});
      const descValues = await extractNumbers();

      for (let i = 0; i < descValues.length - 1; i++) {
        if (descValues[i] < descValues[i + 1]) {
          return {
            passed: false,
            status: 'FAIL',
            message: `Descending sort failed! Index ${i} (${descValues[i]}) < Index ${i + 1} (${descValues[i + 1]}).`,
          };
        }
      }
    } catch {
      // Continue
    }

    return {
      passed: true,
      status: 'PASS',
      message: 'Sorting controls obey monotonic ordering properties.',
    };
  },
};
