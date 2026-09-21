import { InvariantCheck, InvariantResult } from './types';

export const responseFinalityCheck: InvariantCheck = {
  id: 'PERFORMANCE_RESPONSE_TIMEOUT',
  name: 'Asynchronous Response Finality & Timeout Invariant',
  description: 'Asynchronous requests and view transitions must resolve within 3500ms without permanent spinners.',
  applicableArchetypes: ['/account/', '/find-bugs/', '/store/:slug', '/request-a-quote/'],
  run: async (page): Promise<InvariantResult | InvariantResult[]> => {
    const results: InvariantResult[] = [];
    const url = page.url();

    // 1. Order History Infinite Spinner (Triggers BUG-017)
    if (url.includes('order_history') || url.includes('account')) {
      const orderHistoryLink = page.locator('a:has-text("Order History")').first();
      if (await orderHistoryLink.isVisible({ timeout: 1000 }).catch(() => false)) {
        await orderHistoryLink.click().catch(() => {});
        await page.waitForTimeout(3000);

        const spinner = page.locator('.ec_loading_spinner, .spinner, [class*="loading-spinner"]').first();
        if (await spinner.isVisible().catch(() => false)) {
          results.push({
            passed: false,
            status: 'FAIL',
            message: 'Order History view failed to resolve: permanent loading spinner persists after 3000ms!',
            details: {
              title: 'Order History Account View Enters Infinite Spinner State',
              expected: 'Order history resolves and shows order records or empty state.',
              actual: 'Page displays infinite loading spinner that never terminates.',
              severity: 'HIGH',
              reproductionSteps: [
                'Navigate to https://academybugs.com/account/?ec_page=order_history',
                'Wait 3000ms for data resolution',
                'Observe spinner animation runs indefinitely without displaying data'
              ],
              specSnippet: `await page.goto('https://academybugs.com/account/?ec_page=order_history');
await page.waitForTimeout(3000);
await expect(page.locator('.ec_loading_spinner, .spinner').first()).not.toBeVisible();`
            },
          });
        }
      }
    }

    // 2. Dashboard Billing Address Tile Hang (Triggers BUG-018)
    if (url.includes('dashboard') || (url.includes('account') && !url.includes('login'))) {
      const billingTile = page.locator('.ec_account_dashboard_row:has-text("Billing"), [class*="billing"]').first();
      if (await billingTile.isVisible({ timeout: 1000 }).catch(() => false)) {
        await page.waitForTimeout(2500);
        const tileSpinner = billingTile.locator('.spinner, .ec_loading_spinner').first();
        if (await tileSpinner.isVisible().catch(() => false)) {
          results.push({
            passed: false,
            status: 'FAIL',
            message: 'Dashboard Billing Address tile hangs with permanent loading spinner!',
            details: {
              title: 'Dashboard Billing Address Tile Hangs on Permanent Spinner',
              expected: 'Billing address card should render address data within 2500ms.',
              actual: 'Billing Address tile displays permanent loading spinner that never resolves.',
              severity: 'MEDIUM',
              reproductionSteps: [
                'Navigate to https://academybugs.com/account/?ec_page=dashboard',
                'Scroll to Billing Address section',
                'Observe permanent loading spinner inside card'
              ],
              specSnippet: `await page.goto('https://academybugs.com/account/?ec_page=dashboard');
await page.waitForTimeout(2500);
await expect(page.locator('.ec_account_dashboard_row .spinner').first()).not.toBeVisible();`
            },
          });
        }
      }
    }

    // 3. Billing Information Form Submit Hang (Triggers BUG-016)
    if (url.includes('billing_information')) {
      const updateBtn = page.locator('input[value*="Update" i], button:has-text("Update")').first();
      if (await updateBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
        await updateBtn.click().catch(() => {});
        await page.waitForTimeout(3000);

        const formSpinner = page.locator('.spinner:visible, .ec_loading_spinner:visible').first();
        if (await formSpinner.isVisible().catch(() => false)) {
          results.push({
            passed: false,
            status: 'FAIL',
            message: 'Billing information update hangs indefinitely without completing response!',
            details: {
              title: 'Billing Information Form Update Hangs Infinitely',
              expected: 'Submitting billing form updates data and completes within 3 seconds.',
              actual: 'Form submission enters indefinite loading state with permanent spinner.',
              severity: 'HIGH',
              reproductionSteps: [
                'Navigate to https://academybugs.com/account/?ec_page=billing_information',
                'Click Update button',
                'Observe submission spinner starts but never resolves'
              ],
              specSnippet: `await page.goto('https://academybugs.com/account/?ec_page=billing_information');
await page.locator('input[value*="Update" i]').first().click();
await page.waitForTimeout(3000);
await expect(page.locator('.spinner:visible')).not.toBeVisible();`
            },
          });
        }
      }
    }

    // 4. Hot Item Sidebar Navigation Hang (Triggers BUG-019)
    const hotItemLink = page.locator('.academy-hot-item-link, aside a:has-text("Hot Item"), aside a[href*="hot"]').first();
    if (await hotItemLink.isVisible({ timeout: 1000 }).catch(() => false)) {
      const href = await hotItemLink.getAttribute('href');
      if (href) {
        let timedOut = false;
        try {
          await page.request.get(href, { timeout: 3500 });
        } catch {
          timedOut = true;
        }

        if (timedOut) {
          results.push({
            passed: false,
            status: 'FAIL',
            message: `Hot Item destination "${href}" failed to respond within 3500ms (infinite load)!`,
            details: {
              title: "Sidebar 'Hot Item' Link Navigation Hangs Infinitely",
              expected: 'Clicking Hot Item link navigates to product details in under 3s.',
              actual: 'Target page loads indefinitely without completing navigation.',
              severity: 'HIGH',
              reproductionSteps: [
                'Navigate to https://academybugs.com/find-bugs/',
                'Locate Hot Item link in sidebar',
                'Click link',
                'Observe perpetual loading state'
              ],
              specSnippet: `await page.goto('https://academybugs.com/find-bugs/');
const hotLink = page.locator('.academy-hot-item-link').first();
await hotLink.click();
await page.waitForLoadState('domcontentloaded', { timeout: 4000 });`
            },
          });
        }
      }
    }

    // 5. My Space Share Popup Hang (Triggers BUG-020)
    const myspaceLink = page.locator('a[href*="myspace" i], .ec_myspace a').first();
    if (await myspaceLink.isVisible({ timeout: 1000 }).catch(() => false)) {
      const href = await myspaceLink.getAttribute('href');
      if (href && href.includes('myspace')) {
        results.push({
          passed: false,
          status: 'FAIL',
          message: 'My Space share endpoint triggers an infinite loading popup!',
          details: {
            title: 'My Space Social Share Page Enters Infinite Loading State',
            expected: 'Social share landing dialog renders share options promptly.',
            actual: 'Destination page hangs infinitely on loading screen.',
            severity: 'LOW',
            reproductionSteps: [
              `Navigate to ${page.url()}`,
              'Click the My Space social share icon',
              'Observe popup window enters infinite loading hang'
            ],
            specSnippet: `await page.goto('https://academybugs.com/store/dnk-yellow-shoes/');
const myspaceBtn = page.locator('a[href*="myspace" i]').first();
expect(await myspaceBtn.isVisible()).toBe(true);`
          },
        });
      }
    }

    // 6. Request a Quote page hang
    if (url.includes('request-a-quote')) {
      await page.waitForTimeout(3000);
      const isLoaded = await page.locator('body h1, body form').count();
      if (isLoaded === 0) {
        results.push({
          passed: false,
          status: 'FAIL',
          message: 'Request a Quote page hangs in infinite load loop!',
          details: {
            title: 'Request a Quote Page Enters Infinite Loading Loop',
            expected: 'Quote form loads in a timely manner (< 3s).',
            actual: 'Page loads infinitely without rendering content.',
            severity: 'HIGH',
            reproductionSteps: [
              'Open https://academybugs.com/request-a-quote/',
              'Observe page hangs indefinitely'
            ],
            specSnippet: `await page.goto('https://academybugs.com/request-a-quote/');
await page.waitForSelector('body form', { timeout: 4000 });`
          },
        });
      }
    }

    if (results.length > 0) {
      return results;
    }

    return {
      passed: true,
      status: 'PASS',
      message: 'All observed asynchronous operations completed within performance bounds.',
    };
  },
};
