import { InvariantCheck, InvariantResult } from './types';

export const filterMonotonicityCheck: InvariantCheck = {
  id: 'FILTER_MONOTONICITY',
  name: 'Filter Monotonicity & Reversibility',
  description: 'Applying a filter must narrow or preserve result counts (<= initial). Unchecking must restore original count.',
  run: async (page): Promise<InvariantResult> => {
    // 1. Locate an unselected filter checkbox or toggle
    const filter = page.locator(
      'aside input[type="checkbox"]:not(:checked), [role="filter"] input[type="checkbox"]:not(:checked), input[type="checkbox"]:not(:checked)'
    ).first();

    if (!(await filter.isVisible({ timeout: 2000 }).catch(() => false))) {
      return { passed: true, status: 'SKIPPED', message: 'No filter checkboxes found on this page.' };
    }

    const getItemCount = async (): Promise<number> => {
      // Try badge first
      const badge = page.locator('[data-testid*="count"], [aria-live="polite"], .results-count').first();
      if (await badge.isVisible().catch(() => false)) {
        const text = await badge.innerText();
        const num = text.match(/\b\d+[\d,]*\b/);
        if (num) return parseInt(num[0].replace(/,/g, ''), 10);
      }
      return await page.locator('[role="row"], [role="article"], li, tr').count();
    };

    const initialCount = await getItemCount();

    // 2. Check the filter
    await filter.check();
    await page.waitForLoadState('networkidle', { timeout: 3000 }).catch(() => {});
    const filteredCount = await getItemCount();

    if (filteredCount > initialCount) {
      return {
        passed: false,
        status: 'FAIL',
        message: `Filter violated monotonicity! Count increased from ${initialCount} to ${filteredCount} (OR-logic bug).`,
      };
    }

    // 3. Uncheck to test reversibility
    await filter.uncheck();
    await page.waitForLoadState('networkidle', { timeout: 3000 }).catch(() => {});
    const restoredCount = await getItemCount();

    if (restoredCount !== initialCount) {
      return {
        passed: false,
        status: 'FAIL',
        message: `Filter reversibility failed! Expected count to restore to ${initialCount}, but got ${restoredCount}.`,
      };
    }

    return {
      passed: true,
      status: 'PASS',
      message: `Filter obeyed monotonicity (${initialCount} -> ${filteredCount}) and reversibility (${restoredCount}).`,
    };
  },
};
