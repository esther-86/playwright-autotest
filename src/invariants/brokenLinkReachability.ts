import { InvariantCheck, InvariantResult } from './types';

export const brokenLinkReachabilityCheck: InvariantCheck = {
  id: 'BROKEN_LINK_INTEGRITY',
  name: 'Contextual Link Reachability & HTTP 200 Invariant',
  description: 'In-page links (e.g. manufacturer profile) must resolve to HTTP 200 and not return 404/500.',
  applicableArchetypes: ['/store/:slug'],
  run: async (page): Promise<InvariantResult> => {
    // Find contextual links under product details (manufacturer, brand, category)
    const mfgLink = page.locator('#manufacturer-bug a, a:has-text("DNK"), [class*="manufacturer" i] a').first();

    if (!(await mfgLink.isVisible({ timeout: 2000 }).catch(() => false))) {
      return { passed: true, status: 'SKIPPED', message: 'No manufacturer link found on this page.' };
    }

    const href = await mfgLink.getAttribute('href');
    if (!href) {
      return { passed: true, status: 'SKIPPED', message: 'Link element has no href.' };
    }

    // Probe the destination status
    try {
      const response = await page.request.get(href, { failOnStatusCode: false });
      const status = response.status();

      if (status >= 400) {
        return {
          passed: false,
          status: 'FAIL',
          message: `Broken link detected: "${href}" returned HTTP ${status} Not Found!`,
          details: {
            title: `Broken Manufacturer Link on Product Details Page (${status} Error)`,
            expected: `Manufacturer link (${href}) must resolve to a valid page (HTTP 200).`,
            actual: `Manufacturer link returns HTTP ${status} error.`,
            severity: 'MEDIUM',
            reproductionSteps: [
              `Navigate to ${page.url()}`,
              'Locate the manufacturer link beneath the quantity selector',
              'Click the manufacturer link',
              `Observe destination page returns HTTP ${status}`
            ],
            failedRequests: [{ url: href, status }],
            specSnippet: `const mfgLink = page.locator('#manufacturer-bug a, a:has-text("DNK")').first();
const [response] = await Promise.all([
  page.waitForResponse(res => res.url().includes('manufacturer') || res.status() >= 200),
  mfgLink.click()
]);
expect(response.status()).toBeLessThan(400);`
          },
        };
      }

      return {
        passed: true,
        status: 'PASS',
        message: `Contextual link "${href}" verified cleanly (HTTP ${status}).`,
      };
    } catch (err: any) {
      return {
        passed: false,
        status: 'FAIL',
        message: `Contextual link failed to load: ${err.message}`,
      };
    }
  },
};
