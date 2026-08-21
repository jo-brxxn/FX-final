const PW=process.env.PW_PATH||'/opt/node22/lib/node_modules/playwright';
const URL=process.env.CHECK_URL||'http://127.0.0.1:8935/index.html';
// Waechter gegen ueberlappende Dashboard-Karten. Hintergrund: equalizeDash-
// Columns() setzt den Spalten eine gemeinsame Hoehe. Kann der Inhalt sie nicht
// einhalten, laeuft er in die untere Kartenreihe (Nutzer-Bugreport 2026-08-16).
// Exit 1 bei Kollision -> gehoert vor jeden Push.
const {chromium}=require(PW);
const PORT=process.env.PORT||8935;
(async()=>{
  const b=await chromium.launch(); let fehler=[];
  for(const [w,h] of [[1920,1080],[1600,900],[1440,900],[1280,800],[1180,820],[1100,800],[900,900],[390,844]]){
    const p=await b.newPage({viewport:{width:w,height:h}});
    await p.addInitScript(()=>{try{localStorage.setItem('fxpro_help_seen','1');localStorage.setItem('fxpro_intro_anim_enabled','0');}catch(e){}});
    await p.goto('http://127.0.0.1:'+PORT+'/index.html',{waitUntil:'networkidle'});
    await p.evaluate(()=>{const e=document.getElementById('lockScreen');if(e)e.remove();});
    await p.waitForTimeout(1700);
    await p.evaluate(()=>{document.querySelectorAll('.mov,.mov2').forEach(m=>m.style.display='none');showTab('dash');});
    await p.waitForTimeout(800);
    const r=await p.evaluate(()=>{
      const out=[];
      const alle=[...document.querySelectorAll('#dashWidgets .dw')].filter(c=>c.getBoundingClientRect().height>0);
      // Paarweise echte Ueberlappung zweier Karten
      for(let i=0;i<alle.length;i++)for(let j=i+1;j<alle.length;j++){
        const a=alle[i].getBoundingClientRect(),c=alle[j].getBoundingClientRect();
        const ov=Math.min(a.bottom,c.bottom)-Math.max(a.top,c.top);
        const oh=Math.min(a.right,c.right)-Math.max(a.left,c.left);
        if(ov>2&&oh>2){
          const nm=e=>(e.className.match(/dw-([a-z_0-9]+)/)||[])[1]||'?';
          out.push(nm(alle[i])+' ueberlappt '+nm(alle[j])+' um '+Math.round(ov)+'x'+Math.round(oh)+'px');
        }
      }
      // Inhalt, der aus seiner Zone laeuft
      ['left','center','right','right2'].forEach(z=>{
        const el=document.querySelector('.dash-zone-'+z);if(!el)return;
        const ue=el.scrollHeight-el.clientHeight;
        if(ue>2)out.push('Zone '+z+' laeuft um '+Math.round(ue)+'px ueber');
      });
      // ── Ueberlappender TEXT INNERHALB einer Karte ──────────────────────
      // Nutzer-Grundsatz: Elemente duerfen sich nie so ueberlappen, dass
      // etwas unlesbar wird. Die Pruefung oben sieht nur Karten gegeneinander.
      // Gefunden hat das den Fall .hl-side: der Kasten stand auf 88px, sein
      // Inhalt (Quelle UND Zeit nebeneinander) wurde 114px breit und ragte
      // bei align-items:flex-end nach LINKS ueber den Titel - 8px, auf jeder
      // Bildschirmbreite, monatelang unbemerkt.
      const sichtbar=e=>{
        const r=e.getBoundingClientRect();
        if(!(r.width>0&&r.height>0))return null;
        let n=e;
        while(n&&n!==document.body){
          const cs=getComputedStyle(n);
          if(cs.opacity==='0'||cs.visibility==='hidden'||cs.display==='none')return null;
          n=n.parentElement;
        }
        // ⚠ Durch einen scrollenden Vorfahren GECLIPPTE Teile sind nicht
        // sichtbar - ohne das meldet der Test jede Zeile, die unter dem
        // Fussbereich einer scrollbaren Liste weiterlaeuft.
        let a=e.parentElement;
        while(a&&a!==document.body){
          const cs=getComputedStyle(a);
          if(/auto|scroll|hidden/.test(cs.overflowY+cs.overflow)){
            const ar=a.getBoundingClientRect();
            if(r.bottom>ar.bottom-1||r.top<ar.top+1)return null;
          }
          a=a.parentElement;
        }
        return r;
      };
      document.querySelectorAll('#dashWidgets .dw').forEach(k=>{
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
            const nm=(k.className.match(/dw-([a-z_0-9]+)/)||[])[1]||'?';
            out.push('Text in '+nm+': "'+txt[i].e.textContent.trim().slice(0,20)+
              '" ueberlappt "'+txt[j].e.textContent.trim().slice(0,20)+'" um '+Math.round(ux)+'px');
          }
        }
      });
      // ── Text, der SICHTBAR ueber sein eigenes Element hinauslaeuft ────
      // Der Rechteck-Vergleich oben findet das NICHT: das Element bleibt
      // klein, nur der Text ragt heraus. So war .wl-name auf 7px gequetscht,
      // waehrend "CAD/CHF" quer ueber die Prozentspalte lief - im Screenshot
      // sofort sichtbar, in jeder Kollisionsmessung unsichtbar.
      document.querySelectorAll('#dashWidgets .dw *').forEach(e=>{
        if(e.children.length)return;
        const t=(e.textContent||'').trim();if(!t)return;
        const cs=getComputedStyle(e);
        if(cs.overflow!=='visible'||cs.display==='none'||cs.visibility==='hidden'||cs.opacity==='0')return;
        const ue=e.scrollWidth-e.clientWidth;
        if(ue>2&&e.clientWidth>0)
          out.push('"'+t.slice(0,18)+'" laeuft '+ue+'px ueber sein Element (nur '+e.clientWidth+'px breit)');
      });
      return out;
    });
    if(r.length)fehler.push(w+'x'+h+': '+r.join(' | '));
    await p.close();
  }
  await b.close();
  if(fehler.length){console.log('DASHBOARD-KOLLISIONEN:\n  '+fehler.join('\n  '));process.exit(1);}
  console.log('Dashboard ok: keine ueberlappenden Karten, kein ueberlappender Text, kein Zonen-Ueberlauf (8 Breiten)');
})();
