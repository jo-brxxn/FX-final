const PW=process.env.PW_PATH||'/opt/node22/lib/node_modules/playwright';
const URL=process.env.CHECK_URL||'http://127.0.0.1:8935/index.html';
const { chromium } = require(PW);
const MODE = process.argv[2] || 'normalized';
(async()=>{
 const b=await chromium.launch();
 const p=await b.newPage({viewport:{width:1500,height:1000}});
 await p.addInitScript(m=>{try{localStorage.setItem('fxpro_help_seen','1');localStorage.setItem('fxpro_score_mode',m);}catch(e){}},MODE);
 const perr=[];p.on('pageerror',e=>perr.push(String(e)));
 await p.goto(URL,{waitUntil:'networkidle'});
 await p.evaluate(()=>{['introOv','lockScreen'].forEach(id=>{const e=document.getElementById(id);if(e)e.remove();});});
 await p.waitForTimeout(4500);
 const r=await p.evaluate(()=>{
  const F=[],ok={};const add=(t,d)=>F.push(Object.assign({t},d));
  const EPS=1e-9;
  // ── A) Additivitaet der Rechenkette ─────────────────────────────
  let nInd=0;
  syms.forEach(sym=>{
    let symSum=0;
    (sym.rubrics||[]).forEach(rub=>{
      let rubSum=0;
      (rub.indicators||[]).forEach(ind=>{
        nInd++;
        let ps=null;try{ps=indScoreParts(ind,rub,sym.id);}catch(e){add('indScoreParts wirft',{sym:sym.id,ind:ind.name,e:String(e)});return;}
        const tot=+ps.total;
        if(!isFinite(tot))add('Beitrag nicht endlich',{sym:sym.id,ind:ind.name,tot:String(tot)});
        const teile=(+ps.base||0)+(+ps.trend||0)+(+ps.rev||0);
        if(Math.abs(teile-tot)>1e-6)add('total != base+trend+rev',{sym:sym.id,ind:ind.name,tot,teile});
        rubSum+=indScore(ind,rub);
      });
      const rs=rubScore(rub);
      if(Math.abs(rs-rubSum)>0.011)add('rubScore != Summe der Indikatoren',{sym:sym.id,rub:rub.name,rubScore:rs,summe:rubSum});
      symSum+=rs;
    });
    const ss=symScore(sym);
    if(Math.abs(ss-symSum)>0.011)add('symScore != Summe der Rubriken',{sym:sym.id,symScore:ss,summe:symSum});
  });
  ok.indikatorenGeprueft=nInd;
  // ── B) Score unabhaengig vom geoeffneten Asset (_symId) ─────────
  const ref={};syms.forEach(s=>ref[s.id]=symScoreCmp(s));
  const drift=[];
  syms.forEach(open=>{
    try{selSym(open.id);}catch(e){}
    syms.forEach(s=>{const v=symScoreCmp(s);if(Math.abs(v-ref[s.id])>EPS)drift.push({geoeffnet:open.id,asset:s.id,soll:ref[s.id],ist:v});});
  });
  if(drift.length)add('Score haengt vom geoeffneten Asset ab',{anzahl:drift.length,bsp:drift.slice(0,5)});
  ok.symIdDriftGeprueft=syms.length*syms.length;
  // ── C) _symId-Stempel vollstaendig, auch nach save/applySnap ────
  const stempel=()=>{let fehlt=0,falsch=0;syms.forEach(s=>(s.rubrics||[]).forEach(r=>{
    if(!r._symId)fehlt++;else if(r._symId!==s.id)falsch++;}));return[fehlt,falsch];};
  ok.stempelNachBoot=stempel();
  try{save();}catch(e){}
  ok.stempelNachSave=stempel();
  try{applySnap(snap());}catch(e){}
  ok.stempelNachApplySnap=stempel();
  [ok.stempelNachBoot,ok.stempelNachSave,ok.stempelNachApplySnap].forEach((v,i)=>{
    if(v[0]||v[1])add('_symId-Stempel unvollstaendig',{phase:['boot','save','applySnap'][i],fehlt:v[0],falsch:v[1]});});
  // ── D) Bias widerspricht den eigenen Daten? ─────────────────────
  syms.filter(s=>!isNonFx(s.id)).forEach(sym=>{
    (sym.rubrics||[]).forEach(rub=>{
      if(!IND_AUTO_RUBS.includes(rub.name))return;
      (rub.indicators||[]).forEach(ind=>{
        const r=ind.research;if(!r||!r.feed)return;
        const base=stripPeriodSuffix(ind.name).base;
        const hatFc=r.forecast!=null&&r.forecast!=='';
        const soll=hatFc?researchBias(base,r.actual,r.forecast,r.previous):(indStepBias(ind,ind.name)||'neu');
        if(ind.bias!==soll){
          let ps=null;try{ps=indScoreParts(ind,rub,sym.id);}catch(e){}
          add('Bias widerspricht den Daten',{sym:sym.id,rub:rub.name,ind:ind.name,ist:ind.bias,soll,
            a:r.actual,f:r.forecast,pv:r.previous,beitrag:ps?+(ps.total||0).toFixed(3):null});
        }
      });
    });
  });
  // ── E) Rubrik-Badge gegen rubScore + Schwelle ───────────────────
  syms.forEach(sym=>(sym.rubrics||[]).forEach(rub=>{
    if(rub._biasScore!=null)return;                       // manuell gepinnt
    if(rub.name==='COT Data')return;                      // eigene Logik
    const sc=rubScore(rub);
    const thr=(typeof RUB_AUTO_BIAS_THRESHOLD!=='undefined'&&RUB_AUTO_BIAS_THRESHOLD[rub.name])||2;
    const soll=sc>=thr?'bull':sc<=-thr?'bear':'neu';
    if(isNonFx(sym.id))return;                            // ueber deriveRules gespiegelt
    if(rub.bias!==soll)add('Karten-Badge != rubScore/Schwelle',{sym:sym.id,rub:rub.name,score:+sc.toFixed(3),thr,ist:rub.bias,soll});
  }));
  // ── F) Feed-Idempotenz ─────────────────────────────────────────
  const feeds={applyIndDataFeed,applyBondDataFeed,applyCotDataFeed,applySentimentFeed};
  ok.idempotenz={};
  Object.keys(feeds).forEach(n=>{
    try{feeds[n]();recomputeAuto();const zweiter=feeds[n]();ok.idempotenz[n]=zweiter;
      if(zweiter)add('Feed nicht idempotent',{feed:n});}catch(e){ok.idempotenz[n]='ERR '+e;}
  });
  // ── G2) Flip-Tage gegen scoreHist ──────────────────────────────
  // symBiasFlipDays speist die Flip-Marke an den Asset-Schlagzeilen. Sie darf
  // NUR Tage melden, an denen scoreHist wirklich einen Bias-Wechsel
  // aufgezeichnet hat - eine eigene Herleitung waere die naechste Auspraegung
  // der Dual-Source-Fehlerklasse.
  if(typeof symBiasFlipDays==='function'){
    Object.keys(scoreHist||{}).forEach(id=>{
      const reihe=scoreHist[id]||[],flips=symBiasFlipDays(id);
      const soll={};
      for(let i=1;i<reihe.length;i++){
        const a=reihe[i-1][5],b2=reihe[i][5];
        if(a&&b2&&a!==b2)soll[reihe[i][0]]=a+'->'+b2;
      }
      Object.keys(flips).forEach(d=>{
        if(!soll[d])add('Flip-Tag ohne Beleg in scoreHist',{sym:id,tag:d});
        else if(soll[d]!==flips[d].from+'->'+flips[d].to)
          add('Flip-Richtung weicht von scoreHist ab',{sym:id,tag:d,ist:flips[d].from+'->'+flips[d].to,soll:soll[d]});
      });
      Object.keys(soll).forEach(d=>{if(!flips[d])add('Flip-Tag in scoreHist nicht gemeldet',{sym:id,tag:d});});
    });
  }
  // ── G3) Edge-Rueckrechnung ─────────────────────────────────────
  // edgeScoreSeries rechnet den Score fuer VERGANGENE Tage zurueck. Sie darf
  // dabei nichts erfinden: jeder Punkt muss endlich sein, das Datum muss in
  // der Vergangenheit liegen, und bei Non-FX-Assets MUSS die same/inverse-
  // Regel angewendet sein - ohne sie lief die Reihe fuer Gold verkehrt herum
  // (im Test aufgefallen).
  if(typeof edgeScoreSeries==='function'){
    const heute=todayStr();
    syms.slice(0,6).forEach(sym=>{
      let reihe=[];try{reihe=edgeScoreSeries(sym);}catch(e){add('edgeScoreSeries wirft',{sym:sym.id,e:String(e)});return;}
      reihe.forEach(([d,v,aktiv])=>{
        if(!isFinite(v))add('Edge-Punkt nicht endlich',{sym:sym.id,tag:d,v:String(v)});
        if(d>heute)add('Edge-Punkt in der Zukunft',{sym:sym.id,tag:d});
        if(!(aktiv>=3))add('Edge-Punkt mit zu wenig aktiven Indikatoren',{sym:sym.id,tag:d,aktiv});
      });
      // Vorzeichen-Regel: bei Non-FX muss jede beruecksichtigte Rubrik eine
      // hinterlegte same/inverse-Regel haben.
      if(isNonFx(sym.id)&&typeof edgeIndHistories==='function'){
        const reg=effDeriveRules(sym);
        edgeIndHistories(sym).forEach(r=>{
          const soll=reg[r.rub.name]==='inverse'?-1:reg[r.rub.name]==='same'?1:null;
          if(soll===null)add('Edge nutzt Rubrik ohne Ableitungsregel',{sym:sym.id,rub:r.rub.name});
          else if(r.vz!==soll)add('Edge-Vorzeichen weicht von deriveRules ab',{sym:sym.id,rub:r.rub.name,ist:r.vz,soll});
        });
      }
    });
  }
  // ── H2) Aufzeichnung automatischer Score-Ursachen ──────────────
  // _logAutoScoreShifts() schreibt die Ursache einer automatischen
  // Score-Bewegung ins scoreLog, damit die History sie rueckblickend nennen
  // kann. Zwei Eigenschaften muessen halten, sonst behauptet die History
  // etwas Falsches:
  //   1. Ohne echte Score-Aenderung wird NICHTS geschrieben (keine erfundenen
  //      Gruende an Tagen, an denen sich nichts bewegt hat).
  //   2. Mit echter Aenderung wird genau ein Eintrag je betroffenem Symbol
  //      geschrieben, und das protokollierte Delta stimmt mit der wirklichen
  //      Score-Differenz ueberein.
  if(typeof _logAutoScoreShifts==='function'&&typeof _scoreSnapForLog==='function'){
    const zaehle=()=>(typeof scoreLog!=='undefined'?scoreLog:[]).filter(x=>x&&x.kind==='auto').length;
    const vorher=zaehle();
    _flipCauseTag='riskenv';
    _logAutoScoreShifts(_scoreSnapForLog());           // nichts veraendert
    if(zaehle()!==vorher)add('Ursache ohne Score-Aenderung protokolliert',{vorher,nachher:zaehle()});
    // Jetzt mit echter Aenderung
    const sym=syms[0],ind=sym&&sym.rubrics&&sym.rubrics[0]&&sym.rubrics[0].indicators&&sym.rubrics[0].indicators[0];
    if(ind){
      const snap=_scoreSnapForLog(),alt=ind.bias,vorScore=symScoreCmp(sym);
      ind.bias=(alt==='bull')?'bear':'bull';
      const nachScore=symScoreCmp(sym);
      _logAutoScoreShifts(snap);
      const neue=(typeof scoreLog!=='undefined'?scoreLog:[]).filter(x=>x&&x.kind==='auto'&&x.sym===sym.id);
      const letzter=neue[neue.length-1];
      if(Math.abs(nachScore-vorScore)>=0.05){
        if(!letzter)add('Score-Aenderung ohne protokollierte Ursache',{sym:sym.id});
        else{
          if(!letzter.txt)add('Ursachen-Eintrag ohne Text',{sym:sym.id,e:letzter});
          const soll=Math.round((nachScore-vorScore)*10)/10;
          if(Math.abs((+letzter.delta||0)-soll)>0.051)
            add('Protokolliertes Delta weicht ab',{sym:sym.id,ist:letzter.delta,soll});
        }
      }
      ind.bias=alt;                                     // Zustand zuruecksetzen
    }
    _flipCauseTag=null;
  }
  // ── H) NaN/undefined in irgendeinem Score ──────────────────────
  syms.forEach(s=>{[symScore(s),symScoreCmp(s)].forEach((v,i)=>{
    if(!isFinite(v))add('Score nicht endlich',{sym:s.id,welcher:i?'cmp':'raw',v:String(v)});});});
  (typeof ALL_PAIRS!=='undefined'?ALL_PAIRS:[]).forEach(n=>{
    const v=pairScore(n);if(!isFinite(v))add('Paar-Score nicht endlich',{pair:n,v:String(v)});});
  ok.modus=scoreMode;
  return {fehler:F.length,F:F.slice(0,60),ok};
 });
 console.log('MODUS',MODE,'pageerrors',perr.length);
 console.log(JSON.stringify(r,null,1));
 await b.close();
})();
