import { Page } from 'playwright';
import * as crypto from 'crypto';

/**
 * Computes a structural signature for the current browser state.
 * Combines URL path, active modals/drawers, and visible interactive control archetypes,
 * while excluding variable entity row/card text so in-place data reordering preserves state identity.
 */
export async function computeStateFingerprint(page: Page): Promise<string> {
  const url = page.url();
  let pathname = '/';
  try {
    pathname = new URL(url).pathname.replace(/\/+$/, '') || '/';
  } catch {}

  const stateSignature = await page
    .evaluate(() => {
      // 1. Check for active modals or overlays
      const hasModal = !!document.querySelector(
        '[role="dialog"], [aria-modal="true"], .modal, .drawer, [class*="popup" i]'
      );

      // 2. Identify repeated card containers to distinguish page controls from dynamic entity data
      const containerCandidates = Array.from(
        document.querySelectorAll('ul, ol, div, section, main, [role="list"], [role="grid"]')
      );
      const cardElements = new Set<Element>();
      for (const parent of containerCandidates) {
        const children = Array.from(parent.children).filter((el) => {
          const r = el.getBoundingClientRect();
          return r.width > 0 && r.height > 0;
        });
        if (children.length >= 3 && children.length <= 150) {
          const firstTag = children[0].tagName;
          const sameTag = children.filter((c) => c.tagName === firstTag);
          if (sameTag.length / children.length >= 0.8) {
            children.forEach((c) => cardElements.add(c));
          }
        }
      }

      // 3. Sample structural control signatures
      const elements = Array.from(
        document.querySelectorAll(
          'button, a[href], select, input, textarea, [role="button"], [role="checkbox"], [role="radio"]'
        )
      ).filter((el) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && !(el as HTMLButtonElement).disabled;
      });

      const controlSignatures = elements.map((el) => {
        const tag = el.tagName;
        const type = (el.getAttribute('type') || '').toLowerCase();
        const role = el.getAttribute('role') || '';

        // Elements inside repeated data cards contribute their structural control archetype
        let inCard = false;
        for (const card of cardElements) {
          if (card.contains(el)) {
            inCard = true;
            break;
          }
        }

        if (inCard) {
          return `CARD_CTRL:${tag}:${type}:${role}`;
        }

        // Page-level controls contribute their static identifier/label
        const name = (
          el.getAttribute('name') ||
          el.id ||
          el.getAttribute('aria-label') ||
          el.textContent ||
          ''
        )
          .trim()
          .slice(0, 25);

        return `PAGE_CTRL:${tag}:${type}:${role}:${name}`;
      });

      const uniqueControls = Array.from(new Set(controlSignatures)).sort().join('|');
      return `${hasModal ? 'MODAL|' : ''}${uniqueControls}`;
    })
    .catch(() => '');

  const hash = crypto.createHash('sha1').update(stateSignature).digest('hex').slice(0, 10);
  return `${pathname}::${hash}`;
}

