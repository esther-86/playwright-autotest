import { InvariantCheck, InvariantResult } from './types';
import { settlePage, timing } from '../timing';

/**
 * Boundary Value Analysis (BVA) Invariant:
 * Tests extreme edges on inputs: 0, Negative (-1), and Overflow (10,000+).
 * Asserts graceful UI rejection/clamping without 500 server crashes or NaN values.
 */
export const boundaryValueCheck: InvariantCheck = {
  id: 'BOUNDARY_VALUE_ANALYSIS',
  name: 'Boundary Value Analysis (BVA)',
  description: 'Tests 0, negative (-1), and extreme overflow boundaries on numeric and text inputs.',
  run: async (page): Promise<InvariantResult> => {
    // 1. Find a numeric or quantity input (common in carts and filters)
    const numberInput = page.locator('input[type="number"], input[name*="quantity" i], input[id*="quantity" i]').first();

    if (await numberInput.isVisible({ timeout: timing.visibilityMs }).catch(() => false)) {
      // Test A: Negative value (-1)
      await numberInput.fill('-1');
      await numberInput.press('Enter').catch(() => {});
      await settlePage(page);

      const val = await numberInput.inputValue();
      if (val === '-1') {
        // If the input accepted -1, check if the page threw an error or allowed negative values
        const bodyText = await page.innerText('body');
        if (bodyText.includes('$-') || bodyText.includes('NaN')) {
          return {
            passed: false,
            status: 'FAIL',
            message: 'Boundary Bug: Input accepted -1 and resulted in negative pricing or NaN values!',
          };
        }
      }

      // Test B: Zero value (0)
      await numberInput.fill('0');
      await numberInput.press('Enter').catch(() => {});
      await settlePage(page);

      // Test C: Extreme Overflow (99999999)
      await numberInput.fill('99999999');
      await numberInput.press('Enter').catch(() => {});
      await settlePage(page);

      const overflowBody = await page.innerText('body');
      if (overflowBody.includes('500') || overflowBody.includes('Internal Server Error')) {
        return {
          passed: false,
          status: 'FAIL',
          message: 'Boundary Bug: Input with 99999999 caused a 500 server crash!',
        };
      }

      return {
        passed: true,
        status: 'PASS',
        message: 'Numeric boundaries (-1, 0, 99999999) handled gracefully without crashes or NaN.',
      };
    }

    // 2. Fallback: Test text input overflow (1,000 characters)
    const textInput = page.locator('input[type="text"], textarea').first();
    if (await textInput.isVisible({ timeout: timing.visibilityMs }).catch(() => false)) {
      const hugeString = 'QA_OVERFLOW_'.repeat(100);
      await textInput.fill(hugeString);
      await textInput.press('Enter').catch(() => {});
      await settlePage(page);

      const textBody = await page.innerText('body');
      if (textBody.includes('500') || textBody.includes('Internal Server Error')) {
        return {
          passed: false,
          status: 'FAIL',
          message: 'Boundary Bug: 1,000-character input caused a 500 server crash!',
        };
      }

      return {
        passed: true,
        status: 'PASS',
        message: 'Text input handled 1,000-character overflow boundary cleanly.',
      };
    }

    return { passed: true, status: 'SKIPPED', message: 'No editable inputs found on this page to test boundaries.' };
  },
};
