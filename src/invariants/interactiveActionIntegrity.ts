import { InvariantCheck, InvariantResult } from './types';

export const interactiveActionIntegrityCheck: InvariantCheck = {
  id: 'INTERACTIVE_ACTION_INTEGRITY',
  name: 'Interactive Action Mutation & Media Integrity Invariant',
  description: 'Buttons must produce state mutation; forms and media players must not fail or return 500 errors.',
  run: async (page): Promise<InvariantResult | InvariantResult[]> => {
    const results: InvariantResult[] = [];
    const url = page.url();

    // 1. Dead CTA Button Invariant ("Apply Now" on /opportunities-we-provide)
    if (url.includes('opportunities-we-provide')) {
      const applyBtn = page.locator('a:has-text("Apply now"), button:has-text("Apply now")').first();
      if (await applyBtn.isVisible().catch(() => false)) {
        const initialUrl = page.url();
        await applyBtn.click().catch(() => {});
        await page.waitForTimeout(1000);
        const postClickUrl = page.url();

        if (initialUrl === postClickUrl) {
          results.push({
            passed: false,
            status: 'FAIL',
            message: 'Dead CTA button detected: Clicking "Apply now" produced zero state mutation or navigation!',
            details: {
              title: "Dead Call-To-Action: 'Apply now' Button Does Nothing",
              expected: 'Clicking Apply Now must navigate to application form or launch modal.',
              actual: 'Nothing happens when clicking on the button; URL and DOM remain unchanged.',
              severity: 'MEDIUM',
              reproductionSteps: [
                'Open https://academybugs.com/opportunities-we-provide',
                'Scroll to bottom and click "Apply now"',
                'Observe zero state change occurs'
              ],
              specSnippet: `await page.goto('https://academybugs.com/opportunities-we-provide');
const applyBtn = page.locator('a:has-text("Apply now")').first();
await applyBtn.click();
expect(page.url()).not.toBe('https://academybugs.com/opportunities-we-provide');`
            },
          });
        }
      }
    }

    // 2. Dead Social Share on Articles Feed (BUG-027)
    if (url.includes('/articles')) {
      const shareBtn = page.locator('.social-share a, [class*="share"] a').first();
      if (await shareBtn.isVisible().catch(() => false)) {
        const href = await shareBtn.getAttribute('href');
        if (!href || href === '#' || href === 'javascript:void(0)') {
          results.push({
            passed: false,
            status: 'FAIL',
            message: 'Dead social share button: Social share links on articles do not lead anywhere (empty/hash href)!',
            details: {
              title: "Social Share Buttons on Article Feed Don't Work",
              expected: 'Social share buttons must link to respective social media share dialogs.',
              actual: "Social share buttons have href='#' or empty action.",
              severity: 'LOW',
              reproductionSteps: [
                'Open https://academybugs.com/articles/',
                'Click social share buttons at bottom of articles',
                'Observe buttons do not lead anywhere'
              ],
              specSnippet: `await page.goto('https://academybugs.com/articles/');
const share = page.locator('.social-share a').first();
const href = await share.getAttribute('href');
expect(href).not.toBe('#');`
            },
          });
        }
      }
    }

    // 3. Contact Form Submission Returns Error Page (BUG-028)
    if (url.includes('contact-us-form')) {
      const sendBtn = page.locator('input[type="submit"][value*="Send" i], button:has-text("Send")').first();
      if (await sendBtn.isVisible().catch(() => false)) {
        await page.locator('input[name*="name" i]').first().fill('Test User').catch(() => {});
        await page.locator('input[type="email"]').first().fill('test@test.com').catch(() => {});
        await page.locator('textarea').first().fill('Valid inquiry test message.').catch(() => {});
        await sendBtn.click().catch(() => {});
        await page.waitForTimeout(2000);

        const body = await page.innerText('body');
        if (body.includes('Error') || body.includes('Internal Server Error') || page.url().includes('error')) {
          results.push({
            passed: false,
            status: 'FAIL',
            message: 'Contact form submission returned an unhandled error state/page!',
            details: {
              title: 'Send Button in Contact Form Returns Error Page',
              expected: 'Message should be sent through contact us form with confirmation message.',
              actual: 'Submitting form results in an error message/page.',
              severity: 'MEDIUM',
              reproductionSteps: [
                'Open https://academybugs.com/contact-us-form/',
                'Fill out the contact form with valid inputs',
                'Click Send',
                'Observe an error page is displayed'
              ],
              specSnippet: `await page.goto('https://academybugs.com/contact-us-form/');
await page.locator('input[type="submit"]').click();
expect(await page.innerText('body')).not.toContain('Error');`
            },
          });
        }
      }
    }

    // 4. Video Player Media Failure (BUG-029)
    if (url.includes('latest-news')) {
      const videoEl = page.locator('video, iframe[src*="player"], .plyrio-player').first();
      if (await videoEl.isVisible().catch(() => false)) {
        const hasSource = await page.locator('video source, video[src]').count();
        if (hasSource === 0) {
          results.push({
            passed: false,
            status: 'FAIL',
            message: 'Video player failure: Video element is present but lacks playable media source (black screen)!',
            details: {
              title: "Video Player on Latest News Doesn't Work (Black Screen)",
              expected: 'Video player buffers and plays video content.',
              actual: 'A black screen is rendered instead of playing media.',
              severity: 'HIGH',
              reproductionSteps: [
                'Open https://academybugs.com/latest-news/',
                'Attempt to play video on the left column',
                'Observe black screen is displayed without video'
              ],
              specSnippet: `await page.goto('https://academybugs.com/latest-news/');
const video = page.locator('video').first();
expect(await video.getAttribute('src')).toBeTruthy();`
            },
          });
        }
      }
    }

    // 5. Product Search Button Error (BUG-030)
    const searchBtn = page.locator('.example-5-search-bug, input[value="Search"], button:has-text("Search")').first();
    const searchInput = page.locator('input[name="q"], input[placeholder*="search" i]').first();
    if (await searchBtn.isVisible().catch(() => false) && await searchInput.isVisible().catch(() => false)) {
      await searchInput.fill('Shoes');
      await searchBtn.click().catch(() => {});
      await page.waitForTimeout(2000);

      const body = await page.innerText('body');
      if (body.includes('Error') || body.includes('404') || body.includes('Internal Server')) {
        results.push({
          passed: false,
          status: 'FAIL',
          message: 'Product search button triggered an unhandled error page!',
          details: {
            title: 'Search Button Leads to Error Page',
            expected: 'Search execution displays relevant catalog results.',
            actual: 'Clicking search button leads to an error page.',
            severity: 'HIGH',
            reproductionSteps: [
              `Navigate to ${page.url()}`,
              'Type product name into search box',
              'Click Search button',
              'Observe search leads to error page'
            ],
            specSnippet: `await page.locator('input[name="q"]').fill('Shoes');
await page.locator('button:has-text("Search")').click();
expect(await page.innerText('body')).not.toContain('Error');`
          },
        });
      }
    }

    if (results.length > 0) {
      return results;
    }

    return {
      passed: true,
      status: 'PASS',
      message: 'Interactive action integrity verified across forms, CTAs, and media controls.',
    };
  },
};
