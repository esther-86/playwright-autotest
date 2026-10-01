import { CaptureLayers, defaultLayers } from './layers';
export function controlHTML(chunkMs: number, layers: CaptureLayers = defaultLayers): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>UI Observe — recording controls</title>
  <style>body{font:17px system-ui;max-width:680px;margin:64px auto;padding:24px;background:#f4f6fa;color:#172331}button{padding:12px 20px;font:inherit;margin:8px 8px 8px 0}#status{white-space:pre-wrap}small{color:#526174}</style></head>
  <body><h1>Record your workflow</h1><p>Your browser profile remembers logins. Choose capture layers before starting. Settings are locked during a session.</p>
  <fieldset id="layers"><legend>Capture layers</legend>
  ${Object.entries(layers).map(([key, enabled]) => `<label style="display:block;margin:8px"><input type="checkbox" id="layer-${key}" ${enabled ? 'checked' : ''}> ${{ interactions: 'Interactions & navigation', html: 'HTML snapshots (requires interactions)', screenshots: 'Screenshots (requires interactions)', network: 'Network requests, bodies & HAR (browser restart to change)', console: 'Console messages & page errors', audio: 'Microphone narration' }[key as keyof CaptureLayers]}</label>`).join('')}
  <button id="off" type="button">All recording off</button><button id="apply" type="button">Apply settings</button></fieldset>
  <p>HTML and screenshots use interaction capture points. Disabling interactions also disables both. Network changes restart this browser before recording; other settings apply without restart.</p>
  <button id="start">Start selected layers & open application</button><button id="stop" disabled>Stop & save session</button>
  <p><label><input id="screenshots-enabled" type="checkbox" ${layers.screenshots ? 'checked' : ''}> Automatic screenshots after 750 ms idle</label>
  <button id="capture-now" disabled>Capture now</button></p>
  <p id="status">Ready. Apply changed settings before starting. Microphone permission is requested only when narration is enabled.</p>
  <small>Keep this control tab open. Use Stop & save for a complete audio file. Raw artifacts are not sent to AI.</small>
  <script>
  let recorder, stream, uploads = Promise.resolve(), stopped = false, failure;
  const status = document.querySelector('#status');
  const post = async (path, body, headers) => {const res=await fetch(location.pathname+path,{method:'POST',body,headers});if(!res.ok)throw new Error('Capture request failed: '+path);return res;};
  const selected = () => Object.fromEntries([...document.querySelectorAll('#layers input')].map(input=>[input.id.slice(6),input.checked]));
  let applied = ${JSON.stringify(layers)};
  let recordingStarted=false;
  const screenshotSwitch=document.querySelector('#screenshots-enabled');
  const captureButton=document.querySelector('#capture-now');
  screenshotSwitch.onchange=async()=>{
    try {
      if(!recordingStarted){document.querySelector('#layer-screenshots').checked=screenshotSwitch.checked;document.querySelector('#layers').dispatchEvent(new Event('change'));return;}
      await post('screenshots',JSON.stringify({enabled:screenshotSwitch.checked}),{'Content-Type':'application/json'});
      captureButton.disabled=!screenshotSwitch.checked;
    } catch(error){screenshotSwitch.checked=!screenshotSwitch.checked;status.textContent='Could not change screenshot setting: '+error.message;}
  };
  captureButton.onclick=async()=>{captureButton.disabled=true;try{await post('capture-now');status.textContent='Manual screenshot queued for the application.';}catch(error){status.textContent='Capture unavailable: '+error.message;}finally{captureButton.disabled=!screenshotSwitch.checked||stopped;}};
  const dependency = () => {const enabled=document.querySelector('#layer-interactions').checked;for(const key of ['html','screenshots']){const input=document.querySelector('#layer-'+key);input.disabled=!enabled;if(!enabled)input.checked=false;}screenshotSwitch.disabled=!enabled;if(!recordingStarted)screenshotSwitch.checked=document.querySelector('#layer-screenshots').checked;};
  dependency();
  document.querySelector('#layers').onchange=()=>{dependency();document.querySelector('#start').disabled=true;status.textContent='Settings changed. Click Apply settings before starting.';};
  document.querySelector('#off').onclick=()=>{document.querySelectorAll('#layers input').forEach(input=>input.checked=false);dependency();document.querySelector('#start').disabled=true;status.textContent='All layers off. Click Apply settings, then Start to open the application.';};
  document.querySelector('#apply').onclick=async()=>{try{const chosen=selected();status.textContent=chosen.network!==applied.network?'Restarting browser to apply network capture…':'Applying…';document.querySelector('#layers').disabled=true;const response=await post('settings',JSON.stringify(chosen),{'Content-Type':'application/json'});if(await response.text()==='restarting')return;document.querySelector('#layers').disabled=false;dependency();applied=chosen;document.querySelector('#start').disabled=false;status.textContent='Settings applied. Ready to open the application.';}catch(error){document.querySelector('#layers').disabled=false;dependency();status.textContent='Could not apply: '+error.message;}};
  document.querySelector('#start').onclick = async () => {
    document.querySelector('#start').disabled=true;
    try {
      document.querySelector('#layers').disabled=true;
      if(applied.audio) {
      stream=await navigator.mediaDevices.getUserMedia({audio:true});
      const mimeType=['audio/webm;codecs=opus','audio/webm'].find(type=>MediaRecorder.isTypeSupported(type));
      if(!mimeType) throw new Error('WebM microphone recording is unsupported');
      recorder=new MediaRecorder(stream,{mimeType});
      recorder.ondataavailable=e=>{if(e.data.size)uploads=uploads.then(()=>post('audio',e.data,{'Content-Type':mimeType})).catch(error=>{failure=error;status.textContent='Audio save failed. Stop and inspect capture issues.';});};
      await post('audio-start',JSON.stringify({timestamp:new Date().toISOString(),mimeType}),{'Content-Type':'application/json'});
      recorder.start(${chunkMs});
      }
      await post('start');
      recordingStarted=true;screenshotSwitch.checked=applied.screenshots;screenshotSwitch.disabled=!applied.interactions;captureButton.disabled=!applied.screenshots;
      document.querySelector('#stop').disabled=false;
      status.textContent='Application open. Active layers: '+Object.keys(applied).filter(key=>applied[key]).join(', ')+' (none means recording off).';
    } catch(error) {
      if(recorder && recorder.state!=='inactive')recorder.stop();
      stream?.getTracks().forEach(track=>track.stop());
      await uploads;
      status.textContent='Could not start: '+error.message+'\\nCheck settings or microphone permission and retry.';
      document.querySelector('#layers').disabled=false;
      document.querySelector('#start').disabled=false;
    }
  };
  window.finishRecording = async () => {
    if(stopped)return;stopped=true;
    document.querySelector('#stop').disabled=true;
    screenshotSwitch.disabled=true;captureButton.disabled=true;
    if(recorder && recorder.state!=='inactive')await new Promise(resolve=>{recorder.onstop=resolve;recorder.stop();});
    stream?.getTracks().forEach(track=>track.stop());
    await uploads;
    if(applied.audio) await post('audio-stop',JSON.stringify({timestamp:new Date().toISOString(),complete:!failure}),{'Content-Type':'application/json'});
    status.textContent='Saving…';await post('stop');status.textContent='Session saved.';
  };
  document.querySelector('#stop').onclick=()=>window.finishRecording().catch(error=>{status.textContent='Save failed: '+error.message;});
  </script></body></html>`;
}
