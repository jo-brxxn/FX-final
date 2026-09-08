const PW=process.env.PW_PATH||'/opt/node22/lib/node_modules/playwright';
const URL=process.env.CHECK_URL||'http://127.0.0.1:8935/index.html';
const { chromium } = require(PW);
const { wartenBisDatenDa } = require('./warten.js');
const MODE=process.argv[2]||'normalized';
(async()=>{
 const b=await chromium.launch();
 const p=await b.newPage({viewport:{width:1600,height:1100}});
 await p.addInitScript(m=>{try{localStorage.setItem('fxpro_help_seen','1');localStorage.setItem('dmfx_app_choice','fx');localStorage.setItem('fxpro_score_mode',m);}catch(e){}},MODE);
 const perr=[];p.on('pageerror',e=>perr.push(String(e)));
 await p.goto(URL,{waitUntil:'networkidle'});
 await p.evaluate(()=>{['introOv','lockScreen','appChoiceOv'].forEach(id=>{const e=document.getElementById(id);if(e)e.remove();});});
 // ⚠ Keine feste Frist mehr - siehe check/warten.js (Messung 2026-09-07:
 // die Leiste wird bei t=645ms noch mit den Werten VOR den Feeds gezeichnet).
 await wartenBisDatenDa(p);
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
  // 2c) Der Zeitraum steht im Namen NUR EINMAL.
  // ⚠ Nutzer-Wunsch 2026-09-07: "ich will auch nicht das das da doppelt steht
  // bei anderen Indikatoren ist das so". Gemessen war genau ein Name
  // betroffen ("GDP Growth QoQ q/q"), 42 andere trugen das Kuerzel einmal -
  // die Doppelung entsteht, wenn der Basisname den Zeitraum schon in
  // Langform traegt und applyIndResearch die Kurzform anhaengt. Geprueft wird
  // die ANZEIGE, nicht der gespeicherte Name: der bleibt als Schluessel fuer
  // Feed/Kalender/Recherche absichtlich unveraendert.
  // Gegenprobe beim Einbau: indName() auf den rohen Namen zurueckgebaut
  // -> 24 Treffer (auf jeder Asset-Seite die GDP-Zeile), mit indName -> 0.
  const DOPPEL=/(qoq|yoy|mom)\s+(q\/q|y\/y|m\/m)|(q\/q|y\/y|m\/m)\s+(qoq|yoy|mom)/i;
  let n2c=0;
  Object.keys(soll).forEach(id=>{
    selSym(id);
    document.querySelectorAll('#detail .ir-name-txt').forEach(el=>{
      n2c++;
      const t=(el.textContent||'').replace(/\s+/g,' ').trim();
      if(DOPPEL.test(t))F.push({ort:'Zeitraum doppelt im Namen',id,name:t});
    });
  });
  ok.indNamen=n2c;
  // 2d) Kein Indikator darf den Feed STILL verfehlen.
  // ⚠ Die teuerste Fehlerklasse dieser Sitzung: AUD GDP wurde DREIMAL
  // gemeldet ("hat immernoch keine Daten oder Historie"), obwohl die Rohdaten
  // vollstaendig waren (0,4 % vom 2026-09-02, 54 Punkte ab 2013). Der
  // Abgleich lief ueber feed[base] und base entsteht durch Abschneiden nur
  // der KURZform: "GDP Growth q/q" -> "GDP Growth" -> kein Treffer, kein
  // Wert, keine Historie, keine Meldung. Ein Indikator, der eine Reihe haben
  // KOENNTE und keine bekommt, muss auffallen - hier statt beim Nutzer.
  // Gegenprobe beim Einbau: feedEntryFor auf den alten feed[base]-Zugriff
  // zurueckgebaut und ein Indikator umbenannt -> Treffer; zurueck -> 0.
  if(typeof indFeedSicht==='function'){
    const sicht=indFeedSicht();
    // Gemeldet wird NUR der stille Verlust: es GIBT eine passende Reihe
    // (kand>=1), der Indikator bekommt sie aber nicht. Ein Indikator, den die
    // Quelle fuer diese Waehrung gar nicht fuehrt (kand===0, z.B. NZD PPI),
    // ist eine ehrliche Luecke und faerbt den Lauf nicht rot - er wird nur
    // gezaehlt. Sonst waere der Waechter dauerhaft rot und damit wertlos.
    const verloren=sicht.filter(x=>!x.treffer&&x.kand>0);
    verloren.slice(0,10).forEach(x=>F.push({ort:'Indikator verliert seine Feed-Reihe',id:x.sym,name:x.name,kandidaten:x.kand}));
    ok.feedTreffer=sicht.filter(x=>x.treffer).length;
    ok.feedQuelleFuehrtNicht=sicht.filter(x=>!x.treffer&&x.kand===0).length;
  }
  // 2e) Die KI-Einordnung der Nachrichten muss ankommen UND sauber sein.
  // ⚠ Sie wird von einer geplanten Claude-Sitzung geschrieben (Routine, 2x
  // taeglich) - also von einem Lauf, den niemand ansieht. Genau deshalb
  // gehoert sein Ergebnis geprueft, BEVOR es beim Nutzer landet: eine
  // erfundene Asset-Id wuerde die Meldung unter der falschen Waehrung
  // einsortieren, ein zu langer Satz die Zeile sprengen.
  if(typeof newsAiSicht==='function'){
    const na=newsAiSicht();
    ok.newsAi={geladen:na.aiGeladen,eintraege:na.aiEintraege,mitEinordnung:na.mitEinordnung,
               durchKiZugeordnet:na.durchKiZugeordnet,laengsteEinordnung:na.maxSumLen};
    if(na.aiGeladen){
      if(!na.mitEinordnung)F.push({ort:'KI-Einordnung kommt nicht an',
        hinweis:'news_ai.json ist geladen, aber keine Meldung traegt eine Einordnung - der Abgleich ueber die Adresse greift nicht.'});
      // Erfundene Asset-Id: die Meldung landete unter einer Waehrung, die es
      // in der App gar nicht gibt - oder schlimmer, unter der falschen.
      const gueltig=new Set(syms.map(s=>s.id));
      (na.aiAssetIds||[]).filter(id=>!gueltig.has(id)).slice(0,5)
        .forEach(id=>F.push({ort:'KI-Einordnung nennt ein Asset, das es nicht gibt',id}));
      // Laenge und Markup an dem pruefen, was wirklich im DOM steht.
      const zuLang=[],mitMarkup=[];
      document.querySelectorAll('.hl-sum').forEach(el=>{
        const t=(el.textContent||'').trim();
        if(t.length>160)zuLang.push(t.slice(0,60));
        if(/[<>]/.test(t))mitMarkup.push(t.slice(0,60));
      });
      zuLang.slice(0,3).forEach(t=>F.push({ort:'KI-Einordnung zu lang',text:t}));
      mitMarkup.slice(0,3).forEach(t=>F.push({ort:'KI-Einordnung enthaelt Markup',text:t}));
    }
  }
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
