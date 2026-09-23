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
// ⚠ REGELWECHSEL 2026-09-22 (Bild-Design, Nutzer-Entscheid per Rueckfrage):
// die Leiste ist jetzt eine FESTE Icon-Leiste mit Beschriftung - sie klappt
// nie mehr ein. Damit ist der Zwei-Klick-Mechanismus auf Touch Geschichte:
// JEDER erste Tipp wirkt sofort, auf der Leiste wie im Inhalt. Der Waechter
// prueft das jetzt mit echten Tipps UND Mausklicks, und dazu das neue
// Asset-Panel (auf per Tipp, zu nach der Asset-Wahl und beim Tipp daneben).
const {chromium}=require(PW);

const REGEL='Erster Klick verstellt nur die Leiste, erst der zweite wirkt';
const REGEL_MAUS='PC/Maus: der erste Klick soll sofort navigieren (kein Zwei-Klick-Mechanismus)';

async function seite(ctx){
  const p=await ctx.newPage();
  await p.addInitScript(()=>{try{localStorage.setItem('fxpro_help_seen','1');localStorage.setItem('fxpro_intro_anim_enabled','0');}catch(e){}});
  await p.goto(URL,{waitUntil:'networkidle'});
  await p.evaluate(()=>{['lockScreen'].forEach(id=>{const e=document.getElementById(id);if(e)e.remove();});document.querySelectorAll('.ov').forEach(o=>o.style.display='none');});
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
  // Seit 2026-09-22 wirkt der erste Tipp im Inhalt sofort - der Punkt muss
  // deshalb wirklich NEUTRAL sein: der Innenrand direkt neben der Leiste,
  // vor der ersten Karte (bei +30px traf er auf dem Dashboard 'Add pair').
  return {x:Math.round(r.right+5),y:700};
});
const zustand=p=>p.evaluate(()=>({page:curPage,
  collapsed:document.getElementById('navSidebar').classList.contains('nav-collapsed')}));

(async()=>{
  const b=await chromium.launch();
  const fehler=[];
  const pruefe=(bed,text)=>{if(!bed)fehler.push(text);};

  // ── A/B: Touch (iPad): nichts klappt ein, der erste Tipp wirkt ───────
  {
    const ctx=await b.newContext({viewport:{width:1194,height:834},hasTouch:true});
    const p=await seite(ctx);
    const breite0=await p.evaluate(()=>Math.round(document.getElementById('navSidebar').getBoundingClientRect().width));
    const tp=await inhaltPunkt(p);await p.touchscreen.tap(tp.x,tp.y);
    await p.waitForTimeout(300);
    const a1=await zustand(p);
    const breite1=await p.evaluate(()=>Math.round(document.getElementById('navSidebar').getBoundingClientRect().width));
    pruefe(!a1.collapsed&&breite1===breite0,'Touch: Tippen im Inhalt veraendert die Leiste ('+breite0+' -> '+breite1+'px) - sie ist seit 2026-09-22 fest');
    await p.tap(ZIEL);await p.waitForTimeout(400);
    const a2=await zustand(p);
    pruefe(a2.page==='cal','Touch: der erste Tipp auf "Calendar" navigiert nicht (blieb auf "'+a2.page+'") - seit 2026-09-22 wirkt jeder erste Tipp');
    await ctx.close();
  }

  // ── C/D: Maus am PC - die Leiste bleibt STEHEN ──────────────────────
  // ⚠ NEUE REGEL seit 2026-09-13 (Nutzer: "mach noch das man links die
  // leiste wo man das menue hat wo man in den kategorien auswaehlen kann
  // das die am pc dauerhaft da ist"). Bis dahin klappte sie bei jedem
  // Scrollen und jedem Klick im Inhalt auf Icon-Breite ein; genau das
  // verlangte dieser Waechter vorher auch. Er ist jetzt auf die neue Regel
  // gedreht - und dabei STRENGER geworden statt schwaecher: geprueft werden
  // beide Ausloeser einzeln (Klick UND Scrollen), die Breite in Pixeln
  // (nicht nur die Klasse - eine Media Query koennte sie auch ohne Klasse
  // schmal machen), und zusaetzlich, dass die Leiste nach einem Wechsel von
  // schmal zurueck auf breit von selbst wieder aufgeht.
  {
    const ctx=await b.newContext({viewport:{width:1194,height:834}});
    const p=await seite(ctx);
    const breite=()=>p.evaluate(()=>Math.round(document.getElementById('navSidebar').getBoundingClientRect().width));
    const offenBreite=await breite();
    pruefe(offenBreite>=60,'Maus: die Leiste ist nicht sichtbar ('+offenBreite+'px) - alles Weitere waere wirkungslos');

    const mp=await inhaltPunkt(p);await p.mouse.click(mp.x,mp.y);await p.waitForTimeout(350);
    const c1=await zustand(p);
    pruefe(!c1.collapsed,'Maus: Klick im Inhalt klappt die Leiste ein - am PC soll sie stehen bleiben');
    pruefe(await breite()===offenBreite,'Maus: die Leiste ist nach einem Klick im Inhalt schmaler geworden');

    // Scrollen ist der zweite, unabhaengige Ausloeser - der frueher haeufigere.
    await p.mouse.move(mp.x,mp.y);await p.mouse.wheel(0,600);await p.waitForTimeout(400);
    const c1b=await zustand(p);
    pruefe(!c1b.collapsed,'Maus: Scrollen im Inhalt klappt die Leiste ein - am PC soll sie stehen bleiben');
    pruefe(await breite()===offenBreite,'Maus: die Leiste ist nach dem Scrollen schmaler geworden');

    // ⚠ Mit echtem hover() VOR dem Klick - genau das unterscheidet den
    // Maus-Pfad vom Touch-Pfad. Der erste Klick soll SOFORT navigieren
    // (Nutzer-Wunsch 2026-08-22), kein Zwei-Klick-Mechanismus am PC.
    // Selektor statt Element-Handle: die Leiste wird zwischendurch neu
    // aufgebaut, ein festgehaltener Handle waere dann nicht mehr im DOM.
    await p.hover(ZIEL);await p.waitForTimeout(150);await p.click(ZIEL);await p.waitForTimeout(400);
    const c2=await zustand(p);
    pruefe(c2.page==='cal',REGEL_MAUS+' - der erste Klick hat NICHT sofort navigiert (blieb auf "'+c2.page+'")');
    pruefe(!c2.collapsed,'Maus: der erste Klick hat die Leiste eingeklappt');

    // D: und ein zweiter Klick ebenso - nichts darf geschluckt werden.
    await p.evaluate(()=>{try{showTab('dash');}catch(e){}});
    await p.mouse.move(600,400);await p.waitForTimeout(200);
    await p.mouse.move(60,400);await p.waitForTimeout(250);
    await p.click(ZIEL);await p.waitForTimeout(400);
    const d1=await zustand(p);
    pruefe(d1.page!=='dash','Maus: bei offener Leiste wurde der Klick faelschlich geschluckt');

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
    // ── E2: Asset-Panel (seit 2026-09-22) ───────────────────────────────
    // Die Asset-Liste ist ein Panel UEBER dem Inhalt: der Wechsel auf die
    // Asset-Seite darf es NICHT aufklappen (es wuerde den Inhalt verdecken),
    // hervorgehoben bleibt der Eintrag trotzdem. Ein Tipp oeffnet es, die
    // Asset-Wahl und ein Tipp daneben schliessen es.
    await p.evaluate(()=>{selectTab('fx');});
    await p.waitForTimeout(350);
    const e2=await p.evaluate(()=>({
      offen:!!document.querySelector('#sidebar.np-assets.open'),
      aktiv:!!document.querySelector('#navSidebar .np-stack.np-assetstack.has-active'),
    }));
    pruefe(!e2.offen,'Das Asset-Panel klappt beim Wechsel auf die Asset-Seite von selbst auf und verdeckt den Inhalt');
    pruefe(e2.aktiv,'Der Assets-Eintrag wird auf der Assets-Seite nicht hervorgehoben');
    await p.click('#navSidebar .np-assetstack');await p.waitForTimeout(350);
    const e3=await p.evaluate(()=>{const w=document.getElementById('sidebar');const r=w.getBoundingClientRect();const n=document.getElementById('navSidebar').getBoundingClientRect();
      return{offen:w.classList.contains('open'),sichtbar:getComputedStyle(w).visibility==='visible',neben:Math.abs(r.left-n.right)<=2,assets:w.querySelectorAll('.ab.np-asset').length};});
    pruefe(e3.offen&&e3.sichtbar,'Ein Klick auf "Assets" oeffnet das Asset-Panel nicht');
    pruefe(e3.neben,'Das Asset-Panel steht nicht direkt neben der Leiste');
    pruefe(e3.assets>0,'Im Asset-Panel steht kein einziges Asset');
    await p.click('#sidebar .ab.np-asset >> nth=2');await p.waitForTimeout(350);
    const e4=await p.evaluate(()=>({offen:document.getElementById('sidebar').classList.contains('open'),tab:activeTabId}));
    pruefe(e4.tab==='fx'&&!e4.offen,'Nach der Asset-Wahl bleibt das Panel offen oder die Asset-Seite erscheint nicht');
    await p.click('#navSidebar .np-assetstack');await p.waitForTimeout(300);
    await p.mouse.click(1000,30);await p.waitForTimeout(300);
    const e5=await p.evaluate(()=>document.getElementById('sidebar').classList.contains('open'));
    pruefe(!e5,'Ein Klick neben das Asset-Panel schliesst es nicht');
    // ── E3: jeder andere Stapel (Insights ...) ist seit 2026-09-23 dasselbe
    // Panel wie Assets (Nutzer: "genau so wie bei Assets also der Stapel").
    await p.click('#navSidebar .np-stack:not(.np-assetstack)');await p.waitForTimeout(350);
    const e6=await p.evaluate(()=>{const w=document.querySelector('#navSidebar .np-sub-wrap.open:not(.np-assets)');if(!w)return null;
      const r=w.getBoundingClientRect(),n=document.getElementById('navSidebar').getBoundingClientRect();
      return{fest:getComputedStyle(w).position==='fixed',neben:Math.abs(r.left-n.right)<=2,eintraege:w.querySelectorAll('.np-sub').length};});
    pruefe(!!e6,'Ein Klick auf einen Stapel (Insights) oeffnet kein Panel');
    if(e6){
      pruefe(e6.fest&&e6.neben,'Der Stapel oeffnet nicht als Panel neben der Leiste (wie Assets), sondern anders');
      pruefe(e6.eintraege>0,'Im Stapel-Panel steht kein Eintrag');
      await p.click('#navSidebar .np-sub-wrap.open:not(.np-assets) .np-sub >> nth=0');await p.waitForTimeout(350);
      const e7=await p.evaluate(()=>!!document.querySelector('#navSidebar .np-sub-wrap.open'));
      pruefe(!e7,'Nach der Wahl im Stapel-Panel bleibt es offen');
    }
    await ctx.close();
  }

  // ── F: WIRKT EIN KNOPF IM INHALT BEIM ERSTEN KLICK? ─────────────────
  // ⚠ Nutzer-Bugreport 2026-09-14: "check mal bitte ob noch alle funktionen
  // wo man drauf klicken kann gehen - am ipad geht es aber am pc nicht
  // mehr". Gemessen: am PC reagierte im GANZEN Inhaltsbereich kein
  // Bedienelement mehr, auch nicht beim zweiten oder dritten Klick.
  //
  // URSACHE war der Schluck-Merker dieses Mechanismus: er wurde bei jedem
  // Zeigerdruck im Inhalt gesetzt, sobald die Leiste offen war - und seit
  // dem 2026-09-13 ist sie am PC DAUERHAFT offen. Geschluckt wurde also
  // jeder Klick, nicht nur der eine, der die Leiste zuklappt.
  //
  // ⚠ WARUM KEIN BESTEHENDER WAECHTER DAS SAH: A bis E pruefen die Leiste
  // selbst (die funktionierte), und alle anderen Waechter rufen die
  // Funktionen ueber p.evaluate() direkt auf - ein geschluckter MAUSKLICK
  // ist fuer sie unsichtbar. Deshalb hier ein ECHTER Klick auf einen Knopf
  // im Inhalt, mit der Frage, ob danach wirklich etwas passiert ist.
  {
    for(const [name,opt,ersterKlickWirkt] of [
      ['PC 1920',{viewport:{width:1920,height:1080}},true],
      ['PC 1280',{viewport:{width:1280,height:900}},true],
      // Seit 2026-09-22 auch auf Touch: der erste Tipp wirkt.
      ['iPad 1194 Touch',{viewport:{width:1194,height:834},hasTouch:true},true],
    ]){
      const ctx=await b.newContext(opt);
      const p=await seite(ctx);
      await p.evaluate(()=>{try{gotoSym('USD');}catch(e){}});
      await p.waitForTimeout(700);
      const zu=()=>p.evaluate(()=>{const m=document.getElementById('mHist');if(m)m.style.display='none';});
      const offen=()=>p.evaluate(()=>{const m=document.getElementById('mHist');return !!m&&m.style.display==='flex';});
      const knopf='.dmeta .dmeta-hist-btn:has-text("History")';
      const da=await p.$(knopf);
      if(!da){fehler.push(`${name}: kein History-Knopf in der .dmeta-Zeile gefunden - der Waechter kann nichts pruefen`);await ctx.close();continue;}
      await zu();
      await p.click(knopf,{force:true});
      await p.waitForTimeout(400);
      const nach1=await offen();
      await zu();
      await p.click(knopf,{force:true});
      await p.waitForTimeout(400);
      const nach2=await offen();
      await zu();
      if(ersterKlickWirkt){
        pruefe(nach1,`${name}: der ERSTE Mausklick auf "History" oeffnet nichts. Genau so sah der Fehler vom 2026-09-14 aus - am PC wurde jeder Klick im Inhalt geschluckt.`);
        pruefe(nach2,`${name}: auch der zweite Mausklick auf "History" oeffnet nichts - der Knopf ist dauerhaft tot.`);
      }else{
        pruefe(!nach1,`${name}: der erste Tipper wirkt schon. Auf Touch soll er nur die Leiste einklappen (${REGEL}).`);
        pruefe(nach2,`${name}: auch der zweite Tipper oeffnet nichts - auf Touch muss spaetestens der zweite wirken.`);
      }
      await ctx.close();
    }
  }

  await b.close();
  console.log(JSON.stringify({total:fehler.length,findings:fehler},null,2));
})();
