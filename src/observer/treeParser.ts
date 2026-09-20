import { Page } from 'playwright';
import { PageElement } from '../brain/types';

/**
 * Extracts clean, interactive elements using Playwright's native ariaSnapshot()
 * with a fallback for custom clickable CSS elements.
 */
export async function extractInteractiveElements(page: Page): Promise<PageElement[]> {
  const interactive: PageElement[] = [];
  const seenNames = new Set<string>();

  // 1. Playwright modern ARIA Snapshot (Clean standard)
  try {
    const rawSnapshot = await page.locator('body').ariaSnapshot({ timeout: 3000 });
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
    // If ariaSnapshot fails or is unsupported, continue to fallback
  }

  // 2. Fallback: Detect visible standard links, buttons, and inputs
  try {
    const clickables = await page
      .locator('button:visible, a[href]:visible, input:visible, select:visible')
      .all();

    for (const el of clickables.slice(0, 30)) {
      const text = (await el.innerText().catch(() => '')).trim();
      if (text.length > 0 && text.length < 50 && !seenNames.has(text)) {
        seenNames.add(text);
        const tag = await el.evaluate((e) => e.tagName.toLowerCase()).catch(() => 'button');
        const role = tag === 'a' ? 'link' : tag === 'select' ? 'combobox' : 'button';

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
