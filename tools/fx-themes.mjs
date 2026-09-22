#!/usr/bin/env node
// ── ERZEUGT DIE DESIGN-VORLAGEN DES FX ANALYST PRO ───────────────────────
// Ausgabe: das CSS, das in index.html zwischen den Markern
//   /* ══ DESIGN-VORLAGEN … */ und /* ══ ENDE DESIGN-VORLAGEN ══ */
// steht. KEIN Build-Schritt - die App bleibt eine Datei ohne Werkzeugkette;
// dieses Skript ist Nachvollziehbarkeit, nicht Voraussetzung.
//
// ⚠ WARUM EIN GENERATOR: die -rgb-Varianten muessen zur Farbe passen. Von
// Hand gepflegt ist das eine stille Fehlerquelle - eine falsch abgetippte
// rgb-Zeile faerbt woanders falsch und faellt keinem Kontrast-Waechter auf,
// weil die Farbe fuer sich genommen in Ordnung ist.
//
// ⚠ FARBEN MIT BEDEUTUNG: --green ist in JEDER Vorlage ein Blau (bullish),
// --red ein Rot (bearish), --amber ein entsaettigtes Grau (neutral). Nur
// Helligkeit und Saettigung passen sich der Flaeche an. check/theme.js
// rechnet das nach - Farbton-Abstand, nicht Helligkeit (Blau und Rot koennen
// gleich hell sein und trotzdem eindeutig).
//
// Aufruf:  node tools/fx-themes.mjs          -> CSS auf stdout
//          node tools/fx-themes.mjs --pruefe -> Kontrastwerte je Vorlage

const hex2rgb = h => { h = h.replace('#',''); return [0,2,4].map(i => parseInt(h.substr(i,2),16)); };
const rgbTxt  = h => hex2rgb(h).join(',');
const lum = c => { const v = c.map(x => { x/=255; return x<=0.03928 ? x/12.92 : Math.pow((x+0.055)/1.055,2.4); }); return .2126*v[0]+.7152*v[1]+.0722*v[2]; };
const kontrast = (a,b) => { const l1=lum(hex2rgb(a)), l2=lum(hex2rgb(b)); return (Math.max(l1,l2)+.05)/(Math.min(l1,l2)+.05); };

export const THEMES = {
 // ── HELL ───────────────────────────────────────────────────────────────
 linear: { name:'Linear Light', dark:false,
   bg:['#F4F5F8','#FAFAFB','#FFFFFF','#F7F8FA','#EFF1F5','#E4E7EE','#D3D8E2'],
   bd:'rgba(28,29,33,.12)', bd2:'rgba(28,29,33,.22)',
   t:['#16171A','#2C2F36','#4C515B','#4A4F59'],
   chrome:'#1C1D21', cbd:'#101114', cline:'#33353C', cquick:'#2A2C33',
   accent:'#4B55B8', onAccent:'#FFFFFF', blue:'#2C51C7', red:'#B02B26', neu:'#535966',
   purple:'#6B4CC4', success:'#0F6B3C', live:'#C4302B',
   a:['#93670F','#5F45AB','#136B60','#9C5117','#1A6E89','#933C66'] },
 stripe: { name:'Stripe Slate', dark:false,
   bg:['#F0F4F9','#F6F9FC','#FFFFFF','#F4F7FB','#EAF0F7','#DDE6F1','#C9D5E5'],
   bd:'rgba(10,37,64,.13)', bd2:'rgba(10,37,64,.24)',
   t:['#0A2540','#243851','#495D75','#465A73'],
   chrome:'#0A2540', cbd:'#04162A', cline:'#264260', cquick:'#153454',
   accent:'#4F46D6', onAccent:'#FFFFFF', blue:'#0B57B8', red:'#B0322A', neu:'#4E5F74',
   purple:'#6A4BDD', success:'#0C6B41', live:'#C93326',
   a:['#96660F','#5E42AC','#0F6E5F','#A2551A','#186D87','#8F3B63'] },
 swiss: { name:'Swiss Editorial', dark:false,
   bg:['#FFFFFF','#FAFAFA','#FFFFFF','#F7F7F7','#F0F0F0','#E4E4E4','#D0D0D0'],
   bd:'rgba(0,0,0,.14)', bd2:'rgba(0,0,0,.26)',
   t:['#000000','#242424','#4E4E4E','#4A4A4A'],
   chrome:'#111111', cbd:'#000000', cline:'#333333', cquick:'#242424',
   accent:'#1F1F1F', onAccent:'#FFFFFF', blue:'#0B4BA8', red:'#A81F17', neu:'#4A4A4A',
   purple:'#4E3F8C', success:'#0F5C33', live:'#B32B26',
   a:['#7C540F','#4F3A8C','#105C50','#8A4714','#155C74','#7C3255'] },
 notion: { name:'Notion Warm', dark:false,
   bg:['#F7F7F5','#FBFBFA','#FFFFFF','#F6F5F3','#EFEEEA','#E5E3DE','#D5D2CB'],
   bd:'rgba(55,53,47,.14)', bd2:'rgba(55,53,47,.25)',
   t:['#191817','#302E28','#54504A','#524E48'],
   chrome:'#37352F', cbd:'#211F1B', cline:'#4E4B43', cquick:'#45423A',
   accent:'#1B6FC4', onAccent:'#FFFFFF', blue:'#1461B0', red:'#A93125', neu:'#55514A',
   purple:'#6B44AD', success:'#0F6039', live:'#BE3826',
   a:['#8F6113','#5B41A0','#136759','#964E17','#166583','#8A3A5D'] },
 // ── DUNKEL ─────────────────────────────────────────────────────────────
 // ⚠ Auf dunklem Grund braucht ALLES mehr Helligkeit: Text, Bias-Farben und
 // der Akzent. Und der Text AUF einer hellen Akzentflaeche wird dunkel -
 // weiss auf hellem Cyan war im ersten Wurf nur 2,3:1.
 carbon: { name:'Carbon Dark', dark:true,
   bg:['#161616','#1C1C1C','#262626','#212121','#2C2C2C','#333333','#474747'],
   bd:'rgba(255,255,255,.16)', bd2:'rgba(255,255,255,.30)',
   t:['#F4F4F4','#E0E4E9','#B4BAC1','#AEB4BB'],
   chrome:'#000000', cbd:'#2A2A2A', cline:'#393939', cquick:'#1F1F1F',
   accent:'#78C7FF', onAccent:'#0A1520', blue:'#78A9FF', red:'#FF8389', neu:'#A8B0B8',
   purple:'#BE95FF', success:'#5CD17E', live:'#FF9DA2',
   a:['#E3B23C','#B48CFF','#5FE3E1','#FF9E52','#5CC2F0','#FF9CC8'] },
 midnight: { name:'Midnight Terminal', dark:true,
   bg:['#0A101C','#111A2B','#16223A','#131D31','#1B2740','#22304C','#2C3D5E'],
   bd:'rgba(150,180,225,.18)', bd2:'rgba(150,180,225,.32)',
   t:['#EEF3FB','#D5DFEF','#A9B8D0','#A3B2CB'],
   chrome:'#060B16', cbd:'#1B2740', cline:'#2A3A5C', cquick:'#122036',
   accent:'#6FCBE8', onAccent:'#04121B', blue:'#7DBBFF', red:'#FF8C87', neu:'#A2B0C6',
   purple:'#BCA2FF', success:'#5ACF92', live:'#FF9A93',
   a:['#EBBA55','#B49CFF','#4FD3BF','#F59B5C','#5FC0E0','#EE85B4'] },
 graphite: { name:'Graphite Dark', dark:true,
   bg:['#17181B','#1D1F23','#232529','#1F2126','#282B31','#31353C','#41454E'],
   bd:'rgba(255,255,255,.15)', bd2:'rgba(255,255,255,.28)',
   t:['#F2F3F5','#DBDEE3','#ADB3BC','#A7ADB6'],
   chrome:'#0F1113', cbd:'#2A2D33', cline:'#3A3E46', cquick:'#1A1D21',
   accent:'#A8CBDC', onAccent:'#101A20', blue:'#82B8F5', red:'#F58A86', neu:'#A6ADB8',
   purple:'#BBA4E8', success:'#63C68C', live:'#FA9691',
   a:['#DFB25A','#AF9AE0','#57C0AE','#E5975A','#78B8D2','#DA8FB0'] },
 nord: { name:'Nordic Dark', dark:true,
   bg:['#2E3440','#333B48','#3B4252','#374050','#3E4756','#454F60','#4F5A6E'],
   bd:'rgba(216,222,233,.20)', bd2:'rgba(216,222,233,.34)',
   t:['#ECEFF4','#E0E6EF','#C3CCDA','#BDC7D6'],
   chrome:'#242933', cbd:'#3B4252', cline:'#4C566A', cquick:'#2B323E',
   accent:'#A6D3E0', onAccent:'#14202A', blue:'#9EC1DE', red:'#EE9AA0', neu:'#B4BFCE',
   purple:'#D2AECB', success:'#8FD4A8', live:'#F2A8AC',
   a:['#E6C87F','#C7ACDD','#83D8C6','#E7A67F','#A3CCE0','#DFAAC6'] },
 solar: { name:'Solarized Dark', dark:true,
   bg:['#002B36','#03313D','#073642','#053742','#0A3E4A','#0F4753','#175665'],
   bd:'rgba(147,161,161,.24)', bd2:'rgba(147,161,161,.40)',
   t:['#EEE8D5','#DCD6C4','#B3BDBA','#ADB7B4'],
   chrome:'#001F27', cbd:'#073642', cline:'#0F4A57', cquick:'#01303B',
   accent:'#6FC7D4', onAccent:'#02222A', blue:'#7CBCEC', red:'#F58C86', neu:'#A6B2B0',
   purple:'#CBA6E4', success:'#78CE8A', live:'#FA968E',
   a:['#E0BC4A','#B79BE6','#55CBB8','#EA9F52','#5FC0D8','#E297B7'] },
};

function block(id, d) {
  const g = d.blue, r = d.red, n = d.neu;
  const L = [];
  L.push(`/* ${d.name} */`);
  L.push(`:root[data-fx-theme="${id}"]{`);
  L.push(`  --chrome-bg:${d.chrome};--chrome-bd:${d.cbd};--chrome-line:${d.cline};--chrome-quick:${d.cquick};`);
  L.push(`  --bg0:${d.bg[0]};--bg1:${d.bg[1]};--bg2:${d.bg[2]};--bg3:${d.bg[3]};--bg4:${d.bg[4]};--bg5:${d.bg[5]};--bg6:${d.bg[6]};`);
  L.push(`  --bd:${d.bd};--bd2:${d.bd2};`);
  L.push(`  --t0:${d.t[0]};--t1:${d.t[1]};--t2:${d.t[2]};--t3:${d.t[3]};--t3-rgb:${rgbTxt(d.t[3])};`);
  L.push(`  --green:${g};--red:${r};--amber:${n};--star:${n};--blue:${g};--purple:${d.purple};--success:${d.success};--live:${d.live};`);
  L.push(`  --green-rgb:${rgbTxt(g)};--red-rgb:${rgbTxt(r)};--amber-rgb:${rgbTxt(n)};--star-rgb:${rgbTxt(n)};--blue-rgb:${rgbTxt(g)};--purple-rgb:${rgbTxt(d.purple)};--success-rgb:${rgbTxt(d.success)};`);
  L.push(`  --accent:${d.accent};--accent-rgb:${rgbTxt(d.accent)};`);
  L.push(`  --a-infl:${d.a[0]};--a-rate:${d.a[1]};--a-lab:${d.a[2]};--a-grow:${d.a[3]};--a-cot:${d.a[4]};--a-risk:${d.a[5]};`);
  L.push(`  --on-accent:${d.onAccent};`);
  L.push(`  --green-lt:${g};--red-dk:${r};`);
  L.push(`}`);
  L.push(`[data-fx-theme="${id}"] .hdr,[data-fx-theme="${id}"] #navSidebar{`);
  if (d.dark) {
    // Inhalt ist ohnehin dunkel - die Kopfzeile hebt sich nur leicht ab.
    L.push(`  --t0:${d.t[0]};--t1:${d.t[1]};--t2:${d.t[2]};--t3:${d.t[3]};`);
    L.push(`  --bg2:${d.bg[3]};--bg3:${d.bg[4]};--bg4:${d.bg[5]};--bg5:${d.bg[6]};`);
  } else {
    // Heller Inhalt, dunkler Chrome: die Textstufen werden gedreht.
    L.push(`  --t0:#F7F8FA;--t1:#E2E5EA;--t2:#B6BCC5;--t3:#B0B6BF;`);
    L.push(`  --bg2:${d.cquick};--bg3:${d.cline};--bg4:${d.cline};--bg5:${d.cline};`);
  }
  L.push(`  --bd:${d.cline};--bd2:${d.cline};`);
  L.push(`}`);
  return L.join('\n');
}

if (process.argv.includes('--pruefe')) {
  for (const [id, d] of Object.entries(THEMES)) {
    const w = [];
    ['t0','t1','t2','t3'].forEach((k,i) => d.bg.slice(0,6).forEach((f,j) => {
      const c = kontrast(d.t[i], f); if (c < 4.5) w.push(`${k}/bg${j} ${c.toFixed(2)}`);
    }));
    [['green',d.blue],['red',d.red],['amber',d.neu],['accent',d.accent]].forEach(([k,v]) => {
      [2,5].forEach(j => { const c = kontrast(v, d.bg[j]); if (c < 3) w.push(`${k}/bg${j} ${c.toFixed(2)}`); });
    });
    const oa = kontrast(d.onAccent, d.accent); if (oa < 3) w.push(`on-accent/accent ${oa.toFixed(2)}`);
    console.log(`${w.length ? '✗' : '✓'} ${d.name.padEnd(20)} ${w.join('  ') || 'alle Werte ueber der Schwelle'}`);
  }
} else {
  console.log(Object.entries(THEMES).map(([k,v]) => block(k,v)).join('\n'));
}
