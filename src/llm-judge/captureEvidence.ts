import { Page } from 'playwright';
import { PageEvidence } from './types';
import { timing } from '../timing';

const MAX_ARIA_CHARS = 14_000;
const MAX_TEXT_CHARS = 14_000;
const MAX_CONTROLS = 80;

export async function capturePageEvidence(
  page: Page,
  includeScreenshot: boolean
): Promise<PageEvidence> {
  const root = page.locator('main, [role="main"], #main-content, body').first();
  const ariaSnapshot = await root.ariaSnapshot({ timeout: timing.evidenceMs }).catch(() => '');
  const visibleText = await root.innerText({ timeout: timing.evidenceMs }).catch(() => '');
  const viewport = page.viewportSize();

  const controls = await page
    .locator('button, a[href], input, select, textarea, [role="button"], [role="link"], [role="checkbox"], [role="radio"]')
    .evaluateAll((elements, limit) =>
      elements.slice(0, limit).map((element) => {
        const html = element as HTMLElement;
        const input = element as HTMLInputElement;
        const style = window.getComputedStyle(html);
        const visible = style.visibility !== 'hidden' && style.display !== 'none' && html.getClientRects().length > 0;
        return visible
          ? {
              tag: html.tagName.toLowerCase(),
              role: html.getAttribute('role') || '',
              name:
                html.getAttribute('aria-label') ||
                html.getAttribute('title') ||
                (html.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 160),
              value: 'value' in input ? String(input.value || '') : '',
              checked: 'checked' in input ? Boolean(input.checked) : null,
              disabled: 'disabled' in input ? Boolean(input.disabled) : false,
            }
          : null;
      }).filter(Boolean),
    MAX_CONTROLS)
    .catch(() => []);

  const scroll = await page.evaluate(() => ({
    x: window.scrollX,
    y: window.scrollY,
    width: document.documentElement.scrollWidth,
    height: document.documentElement.scrollHeight,
  })).catch(() => ({ x: 0, y: 0, width: 0, height: 0 }));

  let screenshotBase64: string | undefined;
  if (includeScreenshot) {
    screenshotBase64 = await page
      .screenshot({ type: 'jpeg', quality: 60, fullPage: false, animations: 'disabled' })
      .then((buffer) => buffer.toString('base64'))
      .catch(() => undefined);
  }

  return {
    capturedAt: new Date().toISOString(),
    url: page.url(),
    title: await page.title().catch(() => ''),
    ariaSnapshot: ariaSnapshot.slice(0, MAX_ARIA_CHARS),
    visibleText: visibleText.slice(0, MAX_TEXT_CHARS),
    controls: controls as PageEvidence['controls'],
    viewport,
    scroll,
    screenshotBase64,
  };
}

export function evidenceForPrompt(evidence: PageEvidence) {
  const { screenshotBase64: _screenshot, ...textEvidence } = evidence;
  return textEvidence;
}
