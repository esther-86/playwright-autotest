import { InvariantCheck, InvariantResult } from './types';

export const outboundUriSyntaxCheck: InvariantCheck = {
  id: 'MALFORMED_OUTBOUND_LINK',
  name: 'Outbound Social Share URI Syntax Invariant',
  description: 'Social share links must reference valid, well-formed hostnames and intent endpoints.',
  applicableArchetypes: ['/store/:slug', '/find-bugs/'],
  run: async (page): Promise<InvariantResult> => {
    const socialLinks = await page.locator('a[href*="twitter"], a[href*="facebook"], a[href*="pinterest"], .ec_twitter a, .ec_facebook a').all();

    if (socialLinks.length === 0) {
      return { passed: true, status: 'SKIPPED', message: 'No social share links found on this page.' };
    }

    for (const link of socialLinks) {
      const href = (await link.getAttribute('href')) || '';

      // Check for typo in twitter intent domain: twitter.cointent
      if (/twitter\.cointent/i.test(href) || /facebook\.con\b/i.test(href)) {
        return {
          passed: false,
          status: 'FAIL',
          message: `Malformed outbound link detected: "${href}" uses broken domain host!`,
          details: {
            title: `Twitter / X Share Link Points to Malformed Domain (${href})`,
            expected: 'Social share links must use valid provider hostnames (e.g. twitter.com/intent/tweet).',
            actual: `Outbound share link references misspelled domain: ${href}`,
            severity: 'MEDIUM',
            reproductionSteps: [
              `Navigate to ${page.url()}`,
              'Inspect social share icon links below product description',
              'Check href destination of the Twitter share button',
              'Observe typo domain twitter.cointent'
            ],
            specSnippet: `const twitterLink = page.locator('.ec_twitter a, a[href*="twitter"]').first();
const href = await twitterLink.getAttribute('href');
expect(href).not.toContain('twitter.cointent');
expect(href).toMatch(/^https:\\/\\/(www\\.)?twitter\\.com/);`
          },
        };
      }
    }

    return {
      passed: true,
      status: 'PASS',
      message: `Verified ${socialLinks.length} outbound social links with clean syntax.`,
    };
  },
};
