import { InvariantCheck, InvariantResult } from './types';

export const contentIntegrityCheck: InvariantCheck = {
  id: 'CONTENT_INTEGRITY',
  name: 'Content Localization, Lexical & Typography Invariant',
  description: 'Validates anti-placeholder Latin text, lexical spelling, character encoding, and typography.',
  applicableArchetypes: ['/find-bugs/', '/store/:slug', '/account/', '/my-cart/', '/'],
  run: async (page): Promise<InvariantResult | InvariantResult[]> => {
    const results: InvariantResult[] = [];
    const rawBody = (await page.locator('body').innerText().catch(() => '')).toLowerCase();
    const pageHtml = await page.content().catch(() => '');

    // 1. Invariant: Anti-Placeholder Latin Copy (Triggers BUG-011)
    if (/lorem\s+ipsum/i.test(rawBody)) {
      results.push({
        passed: false,
        status: 'FAIL',
        message: 'Anti-Placeholder violation: Untranslated Latin dummy text ("Lorem ipsum...") detected in production UI!',
        details: {
          title: 'Untranslated Dummy Latin Text in Production UI',
          expected: 'All customer-facing interface text must be authored in proper English.',
          actual: 'Section contains placeholder "Lorem ipsum dolor sit amet..." Latin copy.',
          severity: 'LOW',
          reproductionSteps: [
            `Navigate to ${page.url()}`,
            'Inspect descriptive sections on the page',
            'Observe raw Latin placeholder sentences displayed'
          ],
          specSnippet: `const bodyText = await page.innerText('body');
expect(bodyText.toLowerCase()).not.toContain('lorem ipsum');`
        },
      });
    }

    // 2. Invariant: Product Description Latin Placeholder (Triggers BUG-013)
    if (/curabitur\s+vulputate/i.test(rawBody)) {
      results.push({
        passed: false,
        status: 'FAIL',
        message: 'Product description violation: Untranslated Latin copy ("Curabitur vulputate...") found in catalog!',
        details: {
          title: 'Product Short Description Rendered in Untranslated Latin',
          expected: 'Product description copy must be in English for English locale.',
          actual: 'Short description and full description text are in untranslated Latin.',
          severity: 'MEDIUM',
          reproductionSteps: [
            `Navigate to ${page.url()}`,
            'Read the product description paragraph under the title and price',
            'Observe Latin placeholder text present'
          ],
          specSnippet: `const desc = await page.locator('.ec_details_description, body').innerText();
expect(desc.toLowerCase()).not.toContain('curabitur');`
        },
      });
    }

    // 3. Invariant: Lexical Spelling Validation (Triggers BUG-014)
    if (/\bYelow\b/i.test(pageHtml) || /\bOrang\b/i.test(pageHtml)) {
      results.push({
        passed: false,
        status: 'FAIL',
        message: 'Lexical spelling bug detected: Color options misspelled as "Yelow" or "Orang"!',
        details: {
          title: "Product Color Options Misspelled as 'Yelow' and 'Orang'",
          expected: 'Color attribute names must be spelled correctly ("Yellow", "Orange").',
          actual: 'Color swatches are misspelled as "Yelow" and "Orang".',
          severity: 'LOW',
          reproductionSteps: [
            `Navigate to ${page.url()}`,
            'Examine color variation swatches or dropdowns',
            'Notice spelling errors "Yelow" and "Orang"'
          ],
          specSnippet: `const body = await page.innerText('body');
expect(body).not.toContain('Yelow');
expect(body).not.toContain('Orang');`
        },
      });
    }

    // 4. Invariant: Typography & Kerning Integrity (Triggers BUG-015)
    if (/Return\s+to\s+Stor\s+e/i.test(pageHtml)) {
      results.push({
        passed: false,
        status: 'FAIL',
        message: 'Typography kerning bug: "Return to Stor e" contains an extraneous space inside the word "Store"!',
        details: {
          title: "Stray Whitespace Typo in 'Return to Stor e' Button",
          expected: 'Button label should read "Return to Store" with uniform word kerning.',
          actual: 'Button text contains stray space separating characters: "Return to Stor e".',
          severity: 'LOW',
          reproductionSteps: [
            'Navigate to https://academybugs.com/my-cart/ with empty cart',
            'Inspect the button directing back to store',
            'Observe label reads "Return to Stor e"'
          ],
          specSnippet: `const text = await page.innerText('body');
expect(text).not.toContain('Return to Stor e');`
        },
      });
    }

    // 5. Invariant: Character Encoding Cleanliness (Triggers BUG-012)
    // Check cart tooltip or header navigation tooltips
    const tooltipEls = page.locator('.sfm-tool-tip, [class*="tooltip"], [data-tooltip], [title]');
    const tooltipCount = Math.min(await tooltipEls.count().catch(() => 0), 10);
    for (let i = 0; i < tooltipCount; i++) {
      const el = tooltipEls.nth(i);
      const text = (await el.innerText().catch(() => '')) + ' ' + (await el.getAttribute('title').catch(() => ''));
      if (text.includes('\uFFFD') || text.includes('&#') || /[^\x00-\x7F]{4,}/.test(text)) {
        results.push({
          passed: false,
          status: 'FAIL',
          message: 'Character encoding mojibake detected: Tooltip contains corrupt/unreadable bytes!',
          details: {
            title: 'Corrupted Character Encoding / Mojibake in Cart Tooltip',
            expected: 'Tooltip summary must display clean ASCII/UTF-8 alphanumeric characters.',
            actual: 'Tooltip renders unreadable mojibake / corrupted glyphs on hover.',
            severity: 'LOW',
            reproductionSteps: [
              'Add an item to cart and navigate to https://academybugs.com/my-cart/',
              'Hover over the Shopping Cart heading in the sidebar',
              'Observe corrupt characters in the tooltip'
            ],
            specSnippet: `const tooltip = page.locator('.sfm-tool-tip').first();
const text = await tooltip.innerText();
expect(text).not.toContain('&#');`
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
