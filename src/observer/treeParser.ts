import { Locator, Page } from 'playwright';
import { PageElement } from '../brain/types';
import { timing } from '../timing';

export const BLOCKED_ANCESTORS = [
  'header',
  'footer',
  'nav',
  '[role="navigation"]',
  '[role="banner"]',
  '.site-header',
  '.site-footer',
  '.main-menu',
];

/**
 * Returns the locator representing the page's primary main-content container.
 */
export function getMainContentLocator(page: Page): Locator {
  return page.locator('main, [role="main"], #main-content, .site-content, article').first();
}

/**
 * Validates that an element is within the primary content container
 * and not part of global site navigation or chrome.
 */
export async function isInExplorationScope(
  element: Locator,
  mainContent: Locator,
): Promise<boolean> {
  try {
    const mainHandle = await mainContent.elementHandle();
    if (!mainHandle) return false;

    // Action must belong to this page's content, not surrounding site chrome.
    const isContained = await element.evaluate(
      (node, root) => (root as Node).contains(node as Node),
      mainHandle,
    );
    if (!isContained) return false;

    // Extra protection for menus nested inside unusual layouts.
    return await element.evaluate(
      (node, blocked) => !blocked.some((selector) => !!(node as Element).closest(selector)),
      BLOCKED_ANCESTORS,
    );
  } catch {
    return false;
  }
}

/**
 * Extracts clean, interactive elements strictly scoped to the page's main content area.
 */
export async function extractInteractiveElements(page: Page): Promise<PageElement[]> {
  const interactive: PageElement[] = [];
  const seenNames = new Set<string>();

  const mainContent = getMainContentLocator(page);
  const hasMainContent = (await mainContent.count().catch(() => 0)) > 0;
  const rootLocator = hasMainContent ? mainContent : page.locator('body');

  // 1. Playwright modern ARIA Snapshot scoped to main content
  try {
    const rawSnapshot = await rootLocator.ariaSnapshot({ timeout: timing.networkIdleMs });
    const lines = rawSnapshot.split('\n');

    for (const line of lines) {
      const match = line.match(/-\s+(button|link|combobox|searchbox|textbox|checkbox)\s+"([^"]+)"/i);
      if (match) {
        const role = match[1].toLowerCase();
        const name = match[2].trim();

        if (name.length > 0 && !seenNames.has(name)) {
          seenNames.add(name);
          interactive.push({
            role,
            name,
            selector: `role=${role}[name="${name.replace(/"/g, '\\"')}"]`,
          });
        }
      }
    }
  } catch {
    // If ariaSnapshot fails or is unsupported, continue to candidates fallback
  }

  // 2. Fallback / supplementary discovery: Detect visible action candidates in main content
  try {
    const candidates = rootLocator.locator(`
      a[href]:visible,
      button:visible,
      input:visible,
      select:visible,
      textarea:visible,
      [role="button"]:visible,
      [role="link"]:visible
    `);

    const count = await candidates.count().catch(() => 0);
    const limit = Math.min(count, 40);

    for (let i = 0; i < limit; i++) {
      const el = candidates.nth(i);

      // Verify element is strictly in exploration scope
      if (hasMainContent && !(await isInExplorationScope(el, mainContent))) {
        continue;
      }

      const text = (
        (await el.innerText().catch(() => '')) ||
        (await el.getAttribute('aria-label').catch(() => '')) ||
        (await el.getAttribute('placeholder').catch(() => '')) ||
        (await el.getAttribute('value').catch(() => '')) ||
        ''
      ).trim();

      if (text.length > 0 && text.length < 60 && !seenNames.has(text)) {
        seenNames.add(text);
        const tag = await el.evaluate((e) => e.tagName.toLowerCase()).catch(() => 'button');
        const role = tag === 'a' ? 'link' : tag === 'select' ? 'combobox' : tag === 'input' ? 'textbox' : 'button';

        interactive.push({
          role,
          name: text,
          selector: `text="${text.replace(/"/g, '\\"')}"`,
        });
      }
    }
  } catch {}

  return interactive;
}
