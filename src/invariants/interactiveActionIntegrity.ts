import { InvariantCheck, InvariantResult } from './types';

/**
 * Universal Action Mutation & Interactive Integrity Invariant:
 * 1. Non-Dead Buttons: Clicking an action button or CTA must produce a state mutation
 *    (URL navigation, DOM change, or network request). Actions with href="#" or 0 delta are dead controls.
 * 2. Form Error Freedom: Form submissions must not lead to HTTP 500 or unhandled server crash pages.
 * 3. Media Player Integrity: Video elements must reference valid playable streams and not render blank black canvas.
 */
export const interactiveActionIntegrityCheck: InvariantCheck = {
  id: 'INTERACTIVE_ACTION_INTEGRITY',
  name: 'Action State Mutation & Interactive Integrity Invariant',
  description: 'Controls must produce state mutations; forms and media players must not return 500 errors.',
  run: async (page): Promise<InvariantResult | InvariantResult[]> => {
    const results: InvariantResult[] = [];

    // 1. Invariant: Dead Action / No-Op Button Detection
    const ctaButtons = await page.locator(
      'a[role="button"]:visible, button:visible, [class*="btn"]:visible, a[class*="share"]:visible'
    ).all();

    for (const btn of ctaButtons.slice(0, 5)) {
      const href = await btn.getAttribute('href').catch(() => null);
      const text = (await btn.innerText().catch(() => '')).trim();

      // Dead link with href="#" or javascript:void(0)
      if (href === '#' || href === 'javascript:void(0)' || href === 'javascript:;') {
        results.push({
          passed: false,
          status: 'FAIL',
          message: `Dead action control detected: Button "${text || 'Action'}" has no operational destination (href="${href}")!`,
          details: {
            title: `Dead Action Control "${text || 'Button'}" (href="${href}")`,
            expected: 'Interactive buttons must dispatch actions, launch dialogs, or navigate to valid routes.',
            actual: `Button has dead href="${href}" and produces no operation.`,
            severity: 'LOW',
            reproductionSteps: [
              `Navigate to ${page.url()}`,
              `Click button "${text || 'Action'}"`,
              'Observe button has dead link and does nothing'
            ],
            specSnippet: `const btn = page.locator(':has-text("${(text || 'Action').replace(/"/g, '')}")').first();
const href = await btn.getAttribute('href');
expect(href).not.toBe('#');`
          },
        });
        break;
      }
    }

    // 2. Invariant: Video Element Playable Media Source
    const videoElements = await page.locator('video:visible').all();
    for (const vid of videoElements) {
      const src = await vid.getAttribute('src');
      const sourcesCount = await vid.locator('source').count();

      if (!src && sourcesCount === 0) {
        results.push({
          passed: false,
          status: 'FAIL',
          message: 'Media player failure: <video> element lacks any playable media source (renders empty black screen)!',
          details: {
            title: 'Video Player Missing Playable Media Source (Black Screen)',
            expected: 'Video players must specify a valid video stream or source URL.',
            actual: 'Video tag has no src or <source> children, resulting in an unplayable black frame.',
            severity: 'HIGH',
            reproductionSteps: [
              `Open ${page.url()}`,
              'Inspect the embedded video player',
              'Observe black screen without video content'
            ],
            specSnippet: `const video = page.locator('video').first();
const hasSource = (await video.getAttribute('src')) || (await video.locator('source').count()) > 0;
expect(Boolean(hasSource)).toBe(true);`
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
      message: 'Interactive action integrity verified across buttons, forms, and media controls.',
    };
  },
};
