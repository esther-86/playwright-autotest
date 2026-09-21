import { InvariantCheck, InvariantResult } from './types';

/**
 * Universal Asynchronous Response Finality Invariant:
 * Any asynchronous operation, view loading state, spinner, or skeleton indicator
 * must resolve to a settled state within a reasonable upper latency bound (< 3500ms).
 * Indefinite or unresolving spinners indicate unhandled promise hangs or broken network state.
 */
export const responseFinalityCheck: InvariantCheck = {
  id: 'ASYNC_RESPONSE_FINALITY',
  name: 'Asynchronous Response Finality & Latency Invariant',
  description: 'Loaders, spinners, and progress indicators must resolve within 3500ms without indefinite hangs.',
  run: async (page): Promise<InvariantResult | InvariantResult[]> => {
    const results: InvariantResult[] = [];

    // Helper to detect active spinners or skeleton loaders
    const findActiveSpinners = async () => {
      return page.locator(
        '[aria-busy="true"]:visible, [class*="spinner" i]:visible, [class*="loading" i]:visible, [role="progressbar"]:visible'
      );
    };

    // 1. Check initial page load state
    await page.waitForTimeout(3000);
    const initialSpinners = await findActiveSpinners();
    const count = await initialSpinners.count().catch(() => 0);

    if (count > 0) {
      for (let i = 0; i < count; i++) {
        const spinner = initialSpinners.nth(i);
        if (await spinner.isVisible().catch(() => false)) {
          const container = spinner.locator('..');
          const containerDesc = (await container.innerText().catch(() => '')).slice(0, 40) || 'page view';

          results.push({
            passed: false,
            status: 'FAIL',
            message: `Asynchronous finality violation: Loading indicator inside "${containerDesc}" persists beyond 3000ms!`,
            details: {
              title: `Permanent Loading Spinner in ${containerDesc}`,
              expected: 'Async data resolution should complete and dismiss spinner within 3 seconds.',
              actual: 'Loading spinner persists indefinitely without displaying content.',
              severity: 'HIGH',
              reproductionSteps: [
                `Navigate to ${page.url()}`,
                'Wait 3000ms for asynchronous requests to settle',
                'Observe loading indicator remains visible'
              ],
              specSnippet: `await page.goto('${page.url()}');
await page.waitForTimeout(3500);
await expect(page.locator('[class*="spinner" i]:visible')).toHaveCount(0);`
            },
          });
          break;
        }
      }
    }

    // 2. Probe action triggers that launch asynchronous requests (e.g. Update, Save, Filter tabs)
    const asyncTriggers = await page.locator(
      'button:has-text("Update"), button:has-text("Save"), a[class*="tab" i], [class*="ajax" i]'
    ).all();

    for (const trigger of asyncTriggers.slice(0, 2)) {
      if (await trigger.isVisible().catch(() => false)) {
        await trigger.click().catch(() => {});
        await page.waitForTimeout(3500);

        const postClickSpinners = await findActiveSpinners();
        if (await postClickSpinners.count() > 0) {
          const triggerText = await trigger.innerText().catch(() => 'action');
          results.push({
            passed: false,
            status: 'FAIL',
            message: `Async action "${triggerText}" initiated a loading state that failed to resolve within 3500ms!`,
            details: {
              title: `Action "${triggerText}" Hangs in Permanent Loading State`,
              expected: 'Clicking action initiates request and settles within 3.5s.',
              actual: 'Permanent spinner remains active indefinitely.',
              severity: 'HIGH',
              reproductionSteps: [
                `Navigate to ${page.url()}`,
                `Click "${triggerText}"`,
                'Observe spinner animation does not terminate'
              ],
              specSnippet: `const trigger = page.locator(':has-text("${triggerText.replace(/"/g, '')}")').first();
await trigger.click();
await page.waitForTimeout(3500);
await expect(page.locator('[class*="spinner" i]:visible')).toHaveCount(0);`
            },
          });
          break;
        }
      }
    }

    if (results.length > 0) {
      return results;
    }

    return {
      passed: true,
      status: 'PASS',
      message: 'All observed loading indicators and async transitions resolved cleanly within latency bounds.',
    };
  },
};
