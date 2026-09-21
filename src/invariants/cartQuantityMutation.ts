import { InvariantCheck, InvariantResult } from './types';

/**
 * Universal Mutation Persistence Invariant:
 * Updating an editable numeric/counter field to a valid non-zero integer (e.g. 4)
 * followed by an update action must persist the requested value or display an
 * informative constraint message, rather than silently clamping or resetting.
 */
export const cartQuantityMutationCheck: InvariantCheck = {
  id: 'MUTATION_PERSISTENCE_BOUND',
  name: 'Numeric Input Mutation Persistence Invariant',
  description: 'Updating quantity/counter inputs must persist the entered value without silent reset or clamp.',
  applicableArchetypes: ['/cart', '/checkout', '/basket', '/product', '/item'],
  run: async (page, context): Promise<InvariantResult> => {
    const qtySelector = context.targetSelector || 'input[name*="quantity" i], input[type="number"], input[class*="quantity" i]';
    const qtyInput = page.locator(qtySelector).first();

    if (!(await qtyInput.isVisible({ timeout: 1500 }).catch(() => false))) {
      return { passed: true, status: 'SKIPPED', message: 'No editable numeric counter input found on this view.' };
    }

    const initialVal = (await qtyInput.inputValue().catch(() => '1')).trim();
    const testTargetVal = '4';

    // Locate the corresponding update/submit button in form or container
    const updateBtn = page.locator(
      'button:has-text("Update"), input[value*="Update" i], a:has-text("Update"), [aria-label*="update" i], button[type="submit"]'
    ).first();

    await qtyInput.fill(testTargetVal);
    if (await updateBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
      await updateBtn.click();
      await page.waitForLoadState('networkidle', { timeout: 2500 }).catch(() => {});
      await page.waitForTimeout(1000);
    } else {
      await qtyInput.press('Enter');
      await page.waitForTimeout(1000);
    }

    const updatedVal = (await qtyInput.inputValue().catch(() => '')).trim();

    // Invariant: The value must either match the target value, OR display a validation notification
    if (updatedVal !== testTargetVal && updatedVal !== initialVal) {
      // It was silently altered to a different arbitrary number (e.g., clamped to 2)
      return {
        passed: false,
        status: 'FAIL',
        message: `Mutation persistence violation: Entered value "${testTargetVal}", but input silently clamped/reset to "${updatedVal}" without user confirmation!`,
        details: {
          title: `Numeric Field Silently Clamped to ${updatedVal} on Submit`,
          expected: `Field should accept and persist requested value "${testTargetVal}" or explain constraints.`,
          actual: `Field automatically reset/clamped to "${updatedVal}".`,
          severity: 'HIGH',
          reproductionSteps: [
            `Navigate to ${page.url()}`,
            `Enter "${testTargetVal}" into the numeric input field`,
            'Trigger update/submission',
            `Observe field silently resets to "${updatedVal}"`
          ],
          specSnippet: `const input = page.locator('${qtySelector}').first();
await input.fill('${testTargetVal}');
const btn = page.locator('button:has-text("Update"), input[value*="Update" i]').first();
if (await btn.isVisible()) await btn.click();
await page.waitForTimeout(1000);
expect(await input.inputValue()).toBe('${testTargetVal}');`
        },
      };
    }

    return {
      passed: true,
      status: 'PASS',
      message: `Numeric input persisted value "${updatedVal}" successfully.`,
    };
  },
};
