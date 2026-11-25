// ReelCut — browser-only video clip editor
const $ = s => document.querySelector(s);
const video = $('#video'), list = $('#list'), stage = document.querySelector('.stage'), cap = $('#cap');
const RATIOS = {
  v:{label:'Vertical 9:16',css:'9 / 16',n:9/16,w:720,h:1280,tag:'vertical'},
  s:{label:'Square 1:1',css:'1 / 1',n:1,w:1080,h:1080,tag:'square'},
  l:{label:'Landscape 16:9',css:'16 / 9',n:16/9,w:1280,h:720,tag:'landscape'}
};
let clips=[],nextId=1,pin={in:null,out:null},previewEnd=null,active=null,busy=false,objectUrl=null;
let embedMode=false,exportOK=true,linkSrc='',linkRetry=false,ytId='',liveCaptionText='';
const fmt=t=>isFinite(t)?`${Math.floor(t/60)}:${String(Math.floor(t%60)).padStart(2,'0')}`:'0:00';
const fmtTenth=t=>`${fmt(t)}.${Math.floor((t%1)*10)}`;
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const slug=s=>(s||'clip').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')||'clip';
const msg=t=>$('#msg').textContent=t;
const cstat=(c,t)=>{const el=document.querySelector(`.clip[data-id="${c.id}"] .cstat`);if(el)el.textContent=t};
const getClip=el=>clips.find(c=>c.id===+el.closest('.clip').dataset.id);
const applyFrame=k=>{const R=RATIOS[k];stage.style.setProperty('--r',R.css);stage.style.setProperty('--rn',R.n)};
const updateTc=()=>{$('#tc').textContent=`${fmtTenth(video.currentTime)} / ${fmt(video.duration)}`};

function loadFile(file){
  if(!file)return;
  if(!(file.type.startsWith('video/')||/\.(mp4|webm|mov|m4v)$/i.test(file.name))){msg('Choose an MP4, WebM or MOV file.');return}
  if(objectUrl)URL.revokeObjectURL(objectUrl);objectUrl=URL.createObjectURL(file);
  showMode(false);video.src=objectUrl;clips=[];pin={in:null,out:null};active=null;previewEnd=null;
  $('#fileName').textContent=file.name;$('#drop').hidden=true;$('#player').hidden=false;$('#changeBtn').hidden=false;$('#suggest').disabled=true;renderClips();msg('Loading…');
}
video.onloadedmetadata=()=>{$('#suggest').disabled=false;applyFrame('l');msg('');updateTc();};
video.onerror=()=>msg('This video could not be played. Try a different MP4 or WebM file.');
video.ontimeupdate=()=>{updateTc();if(previewEnd!==null&&video.currentTime>=previewEnd){video.pause();previewEnd=null}const cue=active&&$('#capToggle').checked?capText(active,video.currentTime):'';cap.textContent=cue;cap.hidden=!cue};

$('#setIn').onclick=()=>{pin.in=video.currentTime;if(pin.out!==null&&pin.out<=pin.in)pin.out=null};
$('#setOut').onclick=()=>{pin.out=video.currentTime};
$('#addClip').onclick=()=>{if(embedMode)return addEmbedClip();const start=pin.in??video.currentTime,end=Math.min(video.duration,pin.out??start+30);if(end-start<1)return msg('A clip needs at least one second.');clips.push({id:nextId++,title:`Clip ${clips.length+1}`,start,end,ratio:'v',caps:''});pin={in:null,out:null};renderClips();msg(`Added clip ${clips.length}: ${fmt(start)} to ${fmt(end)}.`)};
$('#suggest').onclick=()=>{const d=video.duration;if(!d)return;const n=Math.max(1,Math.min(8,Math.floor(d/30))),seg=d/n,len=Math.min(seg,45);for(let i=0;i<n;i++){const start=i*seg;clips.push({id:nextId++,title:n>1?`Part ${i+1} of ${n}`:'Full video',start,end:Math.min(d,start+len),ratio:'v',caps:''})}renderClips();msg(`Added ${n} segment${n>1?'s':''}.`)};

function renderClips(){
  $('#count').textContent=clips.length?clips.length:'';
  if(!clips.length){list.innerHTML='<p class="pin">No clips yet. Use Suggest segments or set in and out points.</p>';return}
  list.innerHTML=clips.map(c=>`<article class="clip" data-id="${c.id}"><input type="text" data-field="title" value="${esc(c.title)}" aria-label="Clip title"><div class="meta">${fmt(c.start)} → ${fmt(c.end)} · ${Math.round(c.end-c.start)}s</div><div class="acts"><select data-field="ratio">${Object.entries(RATIOS).map(([k,R])=>`<option value="${k}"${k===c.ratio?' selected':''}>${R.label}</option>`).join('')}</select><button class="btn ghost sm" data-act="preview">Preview</button><button class="btn sm" data-act="export"${exportOK?'':' disabled'}>Export</button><button class="btn ghost sm" data-act="captions">Captions</button><button class="btn ghost sm" data-act="srt">Download .srt</button><button class="btn ghost sm" data-act="remove">Remove</button></div><p class="cstat"></p><div class="capbox" hidden><textarea data-field="caps" placeholder="Caption lines, one per line">${esc(c.caps||'')}</textarea><div class="acts"><button class="btn ghost sm" data-act="fromlive">Use live captions</button><span class="pin">Timed across the clip.</span></div></div></article>`).join('');
}
list.onclick=e=>{const btn=e.target.closest('[data-act]');if(!btn)return;const c=getClip(btn),act=btn.dataset.act;if(act==='preview')preview(c);if(act==='export')exportClip(c);if(act==='captions'){const box=btn.closest('.clip').querySelector('.capbox');box.hidden=!box.hidden}if(act==='srt')downloadSrt(c);if(act==='fromlive'){const box=btn.closest('.clip').querySelector('.capbox');const text=liveCaptionText.split(/(?<=[.!?])\s+/).filter(Boolean).join('\n');if(!text)return cstat(c,'No live transcript yet.');box.querySelector('textarea').value=text;c.caps=text;cstat(c,'Filled from live captions.')}if(act==='remove'){clips=clips.filter(x=>x!==c);if(active===c)active=null;renderClips()}};
list.oninput=e=>{if(e.target.dataset.field==='title')getClip(e.target).title=e.target.value;if(e.target.dataset.field==='caps')getClip(e.target).caps=e.target.value};
list.onchange=e=>{if(e.target.dataset.field==='ratio'){const c=getClip(e.target);c.ratio=e.target.value;if(active===c)applyFrame(c.ratio)}};

function preview(c){if(embedMode)return previewEmbed(c);if(busy)return;active=c;applyFrame(c.ratio);previewEnd=c.end;video.currentTime=c.start;video.play().catch(()=>{})}
const seekTo=t=>new Promise(res=>{if(Math.abs(video.currentTime-t)<.05)return res();video.addEventListener('seeked',res,{once:true});video.currentTime=t});
const pickMime=()=>['video/mp4','video/webm;codecs=vp9','video/webm'].find(t=>MediaRecorder.isTypeSupported(t))||'';
function captionTimeline(c){const lines=(c.caps||'').split('\n').map(s=>s.trim()).filter(Boolean),chunks=[];for(const line of lines){const words=line.split(/\s+/);for(let i=0;i<words.length;i+=8)chunks.push(words.slice(i,i+8).join(' '))}if(!chunks.length)return[];const words=s=>s.split(/\s+/).length,total=chunks.reduce((a,s)=>a+words(s),0),dur=c.end-c.start;let t=c.start;return chunks.map(text=>{const end=t+dur*words(text)/total,q={start:t,end,text};t=end;return q})}
function capText(c,t){if(t<c.start||t>=c.end)return'';const q=captionTimeline(c).find(x=>t>=x.start&&t<x.end);return q?q.text:c.title}
function downloadSrt(c){const tl=captionTimeline(c);if(!tl.length)return cstat(c,'Add caption lines first.');const ts=s=>new Date(Math.max(0,s)*1000).toISOString().slice(11,23).replace('.',',');const body=tl.map((q,i)=>`${i+1}\n${ts(q.start-c.start)} --> ${ts(q.end-c.start)}\n${q.text}\n`).join('\n');const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([body],{type:'text/plain'}));a.download=`${slug(c.title)}.srt`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),15000);cstat(c,'Saved .srt file.')}

async function exportClip(c){
  if(busy)return;if(!window.MediaRecorder||!HTMLCanvasElement.prototype.captureStream)return cstat(c,'Recording is not supported. Try Chrome or Edge.');busy=true;
  const R=RATIOS[c.ratio],canvas=Object.assign(document.createElement('canvas'),{width:R.w,height:R.h}),ctx=canvas.getContext('2d'),media=canvas.captureStream(30),src=video.captureStream?.();
  src?.getAudioTracks().forEach(t=>media.addTrack(t));const mime=pickMime(),rec=new MediaRecorder(media,mime?{mimeType:mime}:undefined),chunks=[],stopped=new Promise(res=>rec.onstop=res);rec.ondataavailable=e=>{if(e.data.size)chunks.push(e.data)};
  let raf,useFaces=false,frameN=0,smoothX=.5,targetX=.5;
  const finish=()=>{cancelAnimationFrame(raf);if(rec.state!=='inactive')rec.stop();video.pause()};
  const draw=()=>{const vw=video.videoWidth,vh=video.videoHeight;ctx.fillStyle='#000';ctx.fillRect(0,0,R.w,R.h);if(vw){if(useFaces&&frameN%3===0)targetX=window.faceTracker?.centerX(video)??.5;frameN++;smoothX+=(targetX-smoothX)*.1;const ar=R.w/R.h;let sw=vw,sh=vw/ar;if(sh>vh){sh=vh;sw=vh*ar}const sx=Math.min(Math.max(smoothX*vw-sw/2,0),vw-sw);ctx.drawImage(video,sx,(vh-sh)/2,sw,sh,0,0,R.w,R.h)}const cue=capText(c,video.currentTime);if($('#capToggle').checked&&cue)drawCaption(ctx,cue,R.w,R.h);cstat(c,`Rendering ${Math.min(100,Math.round((video.currentTime-c.start)/(c.end-c.start)*100))}%`);if(video.currentTime>=c.end||video.ended||video.paused)return finish();raf=requestAnimationFrame(draw)};
  try{video.pause();active=c;if($('#faceToggle').checked){cstat(c,'Loading face model…');useFaces=!!await window.faceTracker?.load().then(()=>true,()=>false);if(!useFaces)msg('Face tracking unavailable; using a centered crop.')}await seekTo(c.start);rec.start(250);await video.play();draw();await stopped;const type=rec.mimeType||'video/webm',ext=type.includes('mp4')?'mp4':'webm',a=document.createElement('a');a.href=URL.createObjectURL(new Blob(chunks,{type}));a.download=`${slug(c.title)}-${RATIOS[c.ratio].tag}.${ext}`;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),15000);cstat(c,`Done. Saved ${a.download}.`)}catch{if(rec.state!=='inactive')rec.stop();cstat(c,'Export failed. Try again in Chrome or Edge.')}finally{busy=false}
}
function drawCaption(ctx,text,w,h){const size=Math.round(h*.045),lh=size*1.25;ctx.font=`600 ${size}px system-ui`;ctx.textAlign='center';ctx.textBaseline='middle';const lines=[],parts=text.split(/\s+/);let line='';for(const word of parts){const test=line?`${line} ${word}`:word;if(ctx.measureText(test).width>w*.84&&line){lines.push(line);line=word}else line=test}if(line)lines.push(line);const shown=lines.slice(0,3),top=h*.8-(shown.length-1)*lh/2;shown.forEach((l,i)=>{const y=top+i*lh,tw=ctx.measureText(l).width;ctx.fillStyle='rgba(0,0,0,.6)';ctx.fillRect(w/2-tw/2-size*.4,y-lh/2,tw+size*.8,lh);ctx.fillStyle='#fff';ctx.fillText(l,w/2,y)})}

const YT_RE=/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/|live\/)|youtu\.be\/)([\w-]{11})/;
function showMode(embed){embedMode=embed;exportOK=!embed;if(embed)video.pause();$('#yt').hidden=!embed;video.hidden=embed;$('#tc').hidden=embed;$('#setIn').hidden=embed;$('#setOut').hidden=embed;$('#times').hidden=!embed;$('#faceToggle').closest('label').hidden=embed}
function startLink(name){clips=[];pin={in:null,out:null};active=null;previewEnd=null;$('#fileName').textContent=name;$('#drop').hidden=true;$('#player').hidden=false;$('#changeBtn').hidden=false;$('#suggest').disabled=true;renderClips()}
function loadLink(raw){let u;try{u=new URL(raw)}catch{return $('#urlMsg').textContent='Paste a complete https:// link.'}const yt=raw.match(YT_RE);if(yt){ytId=yt[1];showMode(true);startLink(`YouTube ${ytId}`);$('#yt').src=`https://www.youtube.com/embed/${ytId}`;$('#urlMsg').textContent='Enter start and end times, then Add clip. Export requires an uploaded or direct video.';return}if(/\.(mp4|webm|mov|m4v)$/i.test(u.pathname)){linkSrc=u.href;showMode(false);startLink(u.pathname.split('/').pop()||'Linked video');video.crossOrigin='anonymous';video.src=linkSrc;$('#urlMsg').textContent='Loading link…';return}$('#urlMsg').textContent='Paste a direct .mp4 or .webm link, or a YouTube link.'}
function previewEmbed(c){active=c;applyFrame(c.ratio);$('#yt').src=`https://www.youtube.com/embed/${ytId}?start=${Math.floor(c.start)}&end=${Math.ceil(c.end)}&autoplay=1&rel=0`;cap.textContent=c.title;cap.hidden=!$('#capToggle').checked}
function addEmbedClip(){const parse=s=>{const p=String(s).split(':').map(Number);return p.length<4&&!p.some(isNaN)?p.reduce((a,v)=>a*60+v,0):NaN},start=parse($('#tStart').value),end=parse($('#tEnd').value);if(isNaN(start)||isNaN(end)||end-start<1)return msg('Enter start and end times, such as 0:42 and 1:05.');clips.push({id:nextId++,title:`Clip ${clips.length+1}`,start,end,ratio:'v',caps:''});renderClips();msg(`Added clip ${clips.length}.`)}
$('#urlGo').onclick=()=>loadLink($('#urlIn').value.trim());$('#urlIn').onkeydown=e=>{if(e.key==='Enter')loadLink(e.target.value.trim())};

const drop=$('#drop');$('#heroUpload').onclick=()=>{$('#editor').scrollIntoView({behavior:'smooth'});$('#file').click()};drop.onclick=()=>$('#file').click();drop.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();$('#file').click()}};['dragenter','dragover'].forEach(t=>drop.addEventListener(t,e=>{e.preventDefault();drop.classList.add('over')}));['dragleave','drop'].forEach(t=>drop.addEventListener(t,e=>{e.preventDefault();drop.classList.remove('over')}));drop.ondrop=e=>loadFile(e.dataTransfer.files[0]);$('#file').onchange=e=>loadFile(e.target.files[0]);$('#changeBtn').onclick=()=>$('#file').click();renderClips();

(()=>{const final=$('#liveFinal'),interim=$('#liveInterim'),btn=$('#liveBtn'),status=$('#liveStatus'),Speech=window.SpeechRecognition||window.webkitSpeechRecognition;if(!Speech){status.textContent='Live captions are not supported in this browser.';btn.disabled=true;return}const rec=new Speech();rec.continuous=true;rec.interimResults=true;let listening=false,all='';rec.onresult=e=>{let temp='';for(let i=e.resultIndex;i<e.results.length;i++){const r=e.results[i];if(r.isFinal){all+=r[0].transcript.trim()+' ';liveCaptionText=all.trim();final.textContent=all.slice(-300)}else temp+=r[0].transcript}interim.textContent=temp};rec.onerror=e=>{status.textContent='Error: '+e.error;if(e.error==='not-allowed')listening=false};rec.onend=()=>{if(listening)rec.start()};btn.onclick=()=>{if(listening){listening=false;rec.stop();btn.textContent='Start captions';status.textContent='Stopped.'}else{listening=true;rec.lang=$('#liveLang').value;rec.start();btn.textContent='Stop captions';status.textContent='Listening…'}}})();
