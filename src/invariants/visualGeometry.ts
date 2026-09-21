import { InvariantCheck, InvariantResult } from './types';

/**
 * Universal Visual Layout Geometry & Alignment Invariant:
 * Elements on screen must obey fundamental CSS layout geometry:
 * 1. Non-Collision: Sidebar and action items must not penetrate into the footer boundary.
 * 2. Form Grid Alignment: Sequential field labels in a vertical column must share collinear left X-coordinates.
 * 3. Button Centering: Button caption text must not possess severe asymmetric indentation or offsets.
 * 4. Image Asset Integrity: Displayed image tags must render non-zero natural dimensions.
 */
export const visualGeometryCheck: InvariantCheck = {
  id: 'VISUAL_LAYOUT_GEOMETRY',
  name: 'Visual Layout Geometry & Spatial Non-Collision Invariant',
  description: 'Asserts bounding box non-collision, form label collinearity, and valid image asset dimensions.',
  run: async (page): Promise<InvariantResult | InvariantResult[]> => {
    const results: InvariantResult[] = [];

    // 1. Invariant: Action / Sidebar Container Non-Collision with Footer
    const footer = page.locator('footer, [role="contentinfo"], [class*="footer" i]').first();
    const actionButtons = await page.locator('aside button, aside input[type="submit"], [class*="sidebar" i] input[type="submit"]').all();

    if (await footer.isVisible().catch(() => false) && actionButtons.length > 0) {
      const footerBox = await footer.boundingBox();
      for (const btn of actionButtons) {
        if (await btn.isVisible().catch(() => false)) {
          const btnBox = await btn.boundingBox();
          if (btnBox && footerBox) {
            const bottomEdge = btnBox.y + btnBox.height;
            if (bottomEdge > footerBox.y + 2) {
              const btnDesc = (await btn.getAttribute('value')) || (await btn.innerText().catch(() => 'button'));
              results.push({
                passed: false,
                status: 'FAIL',
                message: `Element collision detected! Action button "${btnDesc}" (bottom ${bottomEdge.toFixed(0)}px) penetrates footer top (${footerBox.y.toFixed(0)}px)!`,
                details: {
                  title: `Interactive Action Control "${btnDesc}" Overlaps Footer Container`,
                  expected: 'Sidebar and page content elements must terminate strictly above footer top boundary.',
                  actual: `Element overlaps into footer container by ${(bottomEdge - footerBox.y).toFixed(0)}px.`,
                  severity: 'LOW',
                  reproductionSteps: [
                    `Navigate to ${page.url()}`,
                    'Scroll down to the footer boundary',
                    `Inspect spatial position of button "${btnDesc}" relative to footer`
                  ],
                  specSnippet: `const btn = page.locator('aside input[type="submit"], [class*="sidebar" i] input[type="submit"]').first();
const footer = page.locator('footer, [role="contentinfo"]').first();
const bBox = await btn.boundingBox();
const fBox = await footer.boundingBox();
expect(bBox!.y + bBox!.height).toBeLessThanOrEqual(fBox!.y);`
                },
              });
              break;
            }
          }
        }
      }
    }

    // 2. Invariant: Form Field Label Coordinate Collinearity
    const verticalFormLabels = await page.locator('form label:visible').all();
    if (verticalFormLabels.length >= 2) {
      const firstBox = await verticalFormLabels[0].boundingBox();
      const secondBox = await verticalFormLabels[1].boundingBox();

      if (firstBox && secondBox && Math.abs(firstBox.y - secondBox.y) > 20) {
        // Labels are in separate rows of the same column
        const xDiff = Math.abs(firstBox.x - secondBox.x);
        if (xDiff > 5) {
          const l1 = (await verticalFormLabels[0].innerText().catch(() => 'Field 1')).trim();
          const l2 = (await verticalFormLabels[1].innerText().catch(() => 'Field 2')).trim();

          results.push({
            passed: false,
            status: 'FAIL',
            message: `Form grid misalignment detected! Label "${l1}" (X=${firstBox.x.toFixed(0)}px) vs Label "${l2}" (X=${secondBox.x.toFixed(0)}px) offset by ${xDiff.toFixed(0)}px!`,
            details: {
              title: `Form Field Labels "${l1}" and "${l2}" Visually Misaligned`,
              expected: 'Sequential column form labels must share collinear left margin alignment.',
              actual: `Labels have horizontal displacement offset of ${xDiff.toFixed(0)}px.`,
              severity: 'LOW',
              reproductionSteps: [
                `Navigate to ${page.url()}`,
                `Examine the horizontal alignment of labels "${l1}" and "${l2}"`,
                'Observe uneven left-side indentation'
              ],
              specSnippet: `const labels = page.locator('form label:visible');
const b1 = await labels.nth(0).boundingBox();
const b2 = await labels.nth(1).boundingBox();
expect(Math.abs(b1!.x - b2!.x)).toBeLessThanOrEqual(3);`
            },
          });
        }
      }
    }

    // 3. Invariant: Action Button Caption Centering & Text Misalignment
    const allButtons = await page.locator('input[type="submit"]:visible, button:visible').all();
    for (const btn of allButtons.slice(0, 5)) {
      const textIndent = await btn.evaluate((el: HTMLElement) => {
        const style = window.getComputedStyle(el);
        return parseFloat(style.textIndent) || 0;
      }).catch(() => 0);

      if (Math.abs(textIndent) > 15) {
        const btnVal = (await btn.getAttribute('value')) || (await btn.innerText().catch(() => 'Button'));
        results.push({
          passed: false,
          status: 'FAIL',
          message: `Button caption alignment failure: "${btnVal}" has severe asymmetric text-indent (${textIndent}px)!`,
          details: {
            title: `Button "${btnVal}" Caption Text Asymmetrically Offset`,
            expected: 'Button labels should be centered without arbitrary text-indentation.',
            actual: `Button text contains an asymmetrical displacement of ${textIndent}px.`,
            severity: 'LOW',
            reproductionSteps: [
              `Navigate to ${page.url()}`,
              `Inspect the layout and text centering of "${btnVal}"`,
              'Observe label text is off-center'
            ],
            specSnippet: `const btn = page.locator(':has-text("${btnVal.replace(/"/g, '')}")').first();
const offset = await btn.evaluate(el => Math.abs(parseFloat(getComputedStyle(el).textIndent)));
expect(offset).toBeLessThan(10);`
          },
        });
        break;
      }
    }

    // 4. Invariant: Broken Image Detection (Natural Dimensions > 0)
    const brokenImages = await page.locator('img:visible').evaluateAll((imgs: HTMLImageElement[]) => {
      return imgs
        .filter((img) => img.complete && img.naturalWidth === 0 && (img.width > 20 || img.height > 20))
        .map((img) => img.src);
    }).catch(() => [] as string[]);

    if (brokenImages.length > 0) {
      results.push({
        passed: false,
        status: 'FAIL',
        message: `Broken image detected: Resource "${brokenImages[0]}" failed to decode (naturalWidth = 0)!`,
        details: {
          title: `Broken Image Asset Failed to Render (${brokenImages[0].slice(0, 40)})`,
          expected: 'Image tags must load valid graphic bitmaps.',
          actual: `Image source is missing or corrupt (naturalWidth: 0).`,
          severity: 'LOW',
          reproductionSteps: [
            `Open ${page.url()}`,
            'Inspect rendered images on the page',
            `Observe image ${brokenImages[0]} displays broken image graphic`
          ],
          specSnippet: `const img = page.locator('img[src*="${brokenImages[0].slice(-20)}"]').first();
const natWidth = await img.evaluate((el: HTMLImageElement) => el.naturalWidth);
expect(natWidth).toBeGreaterThan(0);`
        },
      });
    }

    if (results.length > 0) {
      return results;
    }

    return {
      passed: true,
      status: 'PASS',
      message: 'Visual layout geometry, non-collision, alignment, and asset dimensions verified cleanly.',
    };
  },
};
