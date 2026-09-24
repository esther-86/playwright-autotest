import { Page, Request, Response } from 'playwright';
import { NetworkObservation } from './types';

const RELEVANT_RESOURCE_TYPES = new Set(['document', 'xhr', 'fetch', 'websocket', 'eventsource']);
const MAX_RECORDED_EVENTS = 500;

/** Remove credentials and query values before network evidence is sent to an LLM. */
export function sanitizeNetworkUrl(rawUrl: string): string {
  try {
    const url = new URL(rawUrl);
    url.username = '';
    url.password = '';
    for (const key of [...url.searchParams.keys()]) {
      url.searchParams.set(key, '[redacted]');
    }
    return url.toString().slice(0, 2_000);
  } catch {
    return rawUrl.split('?')[0].slice(0, 2_000);
  }
}

export interface NetworkRecorder {
  mark(): number;
  since(mark: number): NetworkObservation[];
  stop(): void;
}

export function createNetworkRecorder(page: Page): NetworkRecorder {
  const events: Array<{ requestSequence: number; event: NetworkObservation }> = [];
  let nextRequestSequence = 0;
  const startedAt = new WeakMap<Request, number>();
  const requestSequences = new WeakMap<Request, number>();

  const append = (request: Request, event: NetworkObservation) => {
    const requestSequence = requestSequences.get(request) ?? nextRequestSequence++;
    events.push({ requestSequence, event });
    if (events.length > MAX_RECORDED_EVENTS) events.shift();
  };

  const onRequest = (request: Request) => {
    startedAt.set(request, Date.now());
    requestSequences.set(request, nextRequestSequence++);
  };

  const onResponse = (response: Response) => {
    const request = response.request();
    const resourceType = request.resourceType();
    if (!RELEVANT_RESOURCE_TYPES.has(resourceType) && response.status() < 400) return;

    const start = startedAt.get(request);
    append(request, {
      kind: 'RESPONSE',
      method: request.method(),
      url: sanitizeNetworkUrl(response.url()),
      resourceType,
      status: response.status(),
      durationMs: start === undefined ? undefined : Date.now() - start,
    });
  };

  const onRequestFailed = (request: Request) => {
    const start = startedAt.get(request);
    append(request, {
      kind: 'REQUEST_FAILED',
      method: request.method(),
      url: sanitizeNetworkUrl(request.url()),
      resourceType: request.resourceType(),
      failure: request.failure()?.errorText || 'Unknown transport failure',
      durationMs: start === undefined ? undefined : Date.now() - start,
    });
  };

  page.on('request', onRequest);
  page.on('response', onResponse);
  page.on('requestfailed', onRequestFailed);

  return {
    mark: () => nextRequestSequence,
    since: (mark) => events
      .filter((entry) => entry.requestSequence >= mark)
      .map((entry) => entry.event),
    stop: () => {
      page.off('request', onRequest);
      page.off('response', onResponse);
      page.off('requestfailed', onRequestFailed);
    },
  };
}
