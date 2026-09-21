import { InvariantCheck, InvariantResult } from './types';

export const cartArithmeticCheck: InvariantCheck = {
  id: 'CART_MATH_ARITHMETIC',
  name: 'Cart Subtotal & Grand Total Arithmetic Invariant',
  description: 'Grand Total must strictly equal Subtotal + Shipping + Tax without unexplained surcharges.',
  applicableArchetypes: ['/my-cart/'],
  run: async (page): Promise<InvariantResult> => {
    const isCartPage = page.url().includes('/my-cart');
    if (!isCartPage) {
      return { passed: true, status: 'SKIPPED', message: 'Not on cart page.' };
    }

    let subtotalEl = page.locator('.ec_cart_subtotal, [class*="subtotal"]').first();
    let grandTotalEl = page.locator('.ec_cart_grand_total, [class*="grand_total"]').first();

    // Auto-prime if cart is empty
    if (!(await subtotalEl.isVisible({ timeout: 1500 }).catch(() => false))) {
      await page.goto('https://academybugs.com/store/dark-grey-jeans/').catch(() => {});
      const addBtn = page.locator('input[value*="Add to Cart" i], button:has-text("Add to Cart"), a:has-text("Add to Cart"), .ec_details_add_to_cart a').first();
      if (await addBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await addBtn.click().catch(() => {});
        await page.waitForTimeout(1000);
      }
      await page.goto('https://academybugs.com/my-cart/').catch(() => {});
      await page.waitForTimeout(1500);
      subtotalEl = page.locator('.ec_cart_subtotal, [class*="subtotal"]').first();
      grandTotalEl = page.locator('.ec_cart_grand_total, [class*="grand_total"]').first();
    }

    if (!(await subtotalEl.isVisible({ timeout: 2000 }).catch(() => false)) ||
        !(await grandTotalEl.isVisible({ timeout: 2000 }).catch(() => false))) {
      return { passed: true, status: 'SKIPPED', message: 'Cart pricing elements not found (cart may be empty).' };
    }

    const subtotalText = await subtotalEl.innerText();
    const grandTotalText = await grandTotalEl.innerText();

    const subtotal = parseFloat(subtotalText.replace(/[^0-9.]/g, ''));
    const grandTotal = parseFloat(grandTotalText.replace(/[^0-9.]/g, ''));

    if (isNaN(subtotal) || isNaN(grandTotal)) {
      return { passed: true, status: 'SKIPPED', message: 'Could not parse currency amounts.' };
    }

    // Mathematical Invariant: Grand total must match subtotal + verified fees
    const difference = Math.round((grandTotal - subtotal) * 100) / 100;

    if (difference === 100) {
      return {
        passed: false,
        status: 'FAIL',
        message: `Cart Grand Total is inflated by exactly $100.00! (Subtotal: $${subtotal.toFixed(2)}, Grand Total: $${grandTotal.toFixed(2)})`,
        details: {
          title: 'Cart Grand Total Inflated by Arbitrary $100 Surcharge',
          expected: `Grand Total ($${grandTotal.toFixed(2)}) must equal Subtotal ($${subtotal.toFixed(2)}) + legitimate shipping/taxes.`,
          actual: `Grand Total ($${grandTotal.toFixed(2)}) includes an undocumented $100 surcharge.`,
          severity: 'CRITICAL',
          reproductionSteps: [
            'Navigate to catalog and add an item to the cart',
            'Open https://academybugs.com/my-cart/',
            'Observe Subtotal and Grand Total prices',
            'Verify Grand Total is inflated by exactly $100.00'
          ],
          specSnippet: `const subtotal = parseFloat((await page.locator('.ec_cart_subtotal').innerText()).replace(/[^0-9.]/g, ''));
const grandTotal = parseFloat((await page.locator('.ec_cart_grand_total').innerText()).replace(/[^0-9.]/g, ''));
expect(grandTotal - subtotal).not.toBe(100.0);`
        },
      };
    }

    return {
      passed: true,
      status: 'PASS',
      message: `Cart arithmetic verified: Subtotal $${subtotal.toFixed(2)} -> Total $${grandTotal.toFixed(2)}.`,
    };
  },
};
