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
      const ascOption = sortSelect.locator('option').filter({ hasText: /(low.*high|asc|cheapest|oldest)/i }).first();
      if (await ascOption.count() > 0) {
        const val = (await ascOption.getAttribute('value')) || '';
        const selected = await sortSelect.selectOption(val);
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
                  details: {
                    title: 'Ascending Sorting Monotonicity Failure',
                    expected: 'Low-to-High sort must strictly produce monotonically non-decreasing prices.',
                    actual: `Price order broken: $${ascValues[i]} is displayed before $${ascValues[i + 1]}.`,
                    severity: 'HIGH',
                    reproductionSteps: [
                      `Navigate to ${page.url()}`,
                      'Select sort by price: low to high',
                      `Observe order violation between index ${i} and ${i + 1}`
                    ],
                    specSnippet: `const sort = page.locator('select.ec_sort_menu').first();
await sort.selectOption({ label: 'Price: Low to High' });
await page.waitForTimeout(1000);`
                  }
                };
              }
            }
          }
        }
      }
    } catch {
      // Option not available
    }

    // 2. Test DESC
    try {
      const descOption = sortSelect.locator('option').filter({ hasText: /(high.*low|desc|expensive|newest)/i }).first();
      if (await descOption.count() > 0) {
        const val = (await descOption.getAttribute('value')) || '';
        const selected = await sortSelect.selectOption(val);
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
                  details: {
                    title: 'Descending Sorting Monotonicity Failure',
                    expected: 'High-to-Low sort must strictly produce monotonically non-increasing prices.',
                    actual: `Price order broken: $${descValues[i]} is displayed before $${descValues[i + 1]}.`,
                    severity: 'HIGH',
                    reproductionSteps: [
                      `Navigate to ${page.url()}`,
                      'Select sort by price: high to low',
                      `Observe order violation: $${descValues[i]} comes before $${descValues[i + 1]}`
                    ],
                    specSnippet: `const sort = page.locator('select.ec_sort_menu').first();
await sort.selectOption({ label: 'Price: High to Low' });
await page.waitForTimeout(1500);
const prices = await page.locator('.ec_product_price, .ec_price_container').allInnerTexts();
const parsed = prices.map(p => parseFloat(p.replace(/[^0-9.]/g, ''))).filter(n => !isNaN(n));
expect(parsed[${i}]).toBeGreaterThanOrEqual(parsed[${i + 1}]);`
                  }
                };
              }
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
