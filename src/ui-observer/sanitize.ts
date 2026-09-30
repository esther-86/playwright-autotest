import { mkdir, readFile, writeFile, readdir, lstat } from 'node:fs/promises';
import { join, resolve, relative } from 'node:path';

// Conservative sharing draft: payloads, locators, URLs and free text can all
// contain secrets. Preserve only structural fields; never copy raw media/HTML.
const structural = new Set(['version', 'sessionId', 'id', 'eventId', 'stepIndex', 'pageId', 'type', 'phase', 'strategy', 'status', 'capturePolicy',
  'startedAt', 'stoppedAt', 'timestamp', 'browserTimestamp', 'receivedAt', 'afterTimestamp', 'screenshotTimestamp', 'finishedAt', 'closedAt',
  'method', 'resourceType', 'tag', 'button', 'offsetX', 'offsetY', 'uniqueInRoot', 'uniqueAtVerification', 'exact', 'uploadReady', 'schemaVersion']);
export function sanitizeJSON(value: unknown, key = ''): unknown {
  if (/^(requestJSON|responseJSON|requestHeaders|responseHeaders|requestBody|responseBody|frames|element|locators|selectors|outerHTML|beforeHTML|afterHTML|failure|details|issues|text|location|title|url|frameUrl|frameLocatorEvidence)$/i.test(key)) return '[REMOVED FOR REVIEW]';
  if (Array.isArray(value)) return value.map(item => sanitizeJSON(item, key));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([field, item]) => [field, sanitizeJSON(item, field)]));
  }
  if (value === null) return null;
  if (!structural.has(key)) return '[REMOVED FOR REVIEW]';
  return value;
}

export async function sanitizeBundle(source: string, destination: string): Promise<void> {
  source = resolve(source); destination = resolve(destination);
  if (destination === source || !relative(source, destination).startsWith('..')) throw new Error('Sanitized destination must be outside the raw session');
  const rawManifest = JSON.parse(await readFile(join(source, 'manifest.json'), 'utf8'));
  if (rawManifest.capturePolicy !== 'full_raw_local') throw new Error('Expected a raw ui:observe bundle');
  await mkdir(destination, { mode: 0o700 }); // Do not overwrite an existing review copy.
  const excluded: string[] = [];
  async function walk(directory: string, path = ''): Promise<void> {
    for (const name of await readdir(directory)) {
      const file = join(directory, name); const outputPath = join(path, name);
      const info = await lstat(file);
      if (info.isSymbolicLink()) { excluded.push(outputPath); continue; }
      if (info.isDirectory()) { await mkdir(join(destination, outputPath), { recursive: true }); await walk(file, outputPath); continue; }
      if (!name.endsWith('.json') || name === 'manifest.json') { excluded.push(outputPath); continue; }
      try {
        const parsed = JSON.parse(await readFile(file, 'utf8'));
        await writeFile(join(destination, outputPath), JSON.stringify(sanitizeJSON(parsed), null, 2) + '\n', { mode: 0o600 });
      } catch { excluded.push(outputPath); }
    }
  }
  await walk(source);
  await writeFile(join(destination, 'manifest.json'), JSON.stringify({
    version: 1, sessionId: rawManifest.sessionId, capturePolicy: 'sanitized_review_draft', uploadReady: false,
    excludedFiles: excluded,
    review: 'Sensitive values, free text, URLs, selectors, payloads and file links removed. Raw HTML, HAR, body files, screenshots and audio excluded. This draft loses replay and intent detail. Manually review JSON keys and restore only approved evidence into a separate sharing copy. No upload occurs.',
  }, null, 2) + '\n', { mode: 0o600 });
}
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.includes('--help')) { console.log('ui:sanitize --session artifacts/ui-observe/<session> [--out <new-directory>]\nCreates a conservative JSON review draft; no raw media, payload files or automatic upload.'); return; }
  const values = new Map<string, string>();
  for (let i = 0; i < args.length; i += 2) {
    if (!['--session', '--out'].includes(args[i]) || !args[i + 1]) throw new Error('Use --session <directory> [--out <new-directory>]');
    values.set(args[i], args[i + 1]);
  }
  const source = values.get('--session'); if (!source) throw new Error('Use --session <directory>');
  const destination = values.get('--out') || `${resolve(source)}-sanitized`;
  await sanitizeBundle(source, destination); console.log(`Sanitized review draft saved: ${resolve(destination)}. Review before sharing.`);
}
if (require.main === module) void main().catch(() => { console.error('Sanitization failed; use --help and a new output directory. Raw session unchanged.'); process.exitCode = 1; });
