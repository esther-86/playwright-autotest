import { test, expect } from '@playwright/test';

test.describe('Autonomous State-Tree Test Suite (https://academybugs.com/find-bugs/)', () => {

  test('Journey 113: View details for "DNK Yellow Shoes" ➔ Click button "ADD TO CART" ➔ Click button "Functional only"', async ({ page }) => {
    await page.goto('https://academybugs.com/find-bugs/', { waitUntil: 'domcontentloaded' });

    // Step 1: View details for "DNK Yellow Shoes"
    const step_113_1 = page.locator('a:visible:has-text("DNK Yellow Shoes")').first();
    await expect(step_113_1).toBeVisible();
    await step_113_1.click();
    await page.waitForLoadState('domcontentloaded');
    // Invariant: Navigates to detail view for "DNK Yellow Shoes"

    // Step 2: Click button "ADD TO CART"
    const step_113_2 = page.locator('button:visible:has-text("ADD TO CART"), [role="button"]:visible:has-text("ADD TO CART"), input[type="submit"][value="ADD TO CART"]:visible, input[type="button"][value="ADD TO CART"]:visible, input[value="ADD TO CART"]:visible').first();
    await expect(step_113_2).toBeVisible();
    await step_113_2.click();
    await page.waitForLoadState('domcontentloaded');
    // Invariant: Triggers action state update

    // Step 3: Click button "Functional only"
    const step_113_3 = page.locator('button:visible:has-text("Functional only"), [role="button"]:visible:has-text("Functional only"), input[type="submit"][value="Functional only"]:visible, input[type="button"][value="Functional only"]:visible, input[value="Functional only"]:visible').first();
    await expect(step_113_3).toBeVisible();
    await step_113_3.click();
    await page.waitForLoadState('domcontentloaded');
    // Invariant: Triggers action state update
  });

});
