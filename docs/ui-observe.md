# Record a manual workflow for AI test generation

```bash
npm run ui:observe -- --url http://localhost:3000
```

The command launches visible bundled Chromium with a fresh profile under
`.ui-observe/`. Pass `--profile .ui-observe/pilot-profile` to reuse application cookies
and local storage between sessions. Start the application separately. The command never starts your app.
Install the browser first with `npx playwright install chromium` if needed.

In the control tab, choose **Interactions & navigation**, **HTML snapshots**,
**Screenshots**, **Network requests, bodies & HAR**, **Console messages & page
errors**, and **Microphone narration**. All are enabled by default. Click **Apply
settings** after changing switches, then **Start selected layers & open application**.
Microphone permission is requested only when narration is enabled (macOS may
request permission too). A separate
application tab opens after capture starts. Narrate what you intend, perform
the workflow, then return to the control tab and click **Stop & save session**.
Keep the control tab open so audio can be finalized. Ctrl+C also requests a final
audio chunk when possible. If you close/crash the browser first, the audio and
pending snapshots may be incomplete; that is recorded rather than inferred.

HTML and screenshots require interactions, which provide their capture points.
Turning interactions off clears and disables both switches; re-enable them explicitly
when needed. HTML and screenshots can otherwise be switched independently.
Network changes restart Chromium before starting because HAR is a launch setting.
The reopened control tab retains your choices. Layer settings are locked once
started except the live screenshot switch described below.

Automatic screenshots are taken once after **750 milliseconds of user inactivity**,
not on every interaction or keystroke. Input bursts coalesce into one observation;
keyboard, pointer and scroll activity reset the timer even when HTML is disabled.
There are no periodic screenshots. Captures are serialized across the session.

Use **Automatic screenshots after 750 ms idle** to switch screenshot capture off
or back on during recording without changing interaction or network capture.
Switching off cancels pending/queued work. A browser screenshot already in flight
cannot be interrupted by Playwright; its result is discarded and file removed.
**Capture now** requests a manual screenshot of the most recently active app tab,
without waiting for idle. It requires screenshots enabled and is queued behind
any capture in flight. A manual capture supersedes a pending idle observation.
Stopping cancels pending captures; navigation invalidates observations from the
previous page state. This reduces capture frequency but does not prove visible
flicker is eliminated; compare the live screenshot-off mode on your application.

For a recording-off baseline, click **All recording off**, **Apply settings**,
wait for the browser to reopen, then **Start selected layers & open application**.
The app still opens, with no recorder injection, network/HAR, console, screenshots,
HTML or microphone capture. Stop still saves an empty bundle and selected settings.
`manifest.json` records `captureLayers`; disabled audio has status `disabled`, and
disabled network produces no HAR. Use these choices to compare flicker manually;
they do not establish its cause or fix it.

Each session saves to `artifacts/ui-observe/<timestamp>-<uuid>/`. The persistent
profile is separate from artifacts and ignored by Git. The raw bundle contains
all captured values, credentials and personal data, as requested. It stays local.
No AI provider is called, and generated tests are not executed.

```bash
npm run ui:observe -- --url https://your-app.example/patients \
  --profile .ui-observe/pilot-profile --out artifacts/ui-observe
npm run ui:observe -- --help
```

Only one browser can use a profile at a time. `--origin` is an alias for `--url`.
`--headless` is an automated smoke-test mode using a **synthetic microphone**;
it does not capture human narration. The production/default mode uses the real
microphone. Recording is not audio transcription.

## Bundle files

| File | Purpose |
| --- | --- |
| `manifest.json` | Session metadata, limits, issues and artifact counts |
| `recorder.json` | Generated Chrome Recorder-compatible user-flow JSON |
| `recorder-event-map.json` | Maps Recorder steps to detailed UI event IDs |
| `ui-events.json` | Actions, values, selector candidates, timestamps and snapshot links |
| `html/action-*-before.html` | DOM captured in the event's capture phase |
| `html/action-*-after.html` | DOM captured after the configured observation interval |
| `screenshots/capture-*.png` | Idle/manual page observations with unique filenames |
| `screenshots/index.json` | Capture mode, event/page ID, URL, start/finish timestamps and failures |
| `network.har` | Full observable browser-context HTTP HAR, embedded content |
| `network/index.json` | Request index with timestamps and file references |
| `network/request-*.json` | Request/response metadata, parsed JSON bodies, redirect references or WebSocket frames |
| `network/request-*-request.body` | Raw request bytes |
| `network/request-*-response.body` | Raw response bytes when available |
| `audio/narration.webm` | Microphone audio stream |
| `audio/timeline.json` | Start/stop time, chunk sizes and completion state |
| `console.json` | Application console messages |

Times are UTC ISO timestamps. UI events include browser and receiver times;
screenshots have their own observation timestamp. Audio starts when the control
page begins recording. AI can align narration with event times without assuming
temporal proximity proves request causation. No transcription or causal mapping
is generated in this stage.

Recorder JSON follows the Chrome/Puppeteer Replay user-flow schema. It is
generated by this tool, not exported by the actual DevTools panel, and has not
been replay-validated. Unsupported/unreliable steps remain in `ui-events.json`
with limitation markers rather than invented Recorder selectors.

## Selector policy

Prefer explicit test IDs, then role/accessibility-name or label candidates.
CSS alternatives use unique test hooks, stable-looking IDs, field names,
ARIA labels, placeholders, alt/title or static link paths. Stable test-hook
ancestors can scope a locator. Open-shadow hosts require a stable selector chain.

CSS candidates are uniqueness-checked in their document/shadow root. Semantic
candidates are additionally checked with the browser locator engine after
event receipt; timing changes can make that verification unavailable. A
uniqueness check is evidence, not proof that a locator remains stable later.
No positional CSS, absolute XPath, generated class chains or `.nth()` locators
are generated. If nothing reliable is available, the event requires review.

Nested-frame events include frame-owner test ID/name/title/source evidence for
AI to construct semantic frame locators. Their Recorder steps are omitted
because native Recorder frame routing requires numeric indexes. Raw frame
paths remain observational metadata, never a generated locator recommendation.

## Capture boundaries

“Before” HTML means before application bubble handlers; browser default changes
may already have occurred for input events. “After” is a timed snapshot, not an
assertion of success. Navigations or session stop may cancel a pending after
snapshot, with an explicit limitation. Screenshots happen asynchronously and
can show a later state. Closed shadow roots/cross-origin frame lifecycle races
and dynamic JavaScript state cannot be completely serialized. Live input values
are in event metadata; HTML serialization is not a full browser state backup.

All observable context HTTP is retained, not only API candidates. Binary bodies
are saved as bytes; redirects/failed requests can lack inspectable response
bodies. Page WebSocket frames are captured separately from HAR. Worker-only
traffic, streaming responses and browser-internal protocols are not universally
supported. This is not an OS network packet capture. Audio/control traffic is
excluded. Capture size is not capped: stop the session when finished and allow
enough disk space. Capture failures are saved as issues. Profile login reuse is
not guaranteed for apps that expire credentials or use session-only storage.

## Separate sanitization before sharing

```bash
npm run ui:sanitize -- --session artifacts/ui-observe/<session>
```

Creates a new `<session>-sanitized` review draft. It preserves structural metadata
and removes payload/header/selector/free-text values. Raw HTML, body bytes,
screenshots, HAR and audio are excluded. The original stays unchanged.
This intentionally loses replay and narration detail: review the draft, including
JSON keys, and selectively restore approved evidence into a separate sharing
copy. Automatic sensitive-data detection cannot safely certify raw screenshots
or speech. Both manifests have `uploadReady: false`; there is no automatic send.

## Verification

`node --import tsx --test tests/ui-observer.test.ts` exercises a local application with a synthetic audio
device: control-page recording, full network JSON, locator alternatives,
HTML/screenshot capture, audio finalization, persistent local storage, HAR and
separate sanitization. Real microphone permissions require a manual pilot.
Timing settings live in `config/ui-observer.json`.
