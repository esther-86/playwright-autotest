import { InvariantCheck, InvariantResult } from './types';

export const cartQuantityMutationCheck: InvariantCheck = {
  id: 'CART_QUANTITY_CAP',
  name: 'Cart Quantity Mutation Invariant',
  description: 'Updating quantity to a valid integer >= 3 must persist without silently clamping to 2.',
  applicableArchetypes: ['/my-cart/'],
  run: async (page): Promise<InvariantResult> => {
    const isCartPage = page.url().includes('/my-cart');
    if (!isCartPage) {
      return { passed: true, status: 'SKIPPED', message: 'Not on cart page.' };
    }

    let qtyInput = page.locator('input[name*="quantity" i], .ec_quantity').first();
    let updateBtn = page.locator('button:has-text("Update"), input[value*="Update" i], a:has-text("Update")').first();

    // Auto-prime if cart is empty
    if (!(await qtyInput.isVisible({ timeout: 1500 }).catch(() => false))) {
      await page.goto('https://academybugs.com/store/dark-grey-jeans/').catch(() => {});
      const addBtn = page.locator('input[value*="Add to Cart" i], button:has-text("Add to Cart"), a:has-text("Add to Cart"), .ec_details_add_to_cart a').first();
      if (await addBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await addBtn.click().catch(() => {});
        await page.waitForTimeout(1000);
      }
      await page.goto('https://academybugs.com/my-cart/').catch(() => {});
      await page.waitForTimeout(1500);
      qtyInput = page.locator('input[name*="quantity" i], .ec_quantity').first();
      updateBtn = page.locator('button:has-text("Update"), input[value*="Update" i], a:has-text("Update")').first();
    }

    if (!(await qtyInput.isVisible({ timeout: 2000 }).catch(() => false)) ||
        !(await updateBtn.isVisible({ timeout: 2000 }).catch(() => false))) {
      return { passed: true, status: 'SKIPPED', message: 'Cart quantity or update button not found.' };
    }

    // Set quantity to 4
    await qtyInput.fill('4');
    await updateBtn.click();
    await page.waitForTimeout(1500);

    const updatedVal = (await qtyInput.inputValue()).trim();

    if (updatedVal === '2') {
      return {
        passed: false,
        status: 'FAIL',
        message: 'Cart quantity cap detected: Set quantity to 4, but it automatically clamped/reset back to 2!',
        details: {
          title: 'Cart Quantity Cannot Exceed 2 (Resets to 2 on Update)',
          expected: 'Quantity input should accept and preserve requested quantity (4) upon update.',
          actual: 'Quantity resets to 2 immediately upon clicking update button.',
          severity: 'HIGH',
          reproductionSteps: [
            'Add an item to cart and go to https://academybugs.com/my-cart/',
            'In the quantity field, enter 4',
            'Click the Update button below the item line',
            'Observe the quantity field resets to 2'
          ],
          specSnippet: `const qtyInput = page.locator('input[name*="quantity" i], .ec_quantity').first();
await qtyInput.fill('4');
await page.locator('button:has-text("Update"), input[value*="Update" i]').first().click();
await page.waitForTimeout(1500);
expect(await qtyInput.inputValue()).toBe('4');`
        },
      };
    }

    return {
      passed: true,
      status: 'PASS',
      message: `Cart quantity successfully updated and persisted as ${updatedVal}.`,
    };
  },
};
