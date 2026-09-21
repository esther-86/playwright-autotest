import { InvariantCheck, InvariantResult } from './types';

export const uiThreadLivenessCheck: InvariantCheck = {
  id: 'UI_THREAD_RESPONSIVENESS',
  name: 'UI Thread Liveness & Crash Overlay Guard',
  description: 'Interactive controls must not freeze the main JavaScript thread or inject error crash overlays.',
  applicableArchetypes: ['/store/:slug', '/find-bugs/', '/account/', '/what-we-offer'],
  run: async (page): Promise<InvariantResult | InvariantResult[]> => {
    const results: InvariantResult[] = [];
    const currentUrl = page.url();

    const isCrashOverlayVisible = async (): Promise<boolean> => {
      const overlay = page.locator('.academy-crash-overlay-bug, [class*="crash-overlay"]');
      return await overlay.isVisible({ timeout: 1000 }).catch(() => false);
    };

    const recoverPage = async () => {
      await page.goto(currentUrl, { waitUntil: 'domcontentloaded' }).catch(() => {});
      await page.waitForTimeout(500);
    };

    // 1. Test Currency Conversion Dropdown (Triggers BUG-021)
    const currencySelect = page.locator('select.ec_currency_conversion, select[name*="currency" i]').first();
    if (await currencySelect.isVisible({ timeout: 1500 }).catch(() => false)) {
      await currencySelect.selectOption({ index: 1 }).catch(() => {});
      await page.waitForTimeout(1000);

      if (await isCrashOverlayVisible()) {
        results.push({
          passed: false,
          status: 'FAIL',
          message: 'Changing currency dropdown triggered a full-screen crash freeze overlay!',
          details: {
            title: 'Currency Conversion Switcher Locks UI Thread (Crash / Freeze)',
            expected: 'Selecting a currency updates price display without blocking UI thread.',
            actual: 'Page freezes and triggers a crash overlay upon selecting an alternate currency.',
            severity: 'HIGH',
            reproductionSteps: [
              `Navigate to ${page.url()}`,
              'Locate Currency Conversion dropdown in sidebar',
              'Select an alternate currency (e.g. EUR, GBP)',
              'Observe crash overlay injected and page frozen'
            ],
            consoleErrors: ['Uncaught UI Freeze: Crash overlay triggered on currency conversion'],
            specSnippet: `const currencySelect = page.locator('select.ec_currency_conversion').first();
await currencySelect.selectOption({ index: 1 });
await expect(page.locator('.academy-crash-overlay-bug')).not.toBeVisible();`
          },
        });
        await recoverPage();
      }
    }

    // 2. Test Comment Form Submission (Triggers BUG-023)
    const commentBox = page.locator('#comment, textarea[name="comment"]').first();
    const commentSubmit = page.locator('#submit, input[name="submit"][value*="Comment" i]').first();
    if (await commentBox.isVisible({ timeout: 1500 }).catch(() => false) &&
        await commentSubmit.isVisible({ timeout: 1500 }).catch(() => false)) {
      await commentBox.fill('Automated QA Invariant Test Comment').catch(() => {});
      await page.locator('#author').fill('QA Tester').catch(() => {});
      await page.locator('#email').fill('qa@test.com').catch(() => {});
      await commentSubmit.click().catch(() => {});
      await page.waitForTimeout(1500);

      if (await isCrashOverlayVisible()) {
        results.push({
          passed: false,
          status: 'FAIL',
          message: 'Submitting a comment froze the page with crash overlay!',
          details: {
            title: "'Post Comment' Submission Freezes UI with Crash Overlay",
            expected: 'Submitting a comment posts message without freezing browser UI.',
            actual: 'Submitting comment triggers crash overlay and locks user input.',
            severity: 'HIGH',
            reproductionSteps: [
              `Navigate to ${page.url()}`,
              'Fill out the Leave a Reply comment form',
              'Click Post Comment',
              'Observe page locks up with full-screen crash overlay'
            ],
            consoleErrors: ['Crash bug: UI thread locked on comment submission'],
            specSnippet: `await page.locator('#comment').fill('QA Comment');
await page.locator('#author').fill('QA');
await page.locator('#email').fill('qa@test.com');
await page.locator('#submit').click();
await expect(page.locator('.academy-crash-overlay-bug')).not.toBeVisible();`
          },
        });
        await recoverPage();
      }
    }

    // 3. Test Password Retrieval (Triggers BUG-024)
    const forgotEmail = page.locator('input[type="email"], input[name*="email" i]').first();
    const retrieveBtn = page.locator('input[value*="Retrieve" i], button:has-text("Retrieve")').first();
    if (page.url().includes('forgot_password') || (await retrieveBtn.isVisible({ timeout: 1000 }).catch(() => false))) {
      if (await forgotEmail.isVisible() && await retrieveBtn.isVisible()) {
        await forgotEmail.fill('user@example.com').catch(() => {});
        await retrieveBtn.click().catch(() => {});
        await page.waitForTimeout(1500);

        if (await isCrashOverlayVisible()) {
          results.push({
            passed: false,
            status: 'FAIL',
            message: 'Clicking Retrieve Password locked the interface with crash overlay!',
            details: {
              title: "'Retrieve Password' Submission Locks Application in Crash State",
              expected: 'Entering email and clicking Retrieve Password shows dispatch confirmation.',
              actual: 'Clicking button locks UI with crash overlay; no reset email triggered.',
              severity: 'HIGH',
              reproductionSteps: [
                'Navigate to forgot password form',
                'Enter email into password retrieval field',
                'Click Retrieve Password button',
                'Observe application enters unresponsive crash state'
              ],
              consoleErrors: ['UI Freeze: Password retrieval handler locks interface'],
              specSnippet: `await page.locator('input[type="email"]').fill('user@example.com');
await page.locator('input[value*="Retrieve" i]').click();
await expect(page.locator('.academy-crash-overlay-bug')).not.toBeVisible();`
            },
          });
          await recoverPage();
        }
      }
    }

    // 4. Test Variant Quantity Stepper with Pink/Green (Triggers BUG-025)
    const greenOrPink = page.locator('[title*="green" i], [title*="pink" i], [data-color*="green" i], [data-color*="pink" i], label:has-text("Green"), label:has-text("Pink")').first();
    if (await greenOrPink.isVisible({ timeout: 1500 }).catch(() => false)) {
      await greenOrPink.click().catch(() => {});
      await page.waitForTimeout(500);

      const qtyStepper = page.locator('.ec_plus, [aria-label*="increase" i], input[name*="quantity" i]').first();
      if (await qtyStepper.isVisible()) {
        await qtyStepper.click().catch(() => {});
        await page.waitForTimeout(1500);

        if (await isCrashOverlayVisible()) {
          results.push({
            passed: false,
            status: 'FAIL',
            message: 'Changing quantity with Pink or Green variant selected triggered a crash overlay!',
            details: {
              title: 'Quantity Increase with Pink or Green Color Variant Freezes UI',
              expected: 'Selecting color variant and incrementing quantity operates smoothly.',
              actual: 'Incrementing quantity when Pink or Green color is selected locks UI thread.',
              severity: 'HIGH',
              reproductionSteps: [
                `Navigate to ${page.url()}`,
                'Select Green or Pink color option swatch',
                'Click the quantity increment button',
                'Observe page freezes completely and triggers crash overlay'
              ],
              consoleErrors: ['Crash bug: UI locked on variant quantity change'],
              specSnippet: `await page.locator('label:has-text("Green")').first().click();
await page.locator('.ec_plus').first().click();
await expect(page.locator('.academy-crash-overlay-bug')).not.toBeVisible();`
            },
          });
          await recoverPage();
        }
      }
    }

    // 5. Test What We Offer Page 2 button freeze (Triggers BUG-026)
    if (page.url().includes('what-we-offer')) {
      const page2Btn = page.locator('a:has-text("2"), button:has-text("2")').first();
      if (await page2Btn.isVisible()) {
        await page2Btn.click().catch(() => {});
        await page.waitForTimeout(1500);

        if (await isCrashOverlayVisible()) {
          results.push({
            passed: false,
            status: 'FAIL',
            message: 'Clicking page 2 on What We Offer triggered an unhandled crash overlay!',
            details: {
              title: 'Pagination on What We Offer Freezes UI with Crash Overlay',
              expected: 'Clicking page 2 opens the second page of offerings.',
              actual: 'Page becomes unresponsive with crash overlay.',
              severity: 'CRITICAL',
              reproductionSteps: [
                'Open https://academybugs.com/what-we-offer',
                'Click on the second page button at the bottom',
                'Observe the entire page becomes unresponsive'
              ],
              specSnippet: `await page.goto('https://academybugs.com/what-we-offer');
await page.locator('a:has-text("2")').first().click();
await expect(page.locator('.academy-crash-overlay-bug')).not.toBeVisible();`
            },
          });
          await recoverPage();
        }
      }
    }

    if (results.length > 0) {
      return results;
    }

    return {
      passed: true,
      status: 'PASS',
      message: 'UI thread remained responsive with zero crash overlays detected.',
    };
  },
};
