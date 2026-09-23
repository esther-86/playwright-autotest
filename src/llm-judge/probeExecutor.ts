import { Page } from 'playwright';
import { ProbeResult, SafeProbeRequest } from './types';
import { settlePage, timing } from '../timing';

const MAX_PROBES = 5;

export async function executeSafeProbes(
  page: Page,
  requests: SafeProbeRequest[]
): Promise<ProbeResult[]> {
  const results: ProbeResult[] = [];

  for (const request of requests.slice(0, MAX_PROBES)) {
    try {
      if (request.type === 'WAIT_AND_RECHECK') {
        await settlePage(page);
        results.push({ request, ok: true, value: 'Page rechecked after bounded network-idle wait' });
        continue;
      }
      if (request.type === 'RELOAD') {
        await page.reload({ waitUntil: 'domcontentloaded', timeout: timing.reloadMs });
        results.push({ request, ok: true, value: { url: page.url(), title: await page.title() } });
        continue;
      }

      if (!request.locator || request.locator.length > 500) {
        results.push({ request, ok: false, error: 'A bounded locator is required for this probe' });
        continue;
      }

      const locator = page.locator(request.locator).first();
      if (request.type === 'READ_TEXT') {
        results.push({ request, ok: true, value: (await locator.innerText({ timeout: timing.networkIdleMs })).slice(0, 3000) });
      } else if (request.type === 'COUNT') {
        results.push({ request, ok: true, value: await page.locator(request.locator).count() });
      } else if (request.type === 'GET_ATTRIBUTE') {
        const attribute = (request.parameter || '').replace(/[^a-zA-Z0-9_:-]/g, '').slice(0, 80);
        results.push({ request, ok: true, value: attribute ? await locator.getAttribute(attribute) : null });
      } else if (request.type === 'BOUNDING_BOX') {
        results.push({ request, ok: true, value: await locator.boundingBox() });
      } else if (request.type === 'SCREENSHOT_REGION') {
        const image = await locator.screenshot({ type: 'jpeg', quality: 60, timeout: timing.evidenceMs });
        results.push({ request, ok: true, value: { mimeType: 'image/jpeg', base64: image.toString('base64') } });
      } else {
        results.push({ request, ok: false, error: `Unsupported probe type: ${request.type}` });
      }
    } catch (error: any) {
      results.push({ request, ok: false, error: error?.message || String(error) });
    }
  }

  return results;
}
