'use strict';
// ══════════════════════════════════════════════════════════════════════════
//  PERFECT REZEPT - DATENSCHICHT (IndexedDB + Supabase-Sync + Bild-Pipeline)
// ══════════════════════════════════════════════════════════════════════════
//
// ⚠ DIESE DATEI GEHOERT ZUR REZEPT-APP, NICHT ZUM FX ANALYST PRO.
//   Die beiden Apps teilen sich NUR das Repo, den Service Worker und die
//   Supabase-Zugangsdaten - sonst nichts. Wer am FX Analyst Pro arbeitet,
//   muss hier nicht lesen (und umgekehrt). Siehe docs/rezept.md.
//
// WARUM NICHT EINFACH ALLES IN DEN FX-SYNC-BLOB (die naheliegende Loesung):
// cloudPush() des FX Analyst Pro schiebt bei JEDER Aenderung den KOMPLETTEN
// App-Zustand als eine JSON-Zeile hoch. Rezeptbilder darin wuerden bedeuten,
// dass jeder beliebige FX-Autosave (z.B. der stuendliche Kalender-Refresh)
// saemtliche Bilder erneut hochlaedt - bei 20 Rezepten schnell zweistellige
// Megabyte pro Push. Deshalb:
//
//   fx_sync (bestehende Tabelle, KEIN neues Supabase-Setup noetig)
//     <syncId>              -> FX-Zustand            (unangetastet)
//     <syncId>:rez:index    -> Rezept-Verzeichnis    (Titel/Zeit/Tags/Thumbnail)
//     <syncId>:rez:r:<id>   -> EIN Rezept            (Vollbild + Zubereitung)
//
// Das Verzeichnis traegt nur Mini-Thumbnails (~320px, ~20 KB) - ein einziger
// Request rendert damit das komplette Raster. Die Vollbilder liegen je Rezept
// in einer eigenen Zeile und werden erst beim OEFFNEN geholt; hochgeladen
// wird immer nur das GEAENDERTE Rezept.
//
// ⚠ MERGE STATT OVERWRITE (dieselbe Falle wie bei scoreHist/research im FX
//   Analyst Pro, siehe docs/state-sync.md): zwei Geraete legen typischerweise
//   UNABHAENGIG neue Rezepte an. Ein simples "Cloud gewinnt" wuerde die
//   jeweils andere Seite loeschen. Jeder Schreibzyklus laeuft deshalb als
//   lies-merge-schreib unter navigator.locks.

// ── Konfiguration ────────────────────────────────────────────────────────
export const DB_NAME='perfect_rezept';
export const DB_VERSION=1;
const LOCK_NAME='rezept_sync_lock';
const LS_UPDATED='rez_updated';
const LS_SEEN='rez_cloud_seen';
// Bewusst dieselben Supabase-Zugangsdaten wie der FX Analyst Pro: der Nutzer
// soll den Sync nicht zweimal einrichten muessen. Nur der ZEILEN-Schluessel
// unterscheidet sich (siehe Kopfkommentar).
const FX_CLOUD_CFG='fxpro_cloud_cfg';

// Bild-Budgets. Bewusst knapp gewaehlt - Supabase Free hat 500 MB Datenbank,
// Base64 blaeht zusaetzlich um 33% auf. 100 Rezepte landen so bei ~35 MB.
export const IMG_COVER={max:1400,q:.82,bytes:260*1024};
export const IMG_BLOCK={max:1100,q:.78,bytes:180*1024};
export const IMG_THUMB={max:420,q:.70,bytes:34*1024};

export const TRASH_DAYS=30;

// ── Laufzeit-Zustand ─────────────────────────────────────────────────────
// index = das Verzeichnis (Metadaten aller Rezepte), full = Cache der bereits
// geladenen Volldokumente.
export const state={
  index:{v:1,recipes:[],trash:[],settings:{theme:'clay'},settingsUp:''},
  full:new Map(),
  ready:false,
  online:navigator.onLine,
  status:'',
  dbBroken:false,   // lokale Ablage ausgefallen -> Speicher-Map als Notbetrieb
  lastError:'',     // letzte Fehlermeldung, die die Oberflaeche zeigen soll
};

let _db=null;
let _pushTimer=null;
const _dirtyRecipes=new Set();
let _indexDirty=false;
const _listeners=new Set();

export function onChange(fn){_listeners.add(fn);return()=>_listeners.delete(fn);}
function emit(what){_listeners.forEach(fn=>{try{fn(what);}catch(e){console.error(e);}});}

export function setStatus(txt){state.status=txt;emit('status');}

// ── IndexedDB ────────────────────────────────────────────────────────────
// localStorage scheidet fuer Rezepte aus: das Limit liegt bei ~5 MB, ein
// einziges Titelbild frisst davon schon 5%. IndexedDB hat kein solches
// Limit und ist ohnehin die richtige Ablage fuer Binaerdaten.
// ⚠ JEDE IndexedDB-Operation kann scheitern - und zwar nicht nur theoretisch:
// Privatmodus, aufgebrauchtes Speicherkontingent und einzelne iOS-Zustaende
// lassen `open()` oder schon die Transaktion werfen. Per Playwright
// reproduziert (2026-09-01): mit blockierter Transaktion blieb das
// Hinzufuegen-Fenster offen, es erschien KEINE Meldung, nichts wurde
// gespeichert - der Nutzer sah nur "Speichern klappt nicht". Ursache war,
// dass die Ausnahme als unbehandelte Promise-Rejection endete.
//
// Konsequenz: die lokale Ablage ist ab hier BEST EFFORT. Faellt sie aus,
// laeuft die App auf einer Speicher-Map weiter (die Sitzung funktioniert,
// der Cloud-Sync speichert weiterhin dauerhaft) und `state.dbBroken`
// erzaehlt der Oberflaeche davon. Was NIE passieren darf: eine geworfene
// Ausnahme, die den Speichervorgang lautlos abbricht.
const _mem=new Map();
function memKey(store,key){return store+'\u0000'+key;}
function openDb(){
  if(_db)return Promise.resolve(_db);
  if(state.dbBroken)return Promise.reject(new Error('IndexedDB unavailable'));
  return new Promise((res,rej)=>{
    let req;
    try{req=indexedDB.open(DB_NAME,DB_VERSION);}
    catch(e){state.dbBroken=true;return rej(e);}
    req.onupgradeneeded=()=>{
      const db=req.result;
      if(!db.objectStoreNames.contains('kv'))db.createObjectStore('kv');
      if(!db.objectStoreNames.contains('recipes'))db.createObjectStore('recipes',{keyPath:'id'});
    };
    req.onsuccess=()=>{_db=req.result;res(_db);};
    req.onerror=()=>{state.dbBroken=true;rej(req.error);};
    req.onblocked=()=>{state.dbBroken=true;rej(new Error('IndexedDB blocked'));};
  });
}
function markDbBroken(e){
  if(!state.dbBroken){
    state.dbBroken=true;
    console.warn('[rezept] local storage unavailable, falling back to memory:',e&&e.message);
    emit('status');
  }
}
async function idbGet(store,key){
  try{
    const db=await openDb();
    return await new Promise((res,rej)=>{
      const r=db.transaction(store,'readonly').objectStore(store).get(key);
      r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error);
    });
  }catch(e){markDbBroken(e);return _mem.get(memKey(store,key));}
}
async function idbPut(store,val,key){
  const k=key===undefined?(val&&val.id):key;
  try{
    const db=await openDb();
    await new Promise((res,rej)=>{
      const tx=db.transaction(store,'readwrite');
      const r=key===undefined?tx.objectStore(store).put(val):tx.objectStore(store).put(val,key);
      r.onsuccess=()=>res();r.onerror=()=>rej(r.error);
    });
  }catch(e){markDbBroken(e);_mem.set(memKey(store,k),val);}
}
async function idbDel(store,key){
  try{
    const db=await openDb();
    await new Promise((res,rej)=>{
      const r=db.transaction(store,'readwrite').objectStore(store).delete(key);
      r.onsuccess=()=>res();r.onerror=()=>rej(r.error);
    });
  }catch(e){markDbBroken(e);_mem.delete(memKey(store,key));}
}

// ── Hilfsfunktionen ──────────────────────────────────────────────────────
export function uid(){return 'r'+Date.now().toString(36)+Math.random().toString(36).slice(2,7);}
export function nowIso(){return new Date().toISOString();}
export function getCloudCfg(){
  try{
    const c=JSON.parse(localStorage.getItem(FX_CLOUD_CFG));
    if(c&&c.url&&c.key&&c.syncId)return c;
  }catch(e){}
  return null;
}
function cloudHeaders(cfg){return{'apikey':cfg.key,'Authorization':'Bearer '+cfg.key,'Content-Type':'application/json'};}
function rowId(cfg,suffix){return cfg.syncId+':rez:'+suffix;}

// ⚠ Der Zeitstempel entscheidet bei JEDER Kollision, welche Fassung gewinnt.
// Ohne Bump propagiert eine Aenderung nicht - exakt dieselbe Falle wie
// fxpro_updated im FX Analyst Pro (siehe docs/state-sync.md).
function bumpUpdated(){try{localStorage.setItem(LS_UPDATED,nowIso());}catch(e){}}

// ── Merge-Logik ──────────────────────────────────────────────────────────
// Vereinigung nach id; bei einer echten Kollision gewinnt der zuletzt
// bearbeitete Eintrag (`up`). Papierkorb-Eintraege sind Grabsteine: ein auf
// Geraet A geloeschtes Rezept darf nicht dadurch wieder auferstehen, dass
// Geraet B es noch im Verzeichnis stehen hat.
export function mergeIndex(base,over){
  const out={v:1,recipes:[],trash:[],settings:null,settingsUp:''};
  const byId=new Map();
  (base&&base.recipes||[]).forEach(r=>byId.set(r.id,r));
  (over&&over.recipes||[]).forEach(r=>{
    const ex=byId.get(r.id);
    if(!ex||(r.up||'')>=(ex.up||''))byId.set(r.id,r);
  });
  const trash=new Map();
  [...(base&&base.trash||[]),...(over&&over.trash||[])].forEach(t=>{
    const ex=trash.get(t.id);
    if(!ex||(t.delAt||'')>=(ex.delAt||''))trash.set(t.id,t);
  });
  // Grabstein schlaegt Verzeichniseintrag, ausser das Rezept wurde NACH dem
  // Loeschen noch einmal bearbeitet (= auf dem anderen Geraet wiederhergestellt).
  trash.forEach((t,id)=>{
    const r=byId.get(id);
    if(r&&(r.up||'')>(t.delAt||''))trash.delete(id);
    else byId.delete(id);
  });
  out.recipes=[...byId.values()].sort((a,b)=>(b.created||'').localeCompare(a.created||''));
  out.trash=[...trash.values()];
  // Einstellungen (Theme): reines Last-Write-Wins ueber settingsUp.
  const bUp=(base&&base.settingsUp)||'',oUp=(over&&over.settingsUp)||'';
  if(oUp>=bUp&&over&&over.settings){out.settings=over.settings;out.settingsUp=oUp;}
  else{out.settings=(base&&base.settings)||{theme:'clay'};out.settingsUp=bUp;}
  if(!out.settings)out.settings={theme:'clay'};
  return out;
}

// Papierkorb aufraeumen: alles aelter als TRASH_DAYS faellt raus (samt
// Volldokument aus der IndexedDB - sonst bleiben die Bilder ewig liegen).
export function purgeTrash(idx){
  const cutoff=Date.now()-TRASH_DAYS*86400000;
  const keep=[],drop=[];
  (idx.trash||[]).forEach(t=>{
    const ts=Date.parse(t.delAt||'')||0;
    if(ts&&ts<cutoff)drop.push(t);else keep.push(t);
  });
  idx.trash=keep;
  drop.forEach(t=>{idbDel('recipes',t.id).catch(()=>{});state.full.delete(t.id);});
  return drop.length>0;
}

// ── Bild-Pipeline ────────────────────────────────────────────────────────
// Ein Handyfoto hat gern 4 MB. Ungerechnet in die Datenbank geschoben ist das
// pro Rezept mehr, als das gesamte FX-Sync-Dokument wiegt. Deshalb wird JEDES
// Bild im Browser heruntergerechnet, BEVOR es irgendwo landet - und zwar
// nicht nur auf eine Kantenlaenge, sondern iterativ auf ein Byte-Budget.
export function fileToImage(file){
  return new Promise((res,rej)=>{
    const fr=new FileReader();
    fr.onload=()=>{
      const img=new Image();
      img.onload=()=>res(img);
      img.onerror=()=>rej(new Error('Image could not be read'));
      img.src=fr.result;
    };
    fr.onerror=()=>rej(new Error('File could not be read'));
    fr.readAsDataURL(file);
  });
}
export function drawScaled(img,maxPx,quality){
  const scale=Math.min(1,maxPx/Math.max(img.naturalWidth||img.width,img.naturalHeight||img.height));
  const w=Math.max(1,Math.round((img.naturalWidth||img.width)*scale));
  const h=Math.max(1,Math.round((img.naturalHeight||img.height)*scale));
  const cv=document.createElement('canvas');
  cv.width=w;cv.height=h;
  const ctx=cv.getContext('2d');
  ctx.imageSmoothingQuality='high';
  // Weisser Grund: JPEG kennt keine Transparenz, ein PNG mit Alpha wuerde
  // sonst schwarze Flaechen bekommen.
  ctx.fillStyle='#ffffff';ctx.fillRect(0,0,w,h);
  ctx.drawImage(img,0,0,w,h);
  return cv.toDataURL('image/jpeg',quality);
}
// Rechnet so lange Qualitaet (und zuletzt die Kantenlaenge) herunter, bis das
// Byte-Budget eingehalten ist. Gibt notfalls das kleinstmoegliche Ergebnis
// zurueck statt zu scheitern - ein Rezept ohne Bild waere schlimmer.
export function encodeToBudget(img,spec){
  let q=spec.q,max=spec.max,out=drawScaled(img,max,q);
  let guard=0;
  while(out.length*0.75>spec.bytes&&guard++<12){
    if(q>0.42)q-=0.08;
    else max=Math.round(max*0.82);
    out=drawScaled(img,max,q);
  }
  return out;
}
export async function processImage(file,spec){
  const img=await fileToImage(file);
  return encodeToBudget(img,spec||IMG_COVER);
}
// Titelbild + Raster-Thumbnail in EINEM Durchgang (das Bild wird nur einmal
// dekodiert).
export async function processCover(file){
  const img=await fileToImage(file);
  return{cover:encodeToBudget(img,IMG_COVER),thumb:encodeToBudget(img,IMG_THUMB)};
}

// ── Lokales Laden/Speichern ──────────────────────────────────────────────
export async function loadLocal(){
  try{
    const idx=await idbGet('kv','index');
    if(idx&&idx.recipes)state.index=Object.assign({v:1,recipes:[],trash:[],settings:{theme:'clay'},settingsUp:''},idx);
  }catch(e){console.warn('[rezept] local index unreadable',e);}
  if(!state.index.settings)state.index.settings={theme:'clay'};
  state.ready=true;
  emit('index');
}
async function saveLocalIndex(){
  await idbPut('kv',JSON.parse(JSON.stringify(state.index)),'index');
}
export async function getFull(id){
  if(state.full.has(id))return state.full.get(id);
  let doc=null;
  try{doc=await idbGet('recipes',id);}catch(e){}
  if(doc){state.full.set(id,doc);return doc;}
  doc=await pullRecipe(id);
  if(doc){state.full.set(id,doc);try{await idbPut('recipes',doc);}catch(e){}}
  return doc;
}

// ── Cloud: Verzeichnis ───────────────────────────────────────────────────
async function fetchIndexRow(cfg){
  const res=await fetch(cfg.url+'/rest/v1/fx_sync?id=eq.'+encodeURIComponent(rowId(cfg,'index'))+'&select=data,updated_at',
    {headers:cloudHeaders(cfg),signal:AbortSignal.timeout(12000)});
  if(!res.ok)throw new Error('HTTP '+res.status);
  const rows=await res.json();
  return rows.length?rows[0]:null;
}
async function putRow(cfg,id,data,updated){
  const res=await fetch(cfg.url+'/rest/v1/fx_sync?on_conflict=id',{
    method:'POST',
    headers:{...cloudHeaders(cfg),'Prefer':'resolution=merge-duplicates,return=minimal'},
    body:JSON.stringify([{id,data,updated_at:updated}]),
    signal:AbortSignal.timeout(20000)
  });
  if(!res.ok)throw new Error('HTTP '+res.status);
}

// Ein vollstaendiger lies-merge-schreib-Zyklus fuer das Verzeichnis.
// ⚠ Unter navigator.locks, damit zwei gleichzeitig offene Tabs sich nicht
// gegenseitig ueberschreiben (dieselbe Race, die im FX Analyst Pro
// Notizen gekostet hat - siehe docs/state-sync.md).
async function withLock(fn){
  if(navigator.locks&&navigator.locks.request)return navigator.locks.request(LOCK_NAME,fn);
  return fn();
}
export async function syncIndex(manual){
  const cfg=getCloudCfg();
  if(!cfg){if(manual)setStatus('No cloud sync configured.');return false;}
  return withLock(async()=>{
    try{
      setStatus('Syncing...');
      const row=await fetchIndexRow(cfg);
      const cloud=row&&row.data?row.data:null;
      const before=JSON.stringify(state.index);
      // Beim Merge gewinnt bei gleichem Zeitstempel der LOKALE Stand - die
      // frisch getippte Aenderung darf nicht von der Cloud verschluckt werden.
      state.index=mergeIndex(cloud||{},state.index);
      purgeTrash(state.index);
      const changedLocally=JSON.stringify(state.index)!==before||_indexDirty;
      await saveLocalIndex();
      const cloudJson=JSON.stringify(cloud||{});
      if(changedLocally||cloudJson!==JSON.stringify(state.index)){
        const stamp=nowIso();
        await putRow(cfg,rowId(cfg,'index'),state.index,stamp);
        try{localStorage.setItem(LS_SEEN,stamp);}catch(e){}
      }
      _indexDirty=false;
      setStatus('Synced '+new Date().toLocaleTimeString());
      emit('index');
      return true;
    }catch(e){
      setStatus('Sync failed: '+e.message);
      return false;
    }
  });
}
async function pullRecipe(id){
  const cfg=getCloudCfg();if(!cfg)return null;
  try{
    const res=await fetch(cfg.url+'/rest/v1/fx_sync?id=eq.'+encodeURIComponent(rowId(cfg,'r:'+id))+'&select=data',
      {headers:cloudHeaders(cfg),signal:AbortSignal.timeout(20000)});
    if(!res.ok)return null;
    const rows=await res.json();
    return rows.length?rows[0].data:null;
  }catch(e){return null;}
}
async function pushRecipe(id){
  const cfg=getCloudCfg();if(!cfg)return false;
  const doc=state.full.get(id)||await idbGet('recipes',id).catch(()=>null);
  if(!doc)return false;
  try{
    await putRow(cfg,rowId(cfg,'r:'+id),doc,doc.up||nowIso());
    return true;
  }catch(e){return false;}
}
async function deleteRow(id){
  const cfg=getCloudCfg();if(!cfg)return;
  try{
    await fetch(cfg.url+'/rest/v1/fx_sync?id=eq.'+encodeURIComponent(rowId(cfg,'r:'+id)),
      {method:'DELETE',headers:cloudHeaders(cfg),signal:AbortSignal.timeout(12000)});
  }catch(e){}
}

// Debounced: eine Bearbeitung loest nicht sofort einen Upload aus, sonst
// schiebt jeder Tastendruck im Titelfeld eine neue Version hoch.
export function scheduleSync(){
  bumpUpdated();
  clearTimeout(_pushTimer);
  _pushTimer=setTimeout(()=>{flushSync();},1500);
}
export async function flushSync(){
  clearTimeout(_pushTimer);_pushTimer=null;
  const ids=[..._dirtyRecipes];_dirtyRecipes.clear();
  for(const id of ids)await pushRecipe(id);
  await syncIndex(false);
}

// ── Schreib-API (alles, was die Oberflaeche aufruft) ─────────────────────
export function metaOf(doc){
  return{id:doc.id,title:doc.title,min:doc.min,tags:doc.tags||[],fav:!!doc.fav,
    thumb:doc.thumb||'',created:doc.created,up:doc.up};
}
export async function saveRecipe(doc){
  doc.up=nowIso();
  if(!doc.created)doc.created=doc.up;
  state.full.set(doc.id,doc);
  await idbPut('recipes',JSON.parse(JSON.stringify(doc)));
  const meta=metaOf(doc);
  const i=state.index.recipes.findIndex(r=>r.id===doc.id);
  if(i>=0)state.index.recipes[i]=meta;else state.index.recipes.unshift(meta);
  state.index.trash=(state.index.trash||[]).filter(t=>t.id!==doc.id);
  _indexDirty=true;_dirtyRecipes.add(doc.id);
  await saveLocalIndex();
  emit('index');
  scheduleSync();
}
export async function toggleFav(id){
  const meta=state.index.recipes.find(r=>r.id===id);
  if(!meta)return;
  meta.fav=!meta.fav;meta.up=nowIso();
  const doc=state.full.get(id);
  if(doc){doc.fav=meta.fav;doc.up=meta.up;await idbPut('recipes',JSON.parse(JSON.stringify(doc)));_dirtyRecipes.add(id);}
  _indexDirty=true;
  await saveLocalIndex();
  emit('index');
  scheduleSync();
}
// Loeschen = in den Papierkorb legen (30 Tage), nicht wegwerfen. Das
// Volldokument bleibt in der IndexedDB UND in der Cloud liegen, sonst waere
// "Wiederherstellen" auf einem anderen Geraet wertlos.
export async function trashRecipe(id){
  const meta=state.index.recipes.find(r=>r.id===id);
  if(!meta)return;
  state.index.recipes=state.index.recipes.filter(r=>r.id!==id);
  state.index.trash=state.index.trash||[];
  state.index.trash.push(Object.assign({},meta,{delAt:nowIso()}));
  _indexDirty=true;
  await saveLocalIndex();
  emit('index');
  scheduleSync();
}
export async function restoreRecipe(id){
  const t=(state.index.trash||[]).find(x=>x.id===id);
  if(!t)return;
  state.index.trash=state.index.trash.filter(x=>x.id!==id);
  const meta=Object.assign({},t);delete meta.delAt;
  meta.up=nowIso();
  state.index.recipes.unshift(meta);
  const doc=await getFull(id);
  if(doc){doc.up=meta.up;await idbPut('recipes',JSON.parse(JSON.stringify(doc)));_dirtyRecipes.add(id);}
  _indexDirty=true;
  await saveLocalIndex();
  emit('index');
  scheduleSync();
}
export async function deleteForever(id){
  state.index.trash=(state.index.trash||[]).filter(x=>x.id!==id);
  state.index.recipes=state.index.recipes.filter(x=>x.id!==id);
  state.full.delete(id);
  await idbDel('recipes',id).catch(()=>{});
  await deleteRow(id);
  _indexDirty=true;
  await saveLocalIndex();
  emit('index');
  scheduleSync();
}
export async function setSetting(key,val){
  state.index.settings=state.index.settings||{};
  state.index.settings[key]=val;
  state.index.settingsUp=nowIso();
  _indexDirty=true;
  await saveLocalIndex();
  emit('settings');
  scheduleSync();
}

// ── Start ────────────────────────────────────────────────────────────────
export async function boot(){
  await loadLocal();
  if(purgeTrash(state.index)){await saveLocalIndex();emit('index');}
  if(getCloudCfg())syncIndex(false);
}
window.addEventListener('online',()=>{state.online=true;emit('status');if(getCloudCfg())flushSync();});
window.addEventListener('offline',()=>{state.online=false;emit('status');});
document.addEventListener('visibilitychange',()=>{
  // Beim Zurueckkommen aus dem Hintergrund sofort abgleichen - sonst sieht
  // man auf dem zweiten Geraet minutenlang einen veralteten Stand.
  if(document.visibilityState==='visible'&&getCloudCfg())syncIndex(false);
  if(document.visibilityState==='hidden'&&_pushTimer)flushSync();
});
