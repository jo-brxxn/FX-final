'use strict';
// ══════════════════════════════════════════════════════════════════════════
//  PERFECT REZEPT - OBERFLAECHE
// ══════════════════════════════════════════════════════════════════════════
//
// ⚠ Gehoert zur Rezept-App, NICHT zum FX Analyst Pro (siehe docs/rezept.md).
//
// Aufbau bewusst identisch zum FX Analyst Pro: dieselbe Shell (Kopfzeile +
// dunkle Nav-Sidebar + Seitenbereich), dieselben Karten-/Modal-Bausteine,
// dieselbe window-Bruecke fuer Inline-Handler (das Skript ist ein ES-Modul,
// onclick="..." im HTML sieht Modul-Variablen sonst nicht - identisches
// Muster wie js/main.js, siehe docs/module-split.md).
import * as S from './store.js';

// ── Konstanten ───────────────────────────────────────────────────────────
const PAGES={overview:'pgOverview',recipes:'pgRecipes'};
const NAV=[
  {id:'overview',label:'Overview'},
  {id:'recipes',label:'Recipes'},
];
// Zeitauswahl in 5-Minuten-Schritten (Nutzer-Wunsch). 5-180 deckt vom
// Ruehrei bis zum Schmorbraten alles ab; darueber wird die Liste unbrauchbar
// lang, deshalb oben drei grobe Stufen.
const DURATIONS=(()=>{const a=[];for(let m=5;m<=180;m+=5)a.push(m);a.push(240,300,360);return a;})();
const THEMES=[
  {id:'linear',   name:'Linear Light',   desc:'Cool near-white, indigo accent',   sw:['#F1F2F5','#F7F8F9','#FFFFFF','#4B55B8']},
  {id:'notion',   name:'Notion Grey',    desc:'Warm off-white, very quiet',       sw:['#F7F7F5','#FAFAF9','#FFFFFF','#286FB4']},
  {id:'vercel',   name:'Vercel Mono',    desc:'Black header, pure black & white', sw:['#000000','#FAFAFA','#FFFFFF','#171717']},
  {id:'github',   name:'GitHub Light',   desc:'Dark header, bright content',      sw:['#24292F','#F6F8FA','#FFFFFF','#0969DA']},
  {id:'stripe',   name:'Stripe Slate',   desc:'Pale blue-grey, violet accent',    sw:['#EEF3F9','#F6F9FC','#FFFFFF','#5145CD']},
  {id:'ios',      name:'iOS Light',      desc:'System grey, rounded, blue',       sw:['#F9F9FB','#F2F2F7','#FFFFFF','#0A62C9']},
  {id:'swiss',    name:'Swiss Editorial',desc:'Pure white, hairlines, no colour', sw:['#FFFFFF','#FFFFFF','#F0F0F0','#000000']},
  {id:'fog',      name:'Nordic Fog',     desc:'Cool blue-grey, dark header',      sw:['#2B3440','#EDF1F5','#FFFFFF','#2C6091']},
  {id:'graphite', name:'Graphite',       desc:'Neutral grey, graphite header',    sw:['#33383D','#F4F5F6','#FFFFFF','#5A6570']},
  {id:'paper',    name:'Paper Cookbook', desc:'Editorial brown, serif headlines', sw:['#2E241E','#EFE7DA','#FBF7F0','#8A5626']},
];
// ⚠ Wird ein Theme ENTFERNT, muss `applyStoredTheme()`/die Frueh-Weiche in
// rezept.html den alten Wert migrieren - sonst trifft ein Geraet mit dem
// alten Namen im Speicher GAR KEIN Regelwerk und steht ohne eine einzige
// Farbvariable da. Genau deshalb existiert THEME_IDS.
const THEME_IDS=THEMES.map(t=>t.id);
const THEME_DEFAULT='linear';
const ICONS={
  overview:'<path d="M3 12l9-9 9 9"/><path d="M5 10v10h14V10"/><path d="M9 20v-6h6v6"/>',
  recipes:'<path d="M4 3h13a2 2 0 0 1 2 2v16H6a2 2 0 0 1-2-2z"/><path d="M8 3v18"/><path d="M12 8h4"/><path d="M12 12h4"/>',
  clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  star:'<path d="M12 3l2.6 5.6 6.1.8-4.4 4.3 1.1 6.1L12 17l-5.4 2.8 1.1-6.1L3.3 9.4l6.1-.8z"/>',
  plus:'<path d="M12 5v14"/><path d="M5 12h14"/>',
  dice:'<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.3" fill="currentColor"/><circle cx="15.5" cy="15.5" r="1.3" fill="currentColor"/><circle cx="12" cy="12" r="1.3" fill="currentColor"/>',
  plate:'<circle cx="12" cy="12" r="8.4"/><circle cx="12" cy="12" r="4"/>',
  image:'<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.6" cy="9.6" r="1.6"/><path d="M21 16l-5-5-6.5 6.5"/>',
  search:'<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>',
};
function icn(k,size){const s=size||17;return`<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">${ICONS[k]||''}</svg>`;}

// ── Hilfsfunktionen ──────────────────────────────────────────────────────
function escH(s){return String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function $(id){return document.getElementById(id);}
export function fmtDur(m){
  m=+m||0;
  if(m<60)return m+' min';
  const h=Math.floor(m/60),r=m%60;
  return r?h+' h '+r+' min':h+' h';
}
function daysLeft(delAt){
  const ts=Date.parse(delAt||'')||0;
  if(!ts)return 0;
  return Math.max(0,Math.ceil((ts+S.TRASH_DAYS*86400000-Date.now())/86400000));
}
let _toastT=null;
export function toast(msg){
  const el=$('rezToast');if(!el)return;
  el.textContent=msg;el.classList.add('on');
  clearTimeout(_toastT);_toastT=setTimeout(()=>el.classList.remove('on'),2400);
}

// ── Seitenzustand ────────────────────────────────────────────────────────
let curPage='overview';
const filters={q:'',maxMin:0,tag:'',favOnly:false};
let form=null;          // Entwurf im Hinzufuegen/Bearbeiten-Fenster
let formBase=null;      // JSON-Schnappschuss beim Oeffnen - Grundlage fuer "ungespeichert?"
let detailId=null;

// ── Navigation ───────────────────────────────────────────────────────────
export function renderNav(){
  const nav=$('rezNav');if(!nav)return;
  nav.innerHTML=NAV.map(n=>{
    const on=curPage===n.id;
    const cnt=n.id==='recipes'?S.state.index.recipes.length:0;
    return`<button class="np${on?' on':''}" onclick="rezShowPage('${n.id}')" title="${escH(n.label)}" aria-label="${escH(n.label)}">`
      +`<span class="np-ic">${icn(n.id)}</span><span class="np-lbl">${escH(n.label)}</span>`
      +(cnt?`<span class="np-count">${cnt}</span>`:'')+`</button>`;
  }).join('');
}
export function rezShowPage(id){
  curPage=id;
  Object.values(PAGES).forEach(pid=>{const el=$(pid);if(el)el.style.display='none';});
  const el=$(PAGES[id]);
  if(el){
    el.style.display='block';
    el.classList.remove('page-fade-in');void el.offsetWidth;el.classList.add('page-fade-in');
    el.scrollTop=0;
  }
  renderNav();
  if(id==='overview')renderOverview();else renderRecipes();
}

// ── OVERVIEW ─────────────────────────────────────────────────────────────
// Drei Karten. "Today's Meal" und "Random Picker" sind ausdrueckliche
// PLATZHALTER (Nutzer: "Mach nur einen Platzhalter hin. Die Funktion kommt
// noch.") - sie zeigen bewusst keinen erfundenen Inhalt, sondern sagen
// klar, dass die Funktion noch fehlt. Das entspricht auch der Projektregel
// "nie schaetzen/raten/hart eintragen" (CLAUDE.md).
export function renderOverview(){
  const el=$('pgOverview');if(!el)return;
  const n=S.state.index.recipes.length;
  el.innerHTML=
    `<div class="ptitle">Overview</div>`
   +`<div class="psub">${n?`${n} recipe${n===1?'':'s'} in your collection`:'Your collection is still empty'}</div>`
   +`<div class="ov-grid">`
   +`<div class="dw"><div class="dw-hdr"><div class="dw-title">${icn('plate',16)} Today's Meal</div><span class="pill">Coming soon</span></div>`
     +`<div class="dw-ph"><div class="dw-ph-big">Not set yet</div><div>Pick what you are cooking today. This card will show it here.</div></div></div>`
   +`<div class="dw"><div class="dw-hdr"><div class="dw-title">${icn('dice',16)} Random Picker</div><span class="pill">Coming soon</span></div>`
     +`<div class="dw-ph"><div class="dw-ph-big">—</div><div>Let the app choose a recipe for you when you cannot decide.</div></div></div>`
   +`<div class="dw dw-click" onclick="rezAddFromOverview()" role="button" tabindex="0" onkeydown="if(event.key==='Enter')rezAddFromOverview()">`
     +`<div class="dw-hdr"><div class="dw-title">${icn('plus',16)} Add New Meal</div></div>`
     +`<div class="dw-ph" style="border-style:solid;border-color:var(--accent);color:var(--accent);background:var(--accent-soft)">`
       +`<div class="dw-ph-big" style="color:var(--accent)">+</div><div>Add a photo, a title, the duration and how it is made.</div></div></div>`
   +`</div>`;
}
// Fuehrt in die Rezepte-Kategorie UND oeffnet dort direkt das
// Hinzufuegen-Fenster (Nutzer-Wunsch: "wird man in eine zweite Kategorie
// weitergeleitet ... dann ist man automatisch auf den Rezepte-hinzufuegen").
export function rezAddFromOverview(){
  rezShowPage('recipes');
  rezOpenForm(null);
}

// ── REZEPTE ──────────────────────────────────────────────────────────────
function allTags(){
  const set=new Set();
  S.state.index.recipes.forEach(r=>(r.tags||[]).forEach(t=>set.add(t)));
  return[...set].sort((a,b)=>a.localeCompare(b));
}
function visibleRecipes(){
  const q=filters.q.trim().toLowerCase();
  return S.state.index.recipes.filter(r=>{
    if(filters.favOnly&&!r.fav)return false;
    if(filters.maxMin&&(+r.min||0)>filters.maxMin)return false;
    if(filters.tag&&!(r.tags||[]).includes(filters.tag))return false;
    if(q){
      const hay=((r.title||'')+' '+(r.tags||[]).join(' ')).toLowerCase();
      if(!hay.includes(q))return false;
    }
    return true;
  });
}
export function renderRecipes(){
  const el=$('pgRecipes');if(!el)return;
  const tags=allTags();
  const list=visibleRecipes();
  const total=S.state.index.recipes.length;
  const durOpts=[0,15,30,45,60,90].map(m=>`<option value="${m}"${filters.maxMin===m?' selected':''}>${m?'≤ '+fmtDur(m):'Any duration'}</option>`).join('');
  el.innerHTML=
    `<div class="ptitle">Recipes</div>`
   +`<div class="psub">${total?`${list.length} of ${total} shown`:'Nothing here yet — add your first recipe'}</div>`
   +`<div class="rez-toolbar">`
     +`<div class="rez-search">`+icn('search',15)
       +`<input id="rezSearchInp" type="search" placeholder="Search recipes..." value="${escH(filters.q)}" oninput="rezSetQuery(this.value)"></div>`
     +`<select class="rez-sel" onchange="rezSetMaxMin(this.value)">${durOpts}</select>`
     +`<button class="btn${filters.favOnly?' btn-primary':''}" onclick="rezToggleFavFilter()" title="Show favourites only">${icn('star',14)} Favourites</button>`
     +`<button class="btn btn-primary" onclick="rezOpenForm(null)">${icn('plus',14)} Add Recipe</button>`
   +`</div>`
   +(tags.length?`<div class="rez-tags">`
     +`<button class="tag-chip${filters.tag?'':' on'}" onclick="rezSetTag('')">All</button>`
     +tags.map((t,i)=>`<button class="tag-chip${filters.tag===t?' on':''}" onclick="rezSetTagIdx(${i})">${escH(t)}</button>`).join('')
   +`</div>`:'')
   +`<div class="rez-grid">`+(list.length?list.map(cardHtml).join(''):emptyHtml(total))+`</div>`;
}
function emptyHtml(total){
  if(!total)return`<div class="rez-empty"><h4>No recipes yet</h4><p>Add a photo of a dish, give it a title and write down how it is made.</p><button class="btn btn-primary" onclick="rezOpenForm(null)">${icn('plus',14)} Add your first recipe</button></div>`;
  return`<div class="rez-empty"><h4>Nothing matches</h4><p>No recipe matches the current search or filters.</p><button class="btn" onclick="rezClearFilters()">Clear filters</button></div>`;
}
function cardHtml(r){
  const img=r.thumb?`<img class="rez-card-img" src="${r.thumb}" alt="${escH(r.title)}" loading="lazy">`
                   :`<div class="rez-card-img" style="display:flex;align-items:center;justify-content:center;color:var(--t3)">${icn('image',30)}</div>`;
  return`<div class="rez-card" onclick="rezOpenDetail('${r.id}')" role="button" tabindex="0" onkeydown="if(event.key==='Enter')rezOpenDetail('${r.id}')">`
    +img
    +`<button class="rez-card-star${r.fav?' on':''}" onclick="event.stopPropagation();rezToggleFav('${r.id}')" title="${r.fav?'Remove from favourites':'Mark as favourite'}" aria-label="Favourite">`
      +`<svg width="15" height="15" viewBox="0 0 24 24" fill="${r.fav?'currentColor':'none'}" stroke="currentColor" stroke-width="1.75" stroke-linejoin="round">${ICONS.star}</svg></button>`
    +`<div class="rez-card-ov"><div class="rez-card-title">${escH(r.title||'Untitled')}</div>`
      +`<span class="rez-card-dur">${icn('clock',11)}${fmtDur(r.min)}</span></div>`
  +`</div>`;
}
export function rezSetQuery(v){filters.q=v;refreshGridOnly();}
export function rezSetMaxMin(v){filters.maxMin=+v||0;renderRecipes();}
export function rezSetTag(t){filters.tag=t;renderRecipes();}
// ⚠ Tags kommen vom Nutzer und koennen Anfuehrungszeichen enthalten. Sie in
// einen onclick="...('TAG')"-String zu interpolieren zerbricht den Handler,
// sobald jemand einen Apostroph tippt (escH macht daraus &#39;, was der
// HTML-Parser vor der JS-Auswertung wieder zu ' aufloest). Deshalb Index
// statt Wert - der ist immer eine Zahl.
export function rezSetTagIdx(i){const t=allTags()[i];filters.tag=(t===undefined?'':t);renderRecipes();}
export function rezToggleFavFilter(){filters.favOnly=!filters.favOnly;renderRecipes();}
export function rezClearFilters(){filters.q='';filters.maxMin=0;filters.tag='';filters.favOnly=false;renderRecipes();}
// Nur das Raster neu bauen, damit das Suchfeld beim Tippen nicht den Fokus
// (und die Cursorposition) verliert - ein voller renderRecipes() wuerde den
// <input> ersetzen.
function refreshGridOnly(){
  const grid=document.querySelector('#pgRecipes .rez-grid');
  if(!grid){renderRecipes();return;}
  const list=visibleRecipes();
  grid.innerHTML=list.length?list.map(cardHtml).join(''):emptyHtml(S.state.index.recipes.length);
  const sub=document.querySelector('#pgRecipes .psub');
  const total=S.state.index.recipes.length;
  if(sub)sub.textContent=total?`${list.length} of ${total} shown`:'Nothing here yet — add your first recipe';
}
export function rezFocusSearch(){
  rezShowPage('recipes');
  const inp=$('rezSearchInp');if(inp){inp.focus();inp.select();}
}
export async function rezToggleFav(id){
  await S.toggleFav(id);
  refreshGridOnly();
  if(detailId===id)rezOpenDetail(id);
}

// ── MODAL-INFRASTRUKTUR ──────────────────────────────────────────────────
function openModal(html,cls){
  const host=$('rezModals');
  host.innerHTML=`<div class="ov" id="rezOv" onclick="if(event.target===this)rezRequestClose()"><div class="modal ${cls||''}">${html}</div></div>`;
  // ⚠ Erst abmelden, dann anmelden: openModal() wird beim Neuzeichnen des
  // Formulars mehrfach aufgerufen, sonst haengen am Ende N Escape-Handler
  // am document und ein Tastendruck loest N Schliess-Versuche aus.
  document.removeEventListener('keydown',escClose);
  document.addEventListener('keydown',escClose);
}
function escClose(e){if(e.key==='Escape')rezRequestClose();}
// Der EINE Weg nach draussen (Klick daneben, Escape, Cancel-Button). Steht
// ungespeicherte Arbeit im Formular, fragt er nach, statt sie wegzuwerfen.
export function rezRequestClose(){
  if(form&&formDirty()){openUnsavedDialog();return;}
  rezCloseModal();
}
export function rezCloseModal(){
  closeRowMenu();
  closeUnsavedDialog();
  $('rezModals').innerHTML='';
  detailId=null;form=null;formBase=null;
  document.removeEventListener('keydown',escClose);
}

// ══ NACHFRAGE BEI UNGESPEICHERTEN EINGABEN ═══════════════════════════════
// Nutzer-Bugreport 2026-09-01: "wenn man eine Notiz oder ein Rezept
// hinzufuegt und man neben das Fenster schliesst, ist das was man eingegeben
// hat weg". Statt eines Sicherheits-Overlays, das gar nicht mehr zugehen
// will, ein zentriertes Fenster mit drei eindeutigen Wegen. Dieselbe Loesung
// steckt im FX Analyst Pro (#mUnsaved) - beide Apps verhalten sich hier
// gleich, obwohl der Code getrennt ist.
function formDirty(){
  if(!form||!formBase)return false;
  return JSON.stringify(form)!==formBase;
}
function openUnsavedDialog(){
  const host=$('rezConfirm');
  if(!host)return;
  host.innerHTML=
    `<div class="ov uc-ov" onclick="if(event.target===this)rezKeepEditing()"><div class="modal uc-box">`
    +`<h3>Unsaved changes</h3>`
    +`<p class="uc-txt">This recipe has not been saved yet. What do you want to do?</p>`
    +`<div class="uc-btns">`
      +`<button class="uc-btn uc-discard" onclick="rezDiscardClose()">Discard &amp; close</button>`
      +`<button class="uc-btn uc-save" onclick="rezSaveClose()">Save &amp; close</button>`
      +`<button class="uc-btn uc-keep" onclick="rezKeepEditing()">Keep editing</button>`
    +`</div></div></div>`;
}
function closeUnsavedDialog(){const h=$('rezConfirm');if(h)h.innerHTML='';}
export function rezKeepEditing(){closeUnsavedDialog();}
export function rezDiscardClose(){closeUnsavedDialog();form=null;formBase=null;rezCloseModal();toast('Changes discarded');}
export async function rezSaveClose(){
  closeUnsavedDialog();
  const ok=await rezSaveForm();
  // Schlaegt das Speichern fehl (z.B. fehlender Titel oder fehlendes Bild),
  // bleibt das Formular offen - sonst waere genau das passiert, was der
  // Nutzer verhindern wollte: Eingaben weg, ohne dass etwas gespeichert ist.
  if(!ok)toast('Could not save yet - see the message in the form');
}

// ── DETAILFENSTER ────────────────────────────────────────────────────────
export async function rezOpenDetail(id){
  detailId=id;
  const meta=S.state.index.recipes.find(r=>r.id===id);
  if(!meta)return;
  openModal(`<div class="rd-empty" style="padding:26px 0;text-align:center">Loading recipe...</div>`,'modal-wide');
  const doc=await S.getFull(id);
  if(detailId!==id)return;
  if(!doc){
    openModal(`<h3>${escH(meta.title)}</h3><p class="rd-empty">This recipe could not be loaded on this device yet. It will appear once the cloud sync has run.</p>`
      +`<div class="m-btns"><button class="btn" onclick="rezCloseModal()">Close</button></div>`,'modal-wide');
    return;
  }
  const tags=(doc.tags||[]).map(t=>`<span class="rd-chip">${escH(t)}</span>`).join('');
  const ing=(doc.ingredients||[]).filter(x=>x&&x.trim());
  const blocks=(doc.blocks||[]).filter(b=>b&&(b.v||'').trim());
  openModal(
     `<div class="rd-hero">`
      +(doc.cover?`<img src="${doc.cover}" alt="${escH(doc.title)}">`
                 :`<div style="height:180px;display:flex;align-items:center;justify-content:center;background:var(--bg4);color:var(--t3)">${icn('image',34)}</div>`)
      +`<button class="rd-menu-btn" onclick="event.stopPropagation();rezOpenRowMenu(event,'${id}')" title="More" aria-label="More">⋮</button>`
    +`</div>`
    +`<div class="rd-title">${escH(doc.title||'Untitled')}</div>`
    +`<div class="rd-meta"><span class="rd-chip">${icn('clock',12)}${fmtDur(doc.min)}</span>`
      +(doc.fav?`<span class="rd-chip" style="color:var(--star)">${icn('star',12)}Favourite</span>`:'')
      +tags+`</div>`
    +(ing.length?`<div class="rd-sec"><div class="rd-sec-h">Ingredients</div><ul class="rd-ing">${ing.map(x=>`<li>${escH(x)}</li>`).join('')}</ul></div>`:'')
    +`<div class="rd-sec"><div class="rd-sec-h">Preparation</div>`
      +(blocks.length?blocks.map(b=>b.t==='img'
          ?`<div class="rd-block"><img src="${b.v}" alt=""></div>`
          :`<div class="rd-block"><p>${escH(b.v)}</p></div>`).join('')
        :`<div class="rd-empty">No preparation steps written down yet.</div>`)
    +`</div>`
    +`<div class="m-btns"><button class="btn" onclick="rezCloseModal()">Close</button>`
      +`<button class="btn btn-primary" onclick="rezOpenForm('${id}')">Edit recipe</button></div>`
  ,'modal-wide');
}
// ⚠ Am body, position:fixed - ein Kind des scrollenden Modals wuerde am
// Rand abgeschnitten (docs/design-system.md, Overlay-Regel).
export function rezOpenRowMenu(ev,id){
  closeRowMenu();
  const meta=S.state.index.recipes.find(r=>r.id===id)||{};
  const el=document.createElement('div');
  el.className='rd-menu';el.id='rezRowMenu';
  el.innerHTML=
     `<button class="rd-menu-item" onclick="rezCloseRowMenu();rezOpenForm('${id}')">✎ Edit recipe</button>`
    +`<button class="rd-menu-item" onclick="rezCloseRowMenu();rezToggleFav('${id}')">${meta.fav?'☆ Remove favourite':'★ Mark as favourite'}</button>`
    +`<button class="rd-menu-item danger" onclick="rezCloseRowMenu();rezAskDelete('${id}')">🗑 Move to trash</button>`;
  document.body.appendChild(el);
  const r=ev.currentTarget.getBoundingClientRect();
  const w=el.offsetWidth,h=el.offsetHeight;
  el.style.left=Math.max(8,Math.min(window.innerWidth-w-8,r.right-w))+'px';
  el.style.top=(r.bottom+6+h>window.innerHeight?Math.max(8,r.top-h-6):r.bottom+6)+'px';
  setTimeout(()=>document.addEventListener('click',closeRowMenuOnce),0);
}
function closeRowMenuOnce(){closeRowMenu();}
function closeRowMenu(){
  const el=$('rezRowMenu');if(el)el.remove();
  document.removeEventListener('click',closeRowMenuOnce);
}
export function rezCloseRowMenu(){closeRowMenu();}
export function rezAskDelete(id){
  const meta=S.state.index.recipes.find(r=>r.id===id)||{};
  openModal(`<h3>Move to trash?</h3>`
    +`<p style="font-size:13px;color:var(--t2);line-height:1.55;margin-bottom:16px">“${escH(meta.title||'Untitled')}” goes to the trash and stays recoverable for ${S.TRASH_DAYS} days. You can restore it in Settings → Trash.</p>`
    +`<div class="m-btns"><button class="btn" onclick="rezCloseModal()">Cancel</button>`
    +`<button class="btn btn-danger" onclick="rezConfirmDelete('${id}')">Move to trash</button></div>`);
}
export async function rezConfirmDelete(id){
  await S.trashRecipe(id);
  rezCloseModal();
  renderRecipes();renderNav();
  toast('Moved to trash');
}

// ── HINZUFUEGEN / BEARBEITEN ─────────────────────────────────────────────
export async function rezOpenForm(id){
  if(id){
    const doc=await S.getFull(id);
    if(!doc){toast('Recipe not available on this device yet');return;}
    form=JSON.parse(JSON.stringify(doc));
    form.ingredients=(form.ingredients&&form.ingredients.length)?form.ingredients:[''];
    form.blocks=(form.blocks&&form.blocks.length)?form.blocks:[{t:'text',v:''}];
  }else{
    form={id:S.uid(),title:'',min:30,tags:[],fav:false,cover:'',thumb:'',ingredients:[''],blocks:[{t:'text',v:''}],created:'',up:''};
  }
  formBase=JSON.stringify(form);
  renderForm();
}
function renderForm(){
  const isNew=!S.state.index.recipes.some(r=>r.id===form.id);
  const durOpts=DURATIONS.map(m=>`<option value="${m}"${+form.min===m?' selected':''}>${fmtDur(m)}</option>`).join('');
  openModal(
     `<h3>${isNew?'Add recipe':'Edit recipe'}</h3>`
    +`<div class="rf-err" id="rfErr"></div>`
    +`<div class="rf-busy" id="rfBusy">Processing image...</div>`
    +`<label class="dm-lbl">Photo of the dish</label>`
    +`<div class="rf-drop" onclick="rezPickCover()">`
      +(form.cover?`<img src="${form.cover}" alt=""><span class="rf-drop-badge">Change photo</span>`
                  :`${icn('image',26)}<div><b>Click to add a photo</b></div><div>JPG or PNG — it is scaled down automatically</div>`)
    +`</div>`
    +`<div class="rf-row">`
      +`<div><label class="dm-lbl">Title</label><input class="m-inp" id="rfTitle" placeholder="e.g. Pasta al limone" value="${escH(form.title)}" oninput="rezFormField('title',this.value)"></div>`
      +`<div><label class="dm-lbl">Duration</label><select class="m-sel" onchange="rezFormField('min',this.value)">${durOpts}</select></div>`
    +`</div>`
    +`<label class="dm-lbl">Tags (comma separated)</label>`
    +`<input class="m-inp" placeholder="e.g. Dinner, Pasta, Quick" value="${escH((form.tags||[]).join(', '))}" oninput="rezFormTags(this.value)">`
    +`<label class="dm-lbl">Ingredients</label>`
    +`<div id="rfIng">${(form.ingredients||[]).map(ingLine).join('')}</div>`
    +`<div class="rf-add"><button class="btn" onclick="rezAddIngredient()">${icn('plus',13)} Add ingredient</button></div>`
    +`<label class="dm-lbl" style="margin-top:16px">Preparation</label>`
    +`<div class="rf-hint">Write the steps as text, add photos between them, or mix both — the blocks appear in this order in the recipe.</div>`
    +`<div id="rfBlocks">${(form.blocks||[]).map(blockLine).join('')}</div>`
    +`<div class="rf-add"><button class="btn" onclick="rezAddBlock('text')">${icn('plus',13)} Add text</button>`
      +`<button class="btn" onclick="rezAddBlock('img')">${icn('image',13)} Add photo</button></div>`
    +`<div class="m-btns" style="margin-top:18px"><button class="btn" onclick="rezRequestClose()">Cancel</button>`
      +`<button class="btn btn-primary" onclick="rezSaveForm()">${isNew?'Add recipe':'Save changes'}</button></div>`
  ,'modal-wide');
}
function ingLine(v,i){
  return`<div class="rf-line"><input class="m-inp" placeholder="e.g. 200 g pasta" value="${escH(v)}" oninput="rezSetIngredient(${i},this.value)">`
    +`<button class="rf-x" onclick="rezDelIngredient(${i})" title="Remove" aria-label="Remove">×</button></div>`;
}
function blockLine(b,i){
  const total=form.blocks.length;
  const acts=`<div class="rf-blk-acts">`
    +`<button class="rf-x" onclick="rezMoveBlock(${i},-1)" ${i===0?'disabled style="opacity:.35"':''} title="Move up">↑</button>`
    +`<button class="rf-x" onclick="rezMoveBlock(${i},1)" ${i===total-1?'disabled style="opacity:.35"':''} title="Move down">↓</button>`
    +`<button class="rf-x" onclick="rezDelBlock(${i})" title="Remove">×</button></div>`;
  if(b.t==='img'){
    return`<div class="rf-blk"><div class="rf-blk-hd"><span class="rf-blk-lbl">Photo</span>${acts}</div>`
      +(b.v?`<img src="${b.v}" alt="" onclick="rezPickBlockImage(${i})" style="cursor:pointer" title="Click to replace">`
           :`<button class="btn" onclick="rezPickBlockImage(${i})">${icn('image',13)} Choose photo</button>`)
    +`</div>`;
  }
  return`<div class="rf-blk"><div class="rf-blk-hd"><span class="rf-blk-lbl">Text</span>${acts}</div>`
    +`<textarea class="m-area" placeholder="1. Bring a large pot of salted water to the boil..." oninput="rezSetBlock(${i},this.value)">${escH(b.v)}</textarea></div>`;
}
export function rezFormField(k,v){form[k]=k==='min'?+v:v;}
export function rezFormTags(v){form.tags=v.split(',').map(s=>s.trim()).filter(Boolean);}
export function rezSetIngredient(i,v){form.ingredients[i]=v;}
export function rezAddIngredient(){form.ingredients.push('');renderPart('rfIng',form.ingredients.map(ingLine).join(''));}
export function rezDelIngredient(i){
  form.ingredients.splice(i,1);
  if(!form.ingredients.length)form.ingredients=[''];
  renderPart('rfIng',form.ingredients.map(ingLine).join(''));
}
export function rezSetBlock(i,v){form.blocks[i].v=v;}
export function rezAddBlock(t){
  form.blocks.push({t,v:''});
  renderPart('rfBlocks',form.blocks.map(blockLine).join(''));
  if(t==='img')rezPickBlockImage(form.blocks.length-1);
}
export function rezDelBlock(i){
  form.blocks.splice(i,1);
  if(!form.blocks.length)form.blocks=[{t:'text',v:''}];
  renderPart('rfBlocks',form.blocks.map(blockLine).join(''));
}
export function rezMoveBlock(i,d){
  const j=i+d;if(j<0||j>=form.blocks.length)return;
  const[b]=form.blocks.splice(i,1);form.blocks.splice(j,0,b);
  renderPart('rfBlocks',form.blocks.map(blockLine).join(''));
}
function renderPart(id,html){const el=$(id);if(el)el.innerHTML=html;}

// ⚠ DER <input type=file> MUSS IM DOKUMENT HAENGEN.
// Nutzer-Bugreport 2026-09-01 ("das Bild hinzufuegen geht nicht"): die erste
// Fassung hat einen frei erzeugten, NICHT eingehaengten Input geklickt. In
// Chromium funktioniert das - iOS/macOS Safari (also genau die Geraete des
// Nutzers) oeffnet den Dateidialog dann NICHT, der Klick verpufft ohne
// Fehlermeldung. Nachgewiesen im Repro-Lauf: document.body.contains(inp)
// war false. Folgefehler war der zweite gemeldete Punkt - ohne Bild
// verweigert rezSaveForm() das Speichern, was wie "Speichern klappt nicht"
// aussieht.
// Deshalb: einhaengen (unsichtbar, aber Teil des Layouts), klicken, danach
// wieder entfernen. Ausserdem ein Sicherheitsnetz, falls gar nichts
// passiert.
function pickFile(cb){
  const inp=document.createElement('input');
  inp.type='file';inp.accept='image/*';
  inp.style.cssText='position:fixed;left:-9999px;top:0;width:1px;height:1px;opacity:0';
  const weg=()=>{if(inp.parentNode)inp.parentNode.removeChild(inp);};
  inp.onchange=()=>{
    const f=inp.files&&inp.files[0];
    weg();
    if(f)cb(f);
  };
  document.body.appendChild(inp);
  try{inp.click();}
  catch(e){weg();toast('Could not open the file picker');return;}
  // Aufraeumen, falls der Dialog abgebrochen wird (kein change-Ereignis).
  setTimeout(()=>{if(!inp.files||!inp.files.length)weg();},120000);
}
function setBusy(on,txt){
  const el=$('rfBusy');if(!el)return;
  el.textContent=txt||'Processing image...';
  el.style.display=on?'block':'none';
}
export function rezPickCover(){
  pickFile(async f=>{
    setBusy(true);
    try{
      const{cover,thumb}=await S.processCover(f);
      form.cover=cover;form.thumb=thumb;
      renderForm();
    }catch(e){formError('That image could not be read: '+(e&&e.message||'unknown error'));}
    finally{setBusy(false);}
  });
}
export function rezPickBlockImage(i){
  pickFile(async f=>{
    setBusy(true);
    try{
      form.blocks[i].v=await S.processImage(f,S.IMG_BLOCK);
      renderPart('rfBlocks',form.blocks.map(blockLine).join(''));
    }catch(e){formError('That image could not be read: '+(e&&e.message||'unknown error'));}
    finally{setBusy(false);}
  });
}
function formError(msg){
  const el=$('rfErr');if(!el)return;
  el.textContent=msg;el.style.display='block';
  el.scrollIntoView({block:'nearest'});
}
// Gibt true/false zurueck (gespeichert / nicht gespeichert) - die
// Nachfrage beim Schliessen braucht diese Auskunft, sonst wuerde sie das
// Fenster auch dann schliessen, wenn das Speichern gerade gescheitert ist.
export async function rezSaveForm(){
  if(!form)return false;
  const title=(form.title||'').trim();
  if(!title){formError('Please give the recipe a title.');return false;}
  // Bild ist Pflicht (Nutzer-Wunsch: "Wichtig ist, dass man immer Bilder
  // macht") - der Text darum herum ist freiwillig.
  if(!form.cover){formError('Please add a photo of the dish.');return false;}
  const doc={
    id:form.id,title,min:+form.min||5,
    tags:(form.tags||[]).filter(Boolean),
    fav:!!form.fav,cover:form.cover,thumb:form.thumb||'',
    ingredients:(form.ingredients||[]).map(s=>(s||'').trim()).filter(Boolean),
    blocks:(form.blocks||[]).filter(b=>b&&(b.v||'').trim()),
    created:form.created||'',
  };
  // ⚠ OHNE dieses try/catch endete jede Ausnahme des Speicherpfads als
  // unbehandelte Promise-Rejection: das Fenster blieb offen, es erschien
  // keine Meldung, gespeichert war nichts. Genau so ist der Bugreport
  // "das Speichern klappt nicht" entstanden (2026-09-01, per Playwright mit
  // blockierter IndexedDB-Transaktion reproduziert).
  try{
    await S.saveRecipe(doc);
  }catch(e){
    formError('Could not save: '+(e&&e.message||'unknown error'));
    return false;
  }
  formBase=null;form=null;
  rezCloseModal();
  rezShowPage('recipes');
  toast(S.state.dbBroken?'Saved (this device cannot store offline copies)':'Recipe saved');
  return true;
}

// ── EINSTELLUNGEN ────────────────────────────────────────────────────────
export function rezOpenSettings(){
  const cfg=S.getCloudCfg();
  let cur=(S.state.index.settings||{}).theme||THEME_DEFAULT;
  if(THEME_IDS.indexOf(cur)<0)cur=THEME_DEFAULT;
  const trash=(S.state.index.trash||[]).slice().sort((a,b)=>(b.delAt||'').localeCompare(a.delAt||''));
  openModal(
     `<h3>Settings</h3>`
    +`<div class="set-sec"><div class="set-sec-h">Appearance</div>`
      +`<div class="theme-grid">`+THEMES.map(t=>
        `<button class="theme-card${cur===t.id?' on':''}" onclick="rezSetTheme('${t.id}')">`
        +`<div class="theme-sw">${t.sw.map(c=>`<span style="background:${c}"></span>`).join('')}</div>`
        +`<div class="theme-nm">${escH(t.name)}</div><div class="theme-ds">${escH(t.desc)}</div></button>`).join('')
      +`</div></div>`
    +`<div class="set-sec"><div class="set-sec-h">Cloud sync</div>`
      +`<div class="set-row"><div><div class="set-row-t">${cfg?'Connected':'Not connected'}</div>`
        +`<div class="set-row-s">${cfg?'Recipes sync across your devices using the same Supabase project as FX Analyst Pro.'
          :'Set up Supabase sync in FX Analyst Pro once — Perfect Rezept then uses the same connection automatically.'}</div></div>`
        +`<button class="btn" onclick="rezSyncNow()"${cfg?'':' disabled'}>Sync now</button></div>`
      +`<div class="set-row"><div><div class="set-row-t">Status</div><div class="set-row-s" id="rezSyncStatus">${escH(S.state.status||'Idle')}</div></div></div>`
    +`</div>`
    +`<div class="set-sec"><div class="set-sec-h">Trash (${trash.length})</div>`
      +(trash.length?trash.map(t=>
        `<div class="trash-row">`
        +(t.thumb?`<img class="trash-thumb" src="${t.thumb}" alt="">`:`<div class="trash-thumb"></div>`)
        +`<div class="trash-main"><div class="trash-nm">${escH(t.title||'Untitled')}</div>`
        +`<div class="trash-sub">${daysLeft(t.delAt)} day${daysLeft(t.delAt)===1?'':'s'} left</div></div>`
        +`<button class="btn" onclick="rezRestore('${t.id}')">Restore</button>`
        +`<button class="btn btn-danger" onclick="rezDeleteForever('${t.id}')">Delete</button></div>`).join('')
        :`<div class="set-row-s">Deleted recipes stay here for ${S.TRASH_DAYS} days.</div>`)
    +`</div>`
    +`<div class="set-sec"><div class="set-sec-h">Apps</div>`
      +`<div class="set-row"><div><div class="set-row-t">Switch to FX Analyst Pro</div>`
        +`<div class="set-row-s">Perfect Rezept and FX Analyst Pro are two separate apps. This device remembers the last one you opened.</div></div>`
        +`<button class="btn" onclick="rezSwitchApp()">Switch</button></div>`
    +`</div>`
    +`<div class="m-btns"><button class="btn" onclick="rezCloseModal()">Close</button></div>`
  ,'modal-wide');
}
export async function rezSetTheme(id){
  document.documentElement.setAttribute('data-rez-theme',id);
  try{localStorage.setItem('rez_theme',id);}catch(e){}
  const t=THEMES.find(x=>x.id===id);
  const meta=document.querySelector('meta[name="theme-color"]');
  if(meta&&t)meta.setAttribute('content',t.sw[0]);
  await S.setSetting('theme',id);
  rezOpenSettings();
  toast('Theme: '+(t?t.name:id));
}
export async function rezSyncNow(){
  await S.flushSync();
  const el=$('rezSyncStatus');if(el)el.textContent=S.state.status||'Idle';
}
export async function rezRestore(id){
  await S.restoreRecipe(id);
  renderRecipes();renderNav();rezOpenSettings();
  toast('Recipe restored');
}
export async function rezDeleteForever(id){
  await S.deleteForever(id);
  rezOpenSettings();
  toast('Deleted permanently');
}
export function rezSwitchApp(){
  try{localStorage.setItem('dmfx_app_choice','fx');}catch(e){}
  location.href='index.html';
}

// ── Start ────────────────────────────────────────────────────────────────
function applyStoredTheme(){
  let t=(S.state.index.settings||{}).theme;
  if(t&&THEME_IDS.indexOf(t)<0)t=THEME_DEFAULT;   // entferntes Theme -> Standard
  if(!t)return;
  // Der Cloud-Stand gewinnt gegenueber dem lokalen Vorab-Wert aus dem
  // <head>-Skript (der dient nur dazu, ein Aufblitzen zu verhindern).
  if(document.documentElement.getAttribute('data-rez-theme')!==t){
    document.documentElement.setAttribute('data-rez-theme',t);
    try{localStorage.setItem('rez_theme',t);}catch(e){}
  }
  const th=THEMES.find(x=>x.id===t);
  const meta=document.querySelector('meta[name="theme-color"]');
  if(meta&&th)meta.setAttribute('content',th.sw[0]);
}
S.onChange(what=>{
  if(what==='index'){
    applyStoredTheme();
    renderNav();
    if(curPage==='overview')renderOverview();else refreshGridOnly();
  }else if(what==='settings'){
    applyStoredTheme();
  }else if(what==='status'){
    const el=$('rezSyncStatus');if(el)el.textContent=S.state.status||'Idle';
    const b=$('rezSaveBadge');
    if(b){
      // Der Nutzer soll SEHEN, wenn dieses Geraet nicht lokal speichern kann -
      // stilles Weiterlaufen war genau der Fehler aus dem Bugreport.
      b.textContent=S.state.dbBroken?'⚠ No local storage — cloud sync only'
        :(S.state.online?'✓ Saved':'⚠ Offline — saved on this device');
    }
  }
});
(async function start(){
  await S.boot();
  applyStoredTheme();
  rezShowPage('overview');
})();

// ── window-Bruecke fuer die Inline-Handler im HTML ───────────────────────
Object.assign(window,{
  rezShowPage,rezOpenDetail,rezOpenForm,rezCloseModal,rezRequestClose,rezSaveForm,rezOpenSettings,
  rezKeepEditing,rezDiscardClose,rezSaveClose,
  rezSetTheme,rezSyncNow,rezRestore,rezDeleteForever,rezSwitchApp,rezToggleFav,
  rezSetQuery,rezSetMaxMin,rezSetTag,rezSetTagIdx,rezToggleFavFilter,rezClearFilters,rezFocusSearch,
  rezAddFromOverview,rezOpenRowMenu,rezCloseRowMenu,rezAskDelete,rezConfirmDelete,
  rezFormField,rezFormTags,rezSetIngredient,rezAddIngredient,rezDelIngredient,
  rezSetBlock,rezAddBlock,rezDelBlock,rezMoveBlock,rezPickCover,rezPickBlockImage,
});
