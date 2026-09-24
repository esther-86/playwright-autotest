import { Page } from 'playwright';
import { PageEvidence } from './types';
import { timing } from '../timing';
import judgeConfig from '../../config/llm-judge.json';
import { sanitizeNetworkUrl } from './networkRecorder';

function redactSensitiveText(value: string): string {
  return value
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[redacted-email]')
    .replace(/\b(?:\d[ -]*?){13,19}\b/g, '[redacted-payment-number]')
    .replace(/\b(?:AIza[A-Za-z0-9_-]+|AQ\.[A-Za-z0-9._-]+|sk-[A-Za-z0-9_-]+)\b/g, '[redacted-api-key]')
    .replace(/\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi, 'Bearer [redacted-token]');
}

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
    .evaluateAll((elements, options) =>
      elements.slice(0, options.limit).map((element) => {
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
                (html.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 100),
              value: options.captureControlValues && 'value' in input
                ? String(input.value || '').slice(0, 100)
                : '',
              checked: 'checked' in input ? Boolean(input.checked) : null,
              disabled: 'disabled' in input ? Boolean(input.disabled) : false,
            }
          : null;
      }).filter(Boolean),
    {
      limit: judgeConfig.maxControls,
      captureControlValues: judgeConfig.captureControlValues,
    })
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
      .screenshot({
        type: 'jpeg',
        quality: judgeConfig.screenshotJpegQuality,
        fullPage: false,
        animations: 'disabled',
      })
      .then((buffer) => buffer.toString('base64'))
      .catch(() => undefined);
  }

  return {
    capturedAt: new Date().toISOString(),
    url: sanitizeNetworkUrl(page.url()),
    title: await page.title().catch(() => ''),
    ariaSnapshot: redactSensitiveText(ariaSnapshot).slice(0, judgeConfig.maxAriaChars),
    visibleText: redactSensitiveText(visibleText).slice(0, judgeConfig.maxVisibleTextChars),
    controls: (controls as PageEvidence['controls']).map((control) => ({
      ...control,
      name: redactSensitiveText(control.name),
      value: redactSensitiveText(control.value),
    })),
    viewport,
    scroll,
    screenshotBase64,
  };
}

export function evidenceForPrompt(evidence: PageEvidence) {
  const { screenshotBase64: _screenshot, ...textEvidence } = evidence;
  return textEvidence;
}
