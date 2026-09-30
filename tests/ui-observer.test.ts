import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { sanitizeBundle, sanitizeJSON } from '../src/ui-observer/sanitize';
import settings from '../config/ui-observer.json';

async function until(check: () => Promise<boolean> | boolean): Promise<void> {
  const deadline = Date.now() + settings.navigationMs;
  while (!await check()) {
    assert.ok(Date.now() < deadline, 'Capture readiness timed out');
    await new Promise(resolve => setTimeout(resolve, 50));
  }
}
test('sanitization strips secrets regardless of payload field name', () => {
  assert.deepEqual(sanitizeJSON({ type: 'click', method: 'POST', value: 'password', arbitrary: 'secret', selectors: ['#private'], requestJSON: { token: 'private' } }), {
    type: 'click', method: 'POST', value: '[REMOVED FOR REVIEW]', arbitrary: '[REMOVED FOR REVIEW]', selectors: '[REMOVED FOR REVIEW]', requestJSON: '[REMOVED FOR REVIEW]',
  });
});
test('typing captures value metadata without expensive full-page snapshots', async () => {
  const server = createServer((req, res) => {
    res.setHeader('Content-Type', 'text/html');
    res.end(`<!doctype html><input id="name" /><p id="outcome"></p><script>document.querySelector('input').addEventListener('input', e => document.querySelector('#outcome').textContent = e.target.value);</script>`);
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const directory = await mkdtemp(join(tmpdir(), 'ui-observe-typing-'));
  const profile = join(directory, 'profile');
  const output = join(directory, 'sessions');
  const cli = spawn(process.execPath, ['--import', 'tsx', 'src/ui-observer/index.ts', '--url', origin, '--profile', profile, '--out', output, '--headless']);
  const exit = new Promise<number | null>(resolve => cli.on('exit', resolve));
  let logs = ''; cli.stdout.on('data', chunk => { logs += String(chunk); }); cli.stderr.on('data', chunk => { logs += String(chunk); });
  let browser: Awaited<ReturnType<typeof chromium.connectOverCDP>> | undefined;
  try {
    await until(() => logs.includes('Click Start microphone'));
    const port = (await readFile(join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0];
    browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
    const control = browser.contexts()[0].pages()[0];
    await control.locator('#start').click();
    await until(() => logs.includes('Recording active'));
    const page = browser.contexts()[0].pages().find(page => page.url().startsWith(origin))!;
    await page.locator('#name').fill('Anne');
    await page.locator('#outcome').waitFor({ state: 'visible' });
    await new Promise(resolve => setTimeout(resolve, settings.audioChunkMs + settings.afterActionMs));
    await control.locator('#stop').click();
    assert.equal(await exit, 0, logs);
    const sessionDir = join(output, (await readdir(output))[0]);
    const events = JSON.parse(await readFile(join(sessionDir, 'ui-events.json'), 'utf8'));
    const inputEvents = events.filter((event: any) => event.type === 'input' && event.element?.tag === 'input');
    assert.ok(inputEvents.length > 0, 'expected the input event to be recorded');
    assert.ok(inputEvents.every((event: any) => event.element.value === 'Anne' || event.element.value === '' || event.element.value === 'A' || event.element.value.startsWith('A')));
    assert.ok(inputEvents.length <= 2, 'input events should be debounced to avoid per-keystroke browser jitter');
    assert.ok(inputEvents.every((event: any) => event.beforeHTML === undefined && event.afterHTML === undefined), 'input typing should not serialize full DOM snapshots for each keystroke');
  } finally {
    if (cli.exitCode === null) { cli.kill('SIGTERM'); await exit; }
    await browser?.close().catch(() => {});
    await new Promise<void>(resolve => server.close(() => resolve()));
    await rm(directory, { recursive: true, force: true });
  }
});
test('CLI records microphone, robust selectors, raw network and snapshots; persists profile; sanitizes separately', async () => {
  const server = createServer((req, res) => {
    if (req.url === '/api/save') {
      req.resume(); req.on('end', () => { res.writeHead(201, { 'Content-Type': 'application/json' }); res.end('{"id":42,"token":"private-token","status":"created"}'); }); return;
    }
    res.setHeader('Content-Type', 'text/html');
    res.end(`<!doctype html><label for="patient-name">Patient name</label><input id="patient-name" name="firstName"><button data-testid="save-patient">Save</button><p id="outcome"></p>
    <script>localStorage.setItem('remember-me','persisted-login');document.querySelector('button').onclick=async()=>{
      await fetch('/api/save',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer private-token'},body:JSON.stringify({firstName:document.querySelector('input').value})});document.querySelector('#outcome').textContent='Patient created';};</script>`);
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const directory = await mkdtemp(join(tmpdir(), 'ui-observe-test-'));
  const profile = join(directory, 'profile');
  const output = join(directory, 'sessions');
  const cli = spawn(process.execPath, ['--import', 'tsx', 'src/ui-observer/index.ts', '--url', origin, '--profile', profile, '--out', output, '--headless']);
  const exit = new Promise<number | null>(resolve => cli.on('exit', resolve));
  let logs = ''; cli.stdout.on('data', chunk => { logs += String(chunk); }); cli.stderr.on('data', chunk => { logs += String(chunk); });
  let browser: Awaited<ReturnType<typeof chromium.connectOverCDP>> | undefined;
  try {
    await until(() => logs.includes('Click Start microphone'));
    const port = (await readFile(join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0];
    browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
    const control = browser.contexts()[0].pages()[0];
    await control.locator('#start').click();
    await until(() => logs.includes('Recording active'));
    const page = browser.contexts()[0].pages().find(page => page.url().startsWith(origin))!;
    await page.getByLabel('Patient name').fill('Jane Raw Personal');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await page.getByText('Patient created').waitFor();
    await new Promise(resolve => setTimeout(resolve, settings.audioChunkMs + settings.afterActionMs));
    await control.locator('#stop').click();
    assert.equal(await exit, 0, logs);
    const sessionDir = join(output, (await readdir(output))[0]);
    const manifest = JSON.parse(await readFile(join(sessionDir, 'manifest.json'), 'utf8'));
    assert.equal(manifest.capturePolicy, 'full_raw_local');
    const recorder = JSON.parse(await readFile(join(sessionDir, 'recorder.json'), 'utf8'));
    const click = recorder.steps.find((step: any) => step.type === 'click');
    assert.equal(click.selectors[0], '[data-testid="save-patient"]');
    assert.ok(click.selectors.some((selector: string) => selector.startsWith('aria/Save')));
    assert.ok(!JSON.stringify(recorder).includes('nth-child') && !JSON.stringify(recorder).includes('xpath/'));
    const events = JSON.parse(await readFile(join(sessionDir, 'ui-events.json'), 'utf8'));
    const event = events.find((event: any) => event.type === 'click');
    assert.ok((await readFile(join(sessionDir, event.beforeHTML), 'utf8')).includes('save-patient'));
    assert.ok((await readFile(join(sessionDir, event.afterHTML), 'utf8')).includes('Patient created'));
    assert.ok((await stat(join(sessionDir, event.screenshot))).size > 0);
    const index = JSON.parse(await readFile(join(sessionDir, 'network/index.json'), 'utf8'));
    const networkFile = index.find((item: any) => item.url.endsWith('/api/save')).file;
    const network = JSON.parse(await readFile(join(sessionDir, networkFile), 'utf8'));
    assert.equal(network.status, 201); assert.equal(network.requestJSON.firstName, 'Jane Raw Personal');
    assert.equal(network.responseJSON.token, 'private-token');
    assert.ok(network.requestHeaders.some((header: any) => header.name.toLowerCase() === 'authorization' && header.value.includes('private-token')));
    const audio = JSON.parse(await readFile(join(sessionDir, 'audio/timeline.json'), 'utf8'));
    assert.equal(audio.status, 'complete'); assert.ok(audio.chunks.length > 0);
    assert.equal(audio.source, 'synthetic_test_device');
    assert.ok((await stat(join(sessionDir, audio.file))).size > 0);
    const har = JSON.parse(await readFile(join(sessionDir, 'network.har'), 'utf8'));
    assert.ok(har.log.entries.some((entry: any) => entry.request.url.endsWith('/api/save')));
    assert.ok(!har.log.entries.some((entry: any) => entry.request.url.includes('/audio')));
    const reopened = await chromium.launchPersistentContext(profile, { headless: true });
    try { const page = reopened.pages()[0]; await page.goto(origin); assert.equal(await page.evaluate(() => localStorage.getItem('remember-me')), 'persisted-login'); }
    finally { await reopened.close(); }
    const sanitized = join(directory, 'sanitized'); await sanitizeBundle(sessionDir, sanitized);
    const sanitizedNetwork = await readFile(join(sanitized, networkFile), 'utf8');
    assert.ok(!sanitizedNetwork.includes('Jane Raw Personal') && !sanitizedNetwork.includes('private-token'));
    assert.ok(!(await readdir(join(sanitized, 'audio'))).includes('narration.webm'));
    assert.ok((await readFile(join(sessionDir, networkFile), 'utf8')).includes('private-token'));
  } finally {
    if (cli.exitCode === null) { cli.kill('SIGTERM'); await exit; }
    await browser?.close().catch(() => {});
    await new Promise<void>(resolve => server.close(() => resolve()));
    await rm(directory, { recursive: true, force: true });
  }
});
