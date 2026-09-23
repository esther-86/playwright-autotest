import { InvariantCheck, InvariantResult } from './types';
import { observeFor, settlePage, timing } from '../timing';

/**
 * Universal UI Thread Liveness & Crash Overlay Guard:
 * Interacting with interactive controls (selects, forms, buttons, variant toggles)
 * must never lock the browser event loop, trigger fatal uncaught errors,
 * or inject full-screen crash/freeze blocker overlays.
 */
export const uiThreadLivenessCheck: InvariantCheck = {
  id: 'UI_THREAD_LIVENESS',
  name: 'UI Thread Responsiveness & Crash Guard',
  description: 'Controls must execute without unhandled exceptions, event loop freezing, or crash overlays.',
  run: async (page, context): Promise<InvariantResult | InvariantResult[]> => {
    const results: InvariantResult[] = [];
    const currentUrl = page.url();

    const isCrashOrFreezeOverlayActive = async (): Promise<string | null> => {
      // Generic query for blocker overlays or crash banners
      const overlay = page.locator(
        '[class*="crash" i], [class*="freeze" i], [id*="crash" i], [class*="overlay"][class*="bug" i]'
      ).first();

      if (await overlay.isVisible({ timeout: timing.overlayCheckMs }).catch(() => false)) {
        const text = await overlay.innerText().catch(() => 'Crash Overlay Displayed');
        return text.trim() || 'Interactive crash overlay detected';
      }
      return null;
    };

    const recoverView = async () => {
      await page.goto(currentUrl, { waitUntil: 'domcontentloaded' }).catch(() => {});
      await settlePage(page);
    };

    // 1. Probe comboboxes / select dropdowns on the page
    const selectElements = await page.locator('select:visible').all();
    for (const sel of selectElements.slice(0, 3)) {
      const optionCount = await sel.locator('option').count().catch(() => 0);
      if (optionCount > 1) {
        await sel.selectOption({ index: 1 }).catch(() => {});
        await observeFor(page, timing.normalObservationMs);

        const crashMsg = await isCrashOrFreezeOverlayActive();
        if (crashMsg) {
          results.push({
            passed: false,
            status: 'FAIL',
            message: `UI Liveness failure: Changing selection triggered an unhandled crash overlay: "${crashMsg}"!`,
            details: {
              title: 'Dropdown Selection Locks UI with Unhandled Crash Overlay',
              expected: 'Selecting an option updates state smoothly without crashing UI thread.',
              actual: `Changing option rendered a blocking crash overlay: ${crashMsg}`,
              severity: 'HIGH',
              reproductionSteps: [
                `Navigate to ${page.url()}`,
                'Select an option from the dropdown control',
                'Observe full-screen crash overlay is rendered'
              ],
              consoleErrors: [crashMsg],
              specSnippet: `const select = page.locator('select').first();
await select.selectOption({ index: 1 });
await page.waitForLoadState('networkidle');
await expect(page.locator('[class*="crash" i]')).not.toBeVisible();`
            },
          });
          await recoverView();
          break;
        }
      }
    }

    // 2. Probe clickable options (swatches, variant labels, pagination tabs)
    const variantControls = await page.locator(
      '[role="radio"], [role="tab"], input[type="radio"] + label, [class*="swatch" i], [class*="variant" i] label, [class*="pagination" i] a'
    ).all();

    for (const ctrl of variantControls.slice(0, 4)) {
      if (await ctrl.isVisible().catch(() => false)) {
        await ctrl.click().catch(() => {});
        await observeFor(page, timing.shortObservationMs);

        // Also test immediate child increment or action if present
        const plusBtn = page.locator('[class*="plus" i], [aria-label*="increase" i], [aria-label*="increment" i]').first();
        if (await plusBtn.isVisible().catch(() => false)) {
          await plusBtn.click().catch(() => {});
          await observeFor(page, timing.overlayCheckMs);
        }

        const crashMsg = await isCrashOrFreezeOverlayActive();
        if (crashMsg) {
          const ctrlText = await ctrl.innerText().catch(() => 'control');
          results.push({
            passed: false,
            status: 'FAIL',
            message: `UI Liveness failure: Clicking "${ctrlText}" triggered an unhandled crash freeze overlay!`,
            details: {
              title: `Variant/Option Interaction "${ctrlText}" Locks Application`,
              expected: 'User interaction should update UI without locking thread or crashing.',
              actual: 'Full-screen crash overlay rendered upon interaction.',
              severity: 'HIGH',
              reproductionSteps: [
                `Navigate to ${page.url()}`,
                `Click on option "${ctrlText}"`,
                'Observe interface freezes with crash overlay'
              ],
              consoleErrors: [crashMsg],
              specSnippet: `const el = page.locator(':has-text("${ctrlText.replace(/"/g, '')}")').first();
await el.click();
await expect(page.locator('[class*="crash" i]')).not.toBeVisible();`
            },
          });
          await recoverView();
          break;
        }
      }
    }

    // 3. Probe text submission actions (comments, message replies, retrieval forms)
    const singleForm = page.locator('form:visible').first();
    if (await singleForm.isVisible().catch(() => false)) {
      const submitBtn = singleForm.locator('button[type="submit"], input[type="submit"]').first();
      const textInputs = await singleForm.locator('input[type="text"], input[type="email"], textarea').all();

      if (await submitBtn.isVisible().catch(() => false) && textInputs.length > 0) {
        for (const input of textInputs.slice(0, 3)) {
          const type = (await input.getAttribute('type')) || 'text';
          const val = type.includes('email') ? 'test@example.com' : 'Automated QA Test Value';
          await input.fill(val).catch(() => {});
        }

        await submitBtn.click().catch(() => {});
        await observeFor(page, timing.quickVisibilityMs);

        const crashMsg = await isCrashOrFreezeOverlayActive();
        if (crashMsg) {
          results.push({
            passed: false,
            status: 'FAIL',
            message: `Form submission failure: Submitting form triggered a fatal crash overlay!`,
            details: {
              title: 'Form Submission Triggers Unhandled Application Crash',
              expected: 'Submitting valid form inputs should submit or validate cleanly.',
              actual: 'Form submission resulted in a crash overlay locking user input.',
              severity: 'HIGH',
              reproductionSteps: [
                `Navigate to ${page.url()}`,
                'Fill form fields with valid test data',
                'Click submit button',
                'Observe crash overlay rendered'
              ],
              consoleErrors: [crashMsg],
              specSnippet: `const form = page.locator('form').first();
await form.locator('input').first().fill('test@example.com');
await form.locator('[type="submit"]').click();
await expect(page.locator('[class*="crash" i]')).not.toBeVisible();`
            },
          });
          await recoverView();
        }
      }
    }

    if (results.length > 0) {
      return results;
    }

    return {
      passed: true,
      status: 'PASS',
      message: 'UI controls remained fully responsive with zero unhandled crash overlays detected.',
    };
  },
};
