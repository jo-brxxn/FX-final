const PW=process.env.PW_PATH||'/opt/node22/lib/node_modules/playwright';
const URL=process.env.CHECK_URL||'http://127.0.0.1:8935/index.html';
const { chromium } = require(PW);

(async () => {
  const browser = await chromium.launch();
  const findings = [];
  // ⚠ Muss exakt PAGE_IDS aus index.html spiegeln (17 Tabs). Frueher standen
  // hier veraltete/falsche Ids ('fx','matrix','compare','setups','research')
  // - showTab() schluckt eine unbekannte Id per try/catch stillschweigend,
  // der Test lief also mehrfach auf dem letzten GUELTIGEN Tab statt auf den
  // gemeinten Tabs. Gefunden, nachdem ein echter Page-Overflow auf 'rate'
  // trotz gruenem Lauf durchgerutscht war (siehe Fix unten, Punkt 1).
  const TABS = ['dash','cur','cmp','mx','trends','cot','sent','seas','data','rate','news','edge','carry','pairs','watch','cal','notes'];
  const VIEWPORTS = [[1920,1080,'wide'],[1440,900,'desktop'],[1180,820,'small-desktop'],[820,1180,'tablet'],[390,844,'mobile']];

  for (const [w,h,vpName] of VIEWPORTS) {
    const page = await browser.newPage({ viewport: { width: w, height: h } });
    await page.goto(URL, { waitUntil: 'networkidle' });
    await page.evaluate(() => { ['introOv','lockScreen','appChoiceOv'].forEach(id=>{const e=document.getElementById(id);if(e)e.remove();}); });
    await page.waitForTimeout(700);
    await page.evaluate(() => { document.querySelectorAll('.mov,.mov2').forEach(m=>m.style.display='none'); });

    for (const t of TABS) {
      await page.evaluate(tab=>{try{showTab(tab);}catch(e){}}, t);
      await page.waitForTimeout(300);
      const res = await page.evaluate(({tab,vpName}) => {
        const out = [];
        // 1. horizontal page overflow. ⚠ body ist position:fixed (App-Design,
        // verhindert Bounce-Scroll) - dadurch traegt ein zu breites Kind NIE
        // zu document.documentElement.scrollWidth bei, dieser Wert bleibt
        // IMMER gleich der Viewport-Breite, ganz gleich wie sehr der Inhalt
        // ueberlaeuft. Ein echter Fund (Rate-Probabilities-Seite lief nach
        // dem App-Shell-Umbau 2026-08-21 111px ueber den Viewport hinaus,
        // Ursache: #pageArea/.pc als Flex-Kinder ohne min-width:0) blieb
        // dadurch von diesem Check unbemerkt gruen. body/#pageArea/.app-shell
        // muessen stattdessen direkt gemessen werden.
        if (document.body.scrollWidth > document.body.clientWidth + 2)
          out.push(`${vpName}/${tab}: BODY scrolls horizontally (${document.body.scrollWidth} > ${document.body.clientWidth})`);
        const shell = document.querySelector('.app-shell');
        if (shell && shell.scrollWidth > shell.clientWidth + 2)
          out.push(`${vpName}/${tab}: APP-SHELL scrolls horizontally (${shell.scrollWidth} > ${shell.clientWidth})`);
        const pa = document.getElementById('pageArea');
        if (pa && pa.scrollWidth > pa.clientWidth + 2)
          out.push(`${vpName}/${tab}: PAGE-AREA scrolls horizontally (${pa.scrollWidth} > ${pa.clientWidth})`);

        // 2. content overflowing its card (project rule: must scroll INSIDE, not spill)
        document.querySelectorAll('.dw, .cot-card, .rub-card, .tr-card').forEach(card => {
          if (!card.offsetParent) return;
          const cs = getComputedStyle(card);
          if (cs.overflowX === 'auto' || cs.overflowX === 'scroll' || cs.overflow === 'auto') return;
          if (card.scrollWidth > card.clientWidth + 3) {
            const title = (card.querySelector('.dw-title,.cot-card-title,.tr-card-title')||{}).textContent||card.className;
            out.push(`${vpName}/${tab}: card content overflows horizontally: "${title.trim().slice(0,40)}" (${card.scrollWidth}>${card.clientWidth})`);
          }
        });

        // 3. text clipped by a fixed-height ancestor with overflow:hidden
        document.querySelectorAll('.dw').forEach(card => {
          if (!card.offsetParent) return;
          const cs = getComputedStyle(card);
          if (cs.overflowY === 'hidden' && card.scrollHeight > card.clientHeight + 4) {
            const title=(card.querySelector('.dw-title')||{}).textContent||card.className;
            out.push(`${vpName}/${tab}: card content CLIPPED vertically: "${title.trim().slice(0,40)}" (${card.scrollHeight}>${card.clientHeight})`);
          }
        });
        // 4. Flex-Zeile will zentrieren, ein Kind verrutscht trotzdem
        // ⚠ Bugreport 2026-09-06 (Screenshot, COT Report): der Refresh-Button
        // sass 7px tiefer als das Dropdown daneben. Ursache war NICHT die
        // Ausrichtung - .cot-ctrl-r hat align-items:center - sondern ein
        // margin-bottom AM KIND: in einer Flex-Zeile zaehlt der Margin zur
        // Aussenbox, zentriert wird die vergroesserte Box, die sichtbare
        // klebt oben. Genau diese Kollision war zu dem Zeitpunkt schon
        // DREIMAL einzeln weggepatcht worden, ohne dass jemand die Ursache
        // entfernt hat - also gehoert sie in einen Waechter, nicht in einen
        // vierten Patch. Gegenprobe beim Einbau: Margin zurueckgebaut ->
        // 2 Treffer (cot-ctrl-r, data-ctrls), Margin raus -> 0.
        document.querySelectorAll('*').forEach(el => {
          if (!el.offsetParent) return;
          const cs = getComputedStyle(el);
          if (!cs.display.includes('flex') || cs.flexDirection.startsWith('column')) return;
          if (cs.alignItems !== 'center') return;            // nur Zeilen, die zentrieren WOLLEN
          const kinder = [...el.children].filter(c => c.offsetParent);
          if (kinder.length < 2) return;
          const mit = kinder.filter(c => { const m = getComputedStyle(c); return parseFloat(m.marginTop) || parseFloat(m.marginBottom); });
          if (!mit.length) return;
          const boxen = kinder.map(c => c.getBoundingClientRect());
          const tops = boxen.map(b => b.top);
          if (Math.max(...tops) - Math.min(...tops) > 40) return;   // umgebrochen, anderer Fall
          const mitten = boxen.map(b => b.top + b.height / 2);
          const spanne = Math.round(Math.max(...mitten) - Math.min(...mitten));
          if (spanne < 3) return;
          const wer = mit.map(c => (c.className || c.tagName) + ' mb=' + getComputedStyle(c).marginBottom).join(', ');
          out.push(`${vpName}/${tab}: Flex-Zeile "${(el.className||el.id||el.tagName).toString().slice(0,32)}" zentriert, Kind verrutscht ${spanne}px durch Margin (${wer})`);
        });
        return out;
      }, {tab:t, vpName});
      res.forEach(r => findings.push(r));
    }
    await page.close();
  }

  console.log(JSON.stringify({ total: findings.length, findings }, null, 2));
  await browser.close();
})();
