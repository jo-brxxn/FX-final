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
import {detectLink,parseCaption,captionToRecipe,creatorFromUrl,creatorFromText,previewUrl,frameUrls} from './import.js';
import {THEMEN,THEMA_BY_ID} from './themen.js';
import {mealDbToItem} from './feed.js';
import {CATS,CAT_BY_ID,categorize,splitQty,suggest} from './groceries.js';
import * as CK from './cook.js';

// ── Konstanten ───────────────────────────────────────────────────────────
const PAGES={overview:'pgOverview',recipes:'pgRecipes',inspo:'pgInspo',
  week:'pgWeek',shopping:'pgShopping',cooked:'pgCooked'};
// Reihenfolge = Reihenfolge in der Sidebar. Overview bleibt oben (Nutzer-
// Vorgabe), danach der Weg, den man im Alltag geht: Rezepte -> Inspiration
// -> Woche planen -> einkaufen -> was gekocht wurde.
const NAV=[
  {id:'overview',label:'Overview'},
  {id:'recipes',label:'Recipes'},
  {id:'inspo',label:'Inspiration'},
  {id:'week',label:'Week'},
  {id:'shopping',label:'Shopping'},
  {id:'cooked',label:'Cooked'},
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
  inspo:'<path d="M9 18h6"/><path d="M10 21h4"/><path d="M12 3a6 6 0 0 1 3.6 10.8c-.6.5-.9 1.1-.9 1.7H9.3c0-.6-.3-1.2-.9-1.7A6 6 0 0 1 12 3z"/>',
  week:'<rect x="3" y="4.5" width="18" height="16" rx="2.5"/><path d="M3 9.5h18"/><path d="M8 2.5v4"/><path d="M16 2.5v4"/>',
  shopping:'<path d="M4 5h2l1.6 9.4a2 2 0 0 0 2 1.6h7.2a2 2 0 0 0 2-1.6L20 8H7"/><circle cx="10" cy="20" r="1.3"/><circle cx="17" cy="20" r="1.3"/>',
  cooked:'<path d="M12 21a7 7 0 0 0 7-7H5a7 7 0 0 0 7 7z"/><path d="M3.5 14h17"/><path d="M9 6.5c0-1 1.5-1.4 1.5-2.5"/><path d="M12.5 6.5c0-1 1.5-1.4 1.5-2.5"/>',
  play:'<circle cx="12" cy="12" r="9"/><path d="M10.2 8.6l5.2 3.4-5.2 3.4z"/>',
  check:'<path d="M20 6L9 17l-5-5"/>',
  link:'<path d="M10.6 13.4a4 4 0 0 0 5.7 0l2.8-2.8a4 4 0 1 0-5.7-5.7l-1.5 1.5"/><path d="M13.4 10.6a4 4 0 0 0-5.7 0l-2.8 2.8a4 4 0 1 0 5.7 5.7l1.5-1.5"/>',
  trashIcon:'<path d="M4 7h16"/><path d="M9 7V5h6v2"/><path d="M6.5 7l1 13h9l1-13"/>',
  arrowL:'<path d="M15 5l-7 7 7 7"/>',
  arrowR:'<path d="M9 5l7 7-7 7"/>',
  search:'<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>',
  share:'<path d="M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7"/><path d="M12 15V3"/><path d="M8 7l4-4 4 4"/>',
  basket:'<path d="M5 11h14l-1.3 8.2a2 2 0 0 1-2 1.8H8.3a2 2 0 0 1-2-1.8z"/><path d="M9 11V7a3 3 0 0 1 6 0v4"/>',
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
// ══ BEWEGUNG ═════════════════════════════════════════════════════════════
// Die Regeln stehen im CSS (rezept.html, Abschnitt BEWEGUNG); hier steht nur,
// was das CSS nicht allein kann.

// Setzt --i je Kind, damit die Karten gestaffelt hereinkommen. GEDECKELT:
// bei 40 Karten waere die letzte sonst erst nach ueber einer Sekunde da -
// aus "lebendig" wird dann "langsam".
const STAGGER_MAX=14;
function renderStagger(host){
  if(!host)return;
  host.querySelectorAll('.stagger').forEach(g=>{
    [...g.children].forEach((c,i)=>c.style.setProperty('--i',Math.min(i,STAGGER_MAX)));
  });
}
// Bilder blenden auf, sobald sie wirklich da sind. Aus dem Cache geladene
// Bilder sind schon fertig, wenn dieser Code laeuft - deshalb complete
// abfragen, sonst blieben sie unsichtbar.
function fadeInImages(host){
  if(!host)return;
  host.querySelectorAll('img').forEach(img=>{
    if(img.classList.contains('rdy'))return;
    if(img.complete&&img.naturalWidth)img.classList.add('rdy');
    else img.addEventListener('load',()=>img.classList.add('rdy'),{once:true});
    img.addEventListener('error',()=>img.classList.add('rdy'),{once:true});
  });
}
// Nach JEDEM Neuzeichnen aufrufen. Eine vergessene Stelle heisst: Karten
// ohne Staffelung und Bilder, die unsichtbar bleiben (opacity:0 im CSS).
function afterRender(host){
  const el=typeof host==='string'?$(host):host;
  renderStagger(el);
  fadeInImages(el);
}
// Der gleitende Balken in der Sidebar. Muss NACH dem Zeichnen laufen, weil
// er die Geometrie des aktiven Eintrags misst.
function moveNavIndicator(){
  const nav=$('rezNav'),ind=$('rezNavInd');
  if(!nav||!ind)return;
  const akt=nav.querySelector('.np.on');
  if(!akt){ind.classList.remove('on');return;}
  ind.style.setProperty('--y',akt.offsetTop+'px');
  ind.style.setProperty('--h',akt.offsetHeight+'px');
  ind.classList.add('on');
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
// Zahl rechts im Navigationseintrag. Zeigt nur, was gerade zaehlt - eine
// "0" waere ein Zaehler ohne Aussage und wird deshalb weggelassen.
function navZaehler(id){
  const ix=S.state.index;
  if(id==='recipes')return ix.recipes.length;
  if(id==='inspo')return ix.inspo.length;
  if(id==='shopping')return S.shoppingItems().filter(i=>!i.done).length;
  if(id==='week')return wochenTage(wochenAnker).reduce((a,d)=>a+S.planFor(S.dayKey(d)).length,0);
  if(id==='cooked')return ix.cooked.length;
  return 0;
}
export function renderNav(){
  const nav=$('rezNav');if(!nav)return;
  // ⚠ Der Indikator ist ein Kind von #rezNav und darf beim Neuaufbau nicht
  // mit weggeworfen werden - sonst springt die Markierung statt zu gleiten.
  const ind=$('rezNavInd');
  nav.innerHTML=NAV.map(n=>{
    const on=curPage===n.id;
    const cnt=navZaehler(n.id);
    return`<button class="np${on?' on':''}" onclick="rezShowPage('${n.id}')" title="${escH(n.label)}" aria-label="${escH(n.label)}">`
      +`<span class="np-ic">${icn(n.id)}</span><span class="np-lbl">${escH(n.label)}</span>`
      +(cnt?`<span class="np-count">${cnt}</span>`:'')+`</button>`;
  }).join('');
  if(ind)nav.appendChild(ind);
  // Zwei Bilder warten: erst danach steht das frische Layout, und der
  // Balken misst die richtige Position statt der alten.
  requestAnimationFrame(()=>requestAnimationFrame(moveNavIndicator));
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
  if(id==='overview')renderOverview();
  else if(id==='recipes')renderRecipes();
  else if(id==='inspo')renderInspo();
  else if(id==='week')renderWeek();
  else if(id==='shopping')renderShopping();
  else if(id==='cooked')renderCooked();
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
  const heute=S.todaysMeal();
  const offen=S.shoppingItems().filter(i=>!i.done).length;
  el.innerHTML=
    `<div class="ptitle">Overview</div>`
   +`<div class="psub">${n?`${n} recipe${n===1?'':'s'} in your collection`:'Your collection is still empty'}`
     +(offen?` · ${offen} item${offen===1?'':'s'} on the shopping list`:'')+`</div>`
   +`<div class="ov-grid stagger">`
   +todayCardHtml(heute)
   +randomCardHtml()
   +`<div class="dw dw-click" onclick="rezOpenMatch()" role="button" tabindex="0" onkeydown="if(event.key==='Enter')rezOpenMatch()">`
     +`<div class="dw-hdr"><div class="dw-title">${icn('basket',16)} What can I cook?</div></div>`
     +`<div class="dw-ph"><div class="dw-ph-big">${icn('basket',26)}</div>`
       +`<div>Tick what you have at home — the app ranks your recipes by how much of it you already have.</div></div></div>`
   +`<div class="dw dw-click" onclick="rezAddFromOverview()" role="button" tabindex="0" onkeydown="if(event.key==='Enter')rezAddFromOverview()">`
     +`<div class="dw-hdr"><div class="dw-title">${icn('plus',16)} Add New Meal</div></div>`
     +`<div class="dw-ph" style="border-style:solid;border-color:var(--accent);color:var(--accent);background:var(--accent-soft)">`
       +`<div class="dw-ph-big" style="color:var(--accent)">+</div><div>Add a photo, a title, the duration and how it is made.</div></div></div>`
   +`</div>`;
  afterRender(el);
}
// ── Karte "Today's Meal" ────────────────────────────────────────────────
// Kein eigenes Feld: was heute ansteht, ist der erste Eintrag im Wochenplan
// fuer heute (S.todaysMeal). Sonst haette man zwei Wahrheiten, die
// auseinanderlaufen, sobald jemand die Woche umplant.
function todayCardHtml(r){
  const kopf=`<div class="dw-hdr"><div class="dw-title">${icn('plate',16)} Today's Meal</div>`
    +(r?`<button class="btn" onclick="rezPickToday()">Change</button>`:'')+`</div>`;
  if(!r){
    return`<div class="dw">${kopf}<div class="dw-ph"><div class="dw-ph-big">Nothing planned</div>`
      +`<div>Pick what you are cooking today.</div>`
      +`<button class="btn btn-primary" style="margin-top:4px" onclick="rezPickToday()">Pick a recipe</button></div></div>`;
  }
  const st=S.cookedStats(r.id);
  return`<div class="dw">${kopf}`
    +`<div class="today-wrap" onclick="rezOpenDetail('${r.id}')" role="button" tabindex="0">`
      +(r.thumb?`<img class="today-img" src="${r.thumb}" alt="">`:`<div class="today-img"></div>`)
      +`<div class="today-meta"><div class="today-nm">${escH(r.title)}</div>`
        +`<div class="today-sub">${icn('clock',12)} ${fmtDur(r.min)}${st.count?` · cooked ${st.count}×`:''}</div></div>`
    +`</div>`
    +`<div class="dw-acts"><button class="btn btn-primary" onclick="rezMarkCooked('${r.id}')">${icn('check',13)} Mark as cooked</button>`
      +`<button class="btn" onclick="rezClearToday('${r.id}')">Clear</button></div></div>`;
}
// ── Karte "Random Picker" ──────────────────────────────────────────────
// Zieht aus den Rezepten, die den eingestellten Filtern entsprechen, und
// meidet standardmaessig alles, was in den letzten 7 Tagen schon auf dem
// Tisch stand - genau dafuer gibt es den Koch-Verlauf.
let randomPick=null;
const randomOpts={maxMin:0,tag:'',skipRecent:true};
function randomKandidaten(){
  const grenze=Date.now()-7*86400000;
  return S.state.index.recipes.filter(r=>{
    if(randomOpts.maxMin&&(+r.min||0)>randomOpts.maxMin)return false;
    if(randomOpts.tag&&!(r.tags||[]).includes(randomOpts.tag))return false;
    if(randomOpts.skipRecent){
      const st=S.cookedStats(r.id);
      if(st.last&&(Date.parse(st.last)||0)>grenze)return false;
    }
    return true;
  });
}
function randomCardHtml(){
  const kand=randomKandidaten();
  const tags=allTags();
  const durOpts=[0,15,30,45,60,90].map(m=>`<option value="${m}"${randomOpts.maxMin===m?' selected':''}>${m?'≤ '+fmtDur(m):'Any duration'}</option>`).join('');
  const tagOpts=`<option value="">All tags</option>`+tags.map(t=>`<option value="${escH(t)}"${randomOpts.tag===t?' selected':''}>${escH(t)}</option>`).join('');
  let mitte;
  if(randomPick){
    mitte=`<div class="today-wrap" onclick="rezOpenDetail('${randomPick.id}')" role="button" tabindex="0">`
      +(randomPick.thumb?`<img class="today-img" src="${randomPick.thumb}" alt="">`:`<div class="today-img"></div>`)
      +`<div class="today-meta"><div class="today-nm">${escH(randomPick.title)}</div>`
      +`<div class="today-sub">${icn('clock',12)} ${fmtDur(randomPick.min)}</div></div></div>`;
  }else{
    mitte=`<div class="dw-ph"><div class="dw-ph-big">${kand.length?'?':'—'}</div>`
      +`<div>${kand.length?`${kand.length} recipe${kand.length===1?'':'s'} match — let the app choose one.`
        :'No recipe matches these settings.'}</div></div>`;
  }
  return`<div class="dw"><div class="dw-hdr"><div class="dw-title">${icn('dice',16)} Random Picker</div></div>`
    +`<div class="rnd-opts">`
      +`<select class="rez-sel" onchange="rezRandomOpt('maxMin',this.value)">${durOpts}</select>`
      +(tags.length?`<select class="rez-sel" onchange="rezRandomOpt('tag',this.value)">${tagOpts}</select>`:'')
      +`<label class="rnd-chk"><input type="checkbox" ${randomOpts.skipRecent?'checked':''} onchange="rezRandomOpt('skipRecent',this.checked)"> Skip last 7 days</label>`
    +`</div>`
    +mitte
    +`<div class="dw-acts"><button class="btn btn-primary" onclick="rezRoll()" ${kand.length?'':'disabled'}>${icn('dice',13)} ${randomPick?'Roll again':'Surprise me'}</button>`
      +(randomPick?`<button class="btn" onclick="rezCookThis('${randomPick.id}')">Cook this today</button>`:'')
    +`</div></div>`;
}
export function rezRandomOpt(k,v){
  randomOpts[k]=(k==='maxMin')?(+v||0):(k==='skipRecent'?!!v:v);
  randomPick=null;
  renderOverview();
}
export function rezRoll(){
  const k=randomKandidaten();
  if(!k.length){toast('No recipe matches these settings');return;}
  // Bei mehr als einem Kandidaten nie zweimal hintereinander dasselbe ziehen -
  // sonst wirkt der Generator kaputt, obwohl der Zufall korrekt ist.
  let n=k[Math.floor(Math.random()*k.length)];
  if(k.length>1&&randomPick){
    let schutz=0;
    while(n.id===randomPick.id&&schutz++<12)n=k[Math.floor(Math.random()*k.length)];
  }
  randomPick=n;
  renderOverview();
  // Die Karte dreht sich einmal durch - dieselbe Geste wie ein Wuerfel, und
  // sie macht sichtbar, DASS neu gezogen wurde (bei zwei Kandidaten sonst
  // schwer zu erkennen). Rein visuell, ohne Wartezeit: das Ergebnis steht
  // bereits, die Animation laeuft darueber.
  const karte=document.querySelectorAll('#pgOverview .dw')[1];
  const ziel=karte&&karte.querySelector('.today-wrap');
  if(ziel){ziel.classList.remove('rnd-flip');void ziel.offsetWidth;ziel.classList.add('rnd-flip');}
}
export async function rezCookThis(id){
  await S.setTodaysMeal(id);
  randomPick=null;
  renderOverview();
  toast('Planned for today');
}
export async function rezMarkCooked(id){
  await S.logCooked(id,0);
  renderOverview();
  toast('Added to your cooking history');
}
export async function rezClearToday(id){
  await S.removeFromPlan(S.dayKey(),id);
  renderOverview();
  toast('Cleared');
}
export function rezPickToday(){
  openRecipePicker('Pick today\'s meal',async id=>{
    await S.setTodaysMeal(id);
    rezCloseModal();
    renderOverview();
    toast('Planned for today');
  });
}
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
   +`<div class="rez-grid stagger">`+(list.length?list.map(cardHtml).join(''):emptyHtml(total))+`</div>`;
  afterRender(el);
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
    // Von aussen sichtbar, dass das Rezept mehr als ein Foto hat
    // (Nutzer-Wunsch 2026-09-02) - die Bilder selbst liegen im
    // Volldokument, das im Raster gar nicht geladen ist, deshalb nur die
    // Anzahl aus dem Verzeichnis.
    +((r.imgs||0)>1?`<span class="rez-card-imgs">${icn('image',11)} ${r.imgs}</span>`:'')
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
  afterRender($('pgRecipes'));
}
export async function rezToggleFav(id){
  await S.toggleFav(id);
  refreshGridOnly();
  if(detailId===id)rezOpenDetail(id);
}

// ══ BILDER EINES REZEPTS ═════════════════════════════════════════════════
// Nutzer-Wunsch 2026-09-02: "die Bilder die man bei Rezepten hinzufuegt
// sollen immer zu sehen sein, also von aussen und im Rezept und im Cook
// Mode." Bis dahin tauchten Bilder aus den Zubereitungs-Bloecken NUR im
// Detailfenster auf - auf der Karte sah man nur das Titelbild, im Kochmodus
// standen sie als eigene, textlose Schritte dazwischen.
//
// Eine Quelle fuer alle drei Stellen: Titelbild zuerst, dann die Bilder aus
// den Bloecken in ihrer Reihenfolge.
function recipeImages(doc){
  const out=[];
  if(doc&&doc.cover)out.push({src:doc.cover,rolle:'cover'});
  (doc&&doc.blocks||[]).forEach((b,i)=>{
    if(b&&b.t==='img'&&b.v)out.push({src:b.v,rolle:'step',i});
  });
  return out;
}
// ── Grossansicht ───────────────────────────────────────────────────────
// Eigener Host ueber allem: sie muss auch aus dem Kochmodus heraus
// funktionieren, und der liegt bereits ueber der App-Shell.
let _lightbox=[],_lbIdx=0;
export function rezLightbox(bilder,i){
  _lightbox=bilder||[];_lbIdx=Math.max(0,Math.min(i||0,_lightbox.length-1));
  zeichneLightbox();
}
function zeichneLightbox(){
  const host=$('rezLight');
  if(!host)return;
  if(!_lightbox.length){host.innerHTML='';host.classList.remove('on');return;}
  const b=_lightbox[_lbIdx];
  host.classList.add('on');
  host.innerHTML=
     `<div class="lb-ov" onclick="if(event.target===this)rezLightboxClose()">`
      +`<button class="lb-x" onclick="rezLightboxClose()" aria-label="Close">✕</button>`
      +(_lightbox.length>1?`<button class="lb-nav lb-prev" onclick="rezLightboxStep(-1)" aria-label="Previous photo">${icn('arrowL',22)}</button>`:'')
      +`<img class="lb-img" src="${b.src}" alt="">`
      +(_lightbox.length>1?`<button class="lb-nav lb-next" onclick="rezLightboxStep(1)" aria-label="Next photo">${icn('arrowR',22)}</button>`:'')
      +(_lightbox.length>1?`<div class="lb-count">${_lbIdx+1} / ${_lightbox.length}</div>`:'')
    +`</div>`;
}
export function rezLightboxStep(d){
  if(!_lightbox.length)return;
  _lbIdx=(_lbIdx+d+_lightbox.length)%_lightbox.length;
  zeichneLightbox();
}
export function rezLightboxClose(){
  _lightbox=[];
  const host=$('rezLight');
  if(host){host.innerHTML='';host.classList.remove('on');}
}
// Escape und Pfeiltasten - die Grossansicht liegt ueber allem und muss
// deshalb ihre eigenen Tasten bedienen, bevor das Fenster darunter sie sieht.
document.addEventListener('keydown',e=>{
  if(!_lightbox.length)return;
  if(e.key==='Escape'){e.stopPropagation();rezLightboxClose();}
  else if(e.key==='ArrowLeft'){e.stopPropagation();rezLightboxStep(-1);}
  else if(e.key==='ArrowRight'){e.stopPropagation();rezLightboxStep(1);}
},true);
// Aus dem HTML heraus (Inline-Handler koennen keine Objekte uebergeben):
// die Bilder des gerade offenen Rezepts merken.
let _aktuelleBilder=[];
export function rezShowImage(i){rezLightbox(_aktuelleBilder,i);}

// ══ KOCHMODUS ════════════════════════════════════════════════════════════
// Vollbild, grosse Schrift, Bildschirm bleibt an. Beim Kochen steht das
// Geraet zwei Meter weg und man hat nasse Haende - 13px-Text und eine
// Bildschirmsperre nach 30 Sekunden machen die App dort unbrauchbar.
let cookDoc=null,cookStep=0,cookDone=new Set(),cookServ=0,cookMedia='photo';
export async function rezCook(id){
  const g=modalGen();
  const doc=await S.getFull(id);
  if(modalVeraltet(g)&&document.body.classList.contains('cooking'))return;
  if(!doc){toast('Recipe not available on this device yet');return;}
  cookDoc=doc;cookStep=0;cookDone=new Set();cookMedia='photo';
  cookServ=doc.servings||2;
  document.body.classList.add('cooking');
  CK.keepAwake(true);
  CK.audioReady();          // im Nutzer-Gestus, sonst darf der Timer spaeter nicht klingeln
  renderCook();
}
export function rezCookExit(){
  document.body.classList.remove('cooking');
  CK.keepAwake(false);
  cookDoc=null;
  const h=$('rezCook');if(h)h.innerHTML='';
  renderNav();
}
function cookSteps(doc){
  // Die Zubereitung steht als Bloecke da. Fuer den Kochmodus wird sie in
  // einzelne Schritte zerlegt: Textbloecke an Zeilenumbruechen.
  // ⚠ Ein Bild wird an den VORHERGEHENDEN Schritt geheftet, statt ein
  // eigener, textloser Schritt zu werden (Nutzer-Wunsch 2026-09-02: die
  // Bilder sollen auch im Kochmodus zu sehen sein). Vorher musste man am
  // Bild vorbeiblaettern, um den zugehoerigen Text zu lesen - Bild und
  // Anweisung gehoeren zusammen. Nur ein Bild GANZ AM ANFANG (ohne Text
  // davor) bleibt ein eigener Schritt.
  const out=[];
  (doc.blocks||[]).forEach(b=>{
    if(b.t==='img'){
      const letzter=out[out.length-1];
      if(letzter&&letzter.t==='text'&&!letzter.img)letzter.img=b.v;
      else out.push({t:'img',v:b.v});
      return;
    }
    String(b.v||'').split(/\n+/).forEach(z=>{
      const t=z.replace(/^\s*\d{1,2}[.)]\s*/,'').trim();
      if(t)out.push({t:'text',v:t});
    });
  });
  return out.length?out:[{t:'text',v:'No preparation steps written down yet.'}];
}
// ⚠ DREI SPALTEN (Nutzer-Wunsch 2026-09-02: "im Kochmodus links die Zutaten,
// dann in der Mitte das Bild oder das Video ... und dann rechts die
// Zubereitung und oben mittig die Timer Funktion").
// Vorher war die Mitte ein Assistent, der einen Schritt nach dem anderen
// zeigte - beim Kochen will man aber sehen, was als Naechstes kommt, ohne zu
// blaettern. Jetzt stehen ALLE Schritte rechts, der aktive ist gross und
// hervorgehoben, und die Mitte gehoert dem Bild bzw. dem Video.
export function renderCook(){
  const host=$('rezCook');
  if(!host||!cookDoc)return;
  const schritte=cookSteps(cookDoc);
  cookStep=Math.max(0,Math.min(cookStep,schritte.length-1));
  const s=schritte[cookStep];
  const basis=cookDoc.servings||2;
  const faktor=basis?cookServ/basis:1;
  const zut=(cookDoc.ingredients||[]).map((z,i)=>{
    const txt=CK.scaleIngredient(z,faktor);
    return`<label class="ck-ing${cookDone.has('i'+i)?' done':''}">`
      +`<input type="checkbox" ${cookDone.has('i'+i)?'checked':''} onchange="rezCookTick('i${i}')">`
      +`<span>${escH(txt)}</span></label>`;
  }).join('');
  const timer=CK.findTimers(s.t==='text'?s.v:'');
  _aktuelleBilder=recipeImages(cookDoc);
  const vid=cookDoc.source?detectLink(cookDoc.source):null;
  const hatVideo=!!(vid&&vid.embedUrl);
  if(cookMedia==='video'&&!hatVideo)cookMedia='photo';
  const streifen=_aktuelleBilder.length
    ? `<div class="ck-side-h" style="margin-top:18px">Photos</div>`
      +`<div class="ck-strip">`+_aktuelleBilder.map((b,i)=>
          `<img src="${b.src}" alt="" onclick="rezShowImage(${i})" loading="lazy">`).join('')+`</div>`
    : '';
  // ⚠ Der Video-Rahmen darf beim Schrittwechsel NICHT neu geladen werden -
  // sonst springt das Video bei jedem Klick an den Anfang zurueck. Deshalb
  // wird er vor dem Neuzeichnen aus dem DOM geloest und danach wieder
  // eingehaengt, statt ihn neu zu schreiben.
  let alterRahmen=null;
  const wrap=$('ckVideoWrap');
  if(cookMedia==='video'&&wrap){alterRahmen=wrap;wrap.remove();}
  const bildSrc=s.t==='img'?s.v:(s.img||cookDoc.cover||(_aktuelleBilder[0]&&_aktuelleBilder[0].src)||'');
  const bildIdx=bildSrc?_aktuelleBilder.findIndex(x=>x.src===bildSrc):-1;
  // Beim Video gibt das Format der Plattform das Seitenverhaeltnis vor:
  // YouTube quer, Reels von Instagram/TikTok hochkant.
  const vidAr=vid&&vid.platform==='youtube'?'1.7778':'0.5625';
  const medien=cookMedia==='video'
    ? `<div class="ck-media" id="ckMedia" style="--ck-ar:${vidAr}"></div>`
    : `<div class="ck-media" id="ckMedia">`
       +(bildSrc
         ?`<img src="${bildSrc}" alt="" onload="rezCookAspect(this)" onclick="rezShowImage(${bildIdx})">`
         :`<div class="ck-media-empty">No photo for this recipe yet — you can add one from the recipe window.</div>`)
       +`</div>`;
  const stepListe=schritte.map((x,i)=>{
    const txt=x.t==='text'?x.v:'Photo';
    const th=x.img||(x.t==='img'?x.v:'');
    return`<button class="ck-stp${i===cookStep?' on':''}${cookDone.has('s'+i)?' done':''}" onclick="rezCookGo(${i})">`
      +`<span class="ck-stp-n">${cookDone.has('s'+i)?'✓':(i+1)}</span>`
      +`<span class="ck-stp-t">${escH(txt)}</span>`
      +(th?`<img class="ck-stp-thumb" src="${th}" alt="">`:'')
    +`</button>`;
  }).join('');
  host.innerHTML=
     `<div class="ck-bar">`
      +`<button class="ck-x" onclick="rezCookExit()" aria-label="Close cook mode">✕</button>`
      +`<div class="ck-title">${escH(cookDoc.title)}</div>`
      +`<div class="ck-tmwrap" id="ckTimers"></div>`
      +`<div class="ck-serv"><button class="ck-sv" onclick="rezCookServ(-1)" aria-label="Fewer servings">−</button>`
        +`<span>${cookServ} ${cookServ===1?'serving':'servings'}</span>`
        +`<button class="ck-sv" onclick="rezCookServ(1)" aria-label="More servings">+</button></div>`
    +`</div>`
    +`<div class="ck-body">`
      +`<aside class="ck-side"><div class="ck-side-h">Ingredients</div>`
        +(zut||'<div class="ck-empty">No ingredients listed.</div>')+streifen+`</aside>`
      +`<main class="ck-main">`
        +(hatVideo?`<div class="ck-mtabs">`
          +`<button class="ck-mtab${cookMedia==='photo'?' on':''}" onclick="rezCookMedia('photo')">${icn('image',13)} Photo</button>`
          +`<button class="ck-mtab${cookMedia==='video'?' on':''}" onclick="rezCookMedia('video')">${icn('play',13)} Video</button>`
        +`</div>`:'')
        +medien
        +`<div class="ck-cap">`+(cookMedia==='video'
            ?escH((vid&&vid.label)||'Video')+' — the reel this recipe came from'
            :(s.t==='text'?'Step '+(cookStep+1)+' of '+schritte.length:'Photo'))+`</div>`
      +`</main>`
      +`<aside class="ck-side ck-side-r">`
        +`<div class="ck-side-h">Preparation</div>`
        +`<div class="ck-prog"><span class="ck-prog-bar"><span style="width:${Math.round((cookStep+1)/schritte.length*100)}%"></span></span></div>`
        +`<div class="ck-steps">${stepListe}</div>`
        +(timer.length?`<div class="ck-timers" style="margin-top:12px">`+timer.map(t=>
            `<button class="btn btn-primary" onclick="rezStartTimer(${t.sek},'${escH(t.label).replace(/'/g,'')}')">${icn('clock',14)} ${escH(t.label)}</button>`).join('')+`</div>`:'')
        +`<div class="ck-nav">`
          +`<button class="btn" onclick="rezCookStep(-1)" ${cookStep===0?'disabled':''}>${icn('arrowL',14)} Back</button>`
          +`<button class="btn" onclick="rezCookTick('s${cookStep}')">${cookDone.has('s'+cookStep)?'✓ Done':'Mark step done'}</button>`
          +(cookStep<schritte.length-1
            ?`<button class="btn btn-primary" onclick="rezCookStep(1)">Next ${icn('arrowR',14)}</button>`
            :`<button class="btn btn-primary" onclick="rezCookFinish()">${icn('check',14)} Finish &amp; log</button>`)
        +`</div>`
      +`</aside>`
    +`</div>`;
  const slot=$('ckMedia');
  if(cookMedia==='video'&&slot){
    if(alterRahmen)slot.appendChild(alterRahmen);
    else slot.appendChild(videoRahmen(vid));
  }
  renderCookTimers();
  renderTimerPanel();
}
// Das Medienfeld nimmt das Seitenverhaeltnis des geladenen Bildes an -
// ein hochkantes Reel-Bild bekommt kein Querformat-Fenster mit Balken.
export function rezCookAspect(img){
  const box=img&&img.closest('.ck-media');
  if(!box)return;
  const w=img.naturalWidth||0,h=img.naturalHeight||0;
  if(w>0&&h>0)box.style.setProperty('--ck-ar',(w/h).toFixed(4));
}
export function rezCookMedia(m){
  if(cookMedia===m)return;
  cookMedia=m;
  renderCook();
}
export function rezCookGo(i){cookStep=i;renderCook();}
function videoRahmen(l){
  const el=document.createElement('div');
  el.id='ckVideoWrap';
  el.style.cssText='width:100%;height:100%';
  const src=l.embedUrl+(l.platform==='youtube'
    ?(l.embedUrl.includes('?')?'&':'?')+'playsinline=1':'');
  el.innerHTML=`<iframe src="${escH(src)}" loading="lazy" allowfullscreen`
    +` referrerpolicy="origin-when-cross-origin" allow="autoplay; encrypted-media; picture-in-picture"`
    +` sandbox="allow-scripts allow-same-origin allow-popups allow-presentation" title="Recipe video"></iframe>`;
  return el;
}
// Timer OBEN MITTIG im Kochmodus. Dieselben Timer wie unten in der Leiste -
// nur wird die Leiste im Kochmodus ausgeblendet (siehe rezept.html), damit
// dieselbe Uhr nicht an zwei Stellen laeuft.
function renderCookTimers(){
  const host=$('ckTimers');
  if(!host)return;
  const liste=CK.activeTimers();
  if(!liste.length){
    host.innerHTML=`<button class="btn" onclick="rezOpenTimerDialog()">${icn('clock',14)} Timer</button>`;
    return;
  }
  const stumm=liste.some(t=>t.state==='done'&&t.blocked);
  host.innerHTML=liste.map(t=>
     `<div class="ck-tm${t.state==='done'?' ring':''}">`
      +`<span class="ck-tm-clock">${CK.fmtClock(t.rest)}</span>`
      +`<span class="ck-tm-lbl">${escH(t.label)}</span>`
      +(t.state==='done'
        ?`<button class="ck-tm-btn" onclick="rezTimerStop('${t.id}')" aria-label="Stop timer">✓</button>`
        :`<button class="ck-tm-btn" onclick="rezTimer${t.state==='run'?'Pause':'Resume'}('${t.id}')" aria-label="Pause or resume">${t.state==='run'?'❚❚':'▶'}</button>`
         +`<button class="ck-tm-btn" onclick="rezTimerPlus('${t.id}')" aria-label="Add a minute">+1</button>`)
      +`<button class="ck-tm-btn" onclick="rezTimerStop('${t.id}')" aria-label="Remove timer">×</button>`
    +`</div>`).join('')
    +`<button class="btn" onclick="rezOpenTimerDialog()">${icn('plus',13)} Timer</button>`
    +(stumm?`<div class="ck-tm-mute">🔇 No sound came out — your device may be on silent.</div>`:'');
}
export function rezCookStep(d){cookStep+=d;renderCook();}
export function rezCookTick(k){if(cookDone.has(k))cookDone.delete(k);else cookDone.add(k);renderCook();}
export function rezCookServ(d){cookServ=Math.max(1,Math.min(24,cookServ+d));renderCook();}
export async function rezCookFinish(){
  const id=cookDoc&&cookDoc.id;
  rezCookExit();
  if(id){await S.logCooked(id,0);toast('Logged in your cooking history');}
  rezShowPage('cooked');
}

// ══ VIDEO AM REZEPT ══════════════════════════════════════════════════════
// Stammt ein Rezept aus einem Reel, soll man das Video auch VOM REZEPT aus
// sehen koennen - im Detailfenster und im Kochmodus (Nutzer-Wunsch
// 2026-09-02: "im Rezept und im Cook Mode oder halt das Video").
// Es gelten dieselben Grenzen wie in der Inspiration: die Abspielleiste gibt
// es nur bei YouTube, Instagram und TikTok erlauben keine Steuerung von
// aussen.
export async function rezPlayVideo(id){
  const doc=await S.getFull(id);
  if(!doc||!doc.source){toast('This recipe has no video');return;}
  const l=detectLink(doc.source);
  if(!l||!l.embedUrl){
    window.open(doc.source,'_blank','noopener');
    return;
  }
  zeigeVideo(l,doc.title);
}
function zeigeVideo(l,titel){
  const host=$('rezVideo');
  if(!host)return;
  const src=l.embedUrl+(l.platform==='youtube'
    ?(l.embedUrl.includes('?')?'&':'?')+'enablejsapi=1&playsinline=1&origin='+encodeURIComponent(location.origin)
    :'');
  host.classList.add('on');
  host.innerHTML=
     `<div class="vd-ov" onclick="if(event.target===this)rezCloseVideo()">`
      +`<div class="vd-box">`
        +`<div class="vd-hd"><span class="vd-title">${escH(titel||'Video')}</span>`
          +`<button class="lb-x" onclick="rezCloseVideo()" aria-label="Close">✕</button></div>`
        +`<div class="insp-frame${l.platform==='youtube'?' yt':''}"><iframe id="inspFrame" src="${escH(src)}" loading="lazy" allowfullscreen`
          +` referrerpolicy="origin-when-cross-origin" allow="autoplay; encrypted-media; picture-in-picture"`
          +` sandbox="allow-scripts allow-same-origin allow-popups allow-presentation" title="${escH(titel||'Video')}"></iframe></div>`
        +(l.platform==='youtube'
          ?`<div class="yt-bar" id="ytBar" hidden>`
            +`<button class="yt-btn" id="ytPlay" onclick="rezYtToggle()" aria-label="Play or pause">▶</button>`
            +`<button class="yt-btn" onclick="rezYtSeek(-10)" aria-label="Back 10 seconds">−10</button>`
            +`<span class="yt-time" id="ytCur">0:00</span>`
            +`<input class="yt-range" id="ytRange" type="range" min="0" max="1000" value="0"`
            +` oninput="rezYtScrub(this.value)" onchange="rezYtScrubEnd(this.value)" aria-label="Position in the video">`
            +`<span class="yt-time" id="ytDur">0:00</span>`
            +`<button class="yt-btn" onclick="rezYtSeek(10)" aria-label="Forward 10 seconds">+10</button></div>`
            +`<div class="insp-note" id="ytNote">Loading the player…</div>`
          :`<div class="insp-note">Instagram and TikTok do not allow an app to control their player from the outside — use the controls inside the video.</div>`)
      +`</div></div>`;
  if(l.platform==='youtube')ytStart();
}
export function rezCloseVideo(){
  ytStop();
  const host=$('rezVideo');
  if(host){host.innerHTML='';host.classList.remove('on');}
}


// ══ TITELBILD AUS DEM VIDEO ("Screenshot aus dem Reel") ══════════════════
// Nutzer-Wunsch 2026-09-02: "Screenshot aus dem Reel als Titelbild direkt in
// der App auswaehlbar machen".
// ⚠ WAS TECHNISCH GEHT UND WAS NICHT - nachgeprueft, nicht geschaetzt:
//   • YouTube legt zu jedem Video oeffentliche Standbilder ab (0/1/2/3.jpg,
//     hqdefault, maxresdefault). Die lassen sich hier direkt anzeigen und
//     als Titelbild uebernehmen - ein echtes Bild AUS dem Video.
//   • Instagram und TikTok: das Video laeuft in einem fremden Rahmen. Diese
//     Seite darf ihn weder auslesen noch abmalen (Same-Origin-Regel des
//     Browsers, keine Einstellung, die man umlegen koennte), und die
//     Vorschaubilder liegen hinter kurzlebig signierten Adressen. Ein Knopf
//     "Bild aus dem Video holen" waere dort eine Attrappe.
//   Deshalb steht das Video LINKS im selben Fenster: anhalten, mit dem
//   Geraet ein Bildschirmfoto machen, rechts einfuegen oder auswaehlen -
//   ohne die App zu verlassen. Danach zuschneiden, weil ein Bildschirmfoto
//   vom Handy hochkant ist und die Telefonleisten mit drauf hat.
let _cs=null;   // {mode,id,link,titel,img,sel,ratio}
function coverOffen(){return !!_cs;}
export function rezCoverStudio(){
  if(!form){toast('Open a recipe first');return;}
  starteCover('form',form.id,detectLink(form.source||''),form.title||'Recipe');
}
export function rezCoverStudioInspo(id){
  const i=S.state.index.inspo.find(x=>x.id===id);
  if(!i)return;
  starteCover('inspo',id,detectLink(i.url||''),i.title||'Idea');
}
function starteCover(mode,id,link,titel){
  _cs={mode,id,link:link||null,titel,img:null,sel:{x:.05,y:.05,w:.9,h:.9},ratio:4/3,quelle:''};
  document.addEventListener('paste',csPaste);
  zeichneCover();
}
export function rezCloseCover(){
  if(_cs)gibFrei(_cs.quelle);
  _cs=null;
  document.removeEventListener('paste',csPaste);
  const h=$('rezCover');
  if(h){h.innerHTML='';h.classList.remove('on');}
}
function csFehler(msg){
  const el=$('csErr');
  if(!el){toast(msg);return;}
  el.textContent=msg;el.style.display='block';
}
function zeichneCover(){
  const host=$('rezCover');
  if(!host||!_cs)return;
  host.classList.add('on');
  host.innerHTML=`<div class="cs-ov" onclick="if(event.target===this)rezCloseCover()"><div class="cs-box">`
    +`<div class="cs-hd"><h3>${_cs.img?'Crop the cover':'Cover from the video'}</h3>`
      +`<button class="cs-x" onclick="rezCloseCover()" aria-label="Close">✕</button></div>`
    +(_cs.img?cropHtml():pickHtml())
  +`</div></div>`;
  if(_cs.img)bindeCrop();
  else{const d=$('csDrop');if(d)bindeDrop(d);}
  afterRender(host);
}
function pickHtml(){
  const l=_cs.link;
  const frames=frameUrls(l);
  const src=l&&l.embedUrl?l.embedUrl+(l.platform==='youtube'
    ?(l.embedUrl.includes('?')?'&':'?')+'playsinline=1':''):'';
  const links=src
    ? `<div class="cs-embed${l.platform==='youtube'?' yt':''}"><iframe id="csFrame" src="${escH(src)}" loading="lazy" allowfullscreen`
      +` referrerpolicy="origin-when-cross-origin" allow="autoplay; encrypted-media; picture-in-picture"`
      +` sandbox="allow-scripts allow-same-origin allow-popups allow-presentation" title="${escH(_cs.titel)}"></iframe></div>`
      +`<div class="cs-note" style="margin-top:10px">Play the reel, pause it on the frame you want, take a screenshot with your device — then add it on the right.</div>`
    : `<div class="cs-note">This recipe has no video link. You can still pick a photo or paste a screenshot.</div>`;
  return`<div class="cs-grid"><div>${links}</div><div>`
    +(frames.length
      ?`<div class="cs-sec">Frames from the video</div>`
       +`<div class="cs-frames">`+frames.map((f,i)=>
          `<button class="cs-frame" onclick="rezCoverFrame(${i})"><img src="${escH(f.url)}" alt="" loading="lazy"`
          +` onerror="this.closest('.cs-frame').style.display='none'"><span>${escH(f.label)}</span></button>`).join('')+`</div>`
      :(_cs.link?`<div class="cs-note">${escH(_cs.link.label||'This platform')} does not hand out frames of a reel to other websites — that is their restriction, not a missing feature here. A screenshot works just as well:</div>`:''))
    +`<div class="cs-sec">Your screenshot</div>`
    +`<div class="cs-drop" id="csDrop" onclick="rezCoverPick()">${icn('image',22)}`
      +`<div><b>Click to choose a screenshot</b></div><div>or drop it here — you can also paste with ⌘V / Ctrl+V</div></div>`
    +`<div class="cs-btns"><button class="btn" onclick="rezCoverPaste()">${icn('image',13)} Paste from clipboard</button>`
      +`<button class="btn" onclick="rezCloseCover()">Cancel</button></div>`
    +`<div class="cs-err" id="csErr"></div>`
  +`</div></div>`;
}
function cropHtml(){
  const s=_cs.sel;
  const r=[['Free',0],['4:3',4/3],['3:4',3/4],['1:1',1],['16:9',16/9],['9:16',9/16]];
  return`<div class="cs-note">Drag the frame to move it, pull the round handle to resize. Everything outside stays out of the cover.</div>`
    +`<div class="cs-ratios">`+r.map(([lbl,v])=>
        `<button class="cs-ratio${Math.abs((_cs.ratio||0)-v)<1e-6?' on':''}" onclick="rezCoverRatio(${v})">${lbl}</button>`).join('')+`</div>`
    +`<div class="cs-crop" id="csCrop"><img id="csImg" src="${_cs.quelle}" alt="">`
      +`<div class="cs-sel" id="csSel" style="left:${s.x*100}%;top:${s.y*100}%;width:${s.w*100}%;height:${s.h*100}%">`
        +`<span class="cs-h" id="csH"></span></div></div>`
    +`<div class="cs-btns"><button class="btn" onclick="rezCoverBack()">${icn('arrowL',13)} Choose another</button>`
      +`<button class="btn btn-primary" onclick="rezCoverUse()">${icn('check',13)} Use as cover</button></div>`
    +`<div class="cs-err" id="csErr"></div>`;
}
// Ein aus einer Datei erzeugter Verweis muss wieder freigegeben werden -
// sonst haelt der Browser das ganze Bildschirmfoto im Speicher.
function gibFrei(u){if(u&&u.indexOf('blob:')===0)try{URL.revokeObjectURL(u);}catch(e){}}
export function rezCoverBack(){if(!_cs)return;gibFrei(_cs.quelle);_cs.img=null;_cs.quelle='';zeichneCover();}
export function rezCoverRatio(v){
  if(!_cs)return;
  _cs.ratio=v||0;
  if(v)passeSelAn();
  zeichneCover();
}
// Das Seitenverhaeltnis gilt in BILDPUNKTEN. Die Auswahl steht in Anteilen
// des Bildes, deshalb muss die Bildgroesse mitgerechnet werden - sonst waere
// "1:1" auf einem Hochkantbild ein Rechteck.
function passeSelAn(){
  const im=_cs.img;if(!im||!_cs.ratio)return;
  const nw=im.naturalWidth,nh=im.naturalHeight,s=_cs.sel;
  let h=(s.w*nw)/(_cs.ratio*nh);
  if(h>1){h=1;s.w=(_cs.ratio*nh)/nw;}
  s.h=h;
  s.x=Math.min(s.x,1-s.w);s.y=Math.min(s.y,1-s.h);
  if(s.x<0){s.x=0;s.w=Math.min(1,s.w);}
  if(s.y<0){s.y=0;s.h=Math.min(1,s.h);}
}
function bindeCrop(){
  const box=$('csCrop'),sel=$('csSel'),h=$('csH');
  if(!box||!sel||!h)return;
  let modus='',startX=0,startY=0,start=null;
  const ab=(e)=>{
    const r=box.getBoundingClientRect();
    const dx=(e.clientX-startX)/r.width,dy=(e.clientY-startY)/r.height;
    const s=_cs.sel;
    if(modus==='move'){
      s.x=Math.max(0,Math.min(1-start.w,start.x+dx));
      s.y=Math.max(0,Math.min(1-start.h,start.y+dy));
    }else{
      s.w=Math.max(.08,Math.min(1-s.x,start.w+dx));
      if(_cs.ratio){
        const nw=_cs.img.naturalWidth,nh=_cs.img.naturalHeight;
        s.h=Math.min(1-s.y,(s.w*nw)/(_cs.ratio*nh));
        s.w=(s.h*_cs.ratio*nh)/nw;
      }else{
        s.h=Math.max(.08,Math.min(1-s.y,start.h+dy));
      }
    }
    sel.style.left=(s.x*100)+'%';sel.style.top=(s.y*100)+'%';
    sel.style.width=(s.w*100)+'%';sel.style.height=(s.h*100)+'%';
  };
  const hoch=()=>{modus='';window.removeEventListener('pointermove',ab);window.removeEventListener('pointerup',hoch);};
  const runter=(m)=>(e)=>{
    e.preventDefault();e.stopPropagation();
    modus=m;startX=e.clientX;startY=e.clientY;start=Object.assign({},_cs.sel);
    window.addEventListener('pointermove',ab);
    window.addEventListener('pointerup',hoch);
  };
  sel.addEventListener('pointerdown',runter('move'));
  h.addEventListener('pointerdown',runter('size'));
  // Ein Bildschirmfoto ist hochkant: sinnvoll vorbelegen, statt den Nutzer
  // jedes Mal von Hand ziehen zu lassen.
  const im=$('csImg');
  if(im&&!im.complete)im.addEventListener('load',()=>{passeSelAn();zeichneCover();},{once:true});
}
function bindeDrop(el){
  el.addEventListener('dragover',e=>{e.preventDefault();el.classList.add('over');});
  el.addEventListener('dragleave',()=>el.classList.remove('over'));
  el.addEventListener('drop',e=>{
    e.preventDefault();el.classList.remove('over');
    const f=e.dataTransfer&&e.dataTransfer.files&&e.dataTransfer.files[0];
    if(f)nimmDatei(f);else csFehler('That was not an image file.');
  });
}
function csPaste(e){
  if(!_cs||_cs.img)return;
  const it=(e.clipboardData&&e.clipboardData.items)||[];
  for(let i=0;i<it.length;i++){
    if(it[i].type&&it[i].type.indexOf('image')===0){
      const f=it[i].getAsFile();
      if(f){e.preventDefault();nimmDatei(f);return;}
    }
  }
}
// ⚠ navigator.clipboard.read() gibt es nicht ueberall und es fragt um
// Erlaubnis. Scheitert es, sagt die App WARUM und nennt den Weg, der immer
// geht - statt still nichts zu tun.
export async function rezCoverPaste(){
  if(!navigator.clipboard||!navigator.clipboard.read){
    csFehler('This browser does not let a page read the clipboard. Press ⌘V / Ctrl+V instead, or use “Click to choose a screenshot”.');
    return;
  }
  try{
    const items=await navigator.clipboard.read();
    for(const it of items){
      const typ=(it.types||[]).find(t=>t.indexOf('image')===0);
      if(typ){nimmDatei(await it.getType(typ));return;}
    }
    csFehler('There is no image in the clipboard — take a screenshot first.');
  }catch(err){
    csFehler('Could not read the clipboard: '+((err&&err.message)||'permission denied')+'. Press ⌘V / Ctrl+V instead.');
  }
}
export function rezCoverPick(){
  pickFile(f=>nimmDatei(f));
}
function nimmDatei(blob){
  if(!_cs)return;
  if(!blob||(blob.type&&blob.type.indexOf('image')!==0)){csFehler('That file is not an image.');return;}
  const url=URL.createObjectURL(blob);
  ladeBildEl(url,false).then(img=>{
    _cs.img=img;_cs.quelle=url;
    _cs.sel={x:.05,y:.05,w:.9,h:.9};
    passeSelAn();
    zeichneCover();
  }).catch(e=>csFehler('That image could not be read: '+((e&&e.message)||'unknown error')));
}
// Ein Standbild von YouTube. Es MUSS mit crossOrigin geladen werden, sonst
// ist die Zeichenflaeche "verunreinigt" und liefert kein Bild zurueck.
export function rezCoverFrame(i){
  if(!_cs)return;
  const f=frameUrls(_cs.link)[i];
  if(!f)return;
  ladeBildEl(f.url,true).then(img=>{
    _cs.img=img;_cs.quelle=f.url;
    _cs.sel={x:0,y:0,w:1,h:1};_cs.ratio=0;
    zeichneCover();
  }).catch(()=>csFehler('YouTube did not hand out that frame. Try another one, or use a screenshot.'));
}
function ladeBildEl(url,cors){
  return new Promise((res,rej)=>{
    const img=new Image();
    if(cors)img.crossOrigin='anonymous';
    const t=setTimeout(()=>rej(new Error('timeout')),9000);
    img.onload=()=>{clearTimeout(t);res(img);};
    img.onerror=()=>{clearTimeout(t);rej(new Error('load failed'));};
    img.src=url;
  });
}
// Zuschnitt anwenden: der gewaehlte Ausschnitt wird in BILDPUNKTEN des
// Originals ausgeschnitten (nicht in Bildschirmpunkten - sonst haenge die
// Schaerfe an der Fenstergroesse).
export async function rezCoverUse(){
  if(!_cs||!_cs.img)return;
  try{
    const im=_cs.img,s=_cs.sel;
    const nw=im.naturalWidth||im.width,nh=im.naturalHeight||im.height;
    const sx=Math.round(s.x*nw),sy=Math.round(s.y*nh);
    const sw=Math.max(1,Math.round(s.w*nw)),sh=Math.max(1,Math.round(s.h*nh));
    const cv=document.createElement('canvas');
    cv.width=sw;cv.height=sh;
    const ctx=cv.getContext('2d');
    ctx.imageSmoothingQuality='high';
    ctx.drawImage(im,sx,sy,sw,sh,0,0,sw,sh);
    const cover=CK.encodeToBudgetFrom(cv,S.IMG_COVER),thumb=CK.encodeToBudgetFrom(cv,S.IMG_THUMB);
    if(_cs.mode==='form'){
      if(!form){rezCloseCover();return;}
      form.cover=cover;form.thumb=thumb;
      rezCloseCover();
      renderForm();
      toast('Cover updated');
    }else{
      const it=S.state.index.inspo.find(x=>x.id===_cs.id);
      if(!it){rezCloseCover();return;}
      it.thumb=thumb;
      await S.saveInspo(it);
      rezCloseCover();
      renderInspo();
      toast('Cover updated');
    }
  }catch(e){
    // Genau hier landet der Fall "fremdes Bild ohne CORS": toDataURL wirft.
    csFehler('This image could not be used: '+((e&&e.message)||'unknown error')
      +'. A screenshot from your own device always works.');
  }
}

// ══ TIMER-LEISTE ═════════════════════════════════════════════════════════
// Liegt ueber allem und bleibt sichtbar, auch wenn man den Kochmodus
// verlaesst - ein Timer, den man beim Wegklicken verliert, ist keiner.
export function rezStartTimer(sek,label){
  CK.addTimer(sek,label);
  toast('Timer started: '+CK.fmtClock(sek));
}
export function rezTimerPause(id){CK.pauseTimer(id);}
export function rezTimerResume(id){CK.resumeTimer(id);}
export function rezTimerPlus(id){CK.addMinute(id,1);}
export function rezTimerStop(id){CK.stopTimer(id);}
export function rezOpenTimerDialog(){
  openModal(
     `<h3>Start a timer</h3>`
    +`<div class="tm-quick">`+[1,3,5,10,15,20,30,45,60].map(m=>
        `<button class="btn" onclick="rezStartTimer(${m*60},'${m} min');rezCloseModal()">${m} min</button>`).join('')+`</div>`
    +`<label class="dm-lbl" style="margin-top:14px">Custom</label>`
    +`<div class="tm-custom"><input class="m-inp" id="tmMin" type="number" min="1" max="360" value="10" style="margin-bottom:0">`
      +`<span class="tm-unit">minutes</span>`
      +`<button class="btn btn-primary" onclick="rezStartCustomTimer()">Start</button></div>`
    +`<div class="m-btns"><button class="btn" onclick="rezCloseModal()">Cancel</button></div>`);
}
export function rezStartCustomTimer(){
  const v=+(($('tmMin')||{}).value||0);
  if(!v||v<1){toast('Enter a number of minutes');return;}
  rezStartTimer(Math.min(360,v)*60,v+' min');
  rezCloseModal();
}
function renderTimerPanel(){
  const host=$('rezTimers');
  if(!host)return;
  const liste=CK.activeTimers();
  if(!liste.length){
    host.innerHTML='';host.classList.remove('on');
    document.body.classList.remove('timers-on','timer-ring');
    return;
  }
  host.classList.add('on');
  const klingelt=liste.some(t=>t.state==='done');
  // ⚠ Der Hinweis auf ein stummes Geraet erscheint NUR, wenn die Wiedergabe
  // wirklich fehlgeschlagen ist - nicht vorsorglich. Den Stummschalter
  // eines iPhones kann kein Browser abfragen (siehe cook.js), deshalb
  // klingelt es zusaetzlich immer sichtbar.
  const stumm=liste.some(t=>t.state==='done'&&t.blocked);
  host.innerHTML=
     (stumm?`<div class="tm-mute">🔇 No sound came out — your device may be on silent. The timer is shown here and vibrates instead.</div>`:'')
    +liste.map(t=>{
      const p=t.total?Math.max(0,Math.min(100,(t.rest/t.total)*100)):0;
      return`<div class="tm-row${t.state==='done'?' ring':''}">`
        +`<span class="tm-clock">${CK.fmtClock(t.rest)}</span>`
        +`<span class="tm-meta"><span class="tm-lbl">${escH(t.label)}</span>`
          +`<span class="tm-bar"><span style="width:${p}%"></span></span></span>`
        +(t.state==='done'
          ?`<button class="btn btn-primary" onclick="rezTimerStop('${t.id}')">${icn('check',13)} Stop</button>`
          :`<button class="btn" onclick="rezTimer${t.state==='run'?'Pause':'Resume'}('${t.id}')">${t.state==='run'?'Pause':'Resume'}</button>`)
        +`<button class="btn" onclick="rezTimerPlus('${t.id}')" title="Add a minute">+1</button>`
        +`<button class="rf-x" onclick="rezTimerStop('${t.id}')" aria-label="Remove timer">×</button>`
      +`</div>`;
    }).join('');
  document.body.classList.toggle('timer-ring',klingelt);
  // ⚠ Die Timer-Leiste liegt fest am unteren Rand. Ohne diese Klasse
  // verdeckt sie im Kochmodus die Schritt-Navigation ("Back / Next") und auf
  // den normalen Seiten die letzte Zeile - beim ersten Screenshot genau so
  // passiert. Die Klasse schafft unten Platz, solange ein Timer laeuft.
  document.body.classList.add('timers-on');
}
CK.onTimers(()=>{
  renderTimerPanel();
  // ⚠ NUR die Timer-Zeile neu schreiben, nicht den ganzen Kochmodus - sonst
  // laedt der Video-Rahmen jede Sekunde neu.
  if(document.body.classList.contains('cooking'))renderCookTimers();
});

// ══ REZEPT-AUSWAHL (gemeinsamer Baustein) ════════════════════════════════
// EIN Auswahlfenster fuer alle Stellen, die ein Rezept brauchen (Today's
// Meal, Wochenplan, Zufallsgenerator). Projektregel: wiederkehrende
// UI-Bausteine sind ueberall gleich aufgebaut (docs/design-system.md) - eine
// zweite, leicht andere Auswahlliste waere genau der Fehler, den die Regel
// verhindern soll.
let _pickCb=null,_pickQ='';
function openRecipePicker(titel,cb){
  _pickCb=cb;_pickQ='';
  zeichnePicker(titel);
}
function zeichnePicker(titel){
  const q=_pickQ.trim().toLowerCase();
  const liste=S.state.index.recipes.filter(r=>!q||(r.title||'').toLowerCase().includes(q));
  openModal(
     `<h3>${escH(titel)}</h3>`
    +`<div class="rez-search" style="margin-bottom:12px">${icn('search',15)}`
      +`<input id="pickQ" type="search" placeholder="Search recipes..." value="${escH(_pickQ)}" oninput="rezPickQuery(this.value)"></div>`
    +`<div class="pick-list">`+(liste.length?liste.map(r=>
        `<button class="pick-row" onclick="rezPickChoose('${r.id}')">`
        +(r.thumb?`<img class="pick-thumb" src="${r.thumb}" alt="">`:`<span class="pick-thumb"></span>`)
        +`<span class="pick-main"><span class="pick-nm">${escH(r.title)}</span>`
        +`<span class="pick-sub">${fmtDur(r.min)}${(r.tags||[]).length?' · '+escH(r.tags.join(', ')):''}</span></span></button>`).join('')
      :`<div class="rd-empty" style="padding:22px 0;text-align:center">No recipes yet — add one first.</div>`)
    +`</div>`
    +`<div class="m-btns"><button class="btn" onclick="rezCloseModal()">Cancel</button></div>`
  ,'modal-wide');
  _pickTitel=titel;
}
let _pickTitel='';
export function rezPickQuery(v){
  _pickQ=v;
  const host=document.querySelector('.pick-list');
  if(!host){zeichnePicker(_pickTitel);return;}
  const q=v.trim().toLowerCase();
  const liste=S.state.index.recipes.filter(r=>!q||(r.title||'').toLowerCase().includes(q));
  host.innerHTML=liste.length?liste.map(r=>
      `<button class="pick-row" onclick="rezPickChoose('${r.id}')">`
      +(r.thumb?`<img class="pick-thumb" src="${r.thumb}" alt="">`:`<span class="pick-thumb"></span>`)
      +`<span class="pick-main"><span class="pick-nm">${escH(r.title)}</span>`
      +`<span class="pick-sub">${fmtDur(r.min)}${(r.tags||[]).length?' · '+escH(r.tags.join(', ')):''}</span></span></button>`).join('')
    :`<div class="rd-empty" style="padding:22px 0;text-align:center">Nothing matches.</div>`;
}
export function rezPickChoose(id){
  const cb=_pickCb;
  if(cb)cb(id);
}

// ══ GLOBALE SUCHE ════════════════════════════════════════════════════════
// Die Kopfzeilen-Suche durchsuchte bisher nur Rezepttitel. Jetzt alles, was
// man suchen wuerde: Titel, Zutaten, Notizen, Inspirationen, Verlauf.
let _sucheQ='';
export function rezFocusSearch(){
  _sucheQ='';
  zeichneSuche();
  setTimeout(()=>{const i=$('gsInp');if(i){i.focus();}},60);
}
function trefferListe(q){
  const n=(x)=>String(x||'').toLowerCase();
  const k=n(q).trim();
  if(!k)return{rez:[],insp:[],cook:[]};
  const rez=S.state.index.recipes.filter(r=>
    n(r.title).includes(k)||(r.tags||[]).some(t=>n(t).includes(k))
    ||n((S.state.full.get(r.id)||{}).ingredients?(S.state.full.get(r.id).ingredients||[]).join(' '):'').includes(k)
    ||n((S.state.full.get(r.id)||{}).notes).includes(k)).slice(0,12);
  const insp=S.state.index.inspo.filter(i=>
    n(i.title).includes(k)||n(i.caption).includes(k)||n(i.creator).includes(k)
    ||(i.tags||[]).some(t=>n(t).includes(k))).slice(0,8);
  const cook=S.state.index.cooked.filter(c=>n(c.title).includes(k)).slice(0,6);
  return{rez,insp,cook};
}
function zeichneSuche(){
  const t=trefferListe(_sucheQ);
  const block=(titel,eintraege,bauen)=>eintraege.length
    ?`<div class="gs-grp"><div class="gs-grp-h">${titel} · ${eintraege.length}</div>${eintraege.map(bauen).join('')}</div>`:'';
  openModal(
     `<h3>Search</h3>`
    +`<div class="rez-search" style="margin-bottom:12px">${icn('search',15)}`
      +`<input id="gsInp" type="search" placeholder="Recipes, ingredients, notes, ideas…" value="${escH(_sucheQ)}" oninput="rezSearchQuery(this.value)"></div>`
    +`<div class="gs-res" id="gsRes">`+(
      _sucheQ.trim()
        ?(block('Recipes',t.rez,r=>`<button class="pick-row" onclick="rezCloseModal();rezOpenDetail('${r.id}')">`
            +(r.thumb?`<img class="pick-thumb" src="${r.thumb}" alt="">`:`<span class="pick-thumb"></span>`)
            +`<span class="pick-main"><span class="pick-nm">${escH(r.title)}</span>`
            +`<span class="pick-sub">${fmtDur(r.min)}${(r.tags||[]).length?' · '+escH(r.tags.join(', ')):''}</span></span></button>`)
         +block('Ideas',t.insp,i=>`<button class="pick-row" onclick="rezCloseModal();rezShowPage('inspo');rezOpenInspo('${i.id}')">`
            +(i.thumb?`<img class="pick-thumb" src="${i.thumb}" alt="">`:`<span class="pick-thumb"></span>`)
            +`<span class="pick-main"><span class="pick-nm">${escH(i.title||'Idea')}</span>`
            +`<span class="pick-sub">${escH(i.creator||i.label||'')}</span></span></button>`)
         +block('Cooked',t.cook,c=>`<button class="pick-row" onclick="rezCloseModal();rezOpenDetail('${c.recipeId}')">`
            +(c.thumb?`<img class="pick-thumb" src="${c.thumb}" alt="">`:`<span class="pick-thumb"></span>`)
            +`<span class="pick-main"><span class="pick-nm">${escH(c.title||'Recipe')}</span>`
            +`<span class="pick-sub">${new Date(c.date).toLocaleDateString()}</span></span></button>`)
         ||`<div class="rd-empty" style="padding:22px 0;text-align:center">Nothing matches “${escH(_sucheQ)}”.</div>`)
        :`<div class="rd-empty" style="padding:22px 0;text-align:center">Type to search across recipes, ingredients, notes, ideas and your cooking history.</div>`)
    +`</div>`
    +`<div class="m-btns"><button class="btn" onclick="rezCloseModal()">Close</button></div>`
  ,'modal-wide');
}
export function rezSearchQuery(v){
  _sucheQ=v;
  const host=$('gsRes');
  if(!host){zeichneSuche();return;}
  // Nur die Trefferliste neu bauen - ein voller Neuaufbau wuerde den Fokus
  // und die Schreibmarke aus dem Feld werfen.
  const merk=$('gsInp')&&$('gsInp').selectionStart;
  zeichneSucheNurTreffer();
  const i=$('gsInp');
  if(i){i.focus();try{i.setSelectionRange(merk,merk);}catch(e){}}
}
function zeichneSucheNurTreffer(){
  const alt=$('gsRes');if(!alt)return;
  const hoehe=alt.offsetHeight;
  zeichneSuche();
  const neu=$('gsRes');if(neu&&hoehe)neu.style.minHeight='';
}

// ══ "WAS KANN ICH KOCHEN?" ═══════════════════════════════════════════════
// Man hakt ab, was da ist; die App sortiert die Rezepte nach Trefferquote
// und sagt, was fehlt. ⚠ Bewusst OHNE dauerhafte Vorratskammer (vom Nutzer
// ausdruecklich gestrichen) - die Auswahl gilt nur fuer diesen Durchgang.
let _habe=new Set(),_habeQ='';
export async function rezOpenMatch(){
  _habe=new Set();_habeQ='';
  const g=modalGen();
  // Zutaten aller Rezepte brauchen die Volldokumente - einmal nachladen.
  for(const r of S.state.index.recipes){
    if(!S.state.full.has(r.id))await S.getFull(r.id);
    if(modalVeraltet(g))return;      // inzwischen woanders hingeklickt
  }
  if(modalVeraltet(g))return;
  zeichneMatch();
}
function alleZutaten(){
  const z=new Map();
  S.state.index.recipes.forEach(r=>{
    const d=S.state.full.get(r.id);
    (d&&d.ingredients||[]).forEach(i=>{
      const k=zutKey(i);
      if(!k)return;
      const e=z.get(k)||{key:k,text:zutName(i),n:0};
      e.n++;z.set(k,e);
    });
  });
  return[...z.values()].sort((a,b)=>b.n-a.n);
}
// Vergleichsform: Menge weg, Kleinschreibung, Umlaute ausgeschrieben - sonst
// gilt "200 g Spaghetti" und "Spaghetti" als zwei verschiedene Dinge.
function zutKey(t){
  const ohne=splitQty(String(t||'')).name;
  return ohne.toLowerCase().replace(/ä/g,'ae').replace(/ö/g,'oe').replace(/ü/g,'ue').replace(/ß/g,'ss')
    .replace(/[^\w\s]/g,' ').replace(/\s+/g,' ').trim();
}
function zutName(t){return splitQty(String(t||'')).name||String(t||'');}
function matchListe(){
  const out=[];
  S.state.index.recipes.forEach(r=>{
    const d=S.state.full.get(r.id);
    const zut=(d&&d.ingredients||[]).filter(x=>x&&x.trim());
    if(!zut.length)return;
    const fehlt=zut.filter(z=>!_habe.has(zutKey(z)));
    out.push({r,gesamt:zut.length,fehlt,quote:(zut.length-fehlt.length)/zut.length});
  });
  return out.filter(x=>x.quote>0).sort((a,b)=>b.quote-a.quote||a.fehlt.length-b.fehlt.length);
}
function zeichneMatch(){
  const alle=alleZutaten();
  const q=_habeQ.trim().toLowerCase();
  const sicht=alle.filter(z=>!q||z.text.toLowerCase().includes(q)).slice(0,60);
  const treffer=_habe.size?matchListe().slice(0,10):[];
  openModal(
     `<h3>What can I cook?</h3>`
    +`<div class="rf-hint">Tick what you have at home. Nothing is stored — this is just for right now.</div>`
    +`<div class="rez-search" style="margin-bottom:10px">${icn('search',15)}`
      +`<input id="mtQ" type="search" placeholder="Filter ingredients…" value="${escH(_habeQ)}" oninput="rezMatchQuery(this.value)"></div>`
    +`<div class="mt-chips">`+(sicht.length?sicht.map((z,i)=>
        `<button class="tag-chip${_habe.has(z.key)?' on':''}" onclick="rezMatchTick(${i})">${escH(z.text)}</button>`).join('')
      :`<div class="rd-empty">No ingredients yet — add a recipe first.</div>`)+`</div>`
    +(_habe.size?`<div class="rd-sec-h" style="margin-top:16px">Best matches</div>`
      +(treffer.length?treffer.map(t=>
        `<div class="mt-row">`
          +(t.r.thumb?`<img class="pick-thumb" src="${t.r.thumb}" alt="" onclick="rezCloseModal();rezOpenDetail('${t.r.id}')">`:`<span class="pick-thumb"></span>`)
          +`<div class="mt-main"><div class="mt-nm" onclick="rezCloseModal();rezOpenDetail('${t.r.id}')">${escH(t.r.title)}</div>`
            +`<div class="mt-sub">${Math.round(t.quote*100)}% · ${t.fehlt.length?escH('missing: '+t.fehlt.map(zutName).slice(0,4).join(', ')):'you have everything'}</div></div>`
          +(t.fehlt.length?`<button class="btn" onclick="rezMatchToShopping('${t.r.id}')">${icn('shopping',13)} Missing</button>`:'')
        +`</div>`).join('')
        :`<div class="rd-empty">Nothing matches yet.</div>`)
      :'')
    +`<div class="m-btns"><button class="btn" onclick="rezCloseModal()">Close</button></div>`
  ,'modal-wide');
  _matchSicht=sicht;
}
let _matchSicht=[];
export function rezMatchQuery(v){_habeQ=v;zeichneMatch();const i=$('mtQ');if(i){i.focus();i.setSelectionRange(v.length,v.length);}}
export function rezMatchTick(i){
  const z=_matchSicht[i];if(!z)return;
  if(_habe.has(z.key))_habe.delete(z.key);else _habe.add(z.key);
  zeichneMatch();
}
export async function rezMatchToShopping(id){
  const d=S.state.full.get(id)||await S.getFull(id);
  if(!d)return;
  const fehlt=(d.ingredients||[]).filter(z=>z&&z.trim()&&!_habe.has(zutKey(z)));
  const n=await S.addIngredients(fehlt.map(z=>({text:z,src:d.title})));
  renderNav();
  toast(n?`${n} item${n===1?'':'s'} added to the shopping list`:'Everything was already on the list');
}

// ══ REZEPT TEILEN ════════════════════════════════════════════════════════
// Als BILD, damit es auch bei jemandem ankommt, der die App nicht hat.
// Gezeichnet auf ein Canvas - kein Nachladen, funktioniert offline.
export async function rezShareRecipe(id){
  const doc=await S.getFull(id);
  if(!doc){toast('Recipe not available on this device yet');return;}
  toast('Preparing image…');
  try{
    const blob=await rezeptBild(doc);
    const datei=new File([blob],(doc.title||'recipe').replace(/[^\w -]/g,'').slice(0,40)+'.png',{type:'image/png'});
    if(navigator.canShare&&navigator.canShare({files:[datei]})){
      await navigator.share({files:[datei],title:doc.title||'Recipe'});
      return;
    }
    // Rueckfallebene: herunterladen. Ein Link mit download-Attribut ist der
    // einzige Weg, der ohne Share-Schnittstelle ueberall funktioniert.
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');
    a.href=url;a.download=datei.name;
    document.body.appendChild(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),4000);
    toast('Saved as an image');
  }catch(e){
    if(e&&e.name==='AbortError')return;   // Nutzer hat den Teilen-Dialog abgebrochen
    toast('Could not create the image: '+(e&&e.message||'unknown error'));
  }
}
function rezeptBild(doc){
  return new Promise((res,rej)=>{
    const B=1080,rand=64;
    const cv=document.createElement('canvas');
    const ctx=cv.getContext('2d');
    const cs=getComputedStyle(document.documentElement);
    const v=(k,f)=>(cs.getPropertyValue(k).trim()||f);
    const bg=v('--bg2','#ffffff'),t0=v('--t0','#111111'),t2=v('--t2','#555555'),akz=v('--accent','#444444');
    const ff=v('--ff-title','sans-serif'),ft=v('--ff-text','sans-serif');
    const zut=(doc.ingredients||[]).filter(x=>x&&x.trim());
    const schritte=[];
    (doc.blocks||[]).forEach(b=>{if(b.t!=='img')String(b.v||'').split(/\n+/).forEach(z=>{const t=z.trim();if(t)schritte.push(t);});});
    const zeichne=(bild)=>{
      const bildH=bild?Math.round(B*0.62):0;
      // Hoehe vorher rechnen, damit nichts abgeschnitten wird.
      ctx.font=`400 30px ${ft}`;
      const umbruch=(txt,breite)=>{
        const w=String(txt).split(/\s+/),z=[];let akt='';
        w.forEach(x=>{const p=akt?akt+' '+x:x;if(ctx.measureText(p).width>breite&&akt){z.push(akt);akt=x;}else akt=p;});
        if(akt)z.push(akt);return z;
      };
      const nutz=B-rand*2;
      const zZ=zut.map(x=>umbruch('•  '+x,nutz).length).reduce((a,b)=>a+b,0);
      const sZ=schritte.map((x,i)=>umbruch((i+1)+'.  '+x,nutz).length).reduce((a,b)=>a+b,0);
      const H=bildH+rand*2+90+50+(zut.length?60+zZ*44:0)+(schritte.length?60+sZ*44:0)+80;
      cv.width=B;cv.height=H;
      ctx.fillStyle=bg;ctx.fillRect(0,0,B,H);
      if(bild)ctx.drawImage(bild,0,0,B,bildH);
      let y=bildH+rand+40;
      ctx.fillStyle=t0;ctx.font=`800 58px ${ff}`;
      umbruch(doc.title||'Recipe',nutz).slice(0,2).forEach(z=>{ctx.fillText(z,rand,y);y+=64;});
      ctx.fillStyle=t2;ctx.font=`600 30px ${ft}`;
      ctx.fillText(fmtDur(doc.min)+(doc.servings?'  ·  '+doc.servings+' servings':''),rand,y);y+=54;
      const abschnitt=(titel,zeilen)=>{
        if(!zeilen.length)return;
        ctx.fillStyle=akz;ctx.font=`800 24px ${ft}`;
        ctx.fillText(titel.toUpperCase(),rand,y);y+=16;
        ctx.strokeStyle=akz;ctx.globalAlpha=.35;ctx.beginPath();ctx.moveTo(rand,y);ctx.lineTo(B-rand,y);ctx.stroke();ctx.globalAlpha=1;y+=40;
        ctx.fillStyle=t0;ctx.font=`400 30px ${ft}`;
        zeilen.forEach(z=>{umbruch(z,nutz).forEach(w=>{ctx.fillText(w,rand,y);y+=44;});});
        y+=20;
      };
      abschnitt('Ingredients',zut.map(x=>'•  '+x));
      abschnitt('Preparation',schritte.map((x,i)=>(i+1)+'.  '+x));
      ctx.fillStyle=t2;ctx.font=`600 24px ${ft}`;
      ctx.fillText('Perfect Rezept',rand,H-rand+10);
      cv.toBlob(b=>b?res(b):rej(new Error('Canvas could not be exported')),'image/png');
    };
    if(doc.cover){
      const im=new Image();
      im.onload=()=>zeichne(im);
      im.onerror=()=>zeichne(null);
      im.src=doc.cover;
    }else zeichne(null);
  });
}


// ══ TAEGLICHE ESSENSVORSCHLAEGE ══════════════════════════════════════════
// Nutzer-Wunsch 2026-09-03: "irgendeine Quelle die jeden Tag neue
// essenvorschlaege mit direkt erstellbaren Rezepten liefert ... in einer
// Reihe immer 3 Gerichte ... wenn ich alle gesehen habe, auf ein Button
// druecken und 3 neue laden ... nicht nur nach Quellen sondern auch nach
// mit Fleisch ohne Fleisch und Fisch und Nudeln und Suppe".
//
// ⚠ WOHER DIE VORSCHLAEGE KOMMEN: aus rezept_feed.json IM REPO, gefuellt
// vom taeglichen Lauf (.github/workflows/rezept-feed.yml) aus vier Quellen.
// Die App liest die Datei von ihrer EIGENEN Adresse - kein Schluessel, kein
// CORS, offline aus dem Cache.
//
// ⚠ WARUM DER KNOPF KEINEN WORKFLOW AUSLOEST: dafuer braeuchte der Browser
// einen GitHub-Token mit Schreibrecht, der dann im Quelltext dieser Seite
// staende. Stattdessen blaettert der Knopf durch den Vorrat; ist der leer,
// holt er live bei TheMealDB nach - die einzige der vier Quellen, die eine
// Abfrage direkt aus dem Browser erlaubt.
const FEED_PRO_ZUG=3;
let feed={items:[],updated:'',geladen:false,fehler:''};
let feedQuelle='',feedThema='';
export async function ladeFeed(){
  if(feed.geladen)return feed;
  feed.geladen=true;
  try{
    // Tagesgenauer Anhang: der Service Worker liefert Skripte netz-zuerst,
    // eine JSON-Datei aber aus dem Cache - ohne das saehe man den neuen
    // Vorrat erst beim uebernaechsten Oeffnen (derselbe Fehler wie beim
    // Programmcode, siehe sw.js v11).
    const tag=new Date().toISOString().slice(0,10);
    const res=await fetch('rezept_feed.json?t='+tag,{cache:'no-cache'});
    if(!res.ok)throw new Error('HTTP '+res.status);
    const d=await res.json();
    feed.items=Array.isArray(d.items)?d.items:[];
    feed.updated=d.updated||'';
  }catch(e){
    // Kein stilles Scheitern: die Oberflaeche sagt, dass es die Vorschlaege
    // gerade nicht gibt - und die gespeicherten Ideen bleiben sichtbar.
    feed.fehler=(e&&e.message)||'unknown error';
    feed.items=[];
  }
  return feed;
}
function feedGesehen(){return new Set(((S.state.index.feed||{}).seen)||[]);}
function feedQuellen(){
  const z=new Map();
  feed.items.forEach(i=>{if(i.srcName)z.set(i.srcName,(z.get(i.srcName)||0)+1);});
  return [...z.entries()].sort((a,b)=>b[1]-a[1]);
}
function feedThemen(){
  const z=new Map();
  feed.items.forEach(i=>(i.themes||[]).forEach(t=>z.set(t,(z.get(t)||0)+1)));
  return THEMEN.filter(t=>z.has(t.id)).map(t=>[t,z.get(t.id)]);
}
// Die Liste, die gerade dran ist: Filter an, Gesehenes raus, Neuestes zuerst.
function feedListe(){
  const gesehen=feedGesehen();
  return feed.items.filter(i=>
    !gesehen.has(i.id)
    &&(!feedQuelle||i.srcName===feedQuelle)
    &&(!feedThema||(i.themes||[]).includes(feedThema)));
}
function feedKarte(i){
  const themen=(i.themes||[]).slice(0,3).map(id=>(THEMA_BY_ID[id]||{}).label).filter(Boolean);
  return`<div class="fd-card" onclick="rezOpenFeed('${i.id}')" role="button" tabindex="0" onkeydown="if(event.key==='Enter')rezOpenFeed('${i.id}')">`
    +`<div class="fd-img"><img src="${escH(i.image)}" alt="" loading="lazy" onerror="this.closest('.fd-card').classList.add('no-img')">`
      +`<span class="fd-src">${escH(i.srcName||'')}</span>`
      +(i.min?`<span class="rez-card-dur fd-dur">${icn('clock',11)}${fmtDur(i.min)}</span>`:'')
    +`</div>`
    +`<div class="fd-body">`
      +`<div class="fd-title">${escH(i.title)}</div>`
      +(themen.length?`<div class="fd-themes">`+themen.map(t=>`<span class="fd-th">${escH(t)}</span>`).join('')+`</div>`:'')
      +`<div class="fd-meta">${i.ingredients.length} ingredient${i.ingredients.length===1?'':'s'} · ${i.steps.length} step${i.steps.length===1?'':'s'}</div>`
      +`<div class="fd-btns">`
        +`<button class="btn btn-primary" onclick="event.stopPropagation();rezFeedToRecipe('${i.id}')">${icn('plus',13)} Add as recipe</button>`
        +`<button class="btn" onclick="event.stopPropagation();rezFeedToInspo('${i.id}')">${icn('inspo',13)} Save idea</button>`
      +`</div>`
    +`</div></div>`;
}
export function feedAbschnitt(){
  if(feed.fehler){
    return`<div class="fd-wrap"><div class="fd-hd"><span class="fd-hd-t">Daily suggestions</span></div>`
      +`<div class="fd-note">Could not load the daily suggestions (${escH(feed.fehler)}). Your saved ideas below are unaffected.</div></div>`;
  }
  if(!feed.items.length){
    return`<div class="fd-wrap"><div class="fd-hd"><span class="fd-hd-t">Daily suggestions</span></div>`
      +`<div class="fd-note">No suggestions yet — the daily run fills this list. You can start it by hand from the repository (workflow “Rezept-Vorschlaege”).</div></div>`;
  }
  const liste=feedListe();
  const zeige=liste.slice(0,FEED_PRO_ZUG);
  const quellen=feedQuellen(),themen=feedThemen();
  const alter=feed.updated?new Date(feed.updated):null;
  const wann=alter&&!isNaN(alter)?alter.toLocaleDateString(undefined,{day:'numeric',month:'short'}):'';
  return`<div class="fd-wrap">`
    +`<div class="fd-hd"><span class="fd-hd-t">Daily suggestions</span>`
      +`<span class="fd-hd-s">${liste.length} waiting${wann?' · updated '+escH(wann):''}</span></div>`
    +`<div class="rez-tags fd-tags"><span class="shop-quick-lbl">Source</span>`
      +`<button class="tag-chip${feedQuelle?'':' on'}" onclick="rezFeedSource('')">All</button>`
      +quellen.map(([n,c])=>`<button class="tag-chip${feedQuelle===n?' on':''}" onclick="rezFeedSource('${escH(n).replace(/'/g,'')}')">${escH(n)} <span class="chip-n">${c}</span></button>`).join('')
    +`</div>`
    +(themen.length?`<div class="rez-tags fd-tags"><span class="shop-quick-lbl">Kind</span>`
      +`<button class="tag-chip${feedThema?'':' on'}" onclick="rezFeedTheme('')">All</button>`
      +themen.map(([t,c])=>`<button class="tag-chip${feedThema===t.id?' on':''}" onclick="rezFeedTheme('${t.id}')">${t.icon} ${escH(t.label)} <span class="chip-n">${c}</span></button>`).join('')
    +`</div>`:'')
    +(zeige.length
      ?`<div class="fd-row stagger">`+zeige.map(feedKarte).join('')+`</div>`
       +`<div class="fd-more"><button class="btn" id="fdMore" onclick="rezFeedMore()">${icn('arrowR',14)} Show 3 more</button>`
        +`<span class="fd-count">${Math.min(FEED_PRO_ZUG,liste.length)} of ${liste.length}</span></div>`
      :`<div class="fd-note">You have been through everything${feedQuelle||feedThema?' in this filter':''}. `
       +`<button class="fd-lnk" onclick="rezFeedMore()">Load new ones</button> or `
       +`<button class="fd-lnk" onclick="rezFeedReset()">show them all again</button>.</div>`)
  +`</div>`;
}
export function rezFeedSource(n){feedQuelle=(feedQuelle===n)?'':n;renderInspo();}
export function rezFeedTheme(id){feedThema=(feedThema===id)?'':id;renderInspo();}
// Weiterblaettern: die gezeigten drei gelten als gesehen - geraeteuebergreifend,
// damit das Tablet nicht dieselben drei noch einmal zeigt.
export async function rezFeedMore(){
  const liste=feedListe();
  const weg=liste.slice(0,FEED_PRO_ZUG).map(i=>i.id);
  if(weg.length)await S.markFeedSeen(weg);
  const rest=feedListe();
  if(!rest.length)await feedNachladen();
  renderInspo();
}
export async function rezFeedReset(){
  await S.clearFeedSeen();
  renderInspo();
  toast('Showing all suggestions again');
}
// ⚠ LIVE NACHLADEN geht NUR bei TheMealDB: deren Server erlaubt die Abfrage
// aus dem Browser (CORS). Spoonacular braucht einen Schluessel, Blogs und
// YouTube antworten dem Browser nicht - deshalb steht dort der Tageslauf.
// Kein stilles Scheitern: klappt es nicht, sagt die Oberflaeche warum.
async function feedNachladen(){
  const btn=$('fdMore');
  if(btn){btn.disabled=true;btn.textContent='Loading…';}
  let neu=0;
  try{
    for(let i=0;i<FEED_PRO_ZUG;i++){
      const res=await fetch('https://www.themealdb.com/api/json/v1/1/random.php',{cache:'no-store'});
      if(!res.ok)throw new Error('HTTP '+res.status);
      const d=await res.json();
      const e=mealDbToItem(d&&d.meals&&d.meals[0]);
      if(e&&!feed.items.some(x=>x.id===e.id)){feed.items.unshift(e);neu++;}
    }
    toast(neu?`Loaded ${neu} new suggestion${neu===1?'':'s'}`:'No new dishes came back — try again');
  }catch(e){
    toast('Could not load new suggestions: '+((e&&e.message)||'no connection'));
  }
  if(btn)btn.disabled=false;
}
// Aus einem Vorschlag ein Rezept machen. ⚠ Das Bild liegt auf einem fremden
// Server. Ein Rezept braucht sein Bild aber LOKAL (Offline-Betrieb, Sync).
// Erlaubt die Gegenstelle das Auslesen nicht, entsteht ein erzeugtes
// Titelbild - dieselbe Regel wie beim Reel-Import, kein leeres Rezept.
export async function rezFeedToRecipe(id){
  const i=feed.items.find(x=>x.id===id);
  if(!i)return;
  // ⚠ ZUERST das offene Fenster schliessen, DANN das Formular aufbauen.
  // Andersherum war es ein Fehler (im Probelauf gefunden): rezCloseModal()
  // raeumt den Formularzustand ab (form=null), das direkt danach gebaute
  // Formular stand also auf null und renderForm() ist mit "Cannot read
  // properties of null" ausgestiegen - fuer den Nutzer: der Knopf tut
  // nichts. Derselbe Fehlertyp wie beim Titelbild-Fenster.
  rezCloseModal();
  let cover='',thumb='';
  const geholt=i.image?await ladeFernbild(i.image).catch(()=>null):null;
  if(geholt){cover=geholt.cover;thumb=geholt.thumb;}
  else{
    const cs=getComputedStyle(document.documentElement);
    cover=CK.makeCoverCard(i.title,i.creator||i.srcName||'',i.srcName||'Suggestion',
      {a:cs.getPropertyValue('--chrome-bg').trim()||'#3B2A21',
       b:cs.getPropertyValue('--accent').trim()||'#8A5626',
       ff:cs.getPropertyValue('--ff-title').trim()||'sans-serif'});
    thumb=cover;
  }
  form={
    id:S.uid(),
    title:i.title,
    min:i.min||30,
    tags:(i.tags||[]).slice(0,4),
    fav:false,servings:i.servings||2,notes:'',
    cover,thumb,
    ingredients:(i.ingredients||[]).slice(),
    blocks:[{t:'text',v:(i.steps||[]).join('\n')}],
    created:'',up:'',source:i.video||i.url||'',
  };
  formBase=JSON.stringify(form);
  await S.markFeedSeen([i.id]);
  rezShowPage('recipes');
  renderForm();
  toast(`From ${i.srcName}: ${i.ingredients.length} ingredients, ${i.steps.length} steps`);
}
// Nur merken, nicht gleich zum Rezept machen.
export async function rezFeedToInspo(id){
  const i=feed.items.find(x=>x.id===id);
  if(!i)return;
  const l=i.video?detectLink(i.video):(i.url?detectLink(i.url):null);
  await S.saveInspo({
    id:S.uid(),
    title:i.title,
    url:i.video||i.url||'',
    platform:(l&&l.platform)||'link',
    label:(l&&l.label)||i.srcName||'Link',
    embedUrl:(l&&l.embedUrl)||'',
    thumb:'',
    creator:i.creator||i.srcName||'',
    min:i.min||0,
    tags:(i.tags||[]).slice(0,4),
    caption:[i.title,'',
      i.ingredients.length?'Ingredients:':'',...i.ingredients,'',
      i.steps.length?'Preparation:':'',...i.steps].filter(x=>x!==undefined).join('\n'),
    created:'',up:'',
  });
  await S.markFeedSeen([i.id]);
  rezCloseModal();
  renderInspo();renderNav();
  toast('Saved to your ideas');
}
// Detailfenster eines Vorschlags: erst ansehen, dann entscheiden.
export function rezOpenFeed(id){
  const i=feed.items.find(x=>x.id===id);
  if(!i)return;
  const themen=(i.themes||[]).map(t=>(THEMA_BY_ID[t]||{}).label).filter(Boolean);
  openModal(
     (i.image?`<div class="rd-hero"><img src="${escH(i.image)}" alt=""></div>`:'')
    +`<div class="rd-title">${escH(i.title)}</div>`
    +`<div class="rd-meta">`
      +`<span class="rd-chip">${escH(i.srcName||'')}</span>`
      +(i.creator?`<span class="rd-chip">${escH(i.creator)}</span>`:'')
      +(i.min?`<span class="rd-chip">${icn('clock',12)}${fmtDur(i.min)}</span>`:'')
      +themen.map(t=>`<span class="rd-chip">${escH(t)}</span>`).join('')
    +`</div>`
    +(i.ingredients.length?`<div class="rd-sec"><div class="rd-sec-h">Ingredients</div>`
      +`<ul class="rd-ing">`+i.ingredients.map(z=>`<li>${escH(z)}</li>`).join('')+`</ul></div>`:'')
    +(i.steps.length?`<div class="rd-sec"><div class="rd-sec-h">Preparation</div>`
      +`<div class="rd-block">`+i.steps.map((s,n)=>`<p><b>${n+1}.</b> ${escH(s)}</p>`).join('')+`</div></div>`:'')
    +`<div class="m-btns" style="flex-wrap:wrap">`
      +(i.url?`<a class="btn" style="margin-right:auto" href="${escH(i.url)}" target="_blank" rel="noopener">Open source</a>`:'')
      +`<button class="btn" onclick="rezFeedToInspo('${i.id}')">${icn('inspo',13)} Save idea</button>`
      +`<button class="btn btn-primary" onclick="rezFeedToRecipe('${i.id}')">${icn('plus',13)} Add as recipe</button>`
    +`</div>`
  ,'modal-wide');
}

// ══ INSPIRATION ══════════════════════════════════════════════════════════
// Ideen-Sammlung: eingebettete Reels/Videos, Links, Fotos, Notizen. Der
// Unterschied zu "Recipes" ist die Absicht - hier liegt, was man MAL kochen
// will, dort was man kochen KANN. Der Weg dazwischen ist ein Knopf:
// "Convert to recipe" laesst den Parser aus js/rezept/import.js die
// eingefuegte Caption in Titel/Dauer/Zutaten/Schritte zerlegen und oeffnet
// damit das fertig ausgefuellte Rezept-Formular.
let inspoFilter='',inspoCreator='',inspoTag='',inspoSort='new';
function inspoCreators(){
  const z=new Map();
  S.state.index.inspo.forEach(i=>{
    const c=(i.creator||'').trim();
    if(!c)return;
    z.set(c,(z.get(c)||0)+1);
  });
  return[...z.entries()].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0]));
}
function inspoTags(){
  const z=new Map();
  S.state.index.inspo.forEach(i=>(i.tags||[]).forEach(t=>z.set(t,(z.get(t)||0)+1)));
  return[...z.entries()].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0]));
}
function inspoListe(){
  const q=inspoFilter.trim().toLowerCase();
  let l=S.state.index.inspo.filter(i=>{
    if(inspoCreator&&(i.creator||'')!==inspoCreator)return false;
    if(inspoTag&&!(i.tags||[]).includes(inspoTag))return false;
    if(q&&!((i.title||'')+' '+(i.caption||'')+' '+(i.creator||'')+' '+(i.tags||[]).join(' ')).toLowerCase().includes(q))return false;
    return true;
  });
  if(inspoSort==='creator')l=l.slice().sort((a,b)=>(a.creator||'~').localeCompare(b.creator||'~')||(a.title||'').localeCompare(b.title||''));
  else if(inspoSort==='title')l=l.slice().sort((a,b)=>(a.title||'').localeCompare(b.title||''));
  else if(inspoSort==='dur')l=l.slice().sort((a,b)=>(a.min||9999)-(b.min||9999));
  return l;
}
export function renderInspo(){
  const el=$('pgInspo');if(!el)return;
  // Beim ersten Zeichnen die Vorschlaege holen und danach neu zeichnen.
  // ⚠ Nicht await: die eigenen Ideen sollen sofort dastehen, auch wenn die
  // Datei fehlt oder langsam kommt.
  if(!feed.geladen)ladeFeed().then(()=>{if($('pgInspo'))renderInspo();});
  const alle=S.state.index.inspo;
  const liste=inspoListe();
  const kuenstler=inspoCreators(),themen=inspoTags();
  _inspoCreatorListe=kuenstler;_inspoTagListe=themen;
  const sortLbl={new:'Newest first',creator:'By creator',title:'By title',dur:'By duration'}[inspoSort];
  el.innerHTML=
     `<div class="ptitle">Inspiration</div>`
    // ⚠ Die taeglichen Vorschlaege stehen OBEN, die eigenen Ideen darunter:
    // der Nutzer wollte beides in einer Kategorie (2026-09-03), aber was
    // taeglich neu ist, gehoert nach vorn - was man selbst gesammelt hat,
    // findet man auch weiter unten.
    +feedAbschnitt()
    +`<div class="psub">${alle.length?`${liste.length} of ${alle.length} shown`
        +(kuenstler.length?` · ${kuenstler.length} creator${kuenstler.length===1?'':'s'}`:'')
      :'Save reels, links and ideas you want to cook one day'}</div>`
    +`<div class="rez-toolbar">`
      +`<div class="rez-search">${icn('search',15)}<input id="inspoQ" type="search" placeholder="Search ideas, creators, tags..." value="${escH(inspoFilter)}" oninput="rezInspoQuery(this.value)"></div>`
      +`<button class="btn" onclick="rezInspoSort()">${sortLbl}</button>`
      +`<button class="btn" onclick="rezOpenBulk()">${icn('link',14)} Add many</button>`
      +`<button class="btn btn-primary" onclick="rezOpenInspoForm(null)">${icn('plus',14)} Add idea</button>`
    +`</div>`
    +(kuenstler.length?`<div class="rez-tags"><span class="shop-quick-lbl">Creators</span>`
        +`<button class="tag-chip${inspoCreator?'':' on'}" onclick="rezInspoCreator(-1)">All</button>`
        +kuenstler.map(([c,n],i)=>`<button class="tag-chip${inspoCreator===c?' on':''}" onclick="rezInspoCreator(${i})">${escH(c)} <span class="chip-n">${n}</span></button>`).join('')
      +`</div>`:'')
    +(themen.length?`<div class="rez-tags"><span class="shop-quick-lbl">Topics</span>`
        +`<button class="tag-chip${inspoTag?'':' on'}" onclick="rezInspoTag(-1)">All</button>`
        +themen.map(([t,n],i)=>`<button class="tag-chip${inspoTag===t?' on':''}" onclick="rezInspoTag(${i})">${escH(t)} <span class="chip-n">${n}</span></button>`).join('')
      +`</div>`:'')
    +`<div class="rez-grid stagger">`+(liste.length?liste.map(inspoCardHtml).join(''):inspoEmptyHtml(alle.length))+`</div>`;
  afterRender(el);
}
function inspoEmptyHtml(total){
  if(!total)return`<div class="rez-empty"><h4>No ideas saved yet</h4>`
    +`<p>Paste an Instagram reel, a TikTok, a YouTube link or just a note — or add many links at once. Later you turn one into a real recipe with a single click.</p>`
    +`<button class="btn btn-primary" onclick="rezOpenBulk()">${icn('link',14)} Add many links</button>`
    +`<button class="btn" onclick="rezOpenInspoForm(null)">${icn('plus',14)} Add one idea</button></div>`;
  return`<div class="rez-empty"><h4>Nothing matches</h4><p>No idea matches your search or filters.</p>`
    +`<button class="btn" onclick="rezInspoClear()">Clear filters</button></div>`;
}
export function rezInspoClear(){inspoFilter='';inspoCreator='';inspoTag='';renderInspo();}
function inspoCardHtml(i){
  const bild=i.thumb?`<img class="rez-card-img" src="${i.thumb}" alt="" loading="lazy">`
    :`<div class="rez-card-img insp-ph">${icn(i.platform==='link'?'link':'play',34)}<span>${escH(i.label||i.platform||'Idea')}</span></div>`;
  return`<div class="rez-card" onclick="rezOpenInspo('${i.id}')" role="button" tabindex="0" onkeydown="if(event.key==='Enter')rezOpenInspo('${i.id}')">`
    +bild
    +(i.platform&&i.platform!=='note'?`<span class="insp-badge">${escH(i.label||i.platform)}</span>`:'')
    +`<div class="rez-card-ov"><div class="rez-card-tw"><div class="rez-card-title">${escH(i.title||'Untitled idea')}</div>`
      +(i.creator?`<div class="rez-card-by">${escH(i.creator)}</div>`:'')+`</div>`
      +(i.min?`<span class="rez-card-dur">${icn('clock',11)}${fmtDur(i.min)}</span>`:'')+`</div></div>`;
}
let _inspoCreatorListe=[],_inspoTagListe=[];
export function rezInspoCreator(i){inspoCreator=i<0?'':(_inspoCreatorListe[i]||['',0])[0];renderInspo();}
export function rezInspoTag(i){inspoTag=i<0?'':(_inspoTagListe[i]||['',0])[0];renderInspo();}
export function rezInspoSort(){
  const f=['new','creator','title','dur'];
  inspoSort=f[(f.indexOf(inspoSort)+1)%f.length];
  renderInspo();
}
// ── Viele Links auf einmal ─────────────────────────────────────────────
// Der ehrliche Weg zu "ganz vielen Reels": eine Adresse je Zeile einfuegen.
// Die App erkennt Plattform und Kuenstler selbst und legt je Zeile einen
// Eintrag an.
export function rezOpenBulk(){
  openModal(
     `<h3>Add many links at once</h3>`
    +`<div class="rf-hint">One link per line. Platform and creator are detected automatically. `
      +`If a line also contains the caption, title, duration and tags are read from it too.</div>`
    +`<textarea class="m-area" id="bulkTxt" style="min-height:190px" placeholder="https://www.instagram.com/kochenmitchef/reel/…&#10;https://www.tiktok.com/@pastaqueen/video/…&#10;https://youtu.be/…"></textarea>`
    +`<div class="rf-err" id="bulkErr"></div>`
    +`<div class="m-btns"><button class="btn" onclick="rezCloseModal()">Cancel</button>`
      +`<button class="btn btn-primary" onclick="rezRunBulk()">Add all</button></div>`);
}
export async function rezRunBulk(){
  const txt=(($('bulkTxt')||{}).value||'');
  const zeilen=txt.split('\n').map(z=>z.trim()).filter(Boolean);
  const fehler=$('bulkErr');
  if(!zeilen.length){if(fehler){fehler.textContent='Paste at least one link.';fehler.style.display='block';}return;}
  let n=0,uebersprungen=0;
  for(const z of zeilen){
    const p=parseCaption(z);
    if(!p.link){uebersprungen++;continue;}
    // Doppelte Adressen nicht zweimal anlegen.
    if(S.state.index.inspo.some(x=>x.url===p.link.url)){uebersprungen++;continue;}
    try{
      await S.saveInspo({id:S.uid(),title:p.title||p.link.label+' video',url:p.link.url,
        platform:p.link.platform,label:p.link.label,embedUrl:p.link.embedUrl,
        caption:z.includes('\n')?z:'',creator:p.creator||'',thumb:'',tags:p.tags,min:p.min,created:'',up:''});
      n++;
    }catch(e){uebersprungen++;}
  }
  rezCloseModal();
  renderInspo();renderNav();
  toast(n?`${n} idea${n===1?'':'s'} added${uebersprungen?`, ${uebersprungen} skipped`:''}`
        :'No usable link found — every line needs a full https:// address');
}
export function rezInspoQuery(v){inspoFilter=v;renderInspo();}

// ── Idee hinzufuegen/bearbeiten ────────────────────────────────────────
let inspoForm=null,inspoBase=null;
export function rezOpenInspoForm(id){
  if(id){
    const it=S.state.index.inspo.find(x=>x.id===id);
    if(!it){toast('Idea not found');return;}
    inspoForm=JSON.parse(JSON.stringify(it));
  }else{
    inspoForm={id:S.uid(),title:'',url:'',platform:'',label:'',embedUrl:'',
      caption:'',thumb:'',tags:[],min:null,creator:'',created:'',up:''};
  }
  inspoBase=JSON.stringify(inspoForm);
  zeichneInspoForm();
}
function zeichneInspoForm(){
  const neu=!S.state.index.inspo.some(x=>x.id===inspoForm.id);
  const erkannt=inspoForm.url?`<div class="insp-detect">${icn('link',13)} ${escH(inspoForm.label||'Link')} detected`
    +(inspoForm.embedUrl?' — the video will play inside the app':' — will be saved as a link')+`</div>`:'';
  openModal(
     `<h3>${neu?'Add idea':'Edit idea'}</h3>`
    +`<div class="rf-err" id="ifErr"></div>`
    +`<div class="rf-hint">Copy the whole post from Instagram, TikTok or YouTube and paste it here — link and caption together. `
      +`The link is detected automatically, and “Convert to recipe” turns the caption into ingredients and steps for you.</div>`
    +`<label class="dm-lbl">Paste link &amp; caption</label>`
    +`<textarea class="m-area" id="ifPaste" style="min-height:130px" placeholder="https://www.instagram.com/reel/...&#10;&#10;Pasta al Limone in 20 minutes&#10;Ingredients:&#10;- 200 g spaghetti&#10;..." oninput="rezInspoPaste(this.value)">${escH(inspoForm.caption)}</textarea>`
    +erkannt
    +`<div class="rf-row">`
      +`<div><label class="dm-lbl">Title</label><input class="m-inp" id="ifTitle" placeholder="e.g. Pasta al limone" value="${escH(inspoForm.title)}" oninput="rezInspoField('title',this.value)"></div>`
      +`<div><label class="dm-lbl">Link (optional)</label><input class="m-inp" id="ifUrl" placeholder="https://..." value="${escH(inspoForm.url)}" oninput="rezInspoUrl(this.value)"></div>`
    +`</div>`
    +`<label class="dm-lbl">Creator</label>`
    +`<input class="m-inp" id="ifCreator" placeholder="@handle — detected from the link where possible" value="${escH(inspoForm.creator||'')}" oninput="rezInspoField('creator',this.value)">`
    +`<label class="dm-lbl">Tags (comma separated)</label>`
    +`<input class="m-inp" id="ifTags" placeholder="e.g. Dinner, Pasta" value="${escH((inspoForm.tags||[]).join(', '))}" oninput="rezInspoTags(this.value)">`
    +`<label class="dm-lbl">Cover image (optional)</label>`
    +`<div class="rf-drop" style="min-height:130px" onclick="rezPickInspoImage()">`
      +(inspoForm.thumb?`<img src="${inspoForm.thumb}" alt=""><span class="rf-drop-badge">Change image</span>`
        :`${icn('image',24)}<div>Screenshot of the dish — optional, the video is shown anyway</div>`)
    +`</div>`
    +`<div class="m-btns" style="margin-top:16px"><button class="btn" onclick="rezRequestClose()">Cancel</button>`
      +`<button class="btn btn-primary" onclick="rezSaveInspo()">${neu?'Add idea':'Save changes'}</button></div>`
  ,'modal-wide');
}
export function rezInspoField(k,v){inspoForm[k]=v;}
export function rezInspoTags(v){inspoForm.tags=v.split(',').map(x=>x.trim()).filter(Boolean);}
export function rezInspoUrl(v){
  inspoForm.url=v.trim();
  const l=detectLink(v);
  if(l){inspoForm.platform=l.platform;inspoForm.label=l.label;inspoForm.embedUrl=l.embedUrl;inspoForm.url=l.url;
    const c=creatorFromUrl(v);if(c)inspoForm.creator=c;
    const cf=$('ifCreator');if(cf&&inspoForm.creator)cf.value=inspoForm.creator;}
  else{inspoForm.platform='';inspoForm.label='';inspoForm.embedUrl='';}
}
// Ein einziges Einfuegen genuegt: der Link wird aus dem Text herausgefischt,
// Titel/Dauer/Tags kommen aus derselben Caption. Das Feld selbst bleibt
// unangetastet - nur die abgeleiteten Werte werden nachgezogen, und ein vom
// Nutzer selbst getippter Titel wird NICHT ueberschrieben.
export function rezInspoPaste(v){
  inspoForm.caption=v;
  const p=parseCaption(v);
  if(p.link){inspoForm.platform=p.link.platform;inspoForm.label=p.link.label;
    inspoForm.embedUrl=p.link.embedUrl;inspoForm.url=p.link.url;}
  const titelWarAbgeleitet=!inspoForm.title||inspoForm.title===inspoForm._autoTitle;
  if(p.title&&titelWarAbgeleitet){inspoForm.title=p.title;inspoForm._autoTitle=p.title;}
  if(p.min)inspoForm.min=p.min;
  if(p.creator&&!inspoForm.creator)inspoForm.creator=p.creator;
  if(p.tags.length&&!(inspoForm.tags||[]).length)inspoForm.tags=p.tags;
  const cf=$('ifCreator');if(cf&&cf.value!==(inspoForm.creator||''))cf.value=inspoForm.creator||'';
  // ⚠ Die abgeleiteten Werte muessen auch SICHTBAR werden. Erst stand nur der
  // Titel im Feld, waehrend Link und Tags still im Modell landeten - der
  // Nutzer sah leere Felder, obwohl die Werte gespeichert worden waeren, und
  // haette sie beim Tippen ueberschrieben, ohne es zu merken.
  const t=$('ifTitle');if(t&&t.value!==inspoForm.title)t.value=inspoForm.title;
  const u=$('ifUrl');if(u&&u.value!==inspoForm.url)u.value=inspoForm.url;
  const g=$('ifTags');
  if(g){const soll=(inspoForm.tags||[]).join(', ');if(g.value!==soll)g.value=soll;}
  const host=document.querySelector('.insp-detect');
  const txt=inspoForm.url?`${icn('link',13)} ${escH(inspoForm.label||'Link')} detected`
    +(inspoForm.embedUrl?' — the video will play inside the app':' — will be saved as a link'):'';
  if(host)host.innerHTML=txt;
  else if(txt){
    const ta=$('ifPaste');
    if(ta){const d=document.createElement('div');d.className='insp-detect';d.innerHTML=txt;ta.insertAdjacentElement('afterend',d);}
  }
}
export function rezPickInspoImage(){
  pickFile(async f=>{
    try{inspoForm.thumb=await S.processImage(f,S.IMG_THUMB);zeichneInspoForm();}
    catch(e){const el=$('ifErr');if(el){el.textContent='That image could not be read: '+(e&&e.message||'unknown error');el.style.display='block';}}
  });
}
export async function rezSaveInspo(){
  if(!inspoForm)return false;
  const titel=(inspoForm.title||'').trim();
  // Eine Idee braucht mindestens IRGENDETWAS, woran man sie erkennt.
  if(!titel&&!inspoForm.url&&!(inspoForm.caption||'').trim()){
    const el=$('ifErr');
    if(el){el.textContent='Add a link, a title or some text first.';el.style.display='block';}
    return false;
  }
  const doc=Object.assign({},inspoForm,{title:titel||inspoForm.label||'Saved idea'});
  delete doc._autoTitle;
  try{await S.saveInspo(doc);}
  catch(e){
    const el=$('ifErr');
    if(el){el.textContent='Could not save: '+(e&&e.message||'unknown error');el.style.display='block';}
    return false;
  }
  inspoForm=null;inspoBase=null;
  rezCloseModal();
  rezShowPage('inspo');
  toast('Idea saved');
  return true;
}

// ── Idee ansehen: Video einbetten + in ein Rezept verwandeln ───────────
export function rezOpenInspo(id){
  const i=S.state.index.inspo.find(x=>x.id===id);
  if(!i)return;
  // ⚠ Der Einbett-Rahmen ist cross-origin: er ZEIGT das Video, sein Inhalt
  // ist fuer uns aber nicht lesbar (Browser-Regel, nicht umgehbar). Deshalb
  // steht darunter immer der Weg nach draussen - und offline faellt der
  // Rahmen ohnehin aus, dann bleibt der Link das Einzige, was traegt.
  // ⚠ WAS BEIM EINBETTEN GEHT UND WAS NICHT:
  // Der Rahmen ist cross-origin. Instagram und TikTok bieten KEINE
  // Schnittstelle, um von aussen zu spulen, anzuhalten oder die Position zu
  // lesen - dort bleibt nur die Bedienung IM Video selbst. YouTube dagegen
  // hat eine dokumentierte postMessage-Schnittstelle (enablejsapi=1); nur
  // dort gibt es unten eine echte Abspielleiste. Vorgetaeuscht wird nichts:
  // meldet sich der Player nicht, verschwindet die Leiste wieder.
  const ytId=(i.platform==='youtube')?i.id||(i.url.match(/[?&]v=([\w-]+)|youtu\.be\/([\w-]+)|shorts\/([\w-]+)/)||[]).slice(1).find(Boolean):'';
  const src=i.embedUrl+(i.platform==='youtube'
    ?(i.embedUrl.includes('?')?'&':'?')+'enablejsapi=1&playsinline=1&origin='+encodeURIComponent(location.origin)
    :'');
  const einbetten=i.embedUrl
    ? `<div class="insp-frame${i.platform==='youtube'?' yt':''}"><iframe id="inspFrame" src="${escH(src)}" loading="lazy" allowfullscreen`
      +` referrerpolicy="origin-when-cross-origin" allow="autoplay; encrypted-media; picture-in-picture"`
      +` sandbox="allow-scripts allow-same-origin allow-popups allow-presentation"`
      +` title="${escH(i.title||'Embedded video')}"></iframe></div>`
      +(i.platform==='youtube'
        ?`<div class="yt-bar" id="ytBar" hidden>`
          +`<button class="yt-btn" id="ytPlay" onclick="rezYtToggle()" aria-label="Play or pause">▶</button>`
          +`<button class="yt-btn" onclick="rezYtSeek(-10)" aria-label="Back 10 seconds">−10</button>`
          +`<span class="yt-time" id="ytCur">0:00</span>`
          +`<input class="yt-range" id="ytRange" type="range" min="0" max="1000" value="0"`
          +` oninput="rezYtScrub(this.value)" onchange="rezYtScrubEnd(this.value)" aria-label="Position in the video">`
          +`<span class="yt-time" id="ytDur">0:00</span>`
          +`<button class="yt-btn" onclick="rezYtSeek(10)" aria-label="Forward 10 seconds">+10</button></div>`
          +`<div class="insp-note" id="ytNote">Loading the player…</div>`
        :`<div class="insp-note">Instagram and TikTok do not allow an app to control their player from the outside — use the controls inside the video. If it stays blank you are offline, or the post is private.</div>`)
    : (i.thumb?`<div class="rd-hero" style="margin-bottom:14px"><img src="${i.thumb}" alt=""></div>`:'');
  openModal(
     einbetten
    +`<div class="rd-title" style="font-size:var(--fs-xl)">${escH(i.title||'Untitled idea')}</div>`
    +`<div class="rd-meta">`
      +(i.creator?`<button class="rd-chip rd-chip-btn" onclick="rezInspoByCreator('${escH(i.creator).replace(/'/g,'')}')">${escH(i.creator)}</button>`:'')
      +(i.label?`<span class="rd-chip">${icn('link',12)}${escH(i.label)}</span>`:'')
      +(i.min?`<span class="rd-chip">${icn('clock',12)}${fmtDur(i.min)}</span>`:'')
      +(i.tags||[]).map(t=>`<span class="rd-chip">${escH(t)}</span>`).join('')
    +`</div>`
    +(i.caption?`<div class="rd-sec"><div class="rd-sec-h">Saved text</div><div class="rd-block"><p>${escH(i.caption)}</p></div></div>`
      :`<div class="rd-empty" style="margin-bottom:14px">No caption saved. Paste the post text into this idea and “Convert to recipe” fills in ingredients and steps for you.</div>`)
    +`<div class="m-btns" style="flex-wrap:wrap">`
      +`<button class="btn btn-danger" style="margin-right:auto" onclick="rezTrashInspo('${i.id}')">${icn('trashIcon',13)} Delete</button>`
      +(i.url?`<a class="btn" href="${escH(i.url)}" target="_blank" rel="noopener">Open in ${escH(i.label||'browser')}</a>`:'')
      +`<button class="btn" onclick="rezCoverStudioInspo('${i.id}')">${icn('image',13)} Set cover</button>`
      +`<button class="btn" onclick="rezOpenInspoForm('${i.id}')">Edit</button>`
      +`<button class="btn btn-primary" onclick="rezInspoToRecipe('${i.id}')">${icn('recipes',13)} Convert to recipe</button>`
    +`</div>`
  ,'modal-wide');
  if(i.platform==='youtube')ytStart();
}
export function rezInspoByCreator(c){
  const i=_inspoCreatorListe.findIndex(x=>x[0]===c);
  rezCloseModal();
  rezShowPage('inspo');
  if(i>=0)rezInspoCreator(i);
}

// ══ ABSPIELLEISTE (nur YouTube) ══════════════════════════════════════════
// Ueber die dokumentierte postMessage-Schnittstelle - ohne deren Skript
// nachzuladen (die App muss offline lauffaehig bleiben). Meldet sich der
// Player nicht innerhalb von 3 Sekunden, verschwindet die Leiste wieder:
// lieber keine Leiste als eine, die nichts tut.
let ytState={dur:0,cur:0,playing:false,ok:false,scrub:false},_ytT=null,_ytPoll=null;
function ytFrame(){const f=$('inspFrame');return f&&f.contentWindow?f.contentWindow:null;}
function ytSend(func,args){
  const w=ytFrame();if(!w)return;
  try{w.postMessage(JSON.stringify({event:'command',func,args:args||[]}),'*');}catch(e){}
}
function ytOnMessage(ev){
  if(!/youtube(-nocookie)?\.com$/.test((()=>{try{return new URL(ev.origin).hostname;}catch(e){return'';}})()))return;
  let d=ev.data;
  if(typeof d==='string'){try{d=JSON.parse(d);}catch(e){return;}}
  if(!d||!d.info)return;
  const i=d.info;
  if(typeof i.duration==='number'&&i.duration>0)ytState.dur=i.duration;
  if(typeof i.currentTime==='number')ytState.cur=i.currentTime;
  if(typeof i.playerState==='number')ytState.playing=(i.playerState===1);
  if(!ytState.ok&&ytState.dur>0){ytState.ok=true;ytShowBar();}
  ytPaint();
}
function ytShowBar(){
  const bar=$('ytBar'),note=$('ytNote');
  if(bar)bar.hidden=false;
  if(note)note.textContent='Play, pause and scrub from here — the video stays in sync.';
}
function ytPaint(){
  if(!ytState.ok)return;
  const cur=$('ytCur'),dur=$('ytDur'),rg=$('ytRange'),pl=$('ytPlay');
  if(cur)cur.textContent=ytClock(ytState.cur);
  if(dur)dur.textContent=ytClock(ytState.dur);
  if(rg&&!ytState.scrub&&ytState.dur)rg.value=String(Math.round(ytState.cur/ytState.dur*1000));
  if(pl)pl.textContent=ytState.playing?'❚❚':'▶';
}
function ytClock(s){
  s=Math.max(0,Math.round(s||0));
  const m=Math.floor(s/60),r=s%60;
  return m+':'+String(r).padStart(2,'0');
}
function ytStart(){
  ytState={dur:0,cur:0,playing:false,ok:false,scrub:false};
  window.addEventListener('message',ytOnMessage);
  const f=$('inspFrame');
  const anmelden=()=>{const w=ytFrame();if(!w)return;
    try{w.postMessage(JSON.stringify({event:'listening',id:'rezYt',channel:'widget'}),'*');}catch(e){}};
  if(f)f.addEventListener('load',anmelden,{once:true});
  _ytPoll=setInterval(anmelden,400);
  clearTimeout(_ytT);
  _ytT=setTimeout(()=>{
    clearInterval(_ytPoll);_ytPoll=null;
    if(!ytState.ok){
      const bar=$('ytBar'),note=$('ytNote');
      if(bar)bar.remove();
      if(note)note.textContent='The player did not answer — use the controls inside the video. (Offline, or the video does not allow embedding.)';
    }else{
      // Weiterhin nachfragen, damit die Position mitlaeuft.
      _ytPoll=setInterval(()=>ytSend('getCurrentTime'),500);
    }
  },3000);
}
function ytStop(){
  window.removeEventListener('message',ytOnMessage);
  clearTimeout(_ytT);clearInterval(_ytPoll);_ytT=null;_ytPoll=null;
  ytState.ok=false;
}
export function rezYtToggle(){
  ytState.playing=!ytState.playing;
  ytSend(ytState.playing?'playVideo':'pauseVideo');
  ytPaint();
}
export function rezYtSeek(d){
  const ziel=Math.max(0,Math.min(ytState.dur||1e9,ytState.cur+d));
  ytState.cur=ziel;
  ytSend('seekTo',[ziel,true]);
  ytPaint();
}
export function rezYtScrub(v){
  ytState.scrub=true;
  if(!ytState.dur)return;
  ytState.cur=(+v/1000)*ytState.dur;
  const cur=$('ytCur');if(cur)cur.textContent=ytClock(ytState.cur);
}
export function rezYtScrubEnd(v){
  ytState.scrub=false;
  if(!ytState.dur)return;
  const ziel=(+v/1000)*ytState.dur;
  ytState.cur=ziel;
  ytSend('seekTo',[ziel,true]);
  ytPaint();
}

export async function rezTrashInspo(id){
  await S.trashInspo(id);
  rezCloseModal();
  renderInspo();renderNav();
  toast('Moved to trash');
}
// Der eigentliche "wird automatisch zum Rezept"-Schritt: Caption durch den
// Parser, Ergebnis direkt ins Rezept-Formular. Bewusst NICHT still im
// Hintergrund speichern - der Nutzer sieht, was erkannt wurde, und kann
// korrigieren, bevor daraus ein Rezept wird.
export async function rezInspoToRecipe(id){
  const i=S.state.index.inspo.find(x=>x.id===id);
  if(!i)return;
  const entwurf=captionToRecipe(i.caption||'',{});
  // ⚠ TITELBILD AUS DEM REEL (Nutzer-Wunsch 2026-09-02). Drei Stufen, in
  // dieser Reihenfolge:
  //   1. Ein eigenes Bild an der Idee gewinnt immer.
  //   2. YouTube: echtes Vorschaubild ueber die oeffentliche Adresse
  //      (img.youtube.com) - wird versucht, lokal einzulesen, damit das
  //      Rezept auch offline ein Bild hat.
  //   3. Instagram/TikTok: deren Vorschaubilder sind NICHT oeffentlich
  //      abrufbar (kurzlebig signierte Adressen, nur ueber eine API mit
  //      Konto-Token). Statt eine Adresse zu raten, die spaeter als kaputtes
  //      Bild beim Nutzer landet, wird ein erkennbar ERZEUGTES Titelbild aus
  //      Titel, Kuenstler und Plattform gebaut - mit dem Hinweis darauf,
  //      dass ein eigenes Foto es ersetzt.
  let cover=i.thumb||'',thumb=i.thumb||'';
  if(!cover){
    const l=detectLink(i.url||'');
    const purl=previewUrl(l);
    if(purl){
      const geholt=await ladeFernbild(purl).catch(()=>null);
      if(geholt){cover=geholt.cover;thumb=geholt.thumb;}
    }
    if(!cover){
      const cs=getComputedStyle(document.documentElement);
      cover=CK.makeCoverCard(entwurf.title||i.title||'Recipe',i.creator||'',i.label||'Video',
        {a:cs.getPropertyValue('--chrome-bg').trim()||'#3B2A21',
         b:cs.getPropertyValue('--accent').trim()||'#8A5626',
         ff:cs.getPropertyValue('--ff-title').trim()||'sans-serif'});
      thumb=cover;
    }
  }
  form={
    id:S.uid(),
    title:entwurf.title||i.title||'',
    min:i.min||entwurf.min||30,
    tags:(entwurf.tags&&entwurf.tags.length)?entwurf.tags:(i.tags||[]),
    fav:false,servings:2,notes:'',cover,thumb,
    ingredients:entwurf.ingredients,
    blocks:entwurf.blocks,
    created:'',up:'',source:i.url||'',
  };
  formBase=JSON.stringify(form);
  rezShowPage('recipes');
  renderForm();
  const gefunden=entwurf.ingredients.filter(Boolean).length;
  const schritte=(entwurf.blocks[0]&&entwurf.blocks[0].v||'').split('\n').filter(Boolean).length;
  toast(gefunden||schritte
    ? `Parsed ${gefunden} ingredient${gefunden===1?'':'s'} and ${schritte} step${schritte===1?'':'s'}`
    : 'No recipe text found — fill it in yourself');
}

// Ein Bild von einer fremden Adresse in ein lokales Bild verwandeln, damit
// das Rezept auch offline ein Titelbild hat.
// ⚠ Das klappt nur, wenn die Gegenstelle CORS erlaubt. Tut sie es nicht,
// scheitert canvas.toDataURL() mit einem Sicherheitsfehler - dann gibt diese
// Funktion nichts zurueck und der Aufrufer baut sein erzeugtes Titelbild.
// Kein stilles Scheitern: der Nutzer sieht in jedem Fall ein Bild.
function ladeFernbild(url){
  return new Promise((res,rej)=>{
    const img=new Image();
    img.crossOrigin='anonymous';
    const timeout=setTimeout(()=>rej(new Error('timeout')),8000);
    img.onload=()=>{
      clearTimeout(timeout);
      try{
        res({cover:CK.encodeToBudgetFrom(img,S.IMG_COVER),thumb:CK.encodeToBudgetFrom(img,S.IMG_THUMB)});
      }catch(e){rej(e);}
    };
    img.onerror=()=>{clearTimeout(timeout);rej(new Error('load failed'));};
    img.src=url;
  });
}

// ══ WOCHENPLAN ═══════════════════════════════════════════════════════════
// Montag als Wochenanfang (europaeisch). wochenAnker ist ein Datum IN der
// gezeigten Woche, nicht ihr Anfang - Vor/Zurueck verschiebt es um 7 Tage.
let wochenAnker=new Date();
function wochenStart(d){
  const x=new Date(d.getFullYear(),d.getMonth(),d.getDate());
  const wt=(x.getDay()+6)%7;              // 0 = Montag
  x.setDate(x.getDate()-wt);
  return x;
}
function wochenTage(anker){
  const a=wochenStart(anker);
  return Array.from({length:7},(_,i)=>new Date(a.getFullYear(),a.getMonth(),a.getDate()+i));
}
const WT=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
const MON=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
export function renderWeek(){
  const el=$('pgWeek');if(!el)return;
  const tage=wochenTage(wochenAnker);
  const heute=S.dayKey();
  const von=tage[0],bis=tage[6];
  const spanne=`${von.getDate()} ${MON[von.getMonth()]} – ${bis.getDate()} ${MON[bis.getMonth()]} ${bis.getFullYear()}`;
  const geplant=tage.reduce((a,d)=>a+S.planFor(S.dayKey(d)).length,0);
  el.innerHTML=
     `<div class="ptitle">Week</div>`
    +`<div class="psub">${geplant?`${geplant} meal${geplant===1?'':'s'} planned this week`:'Nothing planned for this week yet'}</div>`
    +`<div class="rez-toolbar">`
      +`<button class="btn" onclick="rezWeekShift(-7)">${icn('arrowL',13)} Previous</button>`
      +`<button class="btn" onclick="rezWeekToday()">This week</button>`
      +`<button class="btn" onclick="rezWeekShift(7)">Next ${icn('arrowR',13)}</button>`
      +`<span class="week-range">${escH(spanne)}</span>`
      +`<button class="btn btn-primary" onclick="rezWeekToShopping()" ${geplant?'':'disabled'}>${icn('shopping',13)} Add ingredients to shopping list</button>`
    +`</div>`
    +`<div class="week-grid stagger">`+tage.map(d=>{
        const k=S.dayKey(d),ids=S.planFor(k),ist=k===heute;
        return`<div class="week-day${ist?' on':''}">`
          +`<div class="week-hd"><span class="week-wd">${WT[(d.getDay()+6)%7]}</span>`
            +`<span class="week-dt">${d.getDate()} ${MON[d.getMonth()]}</span></div>`
          +`<div class="week-body">`+(ids.length?ids.map(id=>{
              const r=S.state.index.recipes.find(x=>x.id===id);
              if(!r)return'';
              return`<div class="week-item">`
                +(r.thumb?`<img class="week-thumb" src="${r.thumb}" alt="" onclick="rezOpenDetail('${r.id}')">`:`<span class="week-thumb"></span>`)
                +`<span class="week-nm" onclick="rezOpenDetail('${r.id}')">${escH(r.title)}</span>`
                +`<button class="week-x" onclick="rezWeekRemove('${k}','${r.id}')" title="Remove" aria-label="Remove">×</button></div>`;
            }).join(''):`<div class="week-empty">—</div>`)
          +`</div>`
          +`<button class="week-add" onclick="rezWeekAdd('${k}')">${icn('plus',13)} Add</button>`
        +`</div>`;
      }).join('')+`</div>`;
  afterRender(el);
}
export function rezWeekShift(t){
  wochenAnker=new Date(wochenAnker.getFullYear(),wochenAnker.getMonth(),wochenAnker.getDate()+t);
  renderWeek();renderNav();
}
export function rezWeekToday(){wochenAnker=new Date();renderWeek();renderNav();}
export function rezWeekAdd(key){
  openRecipePicker('Add to '+key,async id=>{
    await S.addToPlan(key,id);
    rezCloseModal();
    renderWeek();renderNav();
    toast('Added to the plan');
  });
}
export async function rezWeekRemove(key,id){
  await S.removeFromPlan(key,id);
  renderWeek();renderNav();
}
export async function rezWeekToShopping(){
  const keys=wochenTage(wochenAnker).map(d=>S.dayKey(d));
  const zutaten=await S.ingredientsForDays(keys);
  if(!zutaten.length){toast('The planned recipes have no ingredients listed');return;}
  const n=await S.addIngredients(zutaten);
  renderNav();
  toast(n?`${n} item${n===1?'':'s'} added to the shopping list`:'Everything was already on the list');
}

// ══ EINKAUFSLISTE ════════════════════════════════════════════════════════
// Nach Abteilungen sortiert, wie man durch den Laden laeuft (Nutzer-Wunsch
// 2026-09-02: "die Liste unterteilt in Kategorien wie Backwaren und Gemüse").
// Die Abteilung kommt aus js/rezept/groceries.js und ist je Eintrag
// ueberschreibbar - was das Woerterbuch nicht kennt, landet in "Other" statt
// in einer plausibel klingenden, aber geratenen Abteilung.
const shopState={sort:'cat',zu:new Set(),vorschlag:-1,letzteQ:''};
function catOf(i){return i.cat||categorize(i.text);}
// Eigene Historie: alles, was schon einmal auf der Liste stand - nach
// Haeufigkeit. Trifft den Sprachgebrauch des Nutzers besser als jedes
// Woerterbuch, deshalb steht sie in den Vorschlaegen vorn.
function shopVerlauf(){
  const z=new Map();
  (S.state.index.shopping.items||[]).forEach(i=>{
    const k=i.text.trim();
    if(!k)return;
    const e=z.get(k.toLowerCase())||{text:k,cat:i.cat||'',n:0};
    e.n++;if(i.cat)e.cat=i.cat;
    z.set(k.toLowerCase(),e);
  });
  return[...z.values()].sort((a,b)=>b.n-a.n);
}
export function renderShopping(){
  const el=$('pgShopping');if(!el)return;
  const items=S.shoppingItems();
  const offen=items.filter(i=>!i.done),erledigt=items.filter(i=>i.done);
  const fortschritt=items.length?Math.round(erledigt.length/items.length*100):0;
  const haeufig=shopVerlauf().filter(v=>v.n>1&&!items.some(i=>!i.done&&i.text.toLowerCase()===v.text.toLowerCase())).slice(0,6);

  el.innerHTML=
     `<div class="ptitle">Shopping</div>`
    +`<div class="psub">${items.length?`${offen.length} still to buy · ${erledigt.length} done`:'Your shopping list is empty'}</div>`
    +`<div class="shop-add">`
      +`<div class="shop-inp">${icn('plus',15)}`
        +`<input id="shopNew" type="text" autocomplete="off" placeholder="Add an item — suggestions appear as you type"`
        +` oninput="rezShopSuggest(this.value)" onkeydown="rezShopKey(event)" onfocus="rezShopSuggest(this.value)"></div>`
      +`<button class="btn btn-primary" onclick="rezShopAdd()">Add</button>`
      +`<div class="shop-sugg" id="shopSugg"></div>`
    +`</div>`
    +(haeufig.length?`<div class="shop-quick"><span class="shop-quick-lbl">Often bought</span>`
      +haeufig.map((v,i)=>`<button class="tag-chip" onclick="rezShopQuick(${i})">${escH(v.text)}</button>`).join('')+`</div>`:'')
    +(items.length?
       `<div class="shop-bar"><div class="shop-bar-fill" style="width:${fortschritt}%"></div></div>`
      +`<div class="shop-tools">`
        +`<span class="shop-count">${erledigt.length} of ${items.length} done</span>`
        +`<span class="shop-tools-sp"></span>`
        +`<button class="btn" onclick="rezWeekToShopping()">${icn('week',13)} From this week's plan</button>`
        +`<button class="btn" onclick="rezShopSort()">${shopState.sort==='cat'?'Sorted by aisle':'Sorted by newest'}</button>`
        +`<button class="btn" onclick="rezShopAll(${offen.length?'true':'false'})">${offen.length?'Check all':'Uncheck all'}</button>`
        +(erledigt.length?`<button class="btn btn-danger" onclick="rezShopClearDone()">${icn('trashIcon',13)} Clear done</button>`:'')
      +`</div>`
      +shopBody(items)
      :`<div class="rez-empty"><h4>Nothing to buy</h4>`
       +`<p>Type an item above — it is sorted into the right aisle automatically. Or plan your week and pull the ingredients in.</p>`
       +`<button class="btn btn-primary" onclick="rezShowPage('week')">${icn('week',13)} Plan the week</button>`
       +`<button class="btn" onclick="rezWeekToShopping()">${icn('shopping',13)} From this week's plan</button></div>`);
  afterRender(el);
}
function shopZeile(i){
  const g=splitQty(i.text);
  const name=g.name;
  // "1×" ist keine Information - eine Einheit ohne Aussage macht die Zeile
  // nur unruhig. Echte Mengen ("500 g", "2×") bleiben stehen.
  const qty=(g.qty==='1×')?'':g.qty;
  return`<label class="shop-row${i.done?' done':''}">`
    +`<input type="checkbox" ${i.done?'checked':''} onchange="rezShopToggle('${i.id}')">`
    +`<span class="shop-txt">${escH(name)}</span>`
    +(qty?`<span class="shop-qty">${escH(qty)}</span>`:'')
    +(i.src?`<span class="shop-src" title="${escH(i.src)}">${escH(i.src)}</span>`:'')
    +`<button class="rf-x" onclick="event.preventDefault();rezShopEdit('${i.id}')" title="Edit" aria-label="Edit">✎</button>`
    +`<button class="rf-x" onclick="event.preventDefault();rezShopRemove('${i.id}')" title="Remove" aria-label="Remove">×</button></label>`;
}
function shopBody(items){
  if(shopState.sort!=='cat'){
    const sortiert=[...items].sort((a,b)=>(a.done?1:0)-(b.done?1:0)||(b.up||'').localeCompare(a.up||''));
    return`<div class="shop-list">`+sortiert.map(shopZeile).join('')+`</div>`;
  }
  // Nach Abteilung gruppiert; erledigte Eintraege sammeln sich unten, damit
  // die Liste beim Einkaufen kuerzer wird statt gleich lang zu bleiben.
  const offen=items.filter(i=>!i.done),erledigt=items.filter(i=>i.done);
  let html='';
  CATS.forEach(c=>{
    const drin=offen.filter(i=>catOf(i)===c.id);
    if(!drin.length)return;
    const zu=shopState.zu.has(c.id);
    html+=`<div class="shop-cat${zu?' zu':''}">`
      +`<button class="shop-cat-hd" onclick="rezShopFold('${c.id}')">`
        +`<span class="shop-cat-ic">${c.icon}</span><span class="shop-cat-nm">${escH(c.label)}</span>`
        +`<span class="shop-cat-n">${drin.length}</span><span class="shop-cat-ar">▾</span></button>`
      +`<div class="shop-cat-body">`+drin.map(shopZeile).join('')+`</div></div>`;
  });
  if(erledigt.length){
    html+=`<div class="shop-cat"><div class="shop-cat-hd shop-cat-done">`
      +`<span class="shop-cat-ic">${icn('check',14)}</span><span class="shop-cat-nm">Done</span>`
      +`<span class="shop-cat-n">${erledigt.length}</span></div>`
      +`<div class="shop-cat-body">`+erledigt.map(shopZeile).join('')+`</div></div>`;
  }
  return`<div class="shop-list">`+(html||`<div class="shop-sep">Everything done</div>`)+`</div>`;
}
export function rezShopFold(id){
  if(shopState.zu.has(id))shopState.zu.delete(id);else shopState.zu.add(id);
  renderShopping();
}
export function rezShopSort(){
  shopState.sort=shopState.sort==='cat'?'new':'cat';
  renderShopping();
}
export async function rezShopAll(done){
  const n=await S.setAllShoppingDone(done);
  renderShopping();renderNav();
  toast(n?`${n} item${n===1?'':'s'} updated`:'Nothing to change');
}

// ── Vorschlaege ────────────────────────────────────────────────────────
let _shopSugg=[],_shopQuick=[];
export function rezShopSuggest(v){
  shopState.letzteQ=v;
  _shopSugg=suggest(v,shopVerlauf(),7);
  shopState.vorschlag=-1;
  const host=$('shopSugg');
  if(!host)return;
  if(!_shopSugg.length||!v.trim()){host.innerHTML='';host.classList.remove('on');return;}
  host.classList.add('on');
  host.innerHTML=_shopSugg.map((sg,i)=>{
    const c=CAT_BY_ID[sg.cat]||CAT_BY_ID.other;
    return`<button class="shop-sugg-row${i===shopState.vorschlag?' on':''}" style="--i:${i}" onclick="rezShopPick(${i})">`
      +`<span class="shop-sugg-ic">${c.icon}</span><span class="shop-sugg-nm">${escH(sg.text)}</span>`
      +`<span class="shop-sugg-cat">${escH(c.label)}</span>`
      +(sg.source==='recent'?`<span class="shop-sugg-tag">recent</span>`:'')+`</button>`;
  }).join('');
}
// Pfeiltasten + Enter, damit man die Liste ohne Maus fuellen kann.
export function rezShopKey(ev){
  const host=$('shopSugg');
  const n=_shopSugg.length;
  if(ev.key==='ArrowDown'&&n){ev.preventDefault();shopState.vorschlag=(shopState.vorschlag+1)%n;markSugg();return;}
  if(ev.key==='ArrowUp'&&n){ev.preventDefault();shopState.vorschlag=(shopState.vorschlag-1+n)%n;markSugg();return;}
  if(ev.key==='Escape'){if(host){host.innerHTML='';host.classList.remove('on');}shopState.vorschlag=-1;return;}
  if(ev.key==='Enter'){
    ev.preventDefault();
    if(shopState.vorschlag>=0&&_shopSugg[shopState.vorschlag]){rezShopPick(shopState.vorschlag);return;}
    rezShopAdd();
  }
}
function markSugg(){
  const host=$('shopSugg');if(!host)return;
  [...host.children].forEach((el,i)=>el.classList.toggle('on',i===shopState.vorschlag));
}
export async function rezShopPick(i){
  const sg=_shopSugg[i];
  if(!sg)return;
  // Eine getippte Menge bleibt erhalten: "2 " + Vorschlag "Milk" -> "2 Milk".
  const roh=($('shopNew')||{}).value||'';
  const menge=(roh.match(/^\s*(\d+(?:[.,]\d+)?\s*[a-zA-Z×x]*)\s+\S/)||[])[1];
  const text=menge?menge.trim()+' '+sg.text:sg.text;
  const id=await S.addShopping(text,'',sg.cat);
  const inp=$('shopNew');if(inp)inp.value='';
  _shopSugg=[];
  renderShopping();renderNav();
  markNeu(id);
  const wieder=$('shopNew');if(wieder)wieder.focus();
}
export async function rezShopQuick(i){
  const v=shopVerlauf().filter(x=>x.n>1&&!S.shoppingItems().some(it=>!it.done&&it.text.toLowerCase()===x.text.toLowerCase())).slice(0,6)[i];
  if(!v)return;
  const id=await S.addShopping(v.text,'',v.cat||categorize(v.text));
  renderShopping();renderNav();
  markNeu(id);
}
export async function rezShopAdd(){
  const inp=$('shopNew');
  if(!inp||!inp.value.trim())return;
  const text=inp.value;
  const id=await S.addShopping(text,'',categorize(text));
  inp.value='';
  _shopSugg=[];
  renderShopping();renderNav();
  markNeu(id);
  const wieder=$('shopNew');if(wieder)wieder.focus();
}
// Auf einer nach Abteilungen sortierten Liste landet ein neuer Eintrag
// irgendwo in der Mitte. Ohne kurzes Aufleuchten sucht man ihn.
function markNeu(id){
  if(!id)return;
  const zeilen=[...document.querySelectorAll('#pgShopping .shop-row')];
  const treffer=zeilen.find(z=>{
    const cb=z.querySelector('input[type=checkbox]');
    return cb&&(cb.getAttribute('onchange')||'').includes(id);
  });
  if(treffer){treffer.classList.add('just-added');treffer.scrollIntoView({block:'nearest',behavior:'smooth'});}
}
export async function rezShopToggle(id){await S.toggleShopping(id);renderShopping();renderNav();}
export async function rezShopRemove(id){await S.removeShopping(id);renderShopping();renderNav();}
export async function rezShopClearDone(){
  const n=await S.clearShoppingDone();
  renderShopping();renderNav();
  toast(n?`${n} item${n===1?'':'s'} cleared`:'Nothing to clear');
}
// Eintrag bearbeiten: Text UND Abteilung. Die automatische Zuordnung ist
// eine Hilfe, keine Behauptung - der Nutzer muss sie korrigieren koennen.
export function rezShopEdit(id){
  const it=S.shoppingItems().find(x=>x.id===id);
  if(!it)return;
  const aktuell=catOf(it);
  openModal(
     `<h3>Edit item</h3>`
    +`<label class="dm-lbl">Item</label>`
    +`<input class="m-inp" id="shopEditTxt" value="${escH(it.text)}">`
    +`<label class="dm-lbl">Aisle</label>`
    +`<div class="cat-pick">`+CATS.map(c=>
        `<button class="cat-opt${c.id===aktuell?' on':''}" data-cat="${c.id}" onclick="rezShopPickCat('${c.id}')">`
        +`<span>${c.icon}</span>${escH(c.label)}</button>`).join('')+`</div>`
    +`<div class="m-btns"><button class="btn btn-danger" style="margin-right:auto" onclick="rezShopRemoveFromEdit('${id}')">Remove</button>`
      +`<button class="btn" onclick="rezCloseModal()">Cancel</button>`
      +`<button class="btn btn-primary" onclick="rezShopSaveEdit('${id}')">Save</button></div>`);
  _editCat=aktuell;
}
let _editCat='other';
export function rezShopPickCat(c){
  _editCat=c;
  document.querySelectorAll('.cat-opt').forEach(el=>el.classList.toggle('on',el.dataset.cat===c));
}
export async function rezShopSaveEdit(id){
  const txt=(($('shopEditTxt')||{}).value||'').trim();
  if(!txt){toast('The item needs a name');return;}
  await S.updateShopping(id,{text:txt,cat:_editCat});
  rezCloseModal();
  renderShopping();renderNav();
  toast('Item updated');
}
export async function rezShopRemoveFromEdit(id){
  await S.removeShopping(id);
  rezCloseModal();
  renderShopping();renderNav();
  toast('Removed');
}

// ══ KOCH-VERLAUF ═════════════════════════════════════════════════════════
export function renderCooked(){
  const el=$('pgCooked');if(!el)return;
  const log=S.state.index.cooked;
  const monat=d=>{const x=new Date(d);return MON[x.getMonth()]+' '+x.getFullYear();};
  let letzter='';
  const zeilen=log.map(e=>{
    const m=monat(e.date);
    const kopf=(m!==letzter)?(letzter=m,`<div class="shop-sep">${escH(m)}</div>`):'';
    const d=new Date(e.date);
    return kopf+`<div class="cook-row">`
      +(e.thumb?`<img class="cook-thumb" src="${e.thumb}" alt="" onclick="rezOpenDetail('${e.recipeId}')">`:`<span class="cook-thumb"></span>`)
      +`<div class="cook-main"><div class="cook-nm" onclick="rezOpenDetail('${e.recipeId}')">${escH(e.title||'Recipe')}</div>`
        +`<div class="cook-dt">${d.getDate()} ${MON[d.getMonth()]} ${d.getFullYear()}</div></div>`
      +`<div class="cook-stars">`+[1,2,3,4,5].map(n=>
          `<button class="cook-star${e.rating>=n?' on':''}" onclick="rezRate('${e.id}',${n})" title="${n} of 5" aria-label="${n} of 5">`
          +`<svg width="15" height="15" viewBox="0 0 24 24" fill="${e.rating>=n?'currentColor':'none'}" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round">${ICONS.star}</svg></button>`).join('')
      +`</div>`
      +`<button class="btn" onclick="rezCookThis('${e.recipeId}')">Cook again</button>`
      +`<button class="rf-x" onclick="rezRemoveCooked('${e.id}')" title="Remove" aria-label="Remove">×</button>`
    +`</div>`;
  }).join('');
  el.innerHTML=
     `<div class="ptitle">Cooked</div>`
    +`<div class="psub">${log.length?`${log.length} meal${log.length===1?'':'s'} logged`:'Nothing logged yet'}</div>`
    +(log.length?`<div class="shop-list">${zeilen}</div>`
      :`<div class="rez-empty"><h4>No history yet</h4>`
       +`<p>Every time you tap “Mark as cooked” on the Overview, the meal lands here — with a rating, and the Random Picker learns to skip what you just had.</p>`
       +`<button class="btn btn-primary" onclick="rezShowPage('overview')">Go to Overview</button></div>`);
  afterRender(el);
}
export async function rezRate(id,n){await S.rateCooked(id,n);renderCooked();}
export async function rezRemoveCooked(id){await S.removeCooked(id);renderCooked();renderNav();toast('Removed from history');}

// ── MODAL-INFRASTRUKTUR ──────────────────────────────────────────────────
// ⚠ FENSTER-GENERATION. Mehrere Oeffner laden erst etwas nach (getFull,
// Bilder) und zeichnen DANACH. Ohne Zaehler passiert Folgendes: man tippt
// "What can I cook?", schliesst gleich wieder, und Sekunden spaeter springt
// das Fenster von selbst auf - oder schlimmer, es ueberschreibt ein
// inzwischen geoeffnetes anderes Fenster. Vom Waechter gefunden, als er
// erst alle Karten durchklickte und danach das Hinzufuegen-Fenster nicht
// mehr fand. Jeder asynchrone Oeffner merkt sich modalGen() und bricht ab,
// wenn sich die Generation seither geaendert hat.
let _modalGen=0;
function modalGen(){return _modalGen;}
function modalVeraltet(g){return g!==_modalGen;}
function openModal(html,cls){
  const host=$('rezModals');
  _modalGen++;
  clearTimeout(_closeT);
  host.innerHTML=`<div class="ov" id="rezOv" onclick="if(event.target===this)rezRequestClose()"><div class="modal ${cls||''}">${html}</div></div>`;
  // ⚠ Erst abmelden, dann anmelden: openModal() wird beim Neuzeichnen des
  // Formulars mehrfach aufgerufen, sonst haengen am Ende N Escape-Handler
  // am document und ein Tastendruck loest N Schliess-Versuche aus.
  document.removeEventListener('keydown',escClose);
  document.addEventListener('keydown',escClose);
  afterRender(host);
}
function escClose(e){
  if(e.key!=='Escape')return;
  // Das Titelbild-Fenster liegt UEBER dem Formular - Escape schliesst
  // immer das oberste Fenster, sonst verschwaende man das Formular darunter.
  if(coverOffen()){rezCloseCover();return;}
  rezRequestClose();
}
// Der EINE Weg nach draussen (Klick daneben, Escape, Cancel-Button). Steht
// ungespeicherte Arbeit im Formular, fragt er nach, statt sie wegzuwerfen.
export function rezRequestClose(){
  if(offeneEingabe()){openUnsavedDialog();return;}
  rezCloseModal();
}
// ⚠ JEDES Eingabe-Fenster gehoert hier hinein. Die Inspirations-Maske wurde
// beim Bau zunaechst vergessen - dort haette ein Klick daneben wieder alles
// verworfen, obwohl das Rezept-Formular laengst geschuetzt war. Genau diese
// Sorte "an einer Stelle gefixt, an der naechsten nicht" soll die eine
// gemeinsame Abfrage verhindern.
function offeneEingabe(){
  if(form&&formBase&&JSON.stringify(form)!==formBase)return true;
  if(inspoForm&&inspoBase&&JSON.stringify(inspoForm)!==inspoBase)return true;
  return false;
}
let _closeT=null;
export function rezCloseModal(){
  _modalGen++;
  // Das Titelbild-Fenster gehoert zum Formular darunter - bleibt es offen,
  // schriebe "Use as cover" in ein Formular, das es nicht mehr gibt.
  if(coverOffen())rezCloseCover();
  closeRowMenu();
  closeUnsavedDialog();
  ytStop();
  const host=$('rezModals');
  // ⚠ Der Zustand wird SOFORT geraeumt, das Aufraeumen des DOM erst nach der
  // Abgangs-Animation. Andersherum haette man 140 ms lang ein Fenster, das
  // noch Eingaben annimmt, obwohl es logisch schon zu ist.
  detailId=null;form=null;formBase=null;inspoForm=null;inspoBase=null;
  document.removeEventListener('keydown',escClose);
  if(!host||!host.firstChild)return;
  const ov=host.querySelector('.ov');
  clearTimeout(_closeT);
  if(!ov||document.body.classList.contains('no-anim')||
     matchMedia('(prefers-reduced-motion: reduce)').matches){host.innerHTML='';return;}
  ov.classList.add('closing');
  _closeT=setTimeout(()=>{if(host.querySelector('.ov.closing'))host.innerHTML='';},140);
}

// ══ NACHFRAGE BEI UNGESPEICHERTEN EINGABEN ═══════════════════════════════
// Nutzer-Bugreport 2026-09-01: "wenn man eine Notiz oder ein Rezept
// hinzufuegt und man neben das Fenster schliesst, ist das was man eingegeben
// hat weg". Statt eines Sicherheits-Overlays, das gar nicht mehr zugehen
// will, ein zentriertes Fenster mit drei eindeutigen Wegen. Dieselbe Loesung
// steckt im FX Analyst Pro (#mUnsaved) - beide Apps verhalten sich hier
// gleich, obwohl der Code getrennt ist.
function formDirty(){return offeneEingabe();}
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
export function rezDiscardClose(){closeUnsavedDialog();form=null;formBase=null;inspoForm=null;inspoBase=null;rezCloseModal();toast('Changes discarded');}
export async function rezSaveClose(){
  closeUnsavedDialog();
  const ok=inspoForm?await rezSaveInspo():await rezSaveForm();
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
  detailServ=doc.servings||2;
  const ing=(doc.ingredients||[]).filter(x=>x&&x.trim());
  const blocks=(doc.blocks||[]).filter(b=>b&&(b.v||'').trim());
  _aktuelleBilder=recipeImages(doc);
  const vid=doc.source?detectLink(doc.source):null;
  openModal(
     `<div class="rd-hero">`
      +(doc.cover?`<img src="${doc.cover}" alt="${escH(doc.title)}" onclick="rezShowImage(0)" style="cursor:zoom-in">`
                 :`<div style="height:180px;display:flex;align-items:center;justify-content:center;background:var(--bg4);color:var(--t3)">${icn('image',34)}</div>`)
      +`<button class="rd-menu-btn" onclick="event.stopPropagation();rezOpenRowMenu(event,'${id}')" title="More" aria-label="More">⋮</button>`
      +(vid&&vid.embedUrl?`<button class="rd-play" onclick="rezPlayVideo('${id}')" aria-label="Play the original video">${icn('play',20)} Watch video</button>`:'')
    +`</div>`
    // Alle Fotos des Rezepts auf einen Blick - bis 2026-09-02 waren die
    // Bilder aus der Zubereitung nur beim Durchscrollen zu finden.
    +(_aktuelleBilder.length>1?`<div class="rd-strip">`
       +_aktuelleBilder.map((b,i)=>`<img src="${b.src}" alt="" onclick="rezShowImage(${i})" loading="lazy">`).join('')
     +`</div>`:'')
    +`<div class="rd-title">${escH(doc.title||'Untitled')}</div>`
    +`<div class="rd-meta"><span class="rd-chip">${icn('clock',12)}${fmtDur(doc.min)}</span>`
      +(doc.fav?`<span class="rd-chip" style="color:var(--star)">${icn('star',12)}Favourite</span>`:'')
      +tags+`</div>`
    +(ing.length?`<div class="rd-sec"><div class="rd-sec-h">Ingredients`
        +`<span class="rd-serv"><button class="ck-sv" onclick="rezDetailServ('${id}',-1)" aria-label="Fewer servings">−</button>`
        +`<span id="rdServN">${detailServ}</span><button class="ck-sv" onclick="rezDetailServ('${id}',1)" aria-label="More servings">+</button></span></div>`
        +`<ul class="rd-ing" id="rdIng">${ingHtml(doc,detailServ)}</ul></div>`:'')
    +`<div class="rd-sec"><div class="rd-sec-h">Preparation</div>`
      +(blocks.length?blocks.map(b=>{
          if(b.t!=='img')return`<div class="rd-block"><p>${escH(b.v)}</p></div>`;
          const bi=_aktuelleBilder.findIndex(x=>x.src===b.v);
          return`<div class="rd-block"><img src="${b.v}" alt="" style="cursor:zoom-in" onclick="rezShowImage(${bi})"></div>`;
        }).join('')
        :`<div class="rd-empty">No preparation steps written down yet.</div>`)
    +`</div>`
    // Notizen: die Information, die beim ZWEITEN Kochen zaehlt ("weniger
    // Salz"). Direkt im Detailfenster editierbar, nicht nur im Formular -
    // sonst schreibt sie niemand auf.
    +`<div class="rd-sec"><div class="rd-sec-h">Notes for next time</div>`
      +`<textarea class="m-area" id="rdNotes" placeholder="e.g. less salt, 5 minutes longer in the oven..."`
      +` oninput="rezNotesDirty()" onblur="rezSaveNotes('${id}')">${escH(doc.notes||'')}</textarea>`
      +`<div class="rd-notes-state" id="rdNotesState"></div></div>`
    +`<div class="m-btns" style="flex-wrap:wrap">`
      +(doc.source?`<a class="btn" href="${escH(doc.source)}" target="_blank" rel="noopener">${icn('link',13)} Original post</a>`:'')
      +`<button class="btn" onclick="rezShareRecipe('${id}')">${icn('share',13)} Share</button>`
      +`<button class="btn" onclick="rezMarkCooked('${id}')">${icn('check',13)} Mark as cooked</button>`
      +`<button class="btn" onclick="rezCookThis('${id}')">Cook today</button>`
      +`<button class="btn" onclick="rezOpenForm('${id}')">Edit</button>`
      +`<button class="btn btn-primary" onclick="rezCloseModal();rezCook('${id}')">${icn('cooked',13)} Cook mode</button>`
    +`</div>`
  ,'modal-wide');
}
let detailServ=2;
function ingHtml(doc,serv){
  const basis=doc.servings||2;
  const f=basis?serv/basis:1;
  return(doc.ingredients||[]).filter(x=>x&&x.trim())
    .map(z=>`<li>${escH(CK.scaleIngredient(z,f))}</li>`).join('');
}
export async function rezDetailServ(id,d){
  const doc=await S.getFull(id);
  if(!doc)return;
  detailServ=Math.max(1,Math.min(24,detailServ+d));
  const n=$('rdServN');if(n)n.textContent=detailServ;
  const host=$('rdIng');if(host)host.innerHTML=ingHtml(doc,detailServ);
}
let _notesDirty=false;
export function rezNotesDirty(){
  _notesDirty=true;
  const el=$('rdNotesState');if(el)el.textContent='Unsaved…';
}
export async function rezSaveNotes(id){
  if(!_notesDirty)return;
  const doc=await S.getFull(id);
  if(!doc)return;
  const v=(($('rdNotes')||{}).value||'');
  if((doc.notes||'')===v){_notesDirty=false;return;}
  doc.notes=v;
  try{
    await S.saveRecipe(doc);
    _notesDirty=false;
    const el=$('rdNotesState');if(el)el.textContent='Saved';
  }catch(e){
    const el=$('rdNotesState');if(el)el.textContent='Could not save: '+(e&&e.message||'unknown error');
  }
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
  const g=modalGen();
  if(id){
    const doc=await S.getFull(id);
    if(modalVeraltet(g))return;
    if(!doc){toast('Recipe not available on this device yet');return;}
    form=JSON.parse(JSON.stringify(doc));
    form.source=form.source||'';
    form.servings=+form.servings||2;
    form.notes=form.notes||'';
    form.ingredients=(form.ingredients&&form.ingredients.length)?form.ingredients:[''];
    form.blocks=(form.blocks&&form.blocks.length)?form.blocks:[{t:'text',v:''}];
  }else{
    form={id:S.uid(),title:'',min:30,servings:2,tags:[],fav:false,cover:'',thumb:'',ingredients:[''],blocks:[{t:'text',v:''}],created:'',up:'',source:'',notes:''};
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
    +`<div class="rf-add" style="margin-top:8px"><button class="btn" onclick="rezCoverStudio()">${icn('play',13)} `
      +`${form.source?'Cover from the video':'Cover from a screenshot'}</button></div>`
    +`<div class="rf-row">`
      +`<div><label class="dm-lbl">Title</label><input class="m-inp" id="rfTitle" placeholder="e.g. Pasta al limone" value="${escH(form.title)}" oninput="rezFormField('title',this.value)"></div>`
      +`<div><label class="dm-lbl">Duration</label><select class="m-sel" onchange="rezFormField('min',this.value)">${durOpts}</select></div>`
    +`</div>`
    +`<label class="dm-lbl">Servings (the amounts above are for this many)</label>`
    +`<input class="m-inp" type="number" min="1" max="24" value="${+form.servings||2}" oninput="rezFormField('servings',this.value)">`
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
export function rezFormField(k,v){form[k]=(k==='min'||k==='servings')?+v:v;}
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
    servings:Math.max(1,Math.min(24,+form.servings||2)),
    notes:form.notes||'',
    // Herkunft eines importierten Rezepts - bleibt am Volldokument haengen,
    // damit man vom Rezept aus zum urspruenglichen Reel zurueckkommt.
    source:form.source||'',
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
  renderNav();
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
      +`</div>`
      +`<div class="set-row" style="margin-top:12px"><div><div class="set-row-t">Animations</div>`
        +`<div class="set-row-s">Motion when pages, cards and windows change. Your system's “reduce motion” setting always wins over this.</div></div>`
        +`<button class="btn${animAn()?' btn-primary':''}" onclick="rezToggleAnim()">${animAn()?'On':'Off'}</button></div>`
    +`</div>`
    +`<div class="set-sec"><div class="set-sec-h">Cloud sync</div>`
      +`<div class="set-row"><div><div class="set-row-t">${cfg?'Connected':'Not connected'}</div>`
        +`<div class="set-row-s">Perfect Rezept and FX Analyst Pro share one Supabase project — changing the credentials here changes them for both apps.</div></div>`
        +`<div style="display:flex;gap:6px;flex-shrink:0"><button class="btn" onclick="rezTestCloud()"${cfg?'':' disabled'}>Test</button>`
        +`<button class="btn" onclick="rezSyncNow()"${cfg?'':' disabled'}>Sync now</button></div></div>`
      +`<div class="set-row"><div style="min-width:0"><div class="set-row-t">Status</div>`
        +`<div class="set-row-s" id="rezSyncStatus">${escH(S.state.lastError||S.state.status||'Idle')}</div></div></div>`
      // ⚠ Die Zugangsdaten sind hier bewusst editierbar. Bis REZEPT-CHECK-3
      // stand hier nur "richte das im FX Analyst Pro ein" - bei einem
      // abgelehnten Schluessel (401) musste der Nutzer die App wechseln, um
      // ein Problem zu reparieren, das er hier gemeldet bekommt.
      +`<details class="set-adv"${S.state.lastError?' open':''}><summary>Credentials</summary>`
        +`<label class="dm-lbl">Project URL</label>`
        +`<input class="m-inp" id="rezCloudUrl" placeholder="https://xxxxx.supabase.co" value="${escH(cfg?cfg.url:'')}">`
        +`<label class="dm-lbl">API key (anon / publishable)</label>`
        +`<input class="m-inp" id="rezCloudKey" placeholder="sb_publishable_… or eyJ…" value="${escH(cfg?cfg.key:'')}">`
        +`<label class="dm-lbl">Sync ID</label>`
        +`<input class="m-inp" id="rezCloudId" placeholder="e.g. jonathan" value="${escH(cfg?cfg.syncId:'')}">`
        +`<div class="set-row-s" style="margin-bottom:10px">Supabase → Project Settings → API. Use the publishable/anon key, never the secret one.</div>`
        +`<button class="btn btn-primary" onclick="rezSaveCloud()">Save credentials</button>`
      +`</details>`
      // ⚠ Der haeufigste Sync-Fehler ist KEIN Schluesselproblem, sondern eine
      // fehlende Datenbank-Regel: Supabase laesst diesen Schluessel keine
      // NEUE Zeile anlegen (Postgres 42501). Der FX Analyst Pro merkt davon
      // nichts, weil seine Zeile schon existiert - die Rezept-App muss
      // welche anlegen. Deshalb steht das SQL hier zum Kopieren, und bei
      // erkanntem Regel-Fehler klappt der Abschnitt von selbst auf.
      +`<details class="set-adv"${S.state.rlsBlocked?' open':''}><summary>Database setup (SQL)</summary>`
        +(S.state.rlsBlocked
          ?`<div class="set-row-s sql-warn" style="margin-bottom:8px"><b>Supabase is blocking new rows for this key.</b> Not a full database, not a bad key — the table is missing an INSERT policy. FX Analyst Pro keeps working because its row already exists and it only updates that row; Perfect Rezept has to create its own rows. Run this once in Supabase → SQL editor, then press Test.</div>`
          :`<div class="set-row-s" style="margin-bottom:8px">Creates table <b>fx_sync</b> and the row-level security policies both apps need. Running it again is harmless.</div>`)
        +`<pre class="sql-box" id="rezSqlBox">${escH(S.SETUP_SQL)}</pre>`
        +`<div class="set-row-s" style="margin-bottom:10px">Anyone holding this publishable key can read and write these rows — that is how both apps work, the key sits in the browser. Keep the Sync ID hard to guess and never paste the secret key.</div>`
        +`<button class="btn" onclick="rezCopySql()">Copy SQL</button>`
      +`</details>`
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
  const el=$('rezSyncStatus');if(el)el.textContent='Syncing…';
  await S.flushSync();
  const el2=$('rezSyncStatus');if(el2)el2.textContent=S.state.lastError||S.state.status||'Idle';
}
export async function rezTestCloud(){
  const el=$('rezSyncStatus');if(el)el.textContent='Testing…';
  const r=await S.testConnection();
  // Bei einem Regel-Fehler das Fenster neu zeichnen, damit "Database setup"
  // offen steht - sonst liest der Nutzer einen Verweis auf einen Abschnitt,
  // den er selbst suchen muss.
  if(!r.ok&&S.state.rlsBlocked)rezOpenSettings();
  const el2=$('rezSyncStatus');if(el2)el2.textContent=(r.ok?'✓ ':'✗ ')+r.msg;
  toast(r.ok?'Connection works':(r.rls?'Database rules block writing':'Connection failed'));
}
// ⚠ Ohne Fallback waere dieser Knopf auf genau den Geraeten tot, auf denen
// er gebraucht wird: navigator.clipboard fehlt in unsicherem Kontext und
// wirft in aelteren iOS-Safaris. Dann wird der Text markiert, damit der
// Nutzer ihn wenigstens von Hand kopieren kann.
export async function rezCopySql(){
  const box=$('rezSqlBox');
  try{
    if(navigator.clipboard&&navigator.clipboard.writeText){
      await navigator.clipboard.writeText(S.SETUP_SQL);
      toast('SQL copied — paste it into Supabase → SQL editor');
      return;
    }
    throw new Error('no clipboard');
  }catch(e){
    try{
      const sel=window.getSelection(),rng=document.createRange();
      rng.selectNodeContents(box);sel.removeAllRanges();sel.addRange(rng);
      const ok=document.execCommand&&document.execCommand('copy');
      toast(ok?'SQL copied — paste it into Supabase → SQL editor':'Could not copy — the SQL is selected, copy it manually');
    }catch(e2){
      toast('Could not copy — select the SQL above and copy it manually');
    }
  }
}
export async function rezSaveCloud(){
  try{
    S.saveCloudCfg(($('rezCloudUrl')||{}).value,($('rezCloudKey')||{}).value,($('rezCloudId')||{}).value);
  }catch(e){
    const el=$('rezSyncStatus');if(el)el.textContent='✗ '+(e&&e.message||'Could not save');
    return;
  }
  toast('Credentials saved');
  await rezTestCloud();
  await S.flushSync();
  const el=$('rezSyncStatus');if(el)el.textContent=S.state.lastError||S.state.status||'Idle';
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
// Animationen an/aus. Standard ist AN; gespeichert wird nur die Abweichung,
// damit ein Geraet ohne gesetzten Wert nicht versehentlich stumm bleibt.
export function animAn(){return (S.state.index.settings||{}).anim!==false;}
function applyAnim(){
  document.body.classList.toggle('no-anim',!animAn());
}
export async function rezToggleAnim(){
  await S.setSetting('anim',!animAn());
  applyAnim();
  rezOpenSettings();
  toast(animAn()?'Animations on':'Animations off');
}
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
    applyStoredTheme();applyAnim();
    renderNav();
    // ⚠ Jede Kategorie muss hier auftauchen. Fehlt eine, bleibt sie nach
    // einer Aenderung auf einem anderen Geraet (Cloud-Pull) auf einem alten
    // Stand stehen, ohne dass irgendetwas kaputt aussieht.
    if(curPage==='overview')renderOverview();
    else if(curPage==='recipes')refreshGridOnly();
    else if(curPage==='inspo')renderInspo();
    else if(curPage==='week')renderWeek();
    else if(curPage==='shopping')renderShopping();
    else if(curPage==='cooked')renderCooked();
  }else if(what==='settings'){
    applyStoredTheme();applyAnim();
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
  applyAnim();
  rezShowPage('overview');
})();

// ── window-Bruecke fuer die Inline-Handler im HTML ───────────────────────
Object.assign(window,{
  rezShowPage,rezOpenDetail,rezOpenForm,rezCloseModal,rezRequestClose,rezSaveForm,rezOpenSettings,
  rezKeepEditing,rezDiscardClose,rezSaveClose,
  rezSetTheme,rezToggleAnim,animAn,rezSyncNow,rezTestCloud,rezSaveCloud,rezCopySql,rezRestore,rezDeleteForever,rezSwitchApp,rezToggleFav,
  rezSetQuery,rezSetMaxMin,rezSetTag,rezSetTagIdx,rezToggleFavFilter,rezClearFilters,rezFocusSearch,
  rezAddFromOverview,rezOpenRowMenu,rezCloseRowMenu,rezAskDelete,rezConfirmDelete,
  rezFormField,rezFormTags,rezSetIngredient,rezAddIngredient,rezDelIngredient,
  rezSetBlock,rezAddBlock,rezDelBlock,rezMoveBlock,rezPickCover,rezPickBlockImage,
  // Overview
  rezRandomOpt,rezRoll,rezCookThis,rezMarkCooked,rezClearToday,rezPickToday,
  // Kochmodus + Timer
  rezCook,rezCookExit,rezCookStep,rezCookTick,rezCookServ,rezCookFinish,renderCook,
  rezCookGo,rezCookMedia,rezCookAspect,
  rezStartTimer,rezTimerPause,rezTimerResume,rezTimerPlus,rezTimerStop,
  rezOpenTimerDialog,rezStartCustomTimer,
  // Portionen, Notizen, Suche, Vorschlag, Teilen
  rezDetailServ,rezNotesDirty,rezSaveNotes,rezSearchQuery,
  rezOpenMatch,rezMatchQuery,rezMatchTick,rezMatchToShopping,rezShareRecipe,
  // Rezept-Auswahl
  rezPickQuery,rezPickChoose,
  // Taegliche Vorschlaege
  rezFeedSource,rezFeedTheme,rezFeedMore,rezFeedReset,rezFeedToRecipe,rezFeedToInspo,rezOpenFeed,
  // Inspiration
  renderInspo,rezInspoQuery,rezInspoClear,rezInspoCreator,rezInspoTag,rezInspoSort,rezOpenBulk,rezRunBulk,rezOpenInspoForm,rezInspoField,rezInspoTags,rezInspoUrl,
  rezInspoPaste,rezPickInspoImage,rezSaveInspo,rezOpenInspo,rezTrashInspo,rezInspoToRecipe,
  rezInspoByCreator,rezYtToggle,rezYtSeek,rezYtScrub,rezYtScrubEnd,
  // Bilder und Video am Rezept
  rezPlayVideo,rezCloseVideo,rezLightbox,rezLightboxStep,rezLightboxClose,rezShowImage,
  // Titelbild aus dem Video / Bildschirmfoto
  rezCoverStudio,rezCoverStudioInspo,rezCloseCover,rezCoverFrame,rezCoverPick,rezCoverPaste,
  rezCoverRatio,rezCoverBack,rezCoverUse,
  // Woche
  renderWeek,rezWeekShift,rezWeekToday,rezWeekAdd,rezWeekRemove,rezWeekToShopping,
  // Einkaufsliste
  renderShopping,rezShopAdd,rezShopToggle,rezShopRemove,rezShopClearDone,
  rezShopSuggest,rezShopKey,rezShopPick,rezShopQuick,rezShopFold,rezShopSort,rezShopAll,
  rezShopEdit,rezShopPickCat,rezShopSaveEdit,rezShopRemoveFromEdit,
  // Verlauf
  renderCooked,rezRate,rezRemoveCooked,
  // von den Waechtern gebraucht
  renderRecipes,renderOverview,
});
