import { Page } from 'playwright';
import * as crypto from 'crypto';

/**
 * Computes a structural signature for the current browser state.
 * Combines URL path, active modals/drawers, and visible interactive controls.
 */
export async function computeStateFingerprint(page: Page): Promise<string> {
  const url = page.url();
  let pathname = '/';
  try {
    pathname = new URL(url).pathname;
  } catch {}

  const stateSignature = await page.evaluate(() => {
    // 1. Check for active modals or overlays
    const hasModal = !!document.querySelector(
      '[role="dialog"], [aria-modal="true"], .modal, .drawer, [class*="popup" i]'
    );

    // 2. Sample visible interactive control signatures
    const elements = Array.from(
      document.querySelectorAll('button, a[href], select, input[type="submit"], [role="button"]')
    );

    const controls = elements
      .slice(0, 60)
      .map((el) => {
        const text = (el.textContent || (el as HTMLInputElement).value || '').trim().slice(0, 25);
        return `${el.tagName}:${text}`;
      })
      .filter((s) => s.length > 2)
      .sort()
      .join('|');

    return `${hasModal ? 'MODAL|' : ''}${controls}`;
  }).catch(() => '');

  const hash = crypto.createHash('sha1').update(stateSignature).digest('hex').slice(0, 10);
  return `${pathname}::${hash}`;
}
