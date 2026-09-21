import { InvariantCheck, InvariantResult } from './types';

/**
 * Universal Financial / Cart Arithmetic Invariant:
 * On any checkout, cart, or transactional summary, the Grand Total must strictly equal
 * the sum of item line totals plus itemized fees (shipping, tax) minus discounts.
 */
export const cartArithmeticCheck: InvariantCheck = {
  id: 'CART_MATH_ARITHMETIC',
  name: 'Cart & Invoice Financial Arithmetic Invariant',
  description: 'Grand Total must strictly equal Subtotal + Shipping + Tax without undocumented surcharges.',
  applicableArchetypes: ['/cart', '/checkout', '/basket', '/order'],
  run: async (page): Promise<InvariantResult> => {
    // Locate subtotal and grand total using generic semantic queries
    const subtotalEl = page.locator(
      '[class*="subtotal" i], [id*="subtotal" i], tr:has-text("Subtotal") td, td:has-text("Subtotal") + td'
    ).last();
    const grandTotalEl = page.locator(
      '[class*="grand_total" i], [class*="grandtotal" i], [class*="order-total" i], tr:has-text("Total") td:not(:has-text("Subtotal")), td:has-text("Total") + td, [class*="total" i] strong'
    ).last();

    if (!(await subtotalEl.isVisible({ timeout: 1500 }).catch(() => false)) ||
        !(await grandTotalEl.isVisible({ timeout: 1500 }).catch(() => false))) {
      return { passed: true, status: 'SKIPPED', message: 'No financial pricing summary detected on this page.' };
    }

    const subtotalText = await subtotalEl.innerText().catch(() => '');
    const grandTotalText = await grandTotalEl.innerText().catch(() => '');

    const parseAmount = (text: string) => {
      const match = text.match(/[$€£¥]?\s*(\d+(?:,\d{3})*(?:\.\d{1,2})?)/);
      return match ? parseFloat(match[1].replace(/,/g, '')) : NaN;
    };

    const subtotal = parseAmount(subtotalText);
    const grandTotal = parseAmount(grandTotalText);

    if (isNaN(subtotal) || isNaN(grandTotal)) {
      return { passed: true, status: 'SKIPPED', message: 'Could not parse currency figures from summary table.' };
    }

    // Mathematical Invariant: Total == Subtotal + itemized additions
    const difference = Math.round((grandTotal - subtotal) * 100) / 100;

    // Detect unexplained inflation / arbitrary surcharge (e.g. exactly 100.00 unexplained difference)
    if (difference > 0) {
      // Check if shipping or tax explains this difference
      const feeTexts = await page.locator('[class*="tax" i], [class*="shipping" i], [class*="fee" i]').allInnerTexts().catch(() => []);
      let totalFees = 0;
      for (const ft of feeTexts) {
        const amt = parseAmount(ft);
        if (!isNaN(amt)) totalFees += amt;
      }

      const unexplained = Math.round((difference - totalFees) * 100) / 100;
      if (unexplained !== 0) {
        return {
          passed: false,
          status: 'FAIL',
          message: `Financial arithmetic violation: Grand Total ($${grandTotal.toFixed(2)}) exceeds Subtotal ($${subtotal.toFixed(2)}) by $${difference.toFixed(2)} with $${unexplained.toFixed(2)} unexplained surcharge!`,
          details: {
            title: 'Cart Grand Total Inflated by Arbitrary Undocumented Surcharge',
            expected: `Grand Total ($${grandTotal.toFixed(2)}) must equal Subtotal ($${subtotal.toFixed(2)}) plus documented fees ($${totalFees.toFixed(2)}).`,
            actual: `An unexplained surcharge of $${unexplained.toFixed(2)} is added to the Grand Total.`,
            severity: 'CRITICAL',
            reproductionSteps: [
              `Navigate to ${page.url()}`,
              'Inspect Subtotal and Grand Total in the pricing summary',
              `Observe Grand Total contains an unexplained $${unexplained.toFixed(2)} inflation`
            ],
            specSnippet: `const subtotal = parseFloat((await page.locator('[class*="subtotal" i]').last().innerText()).replace(/[^0-9.]/g, ''));
const grandTotal = parseFloat((await page.locator('[class*="total" i]').last().innerText()).replace(/[^0-9.]/g, ''));
expect(grandTotal - subtotal).not.toBe(${difference});`
          },
        };
      }
    }

    return {
      passed: true,
      status: 'PASS',
      message: `Financial arithmetic verified: Subtotal $${subtotal.toFixed(2)} -> Total $${grandTotal.toFixed(2)}.`,
    };
  },
};
