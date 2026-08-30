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
  // ── F2) setSuppressBiasFlipAlerts() haelt wirklich, was es zusagt ──
  // Setter statt Direktzugriff, eingefuehrt bei der Modul-Aufteilung von
  // js/score.js (docs/module-split.md) - Import-Bindings sind schreibge-
  // schuetzt von aussen. Trivial genug, um keine eigene Rubrik zu brauchen,
  // aber Regel 5 (check/rules.js) flaggt jede neue *Bias*-benannte Funktion
  // zu Recht als Verdacht - hier der Beleg, dass der Setter den Zustand
  // tatsaechlich umschaltet (nicht nur so aussieht).
  if(typeof setSuppressBiasFlipAlerts==='function'){
    setSuppressBiasFlipAlerts(true);
    if(_suppressBiasFlipAlerts!==true)add('setSuppressBiasFlipAlerts(true) wirkt nicht',{});
    setSuppressBiasFlipAlerts(false);
    if(_suppressBiasFlipAlerts!==false)add('setSuppressBiasFlipAlerts(false) wirkt nicht',{});
  }
  // ── F3) setScoreModeVal() haelt wirklich, was es zusagt ──
  // Derselbe Setter-statt-Direktzugriff-Grund wie bei F2, eingefuehrt bei der
  // Modul-Aufteilung von js/calendar.js: importData()/cloudPull() in
  // js/main.js schrieben vorher direkt auf scoreMode (Import-Binding aus
  // js/score.js) - ein Laufzeitfehler, der erst durch den Import-Bindungs-
  // Zuweisungs-Check dieser Runde aufgefallen ist (nicht durch einen zuvor
  // bestandenen Testlauf). Regel 5 flaggt setScoreModeVal zu Recht als neue
  // Score-Groesse - hier der Beleg, dass der Setter scoreMode wirklich setzt.
  if(typeof setScoreModeVal==='function'){
    const vorher=scoreMode;
    setScoreModeVal('normalized');
    if(scoreMode!=='normalized')add('setScoreModeVal(\'normalized\') wirkt nicht',{});
    setScoreModeVal('classic');
    if(scoreMode!=='classic')add('setScoreModeVal(\'classic\') wirkt nicht',{});
    setScoreModeVal(vorher);
  }
  // ── F4) Notiz-Bias (resPickBias/resPaintBias/noteBiasBadge) - reiner
  // UI-Tag, KEINE Score-Groesse ──
  // Nutzer-Wunsch 2026-08-30 ("mach von Notizen das Aussehen deutlich ob sie
  // neutral bullish oder bearish sind"): eine Notiz bekommt einen rein
  // manuellen Bias-Tag (bull/bear/neu), der NICHTS mit dem App-Score zu tun
  // hat - er faerbt nur die Notiz-Karte. Der Name matcht trotzdem Regel 5s
  // Bias-Filter (zu Recht vorsichtig) - hier der Beleg, dass die drei
  // Funktionen wirklich nur den Notiz-eigenen Zustand betreffen: der Picker
  // setzt/validiert _resBias, das Malen spiegelt ihn auf die drei Modal-
  // Buttons, das Abzeichen zeigt bull/bear an und bleibt bei "neu" leer.
  if(typeof resPickBias==='function'&&typeof noteBiasBadge==='function'){
    resPickBias('bull');
    if(_resBias!=='bull')add('resPickBias(\'bull\') wirkt nicht',{});
    if(document.getElementById('resNBiasBull')&&!document.getElementById('resNBiasBull').classList.contains('on'))
      add('resPaintBias() markiert den Bullish-Knopf nicht',{});
    resPickBias('bear');
    if(_resBias!=='bear')add('resPickBias(\'bear\') wirkt nicht',{});
    resPickBias('unsinn');
    if(_resBias!=='neu')add('resPickBias() faengt ungueltige Werte nicht auf neu ab',{});
    if(!noteBiasBadge({bias:'bull'}))add('noteBiasBadge zeigt fuer bull kein Abzeichen',{});
    if(!noteBiasBadge({bias:'bear'}))add('noteBiasBadge zeigt fuer bear kein Abzeichen',{});
    if(noteBiasBadge({bias:'neu'}))add('noteBiasBadge zeigt fuer neu faelschlich ein Abzeichen',{});
  }
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
  // ── H3) Zerlegung der Tagesveraenderung in der History ─────────
  // histDeltaParts() begruendet, WOHER die Tagesveraenderung eines Scores
  // kommt. Die eine Eigenschaft, die dabei halten MUSS: die angezeigten
  // Teile ergeben in Summe exakt die angezeigte Tagesveraenderung. Vorher
  // stand dort ein roher Kartenwert neben einem mit symCmpFactor skalierten
  // Gesamtwert - die Zeile behauptete eine Rechnung, die nicht aufging
  // (Nutzer-Bugreport 2026-08-23 "Ergibt keinen sinn").
  if(typeof histDeltaParts==='function'){
    const NAMEN=['Inflation','Labour Market','Economic Growth'];
    // Baut einen aufgezeichneten Tag genau so, wie recordScoreHist() ihn
    // schreibt - inklusive derselben Rundungen, denn die sind die einzige
    // Quelle des Restbetrags.
    const tag=(datum,rubs,rest,cmp)=>{
      const rr=rubs.map(v=>Math.round(v*10)/10);
      const raw=roundSc(rr.reduce((a,b)=>a+b,0)+rest);
      const c=Math.round(cmp*100)/100;
      return{d:datum,rub:rr,raw:raw,cmp:c,tot:Math.round(raw*c*10)/10};
    };
    const lauf=(A,B)=>{
      const hm={},hr={},hc={},hraw={};
      [A,B].forEach(t=>{hm[t.d]=t.tot;hr[t.d]=t.rub;hc[t.d]=t.cmp;hraw[t.d]=t.raw;});
      const delta=Math.round((B.tot-A.tot)*10)/10;
      const parts=histDeltaParts(B.d,A.d,delta,hm,hr,hc,hraw,NAMEN);
      return{delta,parts,summe:Math.round(parts.reduce((a,p)=>a+p.v,0)*10)/10};
    };
    // 1) Nur eine Karte bewegt sich, Faktor 1 -> genau ein Teil, exakt so gross
    {
      const r=lauf(tag('2026-01-01',[2,1,0],0,1),tag('2026-01-02',[1,1,0],0,1));
      if(r.parts.length!==1||r.parts[0].name!=='Inflation'||r.parts[0].v!==-1)
        add('Zerlegung: einzelne Kartenaenderung falsch',r);
      if(r.summe!==r.delta)add('Zerlegung: Summe != Delta (1 Karte)',r);
    }
    // 2) Nur die nicht aufgezeichneten Karten bewegen sich -> "Other cards"
    {
      const r=lauf(tag('2026-01-01',[2,1,0],2,1),tag('2026-01-02',[2,1,0],0.5,1));
      const oc=r.parts.filter(p=>p.name==='Other cards');
      if(oc.length!==1||oc[0].v!==-1.5)add('Zerlegung: Other cards falsch',r);
      if(r.summe!==r.delta)add('Zerlegung: Summe != Delta (Other cards)',r);
    }
    // 3) Nur der Fairness-Faktor bewegt sich -> nur dieser Teil
    {
      const r=lauf(tag('2026-01-01',[2,1,0],0,1),tag('2026-01-02',[2,1,0],0,1.2));
      const cf=r.parts.filter(p=>p.name==='Comparability factor');
      if(!cf.length)add('Zerlegung: Faktoraenderung nicht ausgewiesen',r);
      if(r.parts.some(p=>p.name!=='Comparability factor'&&p.name!=='Rounding'))
        add('Zerlegung: Faktoraenderung faelschlich einer Karte zugeschrieben',r);
      if(r.summe!==r.delta)add('Zerlegung: Summe != Delta (Faktor)',r);
    }
    // 4) Altdaten ohne Faktor/Rohwert -> GAR KEINE Zerlegung (nichts erfinden)
    {
      const A=tag('2026-01-01',[2,1,0],0,1),B=tag('2026-01-02',[1,1,0],0,1);
      const hm={},hr={},hc={},hraw={};
      [A,B].forEach(t=>{hm[t.d]=t.tot;hr[t.d]=t.rub;hc[t.d]=null;hraw[t.d]=null;});
      const p=histDeltaParts(B.d,A.d,Math.round((B.tot-A.tot)*10)/10,hm,hr,hc,hraw,NAMEN);
      if(p.length)add('Zerlegung: Altdaten wurden trotzdem zerlegt',{parts:p});
    }
    // 5) Ohne Tagesveraenderung gibt es nichts zu begruenden
    {
      const A=tag('2026-01-01',[2,1,0],0,1);
      const hm={},hr={},hc={},hraw={};hm[A.d]=A.tot;hr[A.d]=A.rub;hc[A.d]=A.cmp;hraw[A.d]=A.raw;
      if(histDeltaParts(A.d,A.d,0,hm,hr,hc,hraw,NAMEN).length)add('Zerlegung ohne Delta erzeugt Teile',{});
    }
    // 6) Zufallstest: ueber viele Kombinationen muss IMMER gelten -
    //    entweder keine Zerlegung, oder die Teile ergeben exakt das Delta.
    let n=0,schief=0,bsp=null,leer=0;
    const rnd=(a,b)=>a+Math.random()*(b-a);
    for(let i=0;i<3000;i++){
      const A=tag('2026-01-01',[rnd(-4,4),rnd(-4,4),rnd(-4,4)],rnd(-3,3),rnd(.5,2));
      const B=tag('2026-01-02',[rnd(-4,4),rnd(-4,4),rnd(-4,4)],rnd(-3,3),rnd(.5,2));
      const r=lauf(A,B);
      if(!r.delta)continue;
      n++;
      if(!r.parts.length){leer++;continue;}
      if(r.summe!==r.delta){schief++;if(!bsp)bsp={A,B,delta:r.delta,summe:r.summe,parts:r.parts};}
    }
    if(schief)add('Zerlegung: Teile ergeben nicht das Delta',{faelle:schief,von:n,bsp});
    ok.zerlegungGeprueft={faelle:n,ohneZerlegung:leer};
    // 7) Gegen ECHTE aufgezeichnete Historie: kein einziger Tag darf eine
    //    Zerlegung zeigen, die nicht aufgeht.
    let echt=0,echtSchief=0,echtBsp=null;
    Object.keys(scoreHist||{}).forEach(sid=>{
      const arr=scoreHist[sid]||[];
      const hm={},hr={},hc={},hraw={};
      arr.forEach(e=>{hm[e[0]]=e[1];hr[e[0]]=[e[2],e[3],e[4]];
        hc[e[0]]=(e[7]!=null&&isFinite(e[7])&&+e[7]>0)?+e[7]:null;
        hraw[e[0]]=(e[8]!=null&&isFinite(e[8]))?+e[8]:null;});
      for(let i=1;i<arr.length;i++){
        const dv=Math.round((arr[i][1]-arr[i-1][1])*10)/10;
        if(!dv)continue;
        const p=histDeltaParts(arr[i][0],arr[i-1][0],dv,hm,hr,hc,hraw,NAMEN);
        if(!p.length)continue;
        echt++;
        const su=Math.round(p.reduce((a,x)=>a+x.v,0)*10)/10;
        if(su!==dv){echtSchief++;if(!echtBsp)echtBsp={sym:sid,tag:arr[i][0],delta:dv,summe:su,parts:p};}
      }
    });
    if(echtSchief)add('Zerlegung echter Historie geht nicht auf',{faelle:echtSchief,von:echt,bsp:echtBsp});
    ok.zerlegungEchteTage=echt;
  }
  // ── H4) histTagsComparable() - History-Delta nie ueber einen
  // Modell-Grenzwechsel hinweg ──
  // Nutzer-Bugreport 2026-08-30 "History hat viele Fehler": der Delta-Gate in
  // renderSymHistoryPanel() prüfte vorher nur, ob der JEWEILS AKTUELLE Tag
  // zum LIVE-Modell passt - nicht, ob er zum VORTAG passt. Am Tag eines
  // Modellwechsels (der neue Tag matcht das Live-Modell, sein Vortag aber
  // noch den alten) wurde die Formel-Umstellung selbst als echte
  // Score-Bewegung ausgegeben. Fix: histTagsComparable(a,b) verlangt BEIDE
  // Tage bekannt UND gleich - "beide unbekannt" zaehlt bewusst NICHT als
  // vergleichbar (nur weil zwei Tage keinen Tag tragen, heisst das nicht,
  // dass sie unter demselben Modell entstanden sind).
  if(typeof histTagsComparable==='function'){
    if(histTagsComparable('8:normalized','8:normalized')!==true)add('histTagsComparable: gleicher Tag nicht als vergleichbar erkannt',{});
    if(histTagsComparable('8:normalized','6:normalized')!==false)add('histTagsComparable: unterschiedlicher Tag faelschlich vergleichbar',{});
    if(histTagsComparable('8:classic','8:normalized')!==false)add('histTagsComparable: gleiche Version, anderer Modus faelschlich vergleichbar',{});
    if(histTagsComparable(null,null)!==false)add('histTagsComparable: zwei unbekannte Tage faelschlich vergleichbar',{});
    if(histTagsComparable(null,'8:normalized')!==false)add('histTagsComparable: ein unbekannter Tag faelschlich vergleichbar',{});
    // Gegen ECHTE aufgezeichnete Historie: kein Symbol darf zwei
    // aufeinanderfolgende Tage mit bekannten, unterschiedlichen Tags als
    // vergleichbar einstufen.
    let grenzenGeprueft=0,grenzenFalsch=0;
    Object.keys(scoreHist||{}).forEach(sid=>{
      const arr=scoreHist[sid]||[];
      for(let i=1;i<arr.length;i++){
        const tHeute=arr[i][6],tVor=arr[i-1][6];
        if(tHeute==null||tVor==null)continue;
        grenzenGeprueft++;
        if(tHeute!==tVor&&histTagsComparable(tHeute,tVor))grenzenFalsch++;
      }
    });
    if(grenzenFalsch)add('histTagsComparable: echte Modellgrenze in der Historie als vergleichbar eingestuft',{faelle:grenzenFalsch,von:grenzenGeprueft});
    ok.modellGrenzenGeprueft=grenzenGeprueft;
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
