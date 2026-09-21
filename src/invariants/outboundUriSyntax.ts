import { InvariantCheck, InvariantResult } from './types';

/**
 * Universal Outbound URI Syntax Invariant:
 * External hyperlinks pointing to third-party providers (social share intents, integrations, partner portals)
 * must have syntactically valid hostnames with recognized TLDs and standard protocol schemes.
 */
export const outboundUriSyntaxCheck: InvariantCheck = {
  id: 'OUTBOUND_URI_SYNTAX',
  name: 'Outbound URI & External Endpoint Syntax Invariant',
  description: 'External destination links must feature syntactically valid hostnames, paths, and recognized TLDs.',
  run: async (page): Promise<InvariantResult> => {
    const originHost = new URL(page.url()).hostname;
    const outboundAnchors = await page.locator('a[href^="http://"], a[href^="https://"]').all();

    for (const anchor of outboundAnchors) {
      const rawHref = (await anchor.getAttribute('href').catch(() => ''))?.trim();
      if (!rawHref) continue;

      try {
        const parsed = new URL(rawHref);
        // Focus on outbound domains
        if (parsed.hostname === originHost) continue;

        // Check for malformed TLDs or common typographical domain corruptions
        // e.g., .cointent, .con, .cm, or double extensions
        const hostnameParts = parsed.hostname.split('.');
        const tld = hostnameParts[hostnameParts.length - 1];

        // Detect domain concatenation errors where path separator '/' was omitted into the TLD
        // e.g. domain.cointent instead of domain.com/intent, or domain.conext instead of domain.com/next
        const isMalformedTld =
          /^(com|co|org|net)[a-z]{3,}$/i.test(tld) ||
          hostnameParts.some((part) => part.length > 30 || /[^a-z0-9-]/i.test(part));

        if (isMalformedTld) {
          return {
            passed: false,
            status: 'FAIL',
            message: `Outbound URI syntax violation: Link "${rawHref}" references a corrupt or misspelled domain (${parsed.hostname})!`,
            details: {
              title: `Outbound Link Points to Typographical Domain Host (${parsed.hostname})`,
              expected: `External link must reference a valid, well-formed internet domain.`,
              actual: `Link references malformed hostname "${parsed.hostname}".`,
              severity: 'MEDIUM',
              reproductionSteps: [
                `Navigate to ${page.url()}`,
                'Inspect outgoing third-party / share links on the page',
                `Check destination URL of link (${rawHref})`,
                `Observe typo in domain name "${parsed.hostname}"`
              ],
              specSnippet: `const anchor = page.locator('a[href*="${parsed.hostname}"]').first();
const href = await anchor.getAttribute('href');
expect(href).not.toContain('${parsed.hostname}');`
            },
          };
        }
      } catch (err: any) {
        return {
          passed: false,
          status: 'FAIL',
          message: `Malformed URI format in anchor href: "${rawHref}" failed standard URL parsing!`,
        };
      }
    }

    return {
      passed: true,
      status: 'PASS',
      message: 'All observed outbound hyperlinks have valid URI syntax and legitimate domain structures.',
    };
  },
};
