import {HouseViewer} from './viewer.js';
import {analyze, proposeAssignments, roomNames} from './vastu.js';

const $=id=>document.getElementById(id);
const safe=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const niceNames={living:'Hall / Living Room',bedroom:'Bedroom',kitchen:'Kitchen',bathroom:'Toilet / Bathroom',puja:'Puja Room',dining:'Dining Room',stairs:'Staircase',balcony:'Balcony',parking:'Parking',store:'Store Room',unknown:'',other:'Other Room'};
let image=null,file=null,rooms=[],openings=[],scanData=null,original=null,proposed=null,currentTicket=0,busy=false;
let ocrWorker=null;
let scanAbort=null,scanTicker=null,scanPreviewURL=null;
const scanMessages=[
  'नक्शे की फ़ाइल पढ़ी जा रही है…',
  'दीवारों और कमरों का लेआउट खोजा जा रहा है…',
  'लिखे हुए नाम और कमरे की सीमाएँ जाँची जा रही हैं…',
  '3D दृश्य के लिए नक्शे की जानकारी तैयार हो रही है…'
];
function stopScanVisual(){
  if(scanTicker){clearInterval(scanTicker);scanTicker=null;}
  if(scanPreviewURL){URL.revokeObjectURL(scanPreviewURL);scanPreviewURL=null;}
  $('scanPreview').removeAttribute('src');
  $('scanPreview').classList.add('hidden');
  $('scanPdfPreview').classList.add('hidden');
  $('scanExperience').classList.add('hidden');
  $('dropzone').classList.remove('hidden');
  document.body.classList.remove('is-scanning');
}
function startScanVisual(selected){
  stopScanVisual();
  $('scanStatus').classList.add('hidden');
  $('dropzone').classList.add('hidden');
  $('scanExperience').classList.remove('hidden');
  document.body.classList.add('is-scanning');
  const preview=$('scanPreview');
  if(selected.type.startsWith('image/')||/\.(png|jpe?g|webp)$/i.test(selected.name)){
    scanPreviewURL=URL.createObjectURL(selected);
    preview.src=scanPreviewURL;
    preview.classList.remove('hidden');
  }else{$('scanPdfPreview').classList.remove('hidden');}
  let n=0;
  $('scanPhase').textContent=scanMessages[n];
  scanTicker=setInterval(()=>{n=Math.min(n+1,scanMessages.length-1);$('scanPhase').textContent=scanMessages[n];},4400);
}

const toast=(msg)=>{const e=$('toast');e.textContent=msg;e.classList.remove('hidden');setTimeout(()=>e.classList.add('hidden'),4500)};
function visibleStage(id){$('uploadStage').classList.toggle('hidden',id!=='uploadStage');$('compareStage').classList.toggle('hidden',id!=='compareStage');window.scrollTo({top:0,behavior:'smooth'});}
function setStatus(msg,error=false){const el=$('scanStatus');el.textContent=msg;el.className='status'+(error?' error':'');}
function cleanup(){original?.dispose();proposed?.dispose();original=proposed=null;}
function reset(){currentTicket++;scanAbort?.abort();scanAbort=null;stopScanVisual();busy=false;cleanup();if(ocrWorker){ocrWorker.terminate().catch(()=>{});ocrWorker=null;}image=null;file=null;rooms=[];scanData=null;openings=[];$('fileInput').value='';$('scanStatus').classList.add('hidden');visibleStage('uploadStage');}
$('newBtn').onclick=reset;
$('cancelScanBtn').onclick=reset;
function selectFile(f){
 if(!f)return;
 if(!/\.(png|jpe?g|webp|pdf)$/i.test(f.name)){toast('PNG, JPG, WEBP ya PDF नक्शा चुनें');return;}
 if(f.size>12*1024*1024){toast('12 MB से छोटी file upload करें');return;}
 if(busy){toast('पहले वाला scan चल रहा है');return;}
 file=f;scan();
}
$('fileInput').onchange=e=>selectFile(e.target.files?.[0]);
const drop=$('dropzone');
for(const t of ['dragover','dragenter'])drop.addEventListener(t,e=>{e.preventDefault();drop.classList.add('dragging')});
for(const t of ['dragleave','drop'])drop.addEventListener(t,e=>{e.preventDefault();drop.classList.remove('dragging')});
drop.addEventListener('drop',e=>selectFile(e.dataTransfer.files?.[0]));
function loadImage(url){return new Promise((resolve,reject)=>{const im=new Image();im.onload=()=>resolve(im);im.onerror=()=>reject(Error('Uploaded floor plan image cannot be loaded'));im.src=url+(url.includes('?')?'&':'?')+'v='+Date.now();});}
function niceRoom(r,i){
 const n=String(r.name||'').trim();
 if(r.type==='unknown')return `क्षेत्र ${i+1}`;
 if(n&& !/^(room|unidentified|area)\s*\d+/i.test(n)&& !/\(confirm\)/i.test(n))return n;
 return niceNames[r.type]||'कमरा';
}
function autoScale(){
 const extracted=Number(scanData?.analysis?.width_estimate_feet);
 if(Number.isFinite(extracted)&&extracted>=8&&extracted<=200)return{feet:extracted,fromDrawing:true};
 return{feet:40,fromDrawing:false}; // Unmeasured preview scale; hidden from user, proportions preserved.
}
async function scan(){
 const ticket=++currentTicket;
 busy=true;
 visibleStage('uploadStage');startScanVisual(file);
 scanAbort=new AbortController();
 const data=new FormData();data.append('plan',file,file.name);
 try{
  const res=await fetch('api/scan.php',{method:'POST',body:data,cache:'no-store',signal:scanAbort.signal});
  const response=await res.json().catch(()=>({ok:false,error:'Server returned invalid response'}));
  if(ticket!==currentTicket)return;
  if(!res.ok||!response.ok)throw Error(response.error||'Scanner did not finish');
  scanData=response;
  image=await loadImage(response.upload_url);
  if(ticket!==currentTicket)return;
  rooms=(response.rooms||[]).filter(r=>Array.isArray(r.polygon)&&r.polygon.length>=3).map((r,i)=>({
   ...r, id:String(r.id||`r${i+1}`),type:String(r.type||'unknown'),
   polygon:r.polygon.map(p=>[Math.min(1,Math.max(0,+p[0])),Math.min(1,Math.max(0,+p[1]))]),
   name:niceRoom(r,i)
  }));
  openings=Array.isArray(response.openings)?response.openings:[];
  if(!rooms.length){stopScanVisual();setStatus('इस नक्शे में दीवारों से बंद room boundaries reliably detect नहीं हो पाईं। कृपया साफ़, सीधा 2D floor plan upload करें।',true);return;}
  stopScanVisual();
  showResult();
  if(rooms.some(r=>r.type==='unknown'))void runBrowserOCR(ticket);
 }catch(err){if(ticket===currentTicket){stopScanVisual();if(err.name!=='AbortError')setStatus('Scan fail हुआ: '+err.message+'। Apache और Python scanner check करें या साफ नक्शा चुनें।',true);}}
 finally{if(ticket===currentTicket){busy=false;scanAbort=null;}}
}
function showResult({keepScroll=false}={}){
 if(!rooms.length||!image)return;
 const scale=autoScale();
 const bounds=scanData?.plan_bounds;
 const spanX=Array.isArray(bounds)&&bounds.length===2?Math.max(.15,Number(bounds[1][0])-Number(bounds[0][0])):1;
 const spanY=Array.isArray(bounds)&&bounds.length===2?Math.max(.15,Number(bounds[1][1])-Number(bounds[0][1])):1;
 const ratio=Math.max(.25,Math.min(4,(image.naturalHeight*spanY)/(image.naturalWidth*spanX)));
 const walls=Array.isArray(scanData?.walls)?scanData.walls:[];
 const north='top'; // Cannot infer actual compass orientation if it is absent in the drawing.
 const report=analyze(rooms,north);
 const proposal=proposeAssignments(rooms,north);
 cleanup();
 if(!keepScroll||$('compareStage').classList.contains('hidden'))visibleStage('compareStage');
 try{
  original=new HouseViewer($('originalViewer'));proposed=new HouseViewer($('vastuViewer'));
  original.init(rooms,openings,scale.feet,ratio,{north,recommendations:report,walls});
  proposed.init(proposal.rooms,openings,scale.feet,ratio,{suggested:true,north,recommendations:analyze(proposal.rooms,north),walls});
 }catch(err){console.error(err);toast('3D open नहीं हो पाया: '+err.message);return;}
 const known=rooms.filter(r=>r.type!=='unknown').length;
 $('autoSummary').textContent=`${rooms.length} पहचाने हुए हिस्से · ${known} के नाम पढ़े गए · ${walls.length} दीवार रेखाएँ`;
 $('autoWarnings').textContent='नक्शे की दीवारें image से पढ़ी गई हैं, लेकिन खुले कमरों की सीमाएँ और dimensions अनुमानित हैं। Furniture व garden सजावट illustrative है। North arrow न मिलने पर ऊपर को North मानकर Vastu का अस्थायी सुझाव दिया गया है।';
 renderReport(report, proposal);
}
function renderReport(data, proposal){
 const good=$('goodCards'),review=$('reviewCards'),unknown=$('unknownCards');
 good.replaceChildren();review.replaceChildren();unknown.replaceChildren();
 let counts={good:0,review:0,unknown:0};
 function item(parent,kind,name,desc){
  const div=document.createElement('div');div.className='insight-item';
  const badge=document.createElement('span');badge.className='insight-marker';badge.textContent=kind==='good'?'✓':kind==='review'?'!':'?';badge.setAttribute('aria-hidden','true');
  const copy=document.createElement('div');copy.className='insight-copy';
  const title=document.createElement('b');title.textContent=name;copy.append(title);
  if(desc){const p=document.createElement('p');p.textContent=desc;copy.append(p)}
  div.append(badge,copy);parent.append(div);
 }
 data.forEach((r,i)=>{
  const name=niceRoom(rooms[i],i);
  if(r.status==='good'){
   counts.good++;
   item(good,'good',name,`${r.currentLabel||'वर्तमान स्थान'} में है — पारंपरिक वास्तु अनुसार उपयुक्त।`);
  }else if(r.status==='review'){
   counts.review++;
   item(review,'review',name,`अभी: ${r.currentLabel||'दिशा स्पष्ट नहीं'}। ${r.suggestion||'दिशा की जाँच करें।'}`);
  }else{
   counts.unknown++;
   item(unknown,'unknown',name,'नक्शे से कमरे का उपयोग स्पष्ट नहीं पढ़ा जा सका।');
  }
 });
 $('goodCount').textContent=counts.good;
 $('reviewCount').textContent=counts.review;
 $('unknownCount').textContent=counts.unknown;
 if(!counts.good)good.innerHTML='<div class="empty-note">इस नक्शे में अभी कोई confirmed सही कमरा नहीं मिला।</div>';
 if(!counts.review)review.innerHTML='<div class="empty-note">अभी किसी पहचाने हुए कमरे के लिए बदलाव की सलाह नहीं है।</div>';
 if(!counts.unknown)unknown.innerHTML='<div class="empty-note">✓ सभी detected कमरों की पहचान मिल गई।</div>';
}
for(const btn of document.querySelectorAll('[data-view]'))btn.onclick=()=>{
 const v=btn.dataset.side==='original'?original:proposed;
 if(!v)return;
 if(btn.dataset.view==='png'){v.png();return;}
 v.setView(btn.dataset.view);
 for(const sibling of document.querySelectorAll(`[data-side="${btn.dataset.side}"][data-view]`)){
  if(sibling.dataset.view!=='png')sibling.classList.toggle('active',sibling===btn);
 }
};
// Functional navigation: no dummy links.
function jumpTo(id){const target=$(id);if(!target||target.classList.contains('hidden'))return false;target.scrollIntoView({behavior:'smooth',block:'start'});return true;}
$('homeLink').addEventListener('click',e=>{e.preventDefault();reset();});
$('brandLink').addEventListener('click',e=>{e.preventDefault();reset();});
$('plannerLink').addEventListener('click',e=>{e.preventDefault();if(!jumpTo('compareStage'))jumpTo('uploadStage');});
$('vastuLink').addEventListener('click',e=>{e.preventDefault();if(!jumpTo('vastuReport'))jumpTo('uploadStage');});
$('reportsLink').addEventListener('click',e=>{e.preventDefault();if(!jumpTo('vastuReport'))jumpTo('uploadStage');});
function classify(text){
 const t=String(text||'').toLowerCase().replace(/[._\-/]+/g,' ').replace(/\s+/g,' ').trim();
 const patterns=[['bedroom',/\b(bedroom|bed\s*room|master\s*bed|m\s*bed)\b/],['kitchen',/\b(kitchen|kitc?hen|cook\s*room|kitch)\b/],['bathroom',/\b(toilet|bathroom|bath\s*room|w\s*c|washroom|restroom|wc)\b/],['living',/\b(living|drawing|hall|lounge|family\s*room)\b/],['puja',/\b(puja|pooja|mandir|prayer)\b/],['dining',/\b(dining)\b/],['stairs',/\b(stairs|staircase|stair)\b/],['balcony',/\b(balcony|veranda|verandah|terrace)\b/],['parking',/\b(parking|garage)\b/],['store',/\b(store|utility|pantry)\b/]];
 return patterns.find(([_,p])=>p.test(t))?.[0]||'unknown';
}
function inside(p,poly){const [x,y]=p;let yes=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){const [xi,yi]=poly[i],[xj,yj]=poly[j];if((yi>y)!==(yj>y)&&x<(xj-xi)*(y-yi)/(yj-yi+1e-10)+xi)yes=!yes;}return yes;}
function wordCandidates(data){
 let lines=[];
 if(data.blocks?.length)for(const b of data.blocks)for(const p of b.paragraphs||[])for(const l of p.lines||[])lines.push(l.words||[]);
 if(!lines.length)lines=(data.lines||[]).map(l=>l.words||[]);
 if(!lines.length&&data.words)lines=data.words.map(w=>[w]);
 const out=[];
 for(const words of lines){
  const all=words.filter(w=>w.bbox&&(Number(w.confidence??w.conf??0)>25));
  for(let i=0;i<all.length;i++){
   const a=all[i];out.push({text:a.text,bbox:a.bbox});
   if(i+1<all.length){const b=all[i+1];out.push({text:a.text+' '+b.text,bbox:{x0:Math.min(a.bbox.x0,b.bbox.x0),x1:Math.max(a.bbox.x1,b.bbox.x1),y0:Math.min(a.bbox.y0,b.bbox.y0),y1:Math.max(a.bbox.y1,b.bbox.y1)}});}
  }
 }
 return out;
}
async function getTesseract(){
 if(window.Tesseract?.createWorker)return window.Tesseract;
 await new Promise((resolve,reject)=>{const s=document.createElement('script');s.src='https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';s.onload=resolve;s.onerror=()=>reject(Error('Browser OCR library unavailable'));document.head.append(s);});
 return window.Tesseract;
}
async function runBrowserOCR(ticket){
 const p=$('ocrProgress');p.classList.remove('hidden');p.textContent='🔍 नक्शे में छोटे room names पढ़ रहे हैं…';
 const deadline=new Promise((_,reject)=>setTimeout(()=>reject(Error('OCR timed out')),90000));
 try{
  await Promise.race([(async()=>{
   const engine=await getTesseract();if(ticket!==currentTicket)return;
   const worker=ocrWorker=await engine.createWorker('eng',1,{logger:()=>{}});
   if(ticket!==currentTicket)return;
   // Upscale original map for text OCR; Tesseract returns positions in this canvas.
   const scale=Math.min(2.3,3000/Math.max(image.naturalWidth,image.naturalHeight));
   const c=document.createElement('canvas');c.width=Math.round(image.naturalWidth*scale);c.height=Math.round(image.naturalHeight*scale);
   const g=c.getContext('2d',{willReadFrequently:true});g.fillStyle='white';g.fillRect(0,0,c.width,c.height);g.drawImage(image,0,0,c.width,c.height);
   const result=await worker.recognize(c,{}, {blocks:true});if(ticket!==currentTicket)return;
   const words=wordCandidates(result.data||{});let found=0;
   for(const w of words){
    const typ=classify(w.text);if(typ==='unknown')continue;
    const x=(w.bbox.x0+w.bbox.x1)/2/c.width, y=(w.bbox.y0+w.bbox.y1)/2/c.height;
    const region=rooms.find(r=>r.type==='unknown'&&inside([x,y],r.polygon));
    if(!region)continue;
    region.type=typ;region.name=niceNames[typ]||typ;region.origin='browser_ocr';found++;
   }
   if(found){showResult({keepScroll:true});p.textContent=`✓ OCR से ${found} और room names पढ़े गए।`;}
   else p.textContent='ℹ कुछ कमरे बिना नाम के हैं; उनसे कोई गलत Vastu दावा नहीं किया गया है।';
  })(),deadline]);
 }catch(e){if(ticket===currentTicket)p.textContent='ℹ अतिरिक्त OCR इस browser/network में उपलब्ध नहीं हुआ; उपलब्ध scan result दिखाया गया है।';console.warn('OCR fallback',e);}
 finally{if(ocrWorker){ocrWorker.terminate().catch(()=>{});ocrWorker=null;}}
}
