const PW=process.env.PW_PATH||'/opt/node22/lib/node_modules/playwright';
const URL=process.env.CHECK_URL||'http://127.0.0.1:8935/index.html';
// ── SIDEBAR-INTERAKTION ───────────────────────────────────────────────
// Diese Regel ist ZWEIMAL beim Nutzer angekommen, obwohl sie jedes Mal als
// "getestet" galt:
//   1. Gebaut und nur mit dispatchEvent('click') geprueft - mit echter Maus
//      klappte pointerenter schon beim Hinbewegen aus, wodurch die Abfrage
//      "ist die Leiste gerade eingeklappt?" zum Klickzeitpunkt immer falsch
//      war und der Klick sofort navigierte.
//   2. Danach mit hover()+click() geprueft (Maus ok) - aber auf dem iPad ist
//      die Ereignisfolge pointerenter -> pointerdown -> pointerup ->
//      POINTERLEAVE -> click. Das pointerleave loeschte das Merkmal, bevor
//      der Klick-Handler es lesen konnte.
// Beide Male war nicht die Logik das Problem, sondern die Testmethode.
// Deshalb prueft dieser Waechter BEIDE Zeigerarten - aber seit dem
// Nutzer-Wunsch 2026-08-22 bewusst gegen UNTERSCHIEDLICHES Verhalten: am PC
// (Maus mit Hover) navigiert der erste Klick sofort (kein verlorener Klick
// nur zum Ausklappen - Hover oeffnet die Leiste dort ja schon vorher), am
// iPad/Handy (kein Hover) bleibt der bestehende Zwei-Klick-Mechanismus.
// Playwright-Kontexte ohne hasTouch melden matchMedia('(hover:hover) and
// (pointer:fine)') wie ein echter Desktop mit Maus.
const {chromium}=require(PW);

const REGEL='Erster Klick verstellt nur die Leiste, erst der zweite wirkt';
const REGEL_MAUS='PC/Maus: der erste Klick soll sofort navigieren (kein Zwei-Klick-Mechanismus)';

async function seite(ctx){
  const p=await ctx.newPage();
  await p.addInitScript(()=>{try{localStorage.setItem('fxpro_help_seen','1');localStorage.setItem('fxpro_intro_anim_enabled','0');}catch(e){}});
  await p.goto(URL,{waitUntil:'networkidle'});
  await p.evaluate(()=>{const e=document.getElementById('lockScreen');if(e)e.remove();document.querySelectorAll('.ov').forEach(o=>o.style.display='none');});
  await p.waitForTimeout(1200);
  await p.evaluate(()=>{document.querySelectorAll('.mov,.mov2').forEach(m=>m.style.display='none');try{showTab('dash');}catch(e){}});
  await p.waitForTimeout(600);
  return p;
}
// data-tip statt title (Nutzer-Wunsch 2026-08-22: eigene Tooltips statt der
// verzoegerten Browser-title-Tooltips - die .np-Buttons tragen den Namen
// seither in data-tip/aria-label, title gibt es dort nicht mehr).
const ZIEL='#navSidebar .np[data-tip="Calendar"]';
// Punkt im INHALT, rechts neben der Leiste - deren Breite haengt vom
// laengsten Label ab und darf hier nicht geraten werden.
const inhaltPunkt=p=>p.evaluate(()=>{
  const r=document.getElementById('navSidebar').getBoundingClientRect();
  return {x:Math.round(r.right+30),y:700};
});
const zustand=p=>p.evaluate(()=>({page:curPage,
  collapsed:document.getElementById('navSidebar').classList.contains('nav-collapsed')}));

(async()=>{
  const b=await chromium.launch();
  const fehler=[];
  const pruefe=(bed,text)=>{if(!bed)fehler.push(text);};

  // ── A/B: Touch (iPad) ───────────────────────────────────────────────
  {
    const ctx=await b.newContext({viewport:{width:1194,height:834},hasTouch:true});
    const p=await seite(ctx);
    // Im Inhalt tippen: neutrale Stelle im Innenabstand, damit der Tipper
    // nicht zufaellig einen Link in einer Karte trifft.
    const tp=await inhaltPunkt(p);await p.touchscreen.tap(tp.x,tp.y);
    await p.waitForTimeout(300);
    const a1=await zustand(p);
    pruefe(a1.collapsed,'Touch: Tippen im Inhalt klappt die Leiste nicht ein');

    await p.tap(ZIEL);await p.waitForTimeout(400);
    const a2=await zustand(p);
    pruefe(a2.page===a1.page,REGEL+' - Touch: der erste Tipper auf die eingeklappte Leiste hat schon navigiert (nach "'+a2.page+'")');
    pruefe(!a2.collapsed,'Touch: der erste Tipper hat die Leiste nicht ausgeklappt');

    await p.tap(ZIEL);await p.waitForTimeout(400);
    const a3=await zustand(p);
    pruefe(a3.page!=='dash','Touch: der zweite Tipper navigiert nicht (haengt auf "'+a3.page+'")');

    // Gegenrichtung: Leiste offen, Tipper im Inhalt klappt nur ein.
    // Vorher zurueck aufs Dashboard - der Test oben ist im Kalender gelandet,
    // dort gibt es keine .dw-Kachel.
    await p.evaluate(()=>{try{showTab('dash');}catch(e){}});
    await p.waitForTimeout(600);
    let geklickt=await p.evaluate(()=>{window.__k=0;
      const el=document.querySelector('.dw');if(el)el.addEventListener('click',()=>{window.__k++;});return true;});
    await p.evaluate(()=>{document.getElementById('navSidebar').classList.remove('nav-collapsed');});
    const kachel=await p.$('.dw');
    if(kachel&&geklickt){
      await kachel.tap();await p.waitForTimeout(300);
      const b1=await p.evaluate(()=>({k:window.__k,collapsed:document.getElementById('navSidebar').classList.contains('nav-collapsed')}));
      pruefe(b1.k===0,REGEL+' - Touch: der erste Tipper im Inhalt hat schon gewirkt, statt nur die Leiste einzuklappen');
      pruefe(b1.collapsed,'Touch: Tippen im Inhalt klappt die Leiste nicht ein');
      await kachel.tap();await p.waitForTimeout(300);
      const b2=await p.evaluate(()=>window.__k);
      pruefe(b2===1,'Touch: der zweite Tipper im Inhalt wirkt nicht');
    }
    await ctx.close();
  }

  // ── C/D: Maus ───────────────────────────────────────────────────────
  {
    const ctx=await b.newContext({viewport:{width:1194,height:834}});
    const p=await seite(ctx);
    const mp=await inhaltPunkt(p);await p.mouse.click(mp.x,mp.y);await p.waitForTimeout(300);
    const c1=await zustand(p);
    pruefe(c1.collapsed,'Maus: Klick im Inhalt klappt die Leiste nicht ein');

    // ⚠ Mit echtem hover() VOR dem Klick - genau das unterscheidet den
    // Maus-Pfad vom Touch-Pfad. Anders als beim Touch-Block oben soll der
    // erste Klick hier SOFORT navigieren (Nutzer-Wunsch 2026-08-22) - kein
    // Zwei-Klick-Mechanismus am PC.
    // Selektor statt Element-Handle: die Leiste wird zwischendurch neu
    // aufgebaut, ein festgehaltener Handle waere dann nicht mehr im DOM.
    await p.hover(ZIEL);await p.waitForTimeout(150);await p.click(ZIEL);await p.waitForTimeout(400);
    const c2=await zustand(p);
    pruefe(c2.page==='cal',REGEL_MAUS+' - der erste Klick hat NICHT sofort navigiert (blieb auf "'+c2.page+'")');
    pruefe(!c2.collapsed,'Maus: der erste Klick hat die Leiste nicht ausgeklappt');

    // D: Leiste war schon offen und wurde NICHT gerade erst ausgeklappt -
    // dann muss ein Klick sofort navigieren, nichts darf geschluckt werden.
    await p.evaluate(()=>{try{showTab('dash');}catch(e){}});
    await p.mouse.move(600,400);await p.waitForTimeout(200);
    await p.evaluate(()=>{document.getElementById('navSidebar').classList.remove('nav-collapsed');});
    await p.mouse.move(60,400);await p.waitForTimeout(250);
    await p.click(ZIEL);await p.waitForTimeout(400);
    const d1=await zustand(p);
    pruefe(d1.page!=='dash','Maus: bei bereits offener Leiste wurde der Klick faelschlich geschluckt');
    await ctx.close();
  }

  // ── E: ein Tab-Stapel darf nicht ausgewaehlt bleiben ────────────────
  // ⚠ Der Test zielte frueher auf 'fx' als "Tab ausserhalb jedes Stapels".
  // Seit 2026-08-23 ist 'fx' (Assets) SELBST ein Stapel - dass er beim
  // Wechsel dorthin aufklappt, ist gewollt und kein Fehler. Es wird jetzt
  // ein Tab gewaehlt, der nachweislich in keinem Stapel steckt, und
  // GEZIELT geprueft, dass genau der zuvor geoeffnete Stapel wieder zu ist.
  // Das ist strenger als vorher: es faellt auch dann auf, wenn irgendein
  // anderer Stapel offen bleibt.
  {
    const ctx=await b.newContext({viewport:{width:1194,height:834}});
    const p=await seite(ctx);
    const vorbereitung=await p.evaluate(()=>{
      const st=tabStacks[0];if(!st)return null;
      onStackClick(null,st.id);
      // Ein Tab, der weder Assets noch Mitglied irgendeines Stapels ist.
      const drin=new Set(tabStacks.flatMap(s=>s.members));
      const frei=TAB_ORDER.find(id=>id!=='fx'&&!drin.has(id));
      return{stackId:st.id,frei};
    });
    if(vorbereitung&&vorbereitung.frei){
      await p.waitForTimeout(250);
      const offenVorher=await p.evaluate(id=>!!document.querySelector(`#navSidebar .np-stack.open[data-stack="${id}"]`),vorbereitung.stackId);
      pruefe(offenVorher,'Der Teststapel liess sich gar nicht erst aufklappen - Pruefung E waere wirkungslos');
      await p.evaluate(id=>{selectTab(id);},vorbereitung.frei);
      await p.waitForTimeout(350);
      const e1=await p.evaluate(id=>({
        offen:!!document.querySelector(`#navSidebar .np-stack.open[data-stack="${id}"]`),
        aktiv:!!document.querySelector(`#navSidebar .np-stack.has-active[data-stack="${id}"]`),
        irgendeinerOffen:!!document.querySelector('#navSidebar .np-stack.open'),
      }),vorbereitung.stackId);
      pruefe(!e1.offen,'Ein Tab-Stapel bleibt aufgeklappt, obwohl ein Tab ausserhalb gewaehlt wurde');
      pruefe(!e1.aktiv,'Ein Tab-Stapel bleibt hervorgehoben, obwohl ein Tab ausserhalb gewaehlt wurde');
      pruefe(!e1.irgendeinerOffen,'Irgendein Stapel bleibt aufgeklappt, obwohl ein stapelfreier Tab gewaehlt wurde');
    }
    // ── E2: der Assets-Stapel klappt beim Wechsel dorthin AUF ──────────
    // Gegenprobe zu E: die Regel oben darf nicht dazu fuehren, dass der
    // aktive Stapel zuklappt - sonst waere die Asset-Liste nach jedem
    // Seitenwechsel verschwunden.
    await p.evaluate(()=>{selectTab('fx');});
    await p.waitForTimeout(350);
    const e2=await p.evaluate(()=>({
      offen:!!document.querySelector('#navSidebar .np-stack.np-assetstack.open'),
      aktiv:!!document.querySelector('#navSidebar .np-stack.np-assetstack.has-active'),
      assets:document.querySelectorAll('#sidebar .ab.np-asset').length,
    }));
    pruefe(e2.offen,'Der Assets-Stapel klappt beim Wechsel auf die Assets-Seite nicht auf');
    pruefe(e2.aktiv,'Der Assets-Stapel wird auf der Assets-Seite nicht hervorgehoben');
    pruefe(e2.assets>0,'Im Assets-Stapel steht kein einziges Asset');
    await ctx.close();
  }

  await b.close();
  console.log(JSON.stringify({total:fehler.length,findings:fehler},null,2));
})();
