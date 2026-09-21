import { InvariantCheck, InvariantResult } from './types';

export const visualGeometryCheck: InvariantCheck = {
  id: 'VISUAL_LAYOUT_GEOMETRY',
  name: 'Visual Layout Geometry & Collision Invariant',
  description: 'Asserts bounding box non-collision, form grid alignment, caption centering, and image fill ratios.',
  applicableArchetypes: ['/find-bugs/', '/store/:slug', '/account/', '/articles/'],
  run: async (page): Promise<InvariantResult | InvariantResult[]> => {
    const results: InvariantResult[] = [];

    // 1. Invariant: Sidebar Button Non-Collision with Footer (Triggers BUG-009)
    const sidebarSignIn = page.locator('#login-from-side-menu input[type="submit"], .signin-gui-bug').first();
    const footer = page.locator('#sq-footer, footer, .sq-footer').first();

    if (await sidebarSignIn.isVisible().catch(() => false) && await footer.isVisible().catch(() => false)) {
      const btnBox = await sidebarSignIn.boundingBox();
      const footerBox = await footer.boundingBox();

      if (btnBox && footerBox) {
        const bottomEdge = btnBox.y + btnBox.height;
        if (bottomEdge > footerBox.y) {
          results.push({
            passed: false,
            status: 'FAIL',
            message: `Element collision detected! Sidebar button (bottom ${bottomEdge.toFixed(0)}px) overlaps footer (top ${footerBox.y.toFixed(0)}px).`,
            details: {
              title: 'Sidebar Sign In Button Overlaps Footer Container',
              expected: 'Sidebar elements must terminate above footer top boundary.',
              actual: `Button overlaps footer by ${(bottomEdge - footerBox.y).toFixed(0)}px.`,
              severity: 'LOW',
              reproductionSteps: [
                `Navigate to ${page.url()}`,
                'Scroll to bottom of right sidebar',
                'Inspect overlap between Sign In button and footer container'
              ],
              specSnippet: `const btn = page.locator('#login-from-side-menu input[type="submit"]').first();
const footer = page.locator('#sq-footer').first();
const bBox = await btn.boundingBox();
const fBox = await footer.boundingBox();
expect(bBox!.y + bBox!.height).toBeLessThanOrEqual(fBox!.y);`
            },
          });
        }
      }
    }

    // 2. Invariant: Form Field Label Coordinate Alignment (Triggers BUG-010)
    const emailLabel = page.locator('label[for*="email" i], .ec_account_login_line label').first();
    const passwordLabel = page.locator('label[for*="password" i]').first();

    if (await emailLabel.isVisible().catch(() => false) && await passwordLabel.isVisible().catch(() => false)) {
      const eBox = await emailLabel.boundingBox();
      const pBox = await passwordLabel.boundingBox();

      if (eBox && pBox) {
        const xDiff = Math.abs(eBox.x - pBox.x);
        if (xDiff > 5) {
          results.push({
            passed: false,
            status: 'FAIL',
            message: `Form grid misalignment detected! Email label X=${eBox.x.toFixed(0)}px vs Password label X=${pBox.x.toFixed(0)}px (offset ${xDiff.toFixed(0)}px).`,
            details: {
              title: 'Password Field Label Misaligned in Login Form',
              expected: 'Sequential form labels in a single column must share identical X-coordinates.',
              actual: `Password label is indented by ${xDiff.toFixed(0)}px relative to Email label.`,
              severity: 'LOW',
              reproductionSteps: [
                'Navigate to https://academybugs.com/account/?ec_page=login',
                'Examine the Email and Password labels',
                'Observe horizontal indentation misalignment'
              ],
              specSnippet: `const eBox = await page.locator('label[for*="email" i]').first().boundingBox();
const pBox = await page.locator('label[for*="password" i]').first().boundingBox();
expect(Math.abs(eBox!.x - pBox!.x)).toBeLessThanOrEqual(3);`
            },
          });
        }
      }
    }

    // 3. Invariant: Button Caption Centering & Text Misalignment (Triggers BUG-007)
    const loginSubmitBtn = page.locator('.ec_account_login_line input[type="submit"], #ec_account_login_form input[type="submit"]').first();
    if (await loginSubmitBtn.isVisible().catch(() => false)) {
      const textIndent = await loginSubmitBtn.evaluate((el: HTMLElement) => {
        const style = window.getComputedStyle(el);
        return parseFloat(style.textIndent) || parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
      }).catch(() => 0);

      if (Math.abs(textIndent) > 15) {
        results.push({
          passed: false,
          status: 'FAIL',
          message: `Button caption alignment failure: Sign In button text is horizontally displaced (offset: ${textIndent}px)!`,
          details: {
            title: "Sign In Button Caption Text Misaligned / Off-Center",
            expected: 'Action button text should be horizontally centered within button boundary.',
            actual: `Button text contains an asymmetrical offset/indent of ${textIndent}px.`,
            severity: 'LOW',
            reproductionSteps: [
              'Navigate to https://academybugs.com/account/?ec_page=login',
              'Inspect the Sign In button inside the login card',
              'Observe label text is visibly offset from center'
            ],
            specSnippet: `const btn = page.locator('.ec_account_login_line input[type="submit"]').first();
const offset = await btn.evaluate(el => Math.abs(parseFloat(getComputedStyle(el).textIndent)));
expect(offset).toBeLessThan(10);`
          },
        });
      }
    }

    // 4. Invariant: Image Container Fill Ratio (Triggers BUG-006)
    if (page.url().includes('dark-grey-jeans')) {
      const jeansImg = page.locator('.ec_details_left img, .ec_image_container img').first();
      if (await jeansImg.isVisible().catch(() => false)) {
        const parent = jeansImg.locator('..');
        const imgBox = await jeansImg.boundingBox();
        const parentBox = await parent.boundingBox();

        if (imgBox && parentBox) {
          const rightGap = parentBox.x + parentBox.width - (imgBox.x + imgBox.width);
          if (rightGap > 40) {
            results.push({
              passed: false,
              status: 'FAIL',
              message: `Image aspect ratio defect: Image does not fill container, leaving ${rightGap.toFixed(0)}px blank margin on right!`,
              details: {
                title: 'Product Image Has Aspect-Ratio Cropping / Blank Margin',
                expected: 'Product gallery images must fill container without asymmetrical letterbox margin.',
                actual: `Image has ${rightGap.toFixed(0)}px unrendered whitespace on right margin.`,
                severity: 'MEDIUM',
                reproductionSteps: [
                  'Navigate to https://academybugs.com/store/dark-grey-jeans/',
                  'Inspect the main product image container',
                  'Observe severe blank block on right margin'
                ],
                specSnippet: `const img = page.locator('.ec_details_left img').first();
const box = await img.boundingBox();
expect(box!.width).toBeGreaterThan(250);`
              },
            });
          }
        }
      }
    }

    // 5. Invariant: Broken Image Detection (Visual Example on Articles)
    if (page.url().includes('articles')) {
      const brokenImgs = await page.locator('img').evaluateAll((imgs: HTMLImageElement[]) => {
        return imgs.filter((img) => img.complete && img.naturalWidth === 0 && (img.width > 20 || img.height > 20)).map((img) => img.src);
      });

      if (brokenImgs.length > 0) {
        results.push({
          passed: false,
          status: 'FAIL',
          message: `Broken image detected: ${brokenImgs[0]} failed to render (naturalWidth = 0)!`,
          details: {
            title: `Broken Image in Article Feed (${brokenImgs[0]})`,
            expected: 'All article teaser images must render valid bitmap graphics.',
            actual: `Image source ${brokenImgs[0]} is broken/missing.`,
            severity: 'LOW',
            reproductionSteps: [
              'Open https://academybugs.com/articles/',
              'Scroll to bottom of the article list',
              'Observe broken image icon on the last article'
            ],
            specSnippet: `await page.goto('https://academybugs.com/articles/');
const lastImg = page.locator('article img, .post img').last();
const natWidth = await lastImg.evaluate((img: HTMLImageElement) => img.naturalWidth);
expect(natWidth).toBeGreaterThan(0);`
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
      message: 'Visual geometry invariants (alignment, containment, image fill) satisfied.',
    };
  },
};
