// ── NOTIZEN UEBERLEBEN ALLES ──────────────────────────────────────
// Notiz-Datenverlust ist in diesem Projekt DREIMAL beim Nutzer angekommen
// (2026-09-01 Klick neben den Editor, 2026-09-01 Papierkorb nachgeruestet,
// 2026-09-08 der Fall hier). Notizen sind der einzige Inhalt der App, den
// niemand wiederherstellen kann - Kurse, Indikatoren und Scores kommen aus
// dem Feed zurueck, ein selbst geschriebener Gedanke nicht. Deshalb ein
// eigener Waechter statt einer Zeile in einem anderen.
//
// ⚠ Der Anlass (Nutzer 2026-09-08): "Ausserdem loeschen sich immer noch
// automatisch Notizen, die in mehreren Ordnern gleichzeitig gespeichert
// sind." Reproduziert und gemessen:
//   • SAFE_UID_RE war /^[a-z0-9]{1,24}$/i - OHNE Unterstrich.
//   • Die mitgelieferten Verhaltensnotizen heissen "sd_USD_macro_bull_0",
//     1440 von 1545 Ids fielen also durch den Filter.
//   • Bearbeitet der Nutzer so eine Notiz, BEHAELT sie ihre Id.
//   • Bei jedem applySnap (Cloud-Sync, Undo, Backup, Import) warf der Filter
//     sie still weg, seedAssetBehaviorNotes legte sie mit ORIGINALTEXT neu an.
//   Nach EINEM Umlauf: eigener Text weg, wieder als "mitgeliefert" markiert,
//   zweiter Ordner weg, nichts im Papierkorb.
const PW=process.env.PW_PATH||'/opt/node22/lib/node_modules/playwright';
const URL=process.env.CHECK_URL||'http://127.0.0.1:8935/index.html';
const { chromium } = require(PW);
const { wartenBisDatenDa } = require('./warten.js');
(async()=>{
 const b=await chromium.launch();
 const p=await b.newPage({viewport:{width:1500,height:1000}});
 await p.addInitScript(()=>{try{localStorage.setItem('fxpro_help_seen','1');localStorage.setItem('dmfx_app_choice','fx');}catch(e){}});
 const perr=[];p.on('pageerror',e=>perr.push(String(e)));
 await p.goto(URL,{waitUntil:'networkidle'});
 await p.evaluate(()=>{['introOv','lockScreen','appChoiceOv'].forEach(id=>{const e=document.getElementById(id);if(e)e.remove();});});
 await wartenBisDatenDa(p);
 const r=await p.evaluate(()=>{
  const F=[],ok={};const add=(t,d)=>F.push(Object.assign({t},d));

  // ── 1) Jede Id, die die App SELBST erzeugt, muss den Sicherheitsfilter
  // passieren. Ein Filter, der eigene Daten aussortiert, ist kein Schutz,
  // sondern ein Loeschwerkzeug.
  const RE=(typeof SAFE_UID_RE!=='undefined')?SAFE_UID_RE:/^[A-Za-z0-9_-]{1,64}$/;
  const schlecht=research.notes.filter(n=>!(n&&typeof n.id==='string'&&RE.test(n.id)));
  ok.notizen=research.notes.length;
  ok.idsAbgelehnt=schlecht.length;
  if(schlecht.length)add('Notiz-Id faellt durch den eigenen Sicherheitsfilter',
    {anzahl:schlecht.length,beispiele:schlecht.slice(0,3).map(n=>n.id)});
  const schlechteOrdner=researchFolders.filter(f=>!(f&&typeof f.id==='string'&&RE.test(f.id)));
  if(schlechteOrdner.length)add('Ordner-Id faellt durch den eigenen Sicherheitsfilter',
    {anzahl:schlechteOrdner.length,beispiele:schlechteOrdner.slice(0,3).map(f=>f.id)});

  // ── 2) Der eigentliche Regressionstest: eine mitgelieferte Notiz
  // bearbeiten, in einen ZWEITEN Ordner legen und durch applySnap schicken.
  // Genau dieser Weg laeuft bei jedem Cloud-Sync.
  const seedN=research.notes.find(n=>n&&n.seed&&Array.isArray(n.fids)&&n.fids.length);
  const ordner=researchFolders.filter(f=>researchFolderAssetOf&&researchFolderAssetOf(f.id));
  if(!seedN||ordner.length<6){
    add('Regressionstest nicht durchfuehrbar',{seedNotiz:!!seedN,ordner:ordner.length});
  }else{
    const id=seedN.id;
    const TITEL='WAECHTER: vom Nutzer ueberschrieben';
    const TEXT='WAECHTER: dieser Text darf einen Sync NIE verlieren.';
    seedN.title=TITEL;seedN.body=TEXT;delete seedN.seed;   // genau das macht saveResNote()
    const zweit=ordner.find(f=>f.id!==seedN.fids[0]).id;
    seedN.fids=[seedN.fids[0],zweit];
    const vorFids=seedN.fids.slice();
    applySnap(snap());
    const nach=research.notes.find(n=>n.id===id);
    ok.roundtrip={vorhanden:!!nach};
    if(!nach){
      const imMuell=(research.trash||[]).some(t=>t.data&&(t.data.title===TITEL||t.data.id===id));
      add('Bearbeitete Notiz ueberlebt den Sync nicht',{id,imPapierkorb:imMuell});
    }else{
      if(nach.title!==TITEL||String(nach.body||'').indexOf('WAECHTER:')<0)
        add('Eigener Text wurde beim Sync ueberschrieben',{id,titelNachher:nach.title,textNachher:String(nach.body||'').slice(0,60)});
      if(nach.seed)add('Notiz wieder als mitgeliefert markiert',{id});
      const fidsNachher=(nach.fids||[]).slice();
      if(fidsNachher.length!==vorFids.length)
        add('Ordner-Zuordnung beim Sync verloren',{id,vorher:vorFids,nachher:fidsNachher});
      ok.roundtrip.ordner=fidsNachher.length;
      ok.roundtrip.textErhalten=nach.title===TITEL;
    }
  }
  return {fehler:F.length,F:F.slice(0,20),ok};
 });
 console.log('pageerrors',perr.length,perr.slice(0,2));
 console.log(JSON.stringify(r,null,1));
 await b.close();
})();
