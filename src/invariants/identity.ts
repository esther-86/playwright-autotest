import { InvariantCheck, InvariantResult } from './types';
import { settlePage, timing } from '../timing';

export const identityCheck: InvariantCheck = {
  id: 'IDENTITY_ROUND_TRIP',
  name: 'Identity Round-Trip Invariant',
  description: 'Searching for an item harvested live from this site must return the original item on Page 1.',
  run: async (page, context): Promise<InvariantResult> => {
    if (!context.seeds || context.seeds.length === 0) {
      return { passed: true, status: 'SKIPPED', message: 'No harvested seeds available to test.' };
    }

    const searchBox = page.locator(
      'role=searchbox, input[type="search"], input[name="q"], input[placeholder*="search" i], input[name*="search" i], input[id*="search" i]'
    ).first();

    if (!(await searchBox.isVisible({ timeout: timing.visibilityMs }).catch(() => false))) {
      return { passed: true, status: 'SKIPPED', message: 'No search input found on this page.' };
    }

    const seed = context.seeds[0];

    await searchBox.fill(seed);
    await searchBox.press('Enter');
    await settlePage(page, timing.evidenceMs);

    const bodyText = await page.innerText('body').catch(() => '');
    const found = bodyText.toLowerCase().includes(seed.toLowerCase());

    if (!found) {
      return {
        passed: false,
        status: 'FAIL',
        message: `Harvested seed "${seed}" was not found in the search results!`,
      };
    }

    return {
      passed: true,
      status: 'PASS',
      message: `Harvested seed "${seed}" successfully retrieved in search results.`,
    };
  },
};
