import { InvariantCheck, InvariantResult } from './types';
import { settlePage, timing } from '../timing';

export const paginationDisjointnessCheck: InvariantCheck = {
  id: 'PAGINATION_DISJOINTNESS',
  name: 'Pagination Set Disjointness',
  description: 'Items displayed on Page 1 must never repeat on Page 2 (Page 1 ∩ Page 2 = ∅).',
  run: async (page): Promise<InvariantResult> => {
    const getCardTitles = async (): Promise<string[]> => {
      const texts = await page.locator('[role="row"], [role="article"], h3, tr').allInnerTexts();
      return texts.map(t => t.trim()).filter(t => t.length > 5);
    };

    const page1Titles = new Set(await getCardTitles());
    if (page1Titles.size === 0) {
      return { passed: true, status: 'SKIPPED', message: 'No items found on current page to paginate.' };
    }

    // Locate pagination "Next", "More", or "2"
    const nextBtn = page.locator(
      'a.morelink, role=button[name*="next" i], a[rel="next"], a:has-text("More"), a:has-text("Next"), a:has-text("2"), [aria-label*="next" i], button:has-text("Next")'
    ).first();

    if (!(await nextBtn.isVisible({ timeout: timing.visibilityMs }).catch(() => false))) {
      return { passed: true, status: 'SKIPPED', message: 'No pagination controls found on this page.' };
    }

    await nextBtn.click();
    await settlePage(page);

    const page2Titles = await getCardTitles();
    const duplicates = page2Titles.filter(title => page1Titles.has(title));

    if (duplicates.length > 0) {
      return {
        passed: false,
        status: 'FAIL',
        message: `Found duplicate items across pagination! E.g.: "${duplicates[0]}"`,
      };
    }

    return {
      passed: true,
      status: 'PASS',
      message: `Page 1 and Page 2 are cleanly disjoint (${page2Titles.length} new items verified).`,
    };
  },
};
