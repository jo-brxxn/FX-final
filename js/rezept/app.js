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
import {detectLink,parseCaption,captionToRecipe} from './import.js';
import {CATS,CAT_BY_ID,categorize,splitQty,suggest} from './groceries.js';

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
export function rezFocusSearch(){
  rezShowPage('recipes');
  const inp=$('rezSearchInp');if(inp){inp.focus();inp.select();}
}
export async function rezToggleFav(id){
  await S.toggleFav(id);
  refreshGridOnly();
  if(detailId===id)rezOpenDetail(id);
}

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

// ══ INSPIRATION ══════════════════════════════════════════════════════════
// Ideen-Sammlung: eingebettete Reels/Videos, Links, Fotos, Notizen. Der
// Unterschied zu "Recipes" ist die Absicht - hier liegt, was man MAL kochen
// will, dort was man kochen KANN. Der Weg dazwischen ist ein Knopf:
// "Convert to recipe" laesst den Parser aus js/rezept/import.js die
// eingefuegte Caption in Titel/Dauer/Zutaten/Schritte zerlegen und oeffnet
// damit das fertig ausgefuellte Rezept-Formular.
let inspoFilter='';
export function renderInspo(){
  const el=$('pgInspo');if(!el)return;
  const alle=S.state.index.inspo;
  const q=inspoFilter.trim().toLowerCase();
  const liste=alle.filter(i=>!q||((i.title||'')+' '+(i.caption||'')+' '+(i.tags||[]).join(' ')).toLowerCase().includes(q));
  el.innerHTML=
     `<div class="ptitle">Inspiration</div>`
    +`<div class="psub">${alle.length?`${liste.length} of ${alle.length} shown`:'Save reels, links and ideas you want to cook one day'}</div>`
    +`<div class="rez-toolbar">`
      +`<div class="rez-search">${icn('search',15)}<input id="inspoQ" type="search" placeholder="Search ideas..." value="${escH(inspoFilter)}" oninput="rezInspoQuery(this.value)"></div>`
      +`<button class="btn btn-primary" onclick="rezOpenInspoForm(null)">${icn('plus',14)} Add idea</button>`
    +`</div>`
    +`<div class="rez-grid stagger">`+(liste.length?liste.map(inspoCardHtml).join(''):inspoEmptyHtml(alle.length))+`</div>`;
  afterRender(el);
}
function inspoEmptyHtml(total){
  if(!total)return`<div class="rez-empty"><h4>No ideas saved yet</h4>`
    +`<p>Paste an Instagram reel, a TikTok, a YouTube link or just a note. Later you turn it into a real recipe with one click.</p>`
    +`<button class="btn btn-primary" onclick="rezOpenInspoForm(null)">${icn('plus',14)} Add your first idea</button></div>`;
  return`<div class="rez-empty"><h4>Nothing matches</h4><p>No idea matches your search.</p>`
    +`<button class="btn" onclick="rezInspoQuery('')">Clear search</button></div>`;
}
function inspoCardHtml(i){
  const bild=i.thumb?`<img class="rez-card-img" src="${i.thumb}" alt="" loading="lazy">`
    :`<div class="rez-card-img insp-ph">${icn(i.platform==='link'?'link':'play',34)}<span>${escH(i.label||i.platform||'Idea')}</span></div>`;
  return`<div class="rez-card" onclick="rezOpenInspo('${i.id}')" role="button" tabindex="0" onkeydown="if(event.key==='Enter')rezOpenInspo('${i.id}')">`
    +bild
    +(i.platform&&i.platform!=='note'?`<span class="insp-badge">${escH(i.label||i.platform)}</span>`:'')
    +`<div class="rez-card-ov"><div class="rez-card-title">${escH(i.title||'Untitled idea')}</div>`
      +(i.min?`<span class="rez-card-dur">${icn('clock',11)}${fmtDur(i.min)}</span>`:'')+`</div></div>`;
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
      caption:'',thumb:'',tags:[],min:null,created:'',up:''};
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
  if(l){inspoForm.platform=l.platform;inspoForm.label=l.label;inspoForm.embedUrl=l.embedUrl;inspoForm.url=l.url;}
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
  if(p.tags.length&&!(inspoForm.tags||[]).length)inspoForm.tags=p.tags;
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
  const einbetten=i.embedUrl
    ? `<div class="insp-frame"><iframe src="${escH(i.embedUrl)}" loading="lazy" allowfullscreen`
      +` referrerpolicy="origin-when-cross-origin"`
      +` sandbox="allow-scripts allow-same-origin allow-popups allow-presentation"`
      +` title="${escH(i.title||'Embedded video')}"></iframe></div>`
      +`<div class="insp-note">If the video stays blank you are offline, or the post is private — use the button below.</div>`
    : (i.thumb?`<div class="rd-hero" style="margin-bottom:14px"><img src="${i.thumb}" alt=""></div>`:'');
  openModal(
     einbetten
    +`<div class="rd-title" style="font-size:var(--fs-xl)">${escH(i.title||'Untitled idea')}</div>`
    +`<div class="rd-meta">`
      +(i.label?`<span class="rd-chip">${icn('link',12)}${escH(i.label)}</span>`:'')
      +(i.min?`<span class="rd-chip">${icn('clock',12)}${fmtDur(i.min)}</span>`:'')
      +(i.tags||[]).map(t=>`<span class="rd-chip">${escH(t)}</span>`).join('')
    +`</div>`
    +(i.caption?`<div class="rd-sec"><div class="rd-sec-h">Saved text</div><div class="rd-block"><p>${escH(i.caption)}</p></div></div>`:'')
    +`<div class="m-btns" style="flex-wrap:wrap">`
      +`<button class="btn btn-danger" style="margin-right:auto" onclick="rezTrashInspo('${i.id}')">${icn('trashIcon',13)} Delete</button>`
      +(i.url?`<a class="btn" href="${escH(i.url)}" target="_blank" rel="noopener">Open in ${escH(i.label||'browser')}</a>`:'')
      +`<button class="btn" onclick="rezOpenInspoForm('${i.id}')">Edit</button>`
      +`<button class="btn btn-primary" onclick="rezInspoToRecipe('${i.id}')">${icn('recipes',13)} Convert to recipe</button>`
    +`</div>`
  ,'modal-wide');
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
export function rezInspoToRecipe(id){
  const i=S.state.index.inspo.find(x=>x.id===id);
  if(!i)return;
  const entwurf=captionToRecipe(i.caption||'',{});
  form={
    id:S.uid(),
    title:entwurf.title||i.title||'',
    min:i.min||entwurf.min||30,
    tags:(entwurf.tags&&entwurf.tags.length)?entwurf.tags:(i.tags||[]),
    fav:false,cover:i.thumb||'',thumb:i.thumb||'',
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
function openModal(html,cls){
  const host=$('rezModals');
  clearTimeout(_closeT);
  host.innerHTML=`<div class="ov" id="rezOv" onclick="if(event.target===this)rezRequestClose()"><div class="modal ${cls||''}">${html}</div></div>`;
  // ⚠ Erst abmelden, dann anmelden: openModal() wird beim Neuzeichnen des
  // Formulars mehrfach aufgerufen, sonst haengen am Ende N Escape-Handler
  // am document und ein Tastendruck loest N Schliess-Versuche aus.
  document.removeEventListener('keydown',escClose);
  document.addEventListener('keydown',escClose);
  afterRender(host);
}
function escClose(e){if(e.key==='Escape')rezRequestClose();}
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
  closeRowMenu();
  closeUnsavedDialog();
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
    +`<div class="m-btns" style="flex-wrap:wrap">`
      +(doc.source?`<a class="btn" style="margin-right:auto" href="${escH(doc.source)}" target="_blank" rel="noopener">${icn('link',13)} Original post</a>`:'')
      +`<button class="btn" onclick="rezMarkCooked('${id}')">${icn('check',13)} Mark as cooked</button>`
      +`<button class="btn" onclick="rezCookThis('${id}')">Cook today</button>`
      +`<button class="btn" onclick="rezCloseModal()">Close</button>`
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
    form.source=form.source||'';
    form.ingredients=(form.ingredients&&form.ingredients.length)?form.ingredients:[''];
    form.blocks=(form.blocks&&form.blocks.length)?form.blocks:[{t:'text',v:''}];
  }else{
    form={id:S.uid(),title:'',min:30,tags:[],fav:false,cover:'',thumb:'',ingredients:[''],blocks:[{t:'text',v:''}],created:'',up:'',source:''};
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
  const el2=$('rezSyncStatus');if(el2)el2.textContent=(r.ok?'✓ ':'✗ ')+r.msg;
  toast(r.ok?'Connection works':'Connection failed');
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
  rezSetTheme,rezToggleAnim,animAn,rezSyncNow,rezTestCloud,rezSaveCloud,rezRestore,rezDeleteForever,rezSwitchApp,rezToggleFav,
  rezSetQuery,rezSetMaxMin,rezSetTag,rezSetTagIdx,rezToggleFavFilter,rezClearFilters,rezFocusSearch,
  rezAddFromOverview,rezOpenRowMenu,rezCloseRowMenu,rezAskDelete,rezConfirmDelete,
  rezFormField,rezFormTags,rezSetIngredient,rezAddIngredient,rezDelIngredient,
  rezSetBlock,rezAddBlock,rezDelBlock,rezMoveBlock,rezPickCover,rezPickBlockImage,
  // Overview
  rezRandomOpt,rezRoll,rezCookThis,rezMarkCooked,rezClearToday,rezPickToday,
  // Rezept-Auswahl
  rezPickQuery,rezPickChoose,
  // Inspiration
  renderInspo,rezInspoQuery,rezOpenInspoForm,rezInspoField,rezInspoTags,rezInspoUrl,
  rezInspoPaste,rezPickInspoImage,rezSaveInspo,rezOpenInspo,rezTrashInspo,rezInspoToRecipe,
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
