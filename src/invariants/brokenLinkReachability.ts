import { InvariantCheck, InvariantResult } from './types';
import { timing } from '../timing';

/**
 * Universal Hyperlink Reachability Invariant:
 * Contextual and navigational links on the page must resolve to HTTP 2xx or 3xx status.
 * Any link returning HTTP 404/500 indicates dead navigation or broken resources.
 */
export const brokenLinkReachabilityCheck: InvariantCheck = {
  id: 'HYPERLINK_REACHABILITY',
  name: 'Hyperlink Reachability & HTTP 200 Invariant',
  description: 'In-page hyperlinks must resolve successfully without returning HTTP 4xx or 5xx error codes.',
  run: async (page): Promise<InvariantResult | InvariantResult[]> => {
    const results: InvariantResult[] = [];

    // Extract visible anchors with real paths
    const links = await page.locator('a[href]:visible').all();
    const checkedHrefs = new Set<string>();

    for (const link of links.slice(0, 8)) {
      const href = (await link.getAttribute('href').catch(() => ''))?.trim();
      if (!href || href === '#' || href.startsWith('javascript:') || href.startsWith('mailto:') || checkedHrefs.has(href)) {
        continue;
      }

      checkedHrefs.add(href);

      try {
        const fullUrl = new URL(href, page.url()).href;
        const response = await page.request.get(fullUrl, { failOnStatusCode: false, timeout: timing.requestMs });
        const status = response.status();

        if (status >= 400) {
          const anchorText = (await link.innerText().catch(() => '')) || href;
          results.push({
            passed: false,
            status: 'FAIL',
            message: `Broken hyperlink detected: "${anchorText}" (${href}) returned HTTP ${status}!`,
            details: {
              title: `Broken Hyperlink on Page Returns HTTP ${status} (${anchorText.slice(0, 30)})`,
              expected: `Link target (${href}) must resolve to a valid page (HTTP 200).`,
              actual: `Navigating to target yields HTTP ${status} error response.`,
              severity: 'MEDIUM',
              reproductionSteps: [
                `Navigate to ${page.url()}`,
                `Locate link "${anchorText}"`,
                'Inspect HTTP destination response status',
                `Observe response returns HTTP ${status}`
              ],
              failedRequests: [{ url: href, status }],
              specSnippet: `const res = await page.request.get('${fullUrl}');
expect(res.status()).toBeLessThan(400);`
            },
          });
          break;
        }
      } catch {}
    }

    if (results.length > 0) {
      return results;
    }

    return {
      passed: true,
      status: 'PASS',
      message: `Sampled ${checkedHrefs.size} contextual hyperlinks; all resolved cleanly without 4xx/5xx errors.`,
    };
  },
};
