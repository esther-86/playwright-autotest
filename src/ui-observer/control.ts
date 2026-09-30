export function controlHTML(chunkMs: number): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>UI Observe — recording controls</title>
  <style>body{font:17px system-ui;max-width:680px;margin:64px auto;padding:24px;background:#f4f6fa;color:#172331}button{padding:12px 20px;font:inherit;margin:8px 8px 8px 0}#status{white-space:pre-wrap}small{color:#526174}</style></head>
  <body><h1>Record your workflow</h1><p>Your browser profile remembers logins. This session saves full local UI, network, HTML, screenshots and narration.</p>
  <button id="start">Start microphone & open application</button><button id="stop" disabled>Stop & save session</button>
  <p id="status">Ready. Microphone permission will be requested when you start.</p>
  <small>Keep this control tab open. Use Stop & save for a complete audio file. Raw artifacts are not sent to AI.</small>
  <script>
  let recorder, stream, uploads = Promise.resolve(), stopped = false, failure;
  const status = document.querySelector('#status');
  const post = async (path, body, headers) => {const res=await fetch(location.pathname+path,{method:'POST',body,headers});if(!res.ok)throw new Error('Capture request failed: '+path);return res;};
  document.querySelector('#start').onclick = async () => {
    document.querySelector('#start').disabled=true;
    try {
      stream=await navigator.mediaDevices.getUserMedia({audio:true});
      const mimeType=['audio/webm;codecs=opus','audio/webm'].find(type=>MediaRecorder.isTypeSupported(type));
      if(!mimeType) throw new Error('WebM microphone recording is unsupported');
      recorder=new MediaRecorder(stream,{mimeType});
      recorder.ondataavailable=e=>{if(e.data.size)uploads=uploads.then(()=>post('audio',e.data,{'Content-Type':mimeType})).catch(error=>{failure=error;status.textContent='Audio save failed. Stop and inspect capture issues.';});};
      await post('audio-start',JSON.stringify({timestamp:new Date().toISOString(),mimeType}),{'Content-Type':'application/json'});
      recorder.start(${chunkMs});
      await post('start');
      document.querySelector('#stop').disabled=false;
      status.textContent='Recording microphone and browser. Switch to the application tab and narrate your intent.';
    } catch(error) {
      if(recorder && recorder.state!=='inactive')recorder.stop();
      stream?.getTracks().forEach(track=>track.stop());
      await uploads;
      status.textContent='Could not start: '+error.message+'\\nCheck microphone permission and retry.';
      document.querySelector('#start').disabled=false;
    }
  };
  window.finishRecording = async () => {
    if(stopped)return;stopped=true;
    document.querySelector('#stop').disabled=true;
    if(recorder && recorder.state!=='inactive')await new Promise(resolve=>{recorder.onstop=resolve;recorder.stop();});
    stream?.getTracks().forEach(track=>track.stop());
    await uploads;
    await post('audio-stop',JSON.stringify({timestamp:new Date().toISOString(),complete:!failure}),{'Content-Type':'application/json'});
    status.textContent='Saving…';await post('stop');status.textContent='Session saved.';
  };
  document.querySelector('#stop').onclick=()=>window.finishRecording().catch(error=>{status.textContent='Save failed: '+error.message;});
  </script></body></html>`;
}
