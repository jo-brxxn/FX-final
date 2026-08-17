const PW=process.env.PW_PATH||'/opt/node22/lib/node_modules/playwright';
const URL=process.env.CHECK_URL||'http://127.0.0.1:8935/index.html';
const { chromium } = require(PW);

(async () => {
  const browser = await chromium.launch();
  const findings = [];
  const TABS = ['dash','fx','matrix','cot','trends','sent','seas','data','rate','compare','watch','notes','cal','research','setups'];
  const VIEWPORTS = [[1920,1080,'wide'],[1440,900,'desktop'],[1180,820,'small-desktop'],[820,1180,'tablet'],[390,844,'mobile']];

  for (const [w,h,vpName] of VIEWPORTS) {
    const page = await browser.newPage({ viewport: { width: w, height: h } });
    await page.goto(URL, { waitUntil: 'networkidle' });
    await page.evaluate(() => { ['introOv','lockScreen'].forEach(id=>{const e=document.getElementById(id);if(e)e.remove();}); });
    await page.waitForTimeout(700);
    await page.evaluate(() => { document.querySelectorAll('.mov,.mov2').forEach(m=>m.style.display='none'); });

    for (const t of TABS) {
      await page.evaluate(tab=>{try{showTab(tab);}catch(e){}}, t);
      await page.waitForTimeout(300);
      const res = await page.evaluate(({tab,vpName}) => {
        const out = [];
        // 1. horizontal page overflow
        if (document.documentElement.scrollWidth > document.documentElement.clientWidth + 2)
          out.push(`${vpName}/${tab}: PAGE scrolls horizontally (${document.documentElement.scrollWidth} > ${document.documentElement.clientWidth})`);

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
        return out;
      }, {tab:t, vpName});
      res.forEach(r => findings.push(r));
    }
    await page.close();
  }

  console.log(JSON.stringify({ total: findings.length, findings }, null, 2));
  await browser.close();
})();
