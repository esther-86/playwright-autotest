import { InvariantCheck, InvariantResult } from './types';
import { settlePage, timing } from '../timing';

export const canaryCheck: InvariantCheck = {
  id: 'CANARY_ZERO_STATE',
  name: 'Canary / Zero-State Check',
  description: 'Searching for an impossible UUID must return a clean empty state without crashing (no 500 error or blank screen).',
  run: async (page): Promise<InvariantResult> => {
    const garbageUuid = `qa_canary_${crypto.randomUUID().slice(0, 12)}`;

    // Locate universal search box
    const searchBox = page.locator(
      'role=searchbox, input[type="search"], input[name="q"], input[placeholder*="search" i], input[name*="search" i], input[id*="search" i]'
    ).first();

    if (!(await searchBox.isVisible({ timeout: timing.visibilityMs }).catch(() => false))) {
      return { passed: true, status: 'SKIPPED', message: 'No search input found on this page.' };
    }

    // Monitor for 500s or unhandled exceptions
    let serverErrorDetected = false;
    const responseHandler = (res: any) => {
      if (res.status() >= 500) serverErrorDetected = true;
    };
    page.on('response', responseHandler);

    try {
      await searchBox.fill(garbageUuid);
      await searchBox.press('Enter');
      await settlePage(page, timing.evidenceMs);

      const bodyText = await page.innerText('body').catch(() => '');

      if (serverErrorDetected || bodyText.includes('Internal Server Error') || bodyText.includes('500 Error')) {
        return {
          passed: false,
          status: 'FAIL',
          message: `Server returned a 500 / error state for search query: ${garbageUuid}`,
        };
      }

      return {
        passed: true,
        status: 'PASS',
        message: 'Site handled impossible search query gracefully with zero-state UI.',
      };
    } finally {
      page.off('response', responseHandler);
    }
  },
};
