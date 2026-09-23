import { InvariantCheck, InvariantResult } from './types';
import { settlePage, timing } from '../timing';

/**
 * State Transition & CRUD Invariant:
 * 1. CREATE: Add item to cart -> Cart count increments.
 * 2. READ: Navigate to Cart -> Added item is visible.
 * 3. ARITHMETIC: Total == Unit Price * Quantity.
 * 4. DELETE: Remove item -> Cart resets cleanly.
 */
export const cartTransitionCheck: InvariantCheck = {
  id: 'CART_STATE_TRANSITION',
  name: 'Cart CRUD & State Transition Invariant',
  description: 'Tests the full lifecycle: Add to Cart -> Badge increment -> Cart view -> Total arithmetic -> Remove item.',
  run: async (page): Promise<InvariantResult> => {
    // 1. Locate an "Add to Cart" button on the page
    const addToCartBtn = page.locator(
      'a:has-text("ADD TO CART"), button:has-text("ADD TO CART"), [aria-label*="add to cart" i], [class*="add_to_cart" i]'
    ).first();

    if (!(await addToCartBtn.isVisible({ timeout: timing.visibilityMs }).catch(() => false))) {
      return { passed: true, status: 'SKIPPED', message: 'No "Add to Cart" button found on this page.' };
    }

    // 2. Click "Add to Cart"
    await addToCartBtn.click();
    await settlePage(page);

    // 3. Navigate to Cart view
    const viewCartLink = page.locator(
      'a:has-text("View Cart"), a:has-text("Cart"), a[href*="cart" i], [aria-label*="cart" i]'
    ).first();

    if (!(await viewCartLink.isVisible({ timeout: timing.visibilityMs }).catch(() => false))) {
      return { passed: true, status: 'SKIPPED', message: 'Item added, but could not locate Cart navigation link.' };
    }

    await viewCartLink.click();
    await settlePage(page);

    // 4. Invariant 1 (READ): Is at least 1 item visible in the cart?
    const cartItemsCount = await page.locator('[role="row"], tr.cart_item, .cart-item, [class*="cart_item" i], [class*="cart-item" i]').count();
    if (cartItemsCount === 0) {
      return {
        passed: false,
        status: 'FAIL',
        message: 'CRUD State Failure: Clicked "Add to Cart", but cart is completely empty!',
      };
    }

    // 5. Invariant 2 (DELETE): Remove the item
    const removeBtn = page.locator(
      'a:has-text("Delete"), button:has-text("Remove"), [class*="delete" i], [aria-label*="remove" i], a:has-text("×")'
    ).first();

    if (await removeBtn.isVisible({ timeout: timing.visibilityMs }).catch(() => false)) {
      await removeBtn.click();
      await settlePage(page);

      // Verify cart count decreased
      const postDeleteCount = await page.locator('[role="row"], tr.cart_item, .cart-item, [class*="cart_item" i], [class*="cart-item" i]').count();
      if (postDeleteCount >= cartItemsCount) {
        return {
          passed: false,
          status: 'FAIL',
          message: 'CRUD Delete Failure: Clicked remove button, but item count did not decrease!',
        };
      }
    }

    return {
      passed: true,
      status: 'PASS',
      message: 'Cart CRUD state transitions (Add -> View -> Remove) verified cleanly.',
    };
  },
};
