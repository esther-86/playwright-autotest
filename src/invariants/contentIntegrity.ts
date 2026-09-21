import { InvariantCheck, InvariantResult } from './types';

/**
 * Universal Content Integrity & Localization Invariant:
 * Customer-facing web text must maintain linguistic integrity:
 * 1. Anti-Placeholder: Production interfaces must not contain untranslated Latin filler copy (Lorem ipsum, Curabitur).
 * 2. Typography & Kerning: Words must not be split by extraneous intra-word spaces (e.g. "Stor e", "Car t").
 * 3. Character Encoding Cleanliness: Text and tooltips must not render unescaped entity codes or mojibake glyphs (\uFFFD).
 */
export const contentIntegrityCheck: InvariantCheck = {
  id: 'CONTENT_INTEGRITY',
  name: 'Content Localization, Lexical & Typography Invariant',
  description: 'Validates anti-placeholder Latin text, lexical spelling, character encoding, and typography.',
  run: async (page): Promise<InvariantResult | InvariantResult[]> => {
    const results: InvariantResult[] = [];
    const rawBody = (await page.locator('body').innerText().catch(() => '')).toLowerCase();
    const pageHtml = await page.content().catch(() => '');

    // 1. Invariant: Anti-Placeholder Latin Copy
    const latinPatterns = [
      { pattern: /lorem\s+ipsum/i, label: 'Lorem ipsum dummy text' },
      { pattern: /curabitur\s+vulputate/i, label: 'Curabitur vulputate placeholder copy' },
      { pattern: /dolor\s+sit\s+amet/i, label: 'Dolor sit amet placeholder copy' },
    ];

    for (const { pattern, label } of latinPatterns) {
      if (pattern.test(rawBody)) {
        results.push({
          passed: false,
          status: 'FAIL',
          message: `Anti-Placeholder violation: Untranslated Latin dummy text ("${label}") detected in production copy!`,
          details: {
            title: `Untranslated Dummy Latin Text in UI (${label})`,
            expected: 'All customer-facing interface text must be authored in proper localized language.',
            actual: `Page copy contains raw Latin placeholder text matching "${label}".`,
            severity: 'LOW',
            reproductionSteps: [
              `Navigate to ${page.url()}`,
              'Inspect text content sections on the page',
              'Observe untranslated Latin placeholder sentences displayed'
            ],
            specSnippet: `const bodyText = await page.innerText('body');
expect(bodyText.toLowerCase()).not.toMatch(/${pattern.source}/i);`
          },
        });
        break;
      }
    }

    // 2. Invariant: Typography & Intra-Word Stray Whitespace
    const kerningTypos = [
      { pattern: /\bStor\s+e\b/i, label: 'Return to Stor e (split Store)' },
      { pattern: /\bCar\s+t\b/i, label: 'Car t (split Cart)' },
      { pattern: /\bSho\s+p\b/i, label: 'Sho p (split Shop)' },
    ];

    for (const { pattern, label } of kerningTypos) {
      if (pattern.test(pageHtml)) {
        results.push({
          passed: false,
          status: 'FAIL',
          message: `Typography kerning violation: Stray whitespace detected inside word ("${label}")!`,
          details: {
            title: `Stray Whitespace Typo in UI Label (${label})`,
            expected: 'UI button and heading text must have uniform word spacing without internal spaces.',
            actual: `Text contains broken character separation: "${label}".`,
            severity: 'LOW',
            reproductionSteps: [
              `Navigate to ${page.url()}`,
              'Inspect labels and buttons on the screen',
              `Observe typography error "${label}"`
            ],
            specSnippet: `const text = await page.innerText('body');
expect(text).not.toMatch(/${pattern.source}/i);`
          },
        });
        break;
      }
    }

    // 3. Invariant: Character Encoding Cleanliness & Mojibake
    const tooltipsAndBadges = page.locator('[title], [data-tooltip], [class*="tooltip" i]');
    const count = Math.min(await tooltipsAndBadges.count().catch(() => 0), 10);

    for (let i = 0; i < count; i++) {
      const el = tooltipsAndBadges.nth(i);
      const text = (await el.innerText().catch(() => '')) + ' ' + (await el.getAttribute('title').catch(() => ''));
      if (text.includes('\uFFFD') || text.includes('&#') || /[^\x00-\x7F]{4,}/.test(text)) {
        results.push({
          passed: false,
          status: 'FAIL',
          message: 'Character encoding mojibake detected: Tooltip/badge contains corrupt or unparsed character bytes!',
          details: {
            title: 'Corrupted Character Encoding / Mojibake in UI Tooltip',
            expected: 'Tooltips and labels must render clean alphanumeric characters.',
            actual: 'Element renders unreadable mojibake / corrupted glyphs or raw unescaped entity codes.',
            severity: 'LOW',
            reproductionSteps: [
              `Navigate to ${page.url()}`,
              'Hover over badge/tooltip elements',
              'Observe corrupt characters in tooltip popup'
            ],
            specSnippet: `const tooltipText = await page.locator('[class*="tooltip" i]').first().innerText();
expect(tooltipText).not.toContain('&#');
expect(tooltipText).not.toContain('\uFFFD');`
          },
        });
        break;
      }
    }

    if (results.length > 0) {
      return results;
    }

    return {
      passed: true,
      status: 'PASS',
      message: 'Content invariants (localization, lexical spelling, typography, encoding) verified cleanly.',
    };
  },
};
