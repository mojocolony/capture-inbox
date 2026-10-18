/* Capture Inbox 0.1 — private Dropbox-backed browser application.
   No third-party JS dependencies; token credentials are never baked into the site.
*/
'use strict';
const $ = id => document.getElementById(id);
const by = (tag, cls, value) => {const el = document.createElement(tag);if(cls)el.className=cls;if(value!==undefined)el.textContent=value;return el;};
const STORAGE_KEY = 'capture-inbox-settings-v1';
const FONT_SIZE_KEY = 'capture-inbox-font-size-v0.2';
const APP_VERSION = '0.7.0';
const REMEMBER_KEY = 'capture-inbox-remember-v0.3';
const PERSISTENT_TOKEN_KEY = 'capture-inbox-persistent-session-v0.3';
const TOKEN_KEY = 'capture-inbox-session-v1';
const OAUTH_PENDING_KEY = 'capture-inbox-oauth-v1';
const defaultSettings = {clientId:'', folder:'/Apps/Capture Inbox'};
function getSettings(){try{return {...defaultSettings,...JSON.parse(localStorage.getItem(STORAGE_KEY)||'{}')};}catch{return {...defaultSettings};}}
let settings=getSettings();
const app = {demo:true,view:'inbox',source:'all',tag:'all',search:'',entries:[],allGroups:[],limit:200,selectedId:null,review:{},confirmedReview:{},reviewRev:null,token:null,refreshToken:null,expires:0,busy:false,loading:false,imageUrl:null,imageFor:null,loadError:null};
const demoRecords = [
 {id:'demo01',source:'Messages',title:'Pick up the right shampoo',content:'Could you please get the EverPure Bond Repair shampoo when you go to the shop? The one in the light purple bottle. Thanks!',details:'Conversation: Family',date:'2026-10-18T09:15:00-04:00',status:'inbox',kind:'Message',note:''},
 {id:'demo02',source:'Google Chrome',title:'New restaurant to try',content:'A thoughtful neighbourhood restaurant serving seasonal Italian cooking. Save this for a possible dinner next month.',details:'TITLE: A restaurant worth the trip\nURL: https://example.com/restaurant-review',date:'2026-10-18T08:47:00-04:00',status:'inbox',kind:'Webpage',note:'Maybe for a Saturday evening.'},
 {id:'demo03',source:'Spark',title:'Tickets for Saturday’s play',content:'Your tickets are confirmed. Two seats. Doors open at 7:00 PM and the performance begins at 7:30 PM. Present your tickets at the entrance.',details:'URL: readdle-spark://bl=example',date:'2026-10-17T14:25:00-04:00',status:'inbox',kind:'Email',note:''},
 {id:'demo04',source:'Messenger',title:'Reply about concert transportation',content:'Have you worked out how we’re getting to the concert? Are we taking one car or meeting there?',details:'Conversation: Friend',date:'2026-10-17T12:03:00-04:00',status:'act',kind:'Message',note:'Check whether everyone can get a ride.'},
 {id:'demo05',source:'Safari',title:'A photography technique to remember',content:'Working with indirect natural light, the photographer positioned the subject beside a large window for soft shadows and gentle contrast.',details:'TITLE: Seeing light differently\nURL: https://example.com/photography',date:'2026-10-15T19:02:00-04:00',status:'keep',kind:'Webpage',note:''}
];
function toast(message){const e=$('toast');e.textContent=message;e.classList.add('visible');clearTimeout(toast.timer);toast.timer=setTimeout(()=>e.classList.remove('visible'),3300);}
function warn(message){const bar=$('message-bar');bar.hidden=false;bar.textContent=message;}
function clearWarn(){$('message-bar').hidden=true;$('message-bar').textContent='';}
function friendlyDate(s,withYear=false){const d=new Date(s);if(Number.isNaN(d.getTime()))return s||'Unknown date';return d.toLocaleString(undefined,withYear?{year:'numeric',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}:{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});}
function ageLabel(s){const d=new Date(s);if(Number.isNaN(d.getTime()))return '';const delta=Date.now()-d.getTime();if(delta>=0&&delta<86400000)return d.toLocaleTimeString(undefined,{hour:'numeric',minute:'2-digit'});return d.toLocaleDateString(undefined,{month:'short',day:'numeric'});}
function safeLink(raw){const match=(raw||'').match(/(?:https?:\/\/|readdle-spark:\/\/)[^\s<>'"\]\)]+/i);if(!match)return null;const url=match[0].replace(/[.,;!?]+$/,'');try{const parsed=new URL(url);return ['https:','http:','readdle-spark:'].includes(parsed.protocol)?url:null;}catch{return null;}}
function parseTxt(content){const lines=content.replace(/\r\n/g,'\n').split('\n');const index=lines.findIndex(l=>/^CONTENT:\s*/i.test(l));const head=lines.slice(0,index<0?lines.length:index);const find=key=>{const row=head.find(l=>l.toUpperCase().startsWith(key+':'));return row?row.slice(key.length+1).trim():'';};const detIndex=head.findIndex(l=>/^SOURCE DETAILS:/i.test(l));let details='';if(detIndex>=0){const rest=head.slice(detIndex+1).findIndex(l=>/^(SOURCE|CAPTURED|STATUS):\s*/i.test(l));const stop=rest<0?head.length:detIndex+1+rest;details=head[detIndex].replace(/^SOURCE DETAILS:\s*/i,'');const following=head.slice(detIndex+1,stop).join('\n').trim();if(following)details+=(details?'\n':'')+following;}
 return {source:find('SOURCE')||'Unknown',details:details.trim(),date:find('CAPTURED')||'',content:index<0?content.trim():lines.slice(index+1).join('\n').trim()};}
function inferTitle(r){const m=(r.details||'').match(/(?:^|\n)TITLE:\s*([^\n]+)/i);if(m)return m[1].trim();const meaningful=(r.content||'').split('\n').map(x=>x.trim()).find(x=>x.length>8&&!/^(Today|Yesterday|Messages|Reply|Sent)$/i.test(x));if(!meaningful)return 'Untitled capture';return meaningful.length>78?meaningful.slice(0,77).trimEnd()+'…':meaningful;}
function kindFor(source){if(/Chrome|Safari|Firefox|Edge|Brave/i.test(source))return 'Webpage';if(/Spark|Mail|Gmail|Outlook/i.test(source))return 'Email';if(/Messages|Messenger|WhatsApp|Signal|Telegram/i.test(source))return 'Message';return 'Capture';}
function iconFor(source){if(/Chrome|Safari|Firefox|Edge|Brave/i.test(source))return '↗';if(/Spark|Mail|Gmail|Outlook/i.test(source))return '✉';if(/Messages|Messenger|WhatsApp|Signal/i.test(source))return '••';return '◫';}
function records(){return app.demo?demoRecords:app.entries;}
function reviewFor(item){const r=app.demo?item:app.review[item.id]||{};return {status:r.status||'inbox',note:r.note||'',title:r.customTitle||r.title||'',previousStatus:r.previousStatus||'inbox',tags:Array.isArray(r.tags)?r.tags:[]};}
function normalTag(value){return String(value||'').trim().replace(/\s+/g,' ').slice(0,40);}
function knownTags(){const source=app.demo?demoRecords:Object.values(app.review);const tags=new Map();for(const record of source){if(!Array.isArray(record.tags))continue;for(const name of record.tags){const tag=normalTag(name);if(tag&&!tags.has(tag.toLocaleLowerCase()))tags.set(tag.toLocaleLowerCase(),tag);}}return [...tags.values()].sort((a,b)=>a.localeCompare(b));}

function displayTitle(item){return reviewFor(item).title||item.title;}
function cancelTitleEdit(){$('title-editor').hidden=true;$('title-edit-status').textContent='';}
function beginTitleEdit(){
 const record=records().find(x=>x.id===app.selectedId);if(!record)return;
 $('title-input').value=displayTitle(record);
 $('title-edit-status').textContent='';
 $('title-editor').hidden=false;
 $('title-input').focus();$('title-input').select();
}
async function saveTitleEdit(){
 const id=app.selectedId,record=records().find(x=>x.id===id);
 if(!record)return;
 const title=$('title-input').value.trim().replace(/\s+/g,' ');
 if(!title){$('title-edit-status').textContent='Enter a title.';return;}
 if(title===displayTitle(record)){cancelTitleEdit();return;}
 $('save-title').disabled=true;$('title-edit-status').textContent='Saving…';
 const ok=await persistChange(id,{title});
 $('save-title').disabled=false;
 if(ok){$('title-editor').hidden=true;$('title-edit-status').textContent='';}
 else $('title-edit-status').textContent='Could not save. Please try again.';
}
function applyFontSize(size){
 const selected=['s','m','l'].includes(size)?size:'m';
 document.body.dataset.fontSize=selected;
 try{localStorage.setItem(FONT_SIZE_KEY,selected);}catch{}
 for(const control of document.querySelectorAll('[data-font-size]')){
  const active=control.dataset.fontSize===selected;
  control.setAttribute('aria-pressed',String(active));
  control.classList.toggle('active',active);
 }
}
function captureDate(record){
 const match=String(record.id||'').match(/^(\d{4})-(\d{2})-(\d{2})_(\d{2})-(\d{2})-(\d{2})/);
 if(match){
  const [year,month,day,hour,minute,second]=match.slice(1).map(Number);
  const d=new Date(year,month-1,day,hour,minute,second);
  if(d.getFullYear()===year&&d.getMonth()===month-1&&d.getDate()===day)return d;
 }
 const fallback=new Date(record.date||'');
 return Number.isNaN(fallback.getTime())?null:fallback;
}
function compareCaptures(a,b){
 const at=captureDate(a)?.getTime()??Number.NEGATIVE_INFINITY;
 const bt=captureDate(b)?.getTime()??Number.NEGATIVE_INFINITY;
 if(at!==bt)return bt-at;
 return String(b.id).localeCompare(String(a.id));
}
function dateKey(d){return Date.UTC(d.getFullYear(),d.getMonth(),d.getDate())/86400000;}
function groupForCapture(d,now=new Date()){
 if(!d)return 'Undated';
 const days=dateKey(now)-dateKey(d);
 if(days===0)return 'Today';
 if(days===1)return 'Yesterday';
 const today=new Date(now.getFullYear(),now.getMonth(),now.getDate());
 const monday=new Date(today);
 monday.setDate(today.getDate()-((today.getDay()+6)%7));
 const lastMonday=new Date(monday);
 lastMonday.setDate(monday.getDate()-7);
 if(d>=monday&&d<today)return 'Earlier This Week';
 if(d>=lastMonday&&d<monday)return 'Last Week';
 if(d.getFullYear()===today.getFullYear()&&d.getMonth()===today.getMonth())return 'Earlier This Month';
 const lastMonth=new Date(today.getFullYear(),today.getMonth()-1,1);
 if(d.getFullYear()===lastMonth.getFullYear()&&d.getMonth()===lastMonth.getMonth())return 'Last Month';
 return d.toLocaleDateString(undefined,{month:'long',year:'numeric'});
}
function captureClock(r){
 const d=captureDate(r);
 return d?d.toLocaleTimeString(undefined,{hour:'numeric',minute:'2-digit'}):'';
}
function filteredRecords(){return records().filter(r=>{const status=reviewFor(r).status;if(app.view==='all'&&status==='trash')return false;if(app.view!=='all'&&status!==app.view)return false;if(app.source!=='all'&&r.source!==app.source)return false;if(app.tag!=='all'&&!reviewFor(r).tags.some(t=>t.toLocaleLowerCase()===app.tag.toLocaleLowerCase()))return false;const q=app.search.trim().toLowerCase();if(q&&!(`${displayTitle(r)}\n${r.title}\n${r.content}\n${r.source}\n${r.details}\n${reviewFor(r).note}\n${reviewFor(r).tags.join(' ')}`).toLowerCase().includes(q))return false;return true;});}
const statuses={trash:['Trash','RECOVERABLE CAPTURES','Restore anything removed by mistake.'],inbox:['Inbox','NEEDS YOUR ATTENTION','Things you’ve saved for later.'],act:['Act','THINGS TO FOLLOW UP','Questions, errands and next steps.'],keep:['Keep','WORTH HOLDING ON TO','Good information to remember.'],dismiss:['Dismiss','ALREADY REVIEWED','Nothing further to do.'],all:['All captures','YOUR CAPTURE LIBRARY','Everything collected in one place.']};
function nodeItem(r){const item=by('button','capture-item'+(app.selectedId===r.id?' active':''));item.type='button';item.dataset.id=r.id;const header=by('div','item-top');header.append(by('span','source-icon',iconFor(r.source)),by('span','source-name',r.source),by('span','item-time',captureClock(r)));item.append(header,by('h3','',displayTitle(r)),by('p','',r.content||'No readable text found. See original screenshot.'));const bottom=by('div','item-bottom');bottom.append(by('span','type-tag',r.kind||kindFor(r.source)));if(r.imagePath||app.demo)bottom.append(by('span','type-tag','▧ Screenshot'));const status=reviewFor(r).status;if(status!=='inbox')bottom.append(by('span','item-state '+status,status.charAt(0).toUpperCase()+status.slice(1)));item.append(bottom);const tags=reviewFor(r).tags;if(tags.length){const tagRow=by('div','item-tags');for(const name of tags.slice(0,3))tagRow.append(by('span','item-tag',name));if(tags.length>3)tagRow.append(by('span','item-tag-more','+'+(tags.length-3)));item.append(tagRow);}item.addEventListener('click',()=>selectItem(r.id));
 const wrap=by('div','capture-row');wrap.append(item);
 if(reviewFor(r).status!=='trash'){
  const action=by('button','capture-trash-button');action.append(document.querySelector('[data-view="trash"] .lucide').cloneNode(true));
  action.type='button';action.setAttribute('aria-label','Move '+displayTitle(r)+' to Trash');action.title='Move to Trash';
  action.addEventListener('click',e=>{e.stopPropagation();moveToTrash(r.id);});
  wrap.append(action);
 }else{
  const action=by('button','capture-restore-button');action.append(document.querySelector('#restore-capture .lucide').cloneNode(true));
  action.type='button';action.setAttribute('aria-label','Restore '+displayTitle(r));action.title='Restore capture';
  action.addEventListener('click',e=>{e.stopPropagation();restoreFromTrash(r.id);});
  wrap.append(action);
 }
 return wrap;}
function render(){const list=filteredRecords().sort(compareCaptures),all=records();const [label,eyebrow,sub]=statuses[app.view];$('view-title').textContent=label;$('view-counter').textContent=list.length;for(const status of ['inbox','act','keep','dismiss','trash'])$(status+'-count').textContent=all.filter(x=>reviewFor(x).status===status).length;for(const el of document.querySelectorAll('.nav-btn')){el.classList.toggle('active',el.dataset.view===app.view);el.setAttribute('aria-current',el.dataset.view===app.view?'page':'false');}
 const filter=$('source-filter'),prev=filter.value;filter.replaceChildren(new Option('All sources','all'));const sources=[...new Set(all.map(r=>r.source))].sort();for(const source of sources)filter.append(new Option(source,source));filter.value=sources.includes(app.source)?app.source:'all';
 const tagFilter=$('tag-filter'),tags=knownTags();tagFilter.replaceChildren(new Option('All tags','all'));for(const name of tags)tagFilter.append(new Option(name,name));app.tag=tags.find(t=>t.toLocaleLowerCase()===app.tag.toLocaleLowerCase())||'all';tagFilter.value=app.tag;
 const target=$('capture-list');target.replaceChildren();if(!list.length){const box=by('div','empty-list');box.append(by('strong','',app.loading?'Loading captures…':'Nothing here yet.'),by('span','',app.loading?'Retrieving your text records from Dropbox.':'Try another view or clear your search.'));target.append(box);}else{let lastHeading=null;const now=new Date();for(const item of list){const heading=groupForCapture(captureDate(item),now);if(heading!==lastHeading){const node=by('div','date-group-heading',heading);node.setAttribute('role','heading');node.setAttribute('aria-level','2');target.append(node);lastHeading=heading;}target.append(nodeItem(item));}}
 $('load-more').hidden=app.demo||app.loading||app.limit>=app.allGroups.length;$('load-more').textContent=`Load older captures (${Math.min(200,app.allGroups.length-app.limit)} more)`;$('status-dot').classList.toggle('connected',!app.demo&&!!app.token);$('connection-label').textContent=app.demo?'Not connected':app.token?'Connected':'Not connected';
 if(app.selectedId){const selected=all.find(r=>r.id===app.selectedId);if(selected)renderDetail(selected);else deselect();}}
function deselect(){$('title-editor').hidden=true;app.selectedId=null;$('detail-placeholder').hidden=false;$('detail-content').hidden=true;document.querySelector('.workspace').classList.remove('show-detail');}
function openImage(r){if(app.demo){$('image-shell').replaceChildren();const preview=by('div','faux-shot');preview.style.cssText='width:100%;min-height:170px;border:1px solid #dddfe1;border-radius:8px;background:#fbfaf7;padding:22px;box-shadow:0 6px 24px #0001';preview.append(by('div','','▣  '+r.source),by('hr'),by('p','',r.content));$('image-shell').append(preview);$('open-image').hidden=true;return;}
 const shell=$('image-shell');shell.replaceChildren(by('p','','Loading original screenshot…'));$('open-image').hidden=true;if(!r.imagePath){shell.replaceChildren(by('p','','No matching screenshot was found in Dropbox.'));return;}
 const id=r.id;const urlKey=r.imagePath;if(app.imageUrl){URL.revokeObjectURL(app.imageUrl);app.imageUrl=null;}
 downloadFile(r.imagePath).then(blob=>{if(app.selectedId!==id)return;const url=URL.createObjectURL(blob);app.imageUrl=url;const img=by('img');img.alt='Original captured screenshot';img.src=url;img.addEventListener('error',()=>shell.replaceChildren(by('p','','This screenshot could not be displayed.')));shell.replaceChildren(img);$('open-image').hidden=false;}).catch(err=>{if(app.selectedId===id)shell.replaceChildren(by('p','','Could not load image: '+cleanError(err)));});}
function renderTagEditor(r){
 const tags=reviewFor(r).tags,container=$('detail-tags');container.replaceChildren();
 if(!tags.length)container.append(by('span','tag-empty','No tags yet'));
 for(const name of tags){
  const chip=by('span','tag-chip'),remove=by('button','tag-remove','×');remove.type='button';remove.title='Remove '+name;remove.setAttribute('aria-label','Remove tag '+name);
  remove.addEventListener('click',()=>removeTag(r.id,name));chip.append(by('span','',name),remove);container.append(chip);
 }
 const dl=$('known-tags');dl.replaceChildren();for(const name of knownTags())dl.append(new Option(name,name));
}
function renderDetail(r){renderTagEditor(r);$('trash-capture').hidden=reviewFor(r).status==='trash';$('trash-detail-actions').hidden=reviewFor(r).status!=='trash';$('detail-content').querySelector('.review-actions').hidden=reviewFor(r).status==='trash';$('detail-placeholder').hidden=true;$('detail-content').hidden=false;$('detail-date').textContent=friendlyDate(r.date,true);$('detail-source').textContent=r.source;$('detail-status').textContent=reviewFor(r).status.toUpperCase();$('detail-title').textContent=displayTitle(r);$('detail-source-name').textContent=r.source;$('detail-source-info').textContent=r.details||'No original link recorded';const link=safeLink(r.details);const e=$('detail-link');e.hidden=!link;if(link){e.href=link;e.textContent=link.startsWith('readdle-spark:')?'Open original email ↗':'Open original page ↗';}
 $('detail-text').textContent=r.content||'No readable text found.';$('review-note').value=reviewFor(r).note;$('note-save-msg').textContent='';for(const b of document.querySelectorAll('[data-set-status]'))b.classList.toggle('selected',b.dataset.setStatus===reviewFor(r).status);if(app.imageFor!==r.id){app.imageFor=r.id;openImage(r);}}
function selectItem(id){$('tag-input').value='';$('tag-message').textContent='';$('title-editor').hidden=true;app.selectedId=id;app.imageFor=null;render();document.querySelector('.workspace').classList.add('show-detail');}
function cleanError(err){return (err&&err.message||String(err)).replace(/(Bearer\s+|refresh_token=|access_token=)[^\s&]+/gi,'[redacted]').slice(0,300);}
function updateSettings(){const clientId=$('app-key').value.trim(),folder=$('folder-path').value.trim().replace(/\/+$/,'');if(folder && !folder.startsWith('/')){$('settings-status').textContent='Folder path must start with /, or be left empty for the app-folder root.';return false;}if(!/^[a-zA-Z0-9_-]*$/.test(clientId)){$('settings-status').textContent='Please enter the Dropbox app key (letters and digits), not a secret.';return false;}settings={clientId,folder};localStorage.setItem(STORAGE_KEY,JSON.stringify(settings));return true;}
function showSettings(){const dlg=$('settings-dialog');$('app-key').value=settings.clientId;$('folder-path').value=settings.folder;$('remember-connection').checked=localStorage.getItem(REMEMBER_KEY)==='yes';$('redirect-uri').textContent=redirectUri();$('disconnect-btn').hidden=!app.token;$('settings-status').textContent='';dlg.showModal();}
function redirectUri(){return window.location.origin+window.location.pathname;}
const enc=new TextEncoder();function toB64Url(arr){return btoa(String.fromCharCode(...new Uint8Array(arr))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=/g,'');}
async function connectDropbox(){if(!saveConnectionPreference())return;if(!settings.clientId){$('settings-status').textContent='Create a Dropbox API app and enter its public app key first.';return;}if(!window.crypto?.subtle){$('settings-status').textContent='Dropbox login requires HTTPS (or localhost).';return;}
 const bytes=crypto.getRandomValues(new Uint8Array(32)),verifier=toB64Url(bytes),challenge=toB64Url(await crypto.subtle.digest('SHA-256',enc.encode(verifier))),state=toB64Url(crypto.getRandomValues(new Uint8Array(24)));sessionStorage.setItem(OAUTH_PENDING_KEY,JSON.stringify({verifier,state,redirect:redirectUri(),clientId:settings.clientId}));const p=new URLSearchParams({client_id:settings.clientId,redirect_uri:redirectUri(),response_type:'code',token_access_type:'offline',code_challenge_method:'S256',code_challenge:challenge,state,scope:'files.metadata.read files.content.read files.content.write'});window.location.assign('https://www.dropbox.com/oauth2/authorize?'+p.toString());}
function persistSession(){
 const value=JSON.stringify({accessToken:app.token,refreshToken:app.refreshToken,expires:app.expires,clientId:settings.clientId});
 sessionStorage.setItem(TOKEN_KEY,value);
 if(localStorage.getItem(REMEMBER_KEY)==='yes'&&app.refreshToken)localStorage.setItem(PERSISTENT_TOKEN_KEY,value);
 else localStorage.removeItem(PERSISTENT_TOKEN_KEY);
}
function saveConnectionPreference(){
 if(!updateSettings())return false;
 const remember=$('remember-connection').checked;
 if(remember)localStorage.setItem(REMEMBER_KEY,'yes');
 else localStorage.removeItem(REMEMBER_KEY);
 persistSessionPreference();
 return true;
}
function persistSessionPreference(){
 if(app.token)persistSession();
 else if(localStorage.getItem(REMEMBER_KEY)!=='yes')localStorage.removeItem(PERSISTENT_TOKEN_KEY);
}
async function processOAuthCallback(){const params=new URLSearchParams(window.location.search);const code=params.get('code'),error=params.get('error');if(!code&&!error)return;history.replaceState(null,'',redirectUri()+window.location.hash);if(error)throw new Error('Dropbox authorization was denied: '+error);const raw=sessionStorage.getItem(OAUTH_PENDING_KEY);sessionStorage.removeItem(OAUTH_PENDING_KEY);if(!raw)throw new Error('This login session expired. Please reconnect Dropbox.');const pending=JSON.parse(raw);if(!pending.verifier||params.get('state')!==pending.state||redirectUri()!==pending.redirect)throw new Error('Dropbox login state did not match. Please reconnect.');const body=new URLSearchParams({code,grant_type:'authorization_code',client_id:pending.clientId,redirect_uri:pending.redirect,code_verifier:pending.verifier});const response=await fetch('https://api.dropboxapi.com/oauth2/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body});if(!response.ok)throw new Error('Dropbox login failed ('+response.status+').');const v=await response.json();app.token=v.access_token;app.refreshToken=v.refresh_token||null;app.expires=Date.now()+(v.expires_in||14400)*1000;persistSession();}
let refreshing=null;
async function refreshToken(){if(refreshing)return refreshing;refreshing=(async()=>{if(!app.refreshToken)throw new Error('Dropbox session expired. Reconnect from Settings.');const params=new URLSearchParams({grant_type:'refresh_token',refresh_token:app.refreshToken,client_id:settings.clientId});const response=await fetch('https://api.dropboxapi.com/oauth2/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:params});if(!response.ok)throw new Error('Dropbox session refresh failed. Reconnect from Settings.');const v=await response.json();app.token=v.access_token;app.expires=Date.now()+(v.expires_in||14400)*1000;persistSession();})();try{return await refreshing;}finally{refreshing=null;}}
async function apiFetch(url,init={},retry=true){if(!app.token)throw new Error('Connect Dropbox first.');if(app.expires&&app.expires<Date.now()+30000)await refreshToken();const headers={...(init.headers||{}),Authorization:'Bearer '+app.token};const response=await fetch(url,{...init,headers});if(response.status===401&&retry){await refreshToken();return apiFetch(url,init,false);}if(!response.ok){let json=null;try{json=await response.json();}catch{}const summary=json?.error_summary||json?.error?.['.tag']||response.statusText||'Dropbox error';const e=new Error('Dropbox '+response.status+': '+summary);e.code=response.status;e.info=json;throw e;}return response;}
async function rpc(endpoint,data){const r=await apiFetch('https://api.dropboxapi.com/2/'+endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});return r.json();}
async function downloadFile(path){const r=await apiFetch('https://content.dropboxapi.com/2/files/download',{method:'POST',headers:{'Dropbox-API-Arg':JSON.stringify({path})}});return r.blob();}
async function uploadFile(path,body,mode){const r=await apiFetch('https://content.dropboxapi.com/2/files/upload',{method:'POST',headers:{'Content-Type':'application/octet-stream','Dropbox-API-Arg':JSON.stringify({path,mode,autorename:false,mute:true,strict_conflict:true})},body:new Blob([body],{type:'application/json'})});return r.json();}
function pjoin(name){const folder=settings.folder.trim().replace(/\/+$/,'');return (folder||'')+'/'+name;}
function isNotFound(e){const x=JSON.stringify(e.info||{});return e.code===409&&(/not_found|path_lookup/i.test(x)||/not_found/.test(e.message));}
async function loadRemoteReview(){const path=pjoin('_capture_inbox_state.json');try{const r=await rpc('files/get_metadata',{path});const blob=await downloadFile(path);const obj=JSON.parse(await blob.text());if(typeof obj!=='object'||Array.isArray(obj)||!obj.items||typeof obj.items!=='object'||Array.isArray(obj.items))throw new Error('Review-state JSON has an invalid structure.');return {items:obj.items,rev:r.rev};}catch(e){if(isNotFound(e))return {items:{},rev:null};throw e;}}
// Queue Dropbox writes so rapid actions cannot overwrite one another.
// Apply pending changes immediately; reconcile against confirmed remote state after each save.
const pendingWrites=[];
let saveTail=Promise.resolve();
function withPending(base){const merged={...base};for(const op of pendingWrites)merged[op.itemId]={...(merged[op.itemId]||{}),...op.patch,updatedAt:op.now};return merged;}
async function persistChange(itemId,patch,{quiet=false}={}){
 if(app.demo){const r=demoRecords.find(x=>x.id===itemId);if(!r)return false;const fields={...patch};if(Object.prototype.hasOwnProperty.call(fields,'title')){r.customTitle=fields.title;delete fields.title;}Object.assign(r,fields);render();toast('Demo updated · no data saved');return true;}
 const now=new Date().toISOString(),op={itemId,patch:{...patch},now};
 pendingWrites.push(op);app.review=withPending(app.confirmedReview);app.busy=true;render();
 const save=async()=>{
  try{
   for(let attempts=0;attempts<3;attempts++){
    const remote=await loadRemoteReview(),prev=remote.items[itemId]||{};
    const items={...remote.items,[itemId]:{...prev,...op.patch,updatedAt:now}};
    const serialized=JSON.stringify({version:1,updatedAt:now,items},null,2);
    try{
     const result=await uploadFile(pjoin('_capture_inbox_state.json'),serialized,remote.rev?{'.tag':'update',update:remote.rev}:'add');
     app.confirmedReview=items;app.reviewRev=result.rev;
     pendingWrites.splice(pendingWrites.indexOf(op),1);app.review=withPending(app.confirmedReview);render();
     if(!quiet)toast('Saved to Dropbox');return true;
    }catch(e){if(e.code===409&&attempts<2)continue;throw e;}
   }
  }catch(e){
   pendingWrites.splice(pendingWrites.indexOf(op),1);app.review=withPending(app.confirmedReview);render();
   warn('Could not save review: '+cleanError(e));toast('Dropbox save failed · change reversed');return false;
  }finally{app.busy=pendingWrites.length>0;}
 };
 const result=saveTail.then(save,save);saveTail=result.then(()=>{},()=>{});
 return result;
}
const textFileRe=/\.txt$/i, imageFileRe=/\.(?:png|jpe?g|webp)$/i;
function basename(name){return name.replace(/(?:\s*\.(?:txt|png|jpe?g|webp))+$/ig,'').trim();}
async function listDropboxFiles(){const all=[];let value=await rpc('files/list_folder',{path:settings.folder,recursive:false,limit:2000});all.push(...value.entries);while(value.has_more){value=await rpc('files/list_folder/continue',{cursor:value.cursor});all.push(...value.entries);}return all.filter(x=>x['.tag']==='file');}
function groupsFromFiles(files){const groups=new Map();for(const f of files){if(!textFileRe.test(f.name)&&!imageFileRe.test(f.name))continue;const base=basename(f.name);if(!base)continue;const g=groups.get(base)||{id:base,txt:null,image:null,modified:f.server_modified};if(textFileRe.test(f.name)){if(!g.txt||f.name.length<g.txt.name.length)g.txt=f;}else{if(!g.image)g.image=f;}if(f.server_modified>g.modified)g.modified=f.server_modified;groups.set(base,g);}return [...groups.values()].filter(g=>g.txt).sort((a,b)=>b.id.localeCompare(a.id));}
async function concurrentMap(items,worker,concurrency=7){let i=0;const out=new Array(items.length);await Promise.all(Array.from({length:Math.min(concurrency,items.length)},async()=>{while(i<items.length){const idx=i++;try{out[idx]=await worker(items[idx]);}catch(e){out[idx]={error:cleanError(e),item:items[idx]};}}}));return out;}
async function loadBatch(start,end){const groups=app.allGroups.slice(start,end);const results=await concurrentMap(groups,async g=>{const blob=await downloadFile(g.txt.path_display||g.txt.id);const parsed=parseTxt(await blob.text());const date=g.id.match(/^\d{4}-\d\d-\d\d_\d\d-\d\d-\d\d/) ? g.id.slice(0,10)+'T'+g.id.slice(11,19).replace(/-/g,':') : g.modified;const record={...parsed,id:g.id,date:parsed.date||date,imagePath:g.image?.path_display||null,kind:kindFor(parsed.source)};record.title=inferTitle(record);return record;});return results;}
async function loadDropbox(older=false){if(app.loading)return;app.loading=true;clearWarn();const btn=$('refresh-btn');btn.disabled=true;try{if(!older){await saveTail;const [remote,files]=await Promise.all([loadRemoteReview(),listDropboxFiles()]);app.confirmedReview=remote.items;app.review=withPending(remote.items);app.reviewRev=remote.rev;app.allGroups=groupsFromFiles(files);app.entries=[];app.limit=0;app.selectedId=null;app.imageFor=null;if(app.imageUrl){URL.revokeObjectURL(app.imageUrl);app.imageUrl=null;}deselect();}const begin=app.limit,end=Math.min(app.allGroups.length,begin+200);app.limit=end;const entries=await loadBatch(begin,end);app.entries.push(...entries.filter(x=>!x.error));const errors=entries.filter(x=>x.error);if(errors.length)warn(`${errors.length} text files could not be read. They were skipped until the next refresh.`);if(!app.allGroups.length)warn('No TXT captures found in this Dropbox folder. Check the folder path in Settings.');}catch(e){warn('Dropbox loading failed: '+cleanError(e));}finally{app.loading=false;btn.disabled=false;render();}}
function setDemo(){app.demo=true;app.entries=[];app.selectedId=null;app.imageFor=null;app.view='inbox';app.source='all';app.tag='all';app.search='';$('search-input').value='';deselect();clearWarn();render();$('settings-dialog').close();}
function disconnect(){for(const k of [TOKEN_KEY,OAUTH_PENDING_KEY])sessionStorage.removeItem(k);localStorage.removeItem(PERSISTENT_TOKEN_KEY);app.token=null;app.refreshToken=null;app.expires=0;setDemo();toast('Disconnected. Dropbox data remains untouched.');}
async function moveToTrash(id){
 const record=records().find(r=>r.id===id);if(!record)return;
 const previous=reviewFor(record).status;if(previous==='trash')return;
 if(app.selectedId===id)deselect();
 const saved=persistChange(id,{status:'trash',previousStatus:previous},{quiet:true});
 toast('Moving to Trash…');
 if(await saved)toast('Moved to Trash · recoverable');
}
async function restoreFromTrash(id){
 const record=records().find(r=>r.id===id);if(!record||reviewFor(record).status!=='trash')return;
 const destination=reviewFor(record).previousStatus;
 const status=['inbox','act','keep','dismiss'].includes(destination)?destination:'inbox';
 if(app.selectedId===id)deselect();
 const saved=persistChange(id,{status,previousStatus:null},{quiet:true});
 toast('Restoring capture…');
 if(await saved)toast('Restored to '+status);
}
async function addTag(){
 const id=app.selectedId,record=records().find(r=>r.id===id),input=$('tag-input');
 if(!record)return;const candidate=normalTag(input.value);if(!candidate){$('tag-message').textContent='Enter a tag.';return;}
 const tags=reviewFor(record).tags;
 if(tags.some(t=>t.toLocaleLowerCase()===candidate.toLocaleLowerCase())){$('tag-message').textContent='Already tagged.';input.select();return;}
 if(tags.length>=16){$('tag-message').textContent='Maximum 16 tags per capture.';return;}
 const label=knownTags().find(t=>t.toLocaleLowerCase()===candidate.toLocaleLowerCase())||candidate;
 input.value='';$('tag-message').textContent='';await persistChange(id,{tags:[...tags,label]},{quiet:true});
}
async function removeTag(id,name){
 const record=records().find(r=>r.id===id);if(!record)return;
 const tags=reviewFor(record).tags.filter(t=>t.toLocaleLowerCase()!==name.toLocaleLowerCase());
 $('tag-message').textContent='';await persistChange(id,{tags},{quiet:true});
}
function attachEvents(){$('tag-form').addEventListener('submit',e=>{e.preventDefault();addTag();});$('tag-filter').addEventListener('change',e=>{app.tag=e.target.value;render();});$('trash-capture').addEventListener('click',()=>{if(app.selectedId)moveToTrash(app.selectedId);});$('restore-capture').addEventListener('click',()=>{if(app.selectedId)restoreFromTrash(app.selectedId);});$('edit-title').addEventListener('click',beginTitleEdit);$('cancel-title').addEventListener('click',cancelTitleEdit);$('title-editor').addEventListener('submit',e=>{e.preventDefault();saveTitleEdit();});$('save-settings-btn').addEventListener('click',()=>{if(!saveConnectionPreference())return;$('settings-dialog').close();toast('Settings saved');if(app.token)loadDropbox();});for(const btn of document.querySelectorAll('[data-font-size]'))btn.addEventListener('click',()=>applyFontSize(btn.dataset.fontSize));document.querySelectorAll('[data-view]').forEach(btn=>btn.addEventListener('click',()=>{app.view=btn.dataset.view;app.selectedId=null;app.imageFor=null;deselect();render();document.body.classList.remove('menu-open');}));$('search-input').addEventListener('input',e=>{app.search=e.target.value;render();});$('source-filter').addEventListener('change',e=>{app.source=e.target.value;render();});$('settings-btn').addEventListener('click',showSettings);$('mobile-settings-btn').addEventListener('click',showSettings);$('close-settings').addEventListener('click',()=>$('settings-dialog').close());$('connect-btn').addEventListener('click',connectDropbox);$('demo-btn').addEventListener('click',setDemo);$('disconnect-btn').addEventListener('click',disconnect);$('copy-redirect').addEventListener('click',async()=>{await navigator.clipboard.writeText(redirectUri());toast('Redirect URI copied');});$('refresh-btn').addEventListener('click',()=>{if(app.demo){toast('Demo is already up to date');return;}loadDropbox();});$('load-more').addEventListener('click',()=>loadDropbox(true));$('menu-btn').addEventListener('click',()=>document.body.classList.toggle('menu-open'));$('back-btn').addEventListener('click',()=>document.querySelector('.workspace').classList.remove('show-detail'));$('copy-btn').addEventListener('click',async()=>{const r=records().find(x=>x.id===app.selectedId);if(!r)return;try{await navigator.clipboard.writeText(r.content);toast('Captured text copied');}catch{toast('Copy unavailable in this browser');}});$('open-image').addEventListener('click',()=>{if(app.imageUrl)window.open(app.imageUrl,'_blank','noopener');});for(const btn of document.querySelectorAll('[data-set-status]'))btn.addEventListener('click',async()=>{if(!app.selectedId)return;await persistChange(app.selectedId,{status:btn.dataset.setStatus});});$('save-note').addEventListener('click',async()=>{if(!app.selectedId)return;const result=await persistChange(app.selectedId,{note:$('review-note').value});$('note-save-msg').textContent=result?'Saved':'Could not save';});document.addEventListener('keydown',e=>{if(e.key==='/'&&!/input|textarea/i.test(document.activeElement.tagName)&&!$('settings-dialog').open){e.preventDefault();$('search-input').focus();}if(e.key==='Escape'){document.body.classList.remove('menu-open');if(document.querySelector('.workspace').classList.contains('show-detail'))document.querySelector('.workspace').classList.remove('show-detail');}});}
async function init(){applyFontSize((()=>{try{return localStorage.getItem(FONT_SIZE_KEY);}catch{return null;}})()||'m');$('version-label').textContent='v'+APP_VERSION;attachEvents();render();try{await processOAuthCallback();}catch(e){warn(cleanError(e));}if(!app.token){try{
 const stored=sessionStorage.getItem(TOKEN_KEY)||(localStorage.getItem(REMEMBER_KEY)==='yes'?localStorage.getItem(PERSISTENT_TOKEN_KEY):null);
 const token=JSON.parse(stored||'null');
 if(token?.accessToken&&(!token.clientId||token.clientId===settings.clientId)){
  app.token=token.accessToken;app.refreshToken=token.refreshToken;app.expires=token.expires;
 }
 }catch{}}if(app.token){app.demo=false;render();await loadDropbox();}else if(new URLSearchParams(location.search).has('code')){warn('Dropbox authorization was not completed. Try connecting again.');}}
init();
