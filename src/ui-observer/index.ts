import { chromium, BrowserContext, Page } from 'playwright';
import { createServer } from 'node:http';
import { mkdir, appendFile, writeFile, unlink } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { UISession } from './session';
import { controlHTML } from './control';
import { defaultLayers, parseLayers } from './layers';
import settings from '../../config/ui-observer.json';

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.includes('--help')) {
    console.log('ui:observe --url http://localhost:3000 [--profile .ui-observe/profile] [--out artifacts/ui-observe]\n--origin is an alias for --url. A persistent Chromium window opens recording controls. Select capture layers, Apply settings (network changes restart Chromium), then Start and interact in the application tab. Stop & save exports the raw local bundle.\n--headless is smoke-test mode with a synthetic microphone, not human narration.'); return;
  }
  const values = new Map<string, string>();
  let headless = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--headless') { headless = true; continue; }
    if (!['--url', '--origin', '--profile', '--out'].includes(args[i]) || !args[i + 1] || args[i + 1].startsWith('--')) throw new Error('Invalid arguments; use --help');
    values.set(args[i], args[++i]);
  }
  const url = values.get('--url') || values.get('--origin');
  if (!url || !['http:', 'https:'].includes(new URL(url).protocol)) throw new Error('Provide an HTTP(S) --url');
  const directory = join(resolve(values.get('--out') || 'artifacts/ui-observe'), `${Date.now()}-${randomUUID()}`);
  const explicitProfile = values.get('--profile');
  const defaultProfile = join('.ui-observe', `profile-${Date.now()}-${randomUUID()}`);
  const profile = resolve(explicitProfile || defaultProfile);
  await mkdir(profile, { recursive: true, mode: 0o700 });
  const token = `/${randomUUID()}/`;
  let session: UISession;
  let layers = { ...defaultLayers };
  let restarting = false;
  let context: BrowserContext | undefined;
  let control: Page | undefined;
  let application: Page | undefined;
  let finishing = false;
  let started = false;
  let finishAudioRequested = false;
  let doneResolve!: () => void;
  const done = new Promise<void>(resolve => { doneResolve = resolve; });
  let audioUploads: Promise<unknown> = Promise.resolve();
  const server = createServer((req, res) => {
    void (async () => {
      if (!req.url?.startsWith(token)) { res.writeHead(404).end(); return; }
      if (req.method === 'GET' && req.url === token) {
        res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(controlHTML(settings.audioChunkMs, layers)); return;
      }
      if (req.method !== 'POST' || !session) { res.writeHead(405).end(); return; }
      const route = req.url.slice(token.length);
      if (route.startsWith('audio') && !layers.audio) { res.writeHead(409).end(); return; }
      if (route === 'audio') {
        if (finishing && !finishAudioRequested) { res.writeHead(409).end(); return; }
        const chunks: Buffer[] = []; for await (const chunk of req) chunks.push(Buffer.from(chunk));
        const data = Buffer.concat(chunks);
        audioUploads = audioUploads.then(async () => {
          await appendFile(join(directory, 'audio/narration.webm'), data, { mode: 0o600 });
          session.audio.chunks.push({ receivedAt: new Date().toISOString(), bytes: data.length });
        });
        await audioUploads; res.end('ok'); return;
      }
      let body = ''; for await (const chunk of req) body += chunk.toString();
      if (route === 'settings') {
        if (started || restarting || finishing) { res.writeHead(409).end(); return; }
        const chosen = parseLayers(JSON.parse(body));
        const restart = chosen.network !== layers.network;
        layers = chosen;
        Object.assign(session.layers, layers);
        Object.assign(session.audio, { status: layers.audio ? 'not_started' : 'disabled', file: layers.audio ? 'audio/narration.webm' : undefined });
        if (restart) {
          restarting = true;
          res.end('restarting');
          await context!.close();
          await unlink(join(directory, 'network.har')).catch(error => { if (error.code !== 'ENOENT') throw error; });
          try { await launch(); } catch { await finish('restart_failed', false); }
          finally { restarting = false; }
          return;
        }
      } else if (route === 'audio-start') {
        const data = JSON.parse(body);
        await audioUploads;
        await writeFile(join(directory, 'audio/narration.webm'), '', { mode: 0o600 });
        Object.assign(session.audio, { status: 'recording', startedAt: data.timestamp, mimeType: data.mimeType, chunks: [] });
      } else if (route === 'audio-stop') {
        const data = JSON.parse(body);
        Object.assign(session.audio, { stoppedAt: data.timestamp, status: session.audio.startedAt ? (data.complete ? 'complete' : 'incomplete') : 'not_started' });
      } else if (route === 'start') {
        if (!started) {
          started = true; Object.assign(session.layers, layers);
          if (!layers.audio) Object.assign(session.audio, { status: 'disabled', file: undefined });
          await session.attach(context!); session.start();
          application = await context!.newPage(); session.setMainPage(application);
          await application.goto(url, { waitUntil: 'domcontentloaded', timeout: settings.navigationMs }).catch(() => session.issue('initial_navigation_failed'));
          console.log('Recording active. Switch to the application tab; return to the control tab to Stop & save.');
        }
      } else if (route === 'stop') {
        res.end('saving'); void finish('control_stop', false); return;
      } else { res.writeHead(404).end(); return; }
      res.end('ok');
    })().catch(() => { session?.issue('control_or_audio_request_failed'); if (!res.headersSent) res.writeHead(500); res.end('capture failed'); });
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  session = new UISession(directory, origin); await session.prepare();
  session.audio.source = headless ? 'synthetic_test_device' : 'microphone';
  async function finish(reason: string, stopAudio = true): Promise<void> {
    if (finishing) return;
    finishing = true;
    try {
      if (stopAudio && control && !control.isClosed()) {
        finishAudioRequested = true;
        await control.evaluate(() => (window as any).finishRecording?.()).catch(() => session.issue('audio_final_chunk_unavailable'));
      }
      await audioUploads.catch(() => session.issue('audio_write_failed'));
      if (session.audio.status === 'recording') session.audio.status = 'incomplete';
      session.freeze(); await session.drain();
      await context?.close().catch(() => session.issue('browser_close_or_har_flush_failed'));
      await session.save(reason);
      console.log(`Session saved: ${directory}\nRaw local bundle; sanitize and review before sharing with AI.`);
    } catch { process.exitCode = 1; console.error('Session save failed; inspect the artifact directory for partial evidence.'); }
    finally { server.close(); server.closeAllConnections(); doneResolve(); }
  }
  const interrupt = () => { void finish('SIGINT'); };
  const terminate = () => { void finish('SIGTERM'); };
  process.once('SIGINT', interrupt); process.once('SIGTERM', terminate);
  try {
    console.log(`Launching persistent Chromium. Profile: ${profile}\nArtifacts: ${directory}`);
    await launch();
    await done;
  } catch {
    process.exitCode = 1; session.issue('browser_launch_or_setup_failed');
    console.error('Could not launch recording browser. Check that Chromium is installed and the profile is not already in use.');
    await finish('launch_failed', false);
  } finally { process.removeListener('SIGINT', interrupt); process.removeListener('SIGTERM', terminate); }
  async function launch(): Promise<void> {
    context = await chromium.launchPersistentContext(profile, {
      headless, handleSIGINT: false, handleSIGTERM: false, handleSIGHUP: false,
      ...(layers.network ? { recordHar: { path: join(directory, 'network.har'), content: 'embed', mode: 'full', urlFilter: new RegExp(`^(?!${origin.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`) } } : {}),
      args: ['--remote-debugging-port=0', ...(headless ? ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] : [])],
    });
    if (finishing) { await context.close(); return; }
    context.on('close', () => { if (!finishing && !restarting) void finish('browser_closed', false); });
    control = context.pages()[0] || await context.newPage();
    await control.goto(origin + token);
    console.log('Click Start microphone / selected layers & open application in the control tab.');
  }
}
void main().catch(() => { console.error('Could not start ui:observe; check --help, URL and writable paths.'); process.exitCode = 1; });
