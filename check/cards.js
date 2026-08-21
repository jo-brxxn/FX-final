const PW=process.env.PW_PATH||'/opt/node22/lib/node_modules/playwright';
const URL=process.env.CHECK_URL||'http://127.0.0.1:8935/index.html';
// ── NEUE REGEL (Nutzer-Wunsch 2026-08-21): Text oder andere Elemente
// duerfen zu KEINER Zeit den Rand ihrer Karte verlassen. check/dashboard.js
// hatte diese Pruefung bereits, aber nur fuer #dashWidgets .dw auf dem
// Dashboard-Tab - dieser Waechter generalisiert dieselbe (bewaehrte) Logik
// auf ALLE 17 Tabs und ein breiteres Karten-Klassen-Set, plus eine neue
// Seiten-Ebene (Punkt 0): der Anlass war ein echter Fund auf der Rate-
// Probabilities-Seite, wo NICHT eine einzelne Karte, sondern die ganze
// Seite (.pc) ueber den Viewport hinaus wuchs (#pageArea/.pc als Flex-
// Kinder ohne min-width:0) - von keinem bisherigen Check erfasst, weil
// body position:fixed ist und document.documentElement.scrollWidth
// dadurch nie waechst (siehe auch der Fix in layout.js).
const {chromium}=require(PW);
const PORT=process.env.PORT||8935;
const TABS=['dash','cur','cmp','mx','trends','cot','sent','seas','data','rate','news','edge','carry','pairs','watch','cal','notes'];
// Breites, aber endliches Set der im Projekt tatsaechlich verwendeten
// Karten-Klassen (CLAUDE.md: "Karten-Inhalt darf nie ueber den Kartenrand
// hinausgehen"). Ergaenzt sich bei neuen Kartentypen - siehe README.
const KARTEN_SEL='.dw,.cot-card,.rub-card,.tr-card,.ov-card,.pov-card,.aaii-kpi,.edge-verdict,.cal-day,.ind-hist-toolbar,.rterm-card';

(async()=>{
  const b=await chromium.launch();
  const fehler=[];
  for(const [w,h] of [[1920,1080],[1440,900],[1180,820],[820,1180],[390,844]]){
    const p=await b.newPage({viewport:{width:w,height:h}});
    await p.addInitScript(()=>{try{localStorage.setItem('fxpro_help_seen','1');localStorage.setItem('fxpro_intro_anim_enabled','0');}catch(e){}});
    await p.goto(URL,{waitUntil:'networkidle'});
    await p.evaluate(()=>{const e=document.getElementById('lockScreen');if(e)e.remove();document.querySelectorAll('.ov').forEach(o=>o.style.display='none');});
    await p.waitForTimeout(1000);
    await p.evaluate(()=>{document.querySelectorAll('.mov,.mov2').forEach(m=>m.style.display='none');});

    for(const tab of TABS){
      await p.evaluate(t=>{try{showTab(t);}catch(e){}},tab);
      await p.waitForTimeout(350);
      const r=await p.evaluate(({tab,KARTEN_SEL})=>{
        const out=[];
        // ── 0. Die SEITE selbst darf nicht ueber den Viewport hinauswachsen.
        // body ist position:fixed - document.documentElement.scrollWidth
        // sieht das NICHT, direkt body/.app-shell/#pageArea messen.
        if(document.body.scrollWidth>document.body.clientWidth+2)
          out.push(tab+': Seite waechst ueber den Viewport hinaus ('+document.body.scrollWidth+'>'+document.body.clientWidth+')');

        // ── 1. Kartenrand: Kein Karten-Kind darf breiter sein als die
        // Karte selbst, AUSSER die Karte (oder ein Nachfahre) ist bewusst
        // horizontal scrollbar (etabliertes Muster "zu breiter Inhalt
        // scrollt INNERHALB der Karte").
        document.querySelectorAll(KARTEN_SEL).forEach(card=>{
          if(!card.offsetParent)return;
          const cs=getComputedStyle(card);
          if(/auto|scroll/.test(cs.overflowX))return;
          if(card.scrollWidth>card.clientWidth+3){
            const t=(card.querySelector('[class*="title"]')||card).textContent.trim().slice(0,30);
            out.push(tab+': Karte "'+t+'" ('+card.className.slice(0,30)+') laeuft '+(card.scrollWidth-card.clientWidth)+'px ueber ihren eigenen Rand hinaus');
          }
        });

        // ── 2. Sichtbarkeit inkl. Clip-Ausschluss (identisch zu
        // check/dashboard.js - ein scrollender Vorfahre versteckt seinen
        // Rand-Ueberschuss legitim, das ist kein Fund).
        const sichtbar=e=>{
          const r=e.getBoundingClientRect();
          if(!(r.width>0&&r.height>0))return null;
          let n=e;
          while(n&&n!==document.body){
            const cs=getComputedStyle(n);
            if(cs.opacity==='0'||cs.visibility==='hidden'||cs.display==='none')return null;
            n=n.parentElement;
          }
          let a=e.parentElement;
          while(a&&a!==document.body){
            const cs=getComputedStyle(a);
            if(/auto|scroll|hidden/.test(cs.overflowY+cs.overflow)||/auto|scroll/.test(cs.overflowX)){
              const ar=a.getBoundingClientRect();
              if(r.bottom>ar.bottom+1||r.top<ar.top-1||r.right>ar.right+1||r.left<ar.left-1)return null;
            }
            a=a.parentElement;
          }
          return r;
        };

        // ── 3. Ueberlappender TEXT innerhalb einer Karte.
        document.querySelectorAll(KARTEN_SEL).forEach(k=>{
          if(!k.offsetParent)return;
          const txt=[];
          k.querySelectorAll('*').forEach(e=>{
            if(e.children.length)return;
            if(!(e.textContent||'').trim())return;
            const r=sichtbar(e);
            if(r)txt.push({e,r});
          });
          for(let i=0;i<txt.length;i++)for(let j=i+1;j<txt.length;j++){
            const a=txt[i].r,c=txt[j].r;
            const ux=Math.min(a.right,c.right)-Math.max(a.left,c.left);
            const uy=Math.min(a.bottom,c.bottom)-Math.max(a.top,c.top);
            if(ux>2&&uy>2){
              out.push(tab+': Text "'+txt[i].e.textContent.trim().slice(0,20)+'" ueberlappt "'+
                txt[j].e.textContent.trim().slice(0,20)+'" um '+Math.round(ux)+'x'+Math.round(uy)+'px in '+k.className.slice(0,30));
            }
          }
        });

        // ── 4. Text, der SICHTBAR ueber sein eigenes (kleines) Element
        // hinauslaeuft - der Rechteck-Vergleich oben sieht das nicht,
        // wenn nur der Text (nicht das Element) heraussteht.
        document.querySelectorAll(KARTEN_SEL+' *').forEach(e=>{
          if(e.children.length)return;
          const t=(e.textContent||'').trim();if(!t)return;
          const cs=getComputedStyle(e);
          if(cs.overflow!=='visible'||cs.display==='none'||cs.visibility==='hidden'||cs.opacity==='0')return;
          const ue=e.scrollWidth-e.clientWidth;
          if(ue>2&&e.clientWidth>0)
            out.push(tab+': "'+t.slice(0,18)+'" laeuft '+ue+'px ueber sein eigenes Element hinaus (nur '+e.clientWidth+'px breit)');
        });
        return out;
      },{tab,KARTEN_SEL});
      r.forEach(x=>fehler.push(w+'x'+h+' '+x));
    }
    await p.close();
  }
  await b.close();
  console.log(JSON.stringify({total:fehler.length,findings:fehler.slice(0,60)},null,2));
})();
