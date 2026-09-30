import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { BrowserContext, Frame, Page, Request } from 'playwright';
import settings from '../../config/ui-observer.json';
import { installRecorder } from './injection';

export class UISession {
  readonly id = randomUUID();
  readonly startedAt = new Date().toISOString();
  readonly events: any[] = [];
  readonly network: any[] = [];
  readonly consoleEvents: any[] = [];
  readonly issues: any[] = [];
  readonly audio: any = { file: 'audio/narration.webm', status: 'not_started', chunks: [] };
  private pages = new Map<Page, string>();
  private requests = new Map<Request, any>();
  private actions = new Map<string, any>();
  private tasks = new Set<Promise<unknown>>();
  private active = false;
  private stopped = false;
  private mainPage?: Page;
  private context?: BrowserContext;
  constructor(readonly directory: string, readonly controlOrigin: string) {}
  async prepare(): Promise<void> {
    for (const name of ['html', 'screenshots', 'network', 'audio']) await mkdir(join(this.directory, name), { recursive: true, mode: 0o700 });
  }
  issue(code: string, details?: unknown): void { this.issues.push({ timestamp: new Date().toISOString(), code, details }); }
  private task(work: Promise<unknown>): void {
    this.tasks.add(work);
    void work.catch(() => this.issue('capture_failed')).finally(() => this.tasks.delete(work));
  }
  private async json(path: string, value: unknown): Promise<void> {
    await writeFile(join(this.directory, path), JSON.stringify(value, null, 2) + '\n', { mode: 0o600 });
  }
  async attach(context: BrowserContext): Promise<void> {
    this.context = context;
    await context.exposeBinding('__uiObserve', ({ page, frame }, event) => {
      if (this.active && !this.stopped && !event.url?.startsWith(this.controlOrigin)) this.task(this.capture(page, frame, event));
    });
    // tsx/esbuild adds __name calls to serialized functions; keep the helper
    // inside the injected closure rather than relying on application globals.
    await context.addInitScript({ content: `(() => { const __name = (fn, name) => fn; (${installRecorder.toString()})(${JSON.stringify({ controlOrigin: this.controlOrigin, afterActionMs: settings.afterActionMs })}); })()` });
    context.on('page', page => this.attachPage(page));
    for (const page of context.pages()) this.attachPage(page);
    context.on('request', request => {
      if (!this.active || this.stopped || request.url().startsWith(this.controlOrigin)) return;
      const item: any = {
        id: `request-${this.network.length + 1}`, timestamp: new Date().toISOString(), url: request.url(),
        method: request.method(), resourceType: request.resourceType(), limitations: [],
        redirectedFrom: this.requests.get(request.redirectedFrom()!)?.id,
      };
      try { item.pageId = this.pages.get(request.frame().page()); item.frameUrl = request.frame().url(); }
      catch { item.limitations.push('worker_or_detached_frame'); }
      this.requests.set(request, item); this.network.push(item);
      this.task((async () => {
        item.requestHeaders = await request.headersArray();
        const body = request.postDataBuffer();
        if (body) {
          item.requestBodyFile = `network/${item.id}-request.body`;
          await writeFile(join(this.directory, item.requestBodyFile), body, { mode: 0o600 });
          try { item.requestJSON = JSON.parse(body.toString('utf8')); } catch {}
        }
      })());
    });
    context.on('requestfinished', request => {
      const item = this.requests.get(request); if (!item) return;
      this.task((async () => {
        const response = await request.response();
        item.finishedAt = new Date().toISOString();
        if (!response) { item.limitations.push('response_missing'); return; }
        item.status = response.status(); item.responseHeaders = await response.headersArray();
        item.timing = request.timing(); item.fromServiceWorker = response.fromServiceWorker();
        try {
          const body = await response.body();
          item.responseBodyFile = `network/${item.id}-response.body`;
          await writeFile(join(this.directory, item.responseBodyFile), body, { mode: 0o600 });
          if (response.headers()['content-type']?.includes('json')) {
            try { item.responseJSON = JSON.parse(body.toString('utf8')); } catch { item.limitations.push('invalid_json_response'); }
          }
        } catch { item.limitations.push('response_body_unavailable'); }
      })());
    });
    context.on('requestfailed', request => {
      const item = this.requests.get(request); if (item) { item.failure = request.failure(); item.finishedAt = new Date().toISOString(); }
    });
  }
  private attachPage(page: Page): void {
    if (this.pages.has(page)) return;
    this.pages.set(page, `page-${this.pages.size + 1}`);
    page.on('console', message => {
      if (this.active && !this.stopped && !page.url().startsWith(this.controlOrigin)) this.consoleEvents.push({ pageId: this.pages.get(page), timestamp: new Date().toISOString(), type: message.type(), text: message.text(), location: message.location() });
    });
    page.on('pageerror', error => { if (this.active && !this.stopped) this.issue('page_error', error.message); });
    page.on('websocket', socket => {
      if (!this.active || this.stopped || socket.url().startsWith(this.controlOrigin.replace('http', 'ws'))) return;
      const item: any = { id: `request-${this.network.length + 1}`, kind: 'websocket', url: socket.url(), timestamp: new Date().toISOString(), frames: [] };
      this.network.push(item);
      const record = (direction: string, payload: string | Buffer) => {
        if (!this.stopped) item.frames.push({ timestamp: new Date().toISOString(), direction, encoding: Buffer.isBuffer(payload) ? 'base64' : 'utf8', data: Buffer.isBuffer(payload) ? payload.toString('base64') : payload });
      };
      socket.on('framesent', event => record('sent', event.payload));
      socket.on('framereceived', event => record('received', event.payload));
      socket.on('socketerror', error => { item.failure = error; });
      socket.on('close', () => { item.closedAt = new Date().toISOString(); });
    });
  }
  start(): void { this.active = true; }
  setMainPage(page: Page): void { this.mainPage = page; }
  freeze(): void { this.active = false; this.stopped = true; }
  private async capture(page: Page, frame: Frame, raw: any): Promise<void> {
    if (raw.phase === 'after') {
      const action = this.actions.get(raw.actionId);
      if (!action) return;
      action.afterTimestamp = raw.browserTimestamp;
      action.afterHTML = `html/${action.id}-after.html`;
      await writeFile(join(this.directory, action.afterHTML), raw.afterHTML, { mode: 0o600 });
      await this.screenshot(page, action); return;
    }
    const { beforeHTML, afterHTML, ...metadata } = raw;
    const event: any = { ...metadata, id: `action-${this.events.length + 1}`, pageId: this.pages.get(page), receivedAt: new Date().toISOString(), frameUrl: frame.url(), framePath: this.framePath(frame) };
    this.events.push(event);
    if (event.framePath.length) {
      event.frameLocatorEvidence = [];
      let current = frame;
      while (current.parentFrame()) {
        try {
          const owner = await current.frameElement();
          event.frameLocatorEvidence.unshift(await owner.evaluate(node => ({
            tag: (node as Element).tagName.toLowerCase(), testId: (node as Element).getAttribute('data-testid'), name: (node as Element).getAttribute('name'),
            title: (node as Element).getAttribute('title'), src: (node as Element).getAttribute('src'),
          })));
        } catch { event.frameLocatorLimitation = 'frame_owner_unavailable'; }
        current = current.parentFrame()!;
      }
    }
    if (raw.actionId) this.actions.set(raw.actionId, event);
    if (beforeHTML) {
      event.beforeHTML = `html/${event.id}-before.html`;
      await writeFile(join(this.directory, event.beforeHTML), beforeHTML, { mode: 0o600 });
    }
    if (afterHTML) {
      event.afterHTML = `html/${event.id}-after.html`;
      await writeFile(join(this.directory, event.afterHTML), afterHTML, { mode: 0o600 });
      await this.screenshot(page, event);
    }
    // Verify semantic candidates using the browser's accessibility locator engine.
    for (const candidate of event.element?.locators || []) {
      if (candidate.strategy !== 'role' && candidate.strategy !== 'label') continue;
      try {
        const locator = candidate.strategy === 'role' ? frame.getByRole(candidate.role, { name: candidate.name, exact: true }) : frame.getByLabel(candidate.label, { exact: true });
        candidate.uniqueAtVerification = await locator.count() === 1;
        if (candidate.uniqueAtVerification && candidate.strategy === 'role' && !/[\[\]\\]/.test(candidate.name)) {
          const aria = `aria/${candidate.name}[role="${candidate.role}"]`;
          // Explicit test hooks remain the first choice.
          const at = event.element.locators.some((entry: any) => ['data-testid', 'data-test', 'data-cy'].includes(entry.strategy)) ? 1 : 0;
          if (!event.element.locators.some((entry: any) => entry.strategy === 'shadow')) event.element.recorder.splice(at, 0, aria);
        }
      } catch { candidate.verification = 'unavailable_after_action'; }
    }
    if (event.element && !event.element.recorder.length) event.selectorStatus = 'needs_review_no_reliable_recorder_selector';
  }
  private framePath(frame: Frame): number[] {
    const path: number[] = [];
    while (frame.parentFrame()) { const parent = frame.parentFrame()!; path.unshift(parent.childFrames().indexOf(frame)); frame = parent; }
    return path;
  }
  private async screenshot(page: Page, event: any): Promise<void> {
    try {
      event.screenshot = `screenshots/${event.id}.png`;
      await page.screenshot({ path: join(this.directory, event.screenshot), timeout: settings.captureMs });
      event.screenshotTimestamp = new Date().toISOString();
    } catch { delete event.screenshot; event.screenshotLimitation = 'page_closed_or_capture_failed'; }
  }
  async drain(): Promise<void> { while (this.tasks.size) await Promise.allSettled([...this.tasks]); }
  async save(reason: string): Promise<void> {
    this.stopped = true;
    await this.drain();
    const steps: any[] = [];
    const eventMap: any[] = [];
    for (const event of this.events) {
      if (event.beforeHTML && !event.afterHTML) event.afterLimitation = 'after_snapshot_lost_to_navigation_or_stop';
      if (event.framePath.length) {
        event.recorderLimitation = 'nested_frame_step_omitted_to_avoid_indexed_recorder_frame_routes';
        continue;
      }
      let step: any;
      const selectors = event.element?.recorder;
      const route = { target: event.pageId === this.pages.get(this.mainPage!) ? 'main' : event.url };
      if (event.type === 'navigation' && !event.framePath.length) step = { type: 'navigate', url: event.url, target: route.target };
      if (selectors?.length && event.type === 'click') step = { type: 'click', selectors, ...route, offsetX: event.offsetX, offsetY: event.offsetY, button: ['primary', 'auxiliary', 'secondary'][event.button] || 'primary' };
      if (selectors?.length && ['input', 'change'].includes(event.type) && event.element.value !== undefined && !['checkbox', 'radio', 'file'].includes(event.element.inputType)) step = { type: 'change', selectors, ...route, value: event.element.value };
      if (['keydown', 'keyup'].includes(event.type)) step = { type: event.type === 'keydown' ? 'keyDown' : 'keyUp', key: event.key, ...route };
      if (step) { eventMap.push({ stepIndex: steps.length, eventId: event.id }); steps.push(step); }
    }
    for (const item of this.network) {
      if (!item.finishedAt && item.kind !== 'websocket') item.limitations.push('incomplete_at_stop');
      await this.json(`network/${item.id}.json`, item);
    }
    await this.json('recorder.json', { title: `UI Observe ${this.id}`, steps });
    await this.json('recorder-event-map.json', eventMap);
    await this.json('ui-events.json', this.events);
    await this.json('network/index.json', this.network.map(item => ({ id: item.id, file: `network/${item.id}.json`, timestamp: item.timestamp, url: item.url })));
    await this.json('console.json', this.consoleEvents);
    await this.json('audio/timeline.json', this.audio);
    await this.json('manifest.json', {
      version: 1, sessionId: this.id, startedAt: this.startedAt, stoppedAt: new Date().toISOString(), stopReason: reason,
      capturePolicy: 'full_raw_local', uploadReady: false,
      files: ['recorder.json', 'recorder-event-map.json', 'ui-events.json', 'network/index.json', 'network.har', 'console.json', 'audio/timeline.json'],
      issues: this.issues,
      counts: { uiEvents: this.events.length, network: this.network.length },
      limitations: [
        'Recorder-compatible export, not a native DevTools panel export; replay is not validated.',
        'Before HTML is event capture-phase DOM, before application bubble handlers, not before browser default input changes.',
        'After HTML is a timed observation, not proof of completed business behavior; navigation may lose pending snapshots.',
        'Screenshots are asynchronous observations of the page, not guaranteed exact action boundaries.',
        'Open shadow roots have selector chains; HTML serialization does not include shadow-root contents or live property values (values are stored in events).',
        'Network is all observable context HTTP plus page WebSocket messages, not OS-wide traffic; browser/worker/protocol limitations apply.',
        'Raw audio is not transcribed; timeline provides alignment and microphone gaps are explicit.',
        'No inferred assertions, test generation, automatic upload or causal network correlation.',
      ],
    });
  }
}
