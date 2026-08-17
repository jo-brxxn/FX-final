const PW=process.env.PW_PATH||'/opt/node22/lib/node_modules/playwright';
const URL=process.env.CHECK_URL||'http://127.0.0.1:8935/index.html';
const { chromium } = require(PW);
const MODE=process.argv[2]||'normalized';
(async()=>{
 const b=await chromium.launch();
 const p=await b.newPage({viewport:{width:1600,height:1100}});
 await p.addInitScript(m=>{try{localStorage.setItem('fxpro_help_seen','1');localStorage.setItem('fxpro_score_mode',m);}catch(e){}},MODE);
 const perr=[];p.on('pageerror',e=>perr.push(String(e)));
 await p.goto(URL,{waitUntil:'networkidle'});
 await p.evaluate(()=>{['introOv','lockScreen'].forEach(id=>{const e=document.getElementById(id);if(e)e.remove();});});
 await p.waitForTimeout(5000);
 const r=await p.evaluate(()=>{
  const F=[],ok={};
  const soll={};syms.forEach(s=>soll[s.id]=Math.round(symScoreCmp(s)*10)/10);
  // Der Score steht am ENDE der Zeile (davor kann der Name selbst Ziffern
  // tragen: "S&P 500", "GER 100") - deshalb von hinten lesen.
  const num=t=>{const s=String(t).replace(/[\s\u00a0]+/g,' ').trim();
    const m=s.match(/([+-]?\d+(?:[.,]\d+)?)\s*[\u25b2\u25bc\u25c6]?\s*$/);
    return m?parseFloat(m[1].replace(',','.')):null;};
  // 1) Sidebar: button.ab[data-sym]
  showTab('fx');
  let n=0;
  document.querySelectorAll('button.ab[data-sym]').forEach(btn=>{
    const id=btn.getAttribute('data-sym'); if(soll[id]==null)return; n++;
    const v=num(btn.innerText);
    if(v==null||Math.abs(v-soll[id])>0.051)F.push({ort:'Sidebar',id,angezeigt:v,soll:soll[id],txt:btn.innerText.replace(/\n/g,'|')});
    // Pfeil/Farbe gegen Vorzeichen
    const bv=(btn.querySelector('.an')||{}).getAttribute&&btn.querySelector('.an').getAttribute('data-bv');
    const sym=syms.find(s=>s.id===id);
    if(bv&&sym&&bv!==sym.bias)F.push({ort:'Sidebar-Bias',id,dom:bv,soll:sym.bias});
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
