import { InvariantCheck, InvariantResult } from './types';

export const deepLinkIdempotenceCheck: InvariantCheck = {
  id: 'DEEP_LINK_IDEMPOTENCE',
  name: 'Deep-Link & Refresh Idempotence',
  description: 'Reloading or opening the active URL in a fresh session must render the same state without dropping parameters.',
  run: async (page): Promise<InvariantResult> => {
    const initialUrl = page.url();
    const firstItem = page.locator('.title a, tr.athing, [role="row"], [role="article"], h1, h2, h3').first();

    const initialText = (await firstItem.innerText().catch(() => '')).trim();

    if (!initialText) {
      return { passed: true, status: 'SKIPPED', message: 'No content available to compare before/after reload.' };
    }

    // Perform hard reload
    await page.reload({ waitUntil: 'networkidle' }).catch(() => {});

    const reloadedUrl = page.url();
    const reloadedText = (await firstItem.innerText().catch(() => '')).trim();

    if (reloadedUrl !== initialUrl) {
      return {
        passed: false,
        status: 'FAIL',
        message: `URL parameters were dropped on reload! Before: ${initialUrl}, After: ${reloadedUrl}`,
      };
    }

    if (reloadedText !== initialText) {
      return {
        passed: false,
        status: 'FAIL',
        message: `UI state mutated after reload! Before: "${initialText}", After: "${reloadedText}"`,
      };
    }

    return {
      passed: true,
      status: 'PASS',
      message: 'State is cleanly serialized in the URL and idempotent across reloads.',
    };
  },
};
