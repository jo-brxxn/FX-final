const PW=process.env.PW_PATH||'/opt/node22/lib/node_modules/playwright';
const URL=process.env.CHECK_URL||'http://127.0.0.1:8935/index.html';
const { chromium } = require(PW);
const MODE=process.argv[2]||'normalized';
(async()=>{
 const b=await chromium.launch();
 const p=await b.newPage({viewport:{width:1600,height:1100}});
 await p.addInitScript(m=>{try{localStorage.setItem('fxpro_help_seen','1');localStorage.setItem('dmfx_app_choice','fx');localStorage.setItem('fxpro_score_mode',m);}catch(e){}},MODE);
 const perr=[];p.on('pageerror',e=>perr.push(String(e)));
 await p.goto(URL,{waitUntil:'networkidle'});
 await p.evaluate(()=>{['introOv','lockScreen','appChoiceOv'].forEach(id=>{const e=document.getElementById(id);if(e)e.remove();});});
 await p.waitForTimeout(5000);
 const r=await p.evaluate(()=>{
  const F=[],ok={};
  const soll={};syms.forEach(s=>soll[s.id]=Math.round(symScoreCmp(s)*10)/10);
  // Der Score steht am ENDE der Zeile (davor kann der Name selbst Ziffern
  // tragen: "S&P 500", "GER 100") - deshalb von hinten lesen.
  const num=t=>{const s=String(t).replace(/[\s\u00a0]+/g,' ').trim();
    const m=s.match(/([+-]?\d+(?:[.,]\d+)?)\s*[\u25b2\u25bc\u25c6]?\s*$/);
    return m?parseFloat(m[1].replace(',','.')):null;};
  // 1) Asset-Liste in der Navigationsleiste.
  // ⚠ Seit 2026-08-23 steht dort NUR noch der Name (Nutzer-Wunsch "nur die
  // Namen") - die Score-Zahl ist raus. Der Score bleibt aber erreichbar: er
  // steht im Tooltip der Zeile (data-tip). Geprueft wird deshalb DORT, nicht
  // mehr im sichtbaren Text. Die Pruefung bleibt damit vollstaendig - sie
  // wandert nur an die Stelle, an der die Zahl jetzt wirklich steht.
  showTab('fx');
  let n=0;
  document.querySelectorAll('button.ab[data-sym]').forEach(btn=>{
    const id=btn.getAttribute('data-sym'); if(soll[id]==null)return; n++;
    const imNav=!!btn.closest('#navSidebar');
    const quelle=imNav?(btn.getAttribute('data-tip')||''):btn.innerText;
    const v=num(quelle);
    if(v==null||Math.abs(v-soll[id])>0.051)F.push({ort:imNav?'Nav-Tooltip':'Sidebar',id,angezeigt:v,soll:soll[id],txt:String(quelle).replace(/\n/g,'|')});
    // Die Zeile in der Navigationsleiste faerbt bewusst NICHT nach Bias
    // (Nutzer-Wunsch 2026-08-23) - eine data-bv-Markierung darf dort also
    // gar nicht mehr stehen, sonst kaeme die Faerbung durch die Hintertuer
    // zurueck. Ausserhalb der Leiste gilt die alte Pruefung weiter.
    const an=btn.querySelector('.an');
    const bv=an&&an.getAttribute('data-bv');
    const sym=syms.find(s=>s.id===id);
    if(imNav){
      if(bv)F.push({ort:'Nav-Bias',id,dom:bv,hinweis:'Die Nav-Liste soll neutral bleiben'});
    }else if(bv&&sym&&bv!==sym.bias)F.push({ort:'Sidebar-Bias',id,dom:bv,soll:sym.bias});
  });
  ok.sidebar=n;
  // 2) Asset-Kopf: Score-Badge im Detailbereich
  let n2=0,fehlend=0;
  Object.keys(soll).forEach(id=>{
    selSym(id);
    const cand=[...document.querySelectorAll('#detail .ab,#detail [onclick*="openScoreInfoSym"]')];
    if(!cand.length){fehlend++;return;}
    n2++;
    const v=num(cand[0].innerText);
    if(v==null||Math.abs(v-soll[id])>0.051)F.push({ort:'Asset-Kopf',id,angezeigt:v,soll:soll[id],txt:cand[0].innerText.replace(/\n/g,'|')});
  });
  ok.assetKopf=n2;ok.assetKopfOhneBadge=fehlend;
  // 2b) Die Event-Sektion muss auf JEDEM Asset stehen.
  // ⚠ Nutzer-Bugreport 2026-09-06 ("Bei Assets bei cad gibt es kein
  // minimalender"): die Sektion haengte an `symEvts.length` und verschwand
  // komplett, sobald kein Event ins Fenster (-10 bis +7 Tage) fiel. Gemessen
  // war CAD das einzige betroffene Asset (0 Events im Fenster, alle anderen
  // 1-19) - und die App kannte den naechsten CAD-Termin sehr wohl
  // (2026-09-14, 8 Tage entfernt, knapp ausserhalb des Fensters). Mit der
  // Liste fiel auch die Kopfzeile mit "Next Event" weg, also genau die
  // Information, die vorlag. Ein leerer Zustand darf nichts verschlucken,
  // was bekannt ist - deshalb hier als Dauerpruefung ueber ALLE Assets,
  // nicht nur ueber das eine, das gerade auffiel.
  let n2b=0;
  Object.keys(soll).forEach(id=>{
    selSym(id);
    if(!document.querySelector('#detail .evt-section')){
      F.push({ort:'Event-Sektion fehlt',id,hinweis:'Asset zeigt weder Kalender noch "Next Event"'});
      return;
    }
    n2b++;
  });
  ok.evtSektion=n2b;
  // 3) Score-Fenster: Summe der Zeilen == angezeigter Gesamtwert
  let n3=0;
  Object.keys(soll).forEach(id=>{
    const sym=syms.find(s=>s.id===id);
    let summe=0;(sym.rubrics||[]).forEach(r=>summe+=rubScore(r));
    const ss=symScore(sym);
    n3++;
    if(Math.abs(roundSc(summe)-ss)>0.011)F.push({ort:'Score-Fenster-Summe',id,summe:roundSc(summe),symScore:ss});
  });
  ok.scoreFenster=n3;
  // 4) Paar-Scores endlich und symmetrisch (A/B == -(B/A) ohne Carry-Asymmetrie pruefen wir nicht)
  let n4=0;
  (typeof ALL_PAIRS!=='undefined'?ALL_PAIRS:[]).forEach(nm=>{const v=pairScore(nm);n4++;
    if(!isFinite(v))F.push({ort:'Paar',pair:nm,v:String(v)});});
  ok.paare=n4;
  return {fehler:F.length,F:F.slice(0,40),ok};
 });
 console.log('MODUS',MODE,'pageerrors',perr.length,perr.slice(0,2));
 console.log(JSON.stringify(r,null,1));
 await b.close();
})();
