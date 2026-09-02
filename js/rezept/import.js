'use strict';
// ══════════════════════════════════════════════════════════════════════════
//  PERFECT REZEPT - LINK-ERKENNUNG UND CAPTION-PARSER
// ══════════════════════════════════════════════════════════════════════════
//
// ⚠ Gehoert zur Rezept-App, NICHT zum FX Analyst Pro (siehe docs/rezept.md).
//
// WAS HIER GEHT UND WAS NICHT - bitte vor dem naechsten Ausbau lesen:
//
// Der Wunsch war "Instagram-Reels importieren, die automatisch zu einem
// Rezept werden". Der TEXT eines Reels laesst sich aus dem Browser heraus
// NICHT automatisch holen:
//   • Ein fetch() auf instagram.com scheitert an CORS - Instagram sendet
//     keinen Access-Control-Allow-Origin-Header. Das ist keine Einstellung,
//     die man umgehen kann.
//   • Die offizielle oEmbed-Schnittstelle verlangt seit 2020 ein
//     Meta-Business-Token, also einen eigenen Server mit Anmeldedaten.
//   • Der Einbett-Rahmen (iframe) zeigt das Video zwar an, sein Inhalt ist
//     aber cross-origin - Text daraus zu lesen verbietet der Browser.
// Wer das kuenftig doch automatisieren will, braucht einen Serverdienst
// (z.B. einen GitHub-Actions-Lauf mit Meta-Token), der die Caption holt und
// in die Supabase-Zeile schreibt. Ohne den ist jede "automatische"
// Loesung geraten - und geraten wird in diesem Projekt nicht (CLAUDE.md).
//
// WAS DIESE DATEI DAFUER TUT: der Nutzer fuegt EINMAL den kopierten
// Beitragstext ein (Link und Caption duerfen im selben Block stehen), und der
// Rest laeuft automatisch - Link erkennen, Titel, Dauer, Zutaten, Schritte
// und Hashtags herausloesen und daraus ein fertig ausgefuelltes Rezept
// bauen. Zweisprachig, weil Koch-Captions haeufig deutsch sind.

// ── Link-Erkennung ───────────────────────────────────────────────────────
const MUSTER=[
  {p:'instagram',re:/instagram\.com\/(?:reels?|p|tv)\/([A-Za-z0-9_-]+)/i,
   embed:id=>`https://www.instagram.com/p/${id}/embed/captioned/`,
   open:id=>`https://www.instagram.com/reel/${id}/`,label:'Instagram'},
  {p:'tiktok',re:/tiktok\.com\/@[^/]+\/video\/(\d+)/i,
   embed:id=>`https://www.tiktok.com/embed/v2/${id}`,
   open:id=>`https://www.tiktok.com/video/${id}`,label:'TikTok'},
  {p:'tiktok',re:/(?:vm|vt)\.tiktok\.com\/([A-Za-z0-9]+)/i,
   embed:()=>'',                       // Kurzlink: Ziel-ID unbekannt, kein Einbetten
   open:id=>`https://vm.tiktok.com/${id}`,label:'TikTok'},
  {p:'youtube',re:/(?:youtube\.com\/(?:watch\?v=|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{6,})/i,
   embed:id=>`https://www.youtube-nocookie.com/embed/${id}`,
   open:id=>`https://www.youtube.com/watch?v=${id}`,label:'YouTube'},
];
// Kuenstler/Kanal aus der Adresse lesen, wo er drinsteht. Instagram kennt
// beide Formen (mit und ohne Handle), TikTok hat ihn immer, YouTube nie.
// ⚠ Steht er nicht drin, bleibt das Feld LEER - ein geratener Name waere
// schlimmer als keiner.
// ══ VORSCHAUBILD EINES VIDEOS ════════════════════════════════════════════
// ⚠ NUR YOUTUBE hat eine oeffentliche, schluessellose Adresse fuers
// Vorschaubild (img.youtube.com/vi/<id>/...). Instagram und TikTok haben das
// NICHT: ihre Bild-Adressen sind kurzlebig signiert und nur ueber die
// jeweilige API zu bekommen, die ein Konto-Token verlangt. Deshalb gibt diese
// Funktion dort bewusst nichts zurueck - der Aufrufer baut dann ein sichtbar
// ERZEUGTES Titelbild, statt eine Adresse zu raten, die spaeter als kaputtes
// Bild beim Nutzer landet.
// Einzelbilder AUS dem Video, aus denen man ein Titelbild waehlen kann.
// ⚠ Nur YouTube liefert oeffentliche Standbilder (0.jpg = Titelbild,
// 1/2/3.jpg = Bilder aus dem ersten, mittleren und letzten Drittel). Bei
// Instagram und TikTok gibt es KEINEN Weg, im Browser ein Bild aus dem
// Video zu holen: das Video laeuft in einem fremden Rahmen, den diese Seite
// weder auslesen noch abmalen darf (Same-Origin-Regel), und die
// Vorschaubilder liegen hinter kurzlebig signierten Adressen. Deshalb gibt
// diese Funktion dort eine leere Liste zurueck - die Oberflaeche bietet
// stattdessen an, einen Bildschirmfoto-Schnappschuss einzufuegen.
export function frameUrls(link){
  if(!link||link.platform!=='youtube'||!link.id)return[];
  const b='https://img.youtube.com/vi/'+link.id+'/';
  return[
    {url:b+'maxresdefault.jpg',label:'Cover (large)'},
    {url:b+'hqdefault.jpg',label:'Cover'},
    {url:b+'1.jpg',label:'Frame 1'},
    {url:b+'2.jpg',label:'Frame 2'},
    {url:b+'3.jpg',label:'Frame 3'},
  ];
}
export function previewUrl(link){
  if(!link||link.platform!=='youtube'||!link.id)return'';
  // hqdefault existiert fuer JEDES Video (maxres nicht immer) - lieber ein
  // Bild, das sicher da ist, als eins in besserer Aufloesung, das fehlt.
  return'https://img.youtube.com/vi/'+link.id+'/hqdefault.jpg';
}
export function creatorFromUrl(text){
  const t=String(text||'');
  const ig=t.match(/instagram\.com\/([A-Za-z0-9._]+)\/(?:reels?|p|tv)\//i);
  if(ig&&!/^(reels?|p|tv|explore|stories)$/i.test(ig[1]))return'@'+ig[1];
  const tt=t.match(/tiktok\.com\/@([A-Za-z0-9._]+)/i);
  if(tt)return'@'+tt[1];
  return'';
}
// Sonst aus dem Beitragstext: das erste @handle, das nicht offensichtlich
// eine Erwaehnung mitten im Satz ist (Zeilenanfang oder "by @...").
export function creatorFromText(text){
  const t=String(text||'');
  const m=t.match(/(?:^|\n)\s*(?:by\s+|von\s+|rezept von\s+|recipe by\s+)?@([A-Za-z0-9._]{2,30})/i)
        ||t.match(/(?:by|von)\s+@([A-Za-z0-9._]{2,30})/i);
  return m?'@'+m[1]:'';
}
export function detectLink(text){
  const t=String(text||'');
  for(const m of MUSTER){
    const hit=t.match(m.re);
    if(hit)return{platform:m.p,label:m.label,id:hit[1],
      url:m.open(hit[1]),embedUrl:m.embed(hit[1])};
  }
  // Irgendein anderer Link - als einfacher Verweis brauchbar.
  const roh=t.match(/https?:\/\/[^\s"'<>]+/i);
  if(roh)return{platform:'link',label:'Link',id:'',url:roh[0],embedUrl:''};
  return null;
}

// ── Bausteine des Parsers ────────────────────────────────────────────────
const H_ZUTATEN=/^\s*(?:[^\w]{0,3})?(zutaten|ingredients|du brauchst|das brauchst du|you(?:'ll)?\s+need|einkaufsliste|shopping list|for the .{0,24})\s*:?\s*$/i;
const H_SCHRITTE=/^\s*(?:[^\w]{0,3})?(zubereitung|anleitung|so geht'?s|so wird'?s gemacht|instructions?|method|steps?|preparation|directions?|how to)\s*:?\s*$/i;
// Eine Zeile, die wie eine Zutat aussieht: Aufzaehlungszeichen oder eine
// Menge am Anfang. Die Einheitenliste ist bewusst kurz und eindeutig - ein
// zu gieriges Muster zieht sonst Fliesstext mit hinein.
const EINHEIT=/^\s*(?:[-–—•*·▢▪]|\d+[.)])?\s*(?:\d+(?:[.,/]\d+)?(?:\s*[½⅓⅔¼¾⅕⅙⅛])?|[½⅓⅔¼¾⅕⅙⅛])\s*(?:g|kg|mg|ml|cl|l|el|tl|tbsp?|tsp?|cups?|prise[n]?|stk|st(?:ü|ue)ck|scheiben?|zehen?|bund|dose[n]?|packung(?:en)?|pkg|tasse[n]?|glas|gl(?:ä|ae)ser|kugeln?|blatt|bl(?:ä|ae)tter|cloves?|slices?|cans?|pinch(?:es)?|handfuls?|bunch(?:es)?|sprigs?|sticks?|oz|lbs?|pints?|quarts?|packs?|pieces?)\b/i;
const AUFZAEHLUNG=/^\s*[-–—•*·▢▪]\s+\S/;
const NUMMERIERT=/^\s*(\d{1,2})[.)]\s+\S/;
const NUR_HASHTAGS=/^\s*(?:#[\wÀ-ɏ]+[\s,]*)+$/;

// ── Erkennen, WAS eine Zeile ist ────────────────────────────────────────
// Nutzer-Bugreport 2026-09-02 (per Screenshot): eine Caption mit
// "Ingredients:", aber OHNE eigene Ueberschrift fuer die Zubereitung, hat
// die komplette Anleitung als elfte "Zutat" in die Liste geschrieben. Der
// Ueberschriften-Weg lief bis zum Textende, weil er nur auf die naechste
// Ueberschrift wartete - die es nie gab. Deshalb entscheidet ab hier
// zusaetzlich die FORM der Zeile, wo die Zutaten aufhoeren.
function istZutat(z){
  const t=String(z||'').trim();
  if(!t)return false;
  if(AUFZAEHLUNG.test(t)&&t.length<=80)return true;
  if(EINHEIT.test(t))return true;
  // "3 Eier", "1 Zwiebel": Zahl + kurzer Ausdruck, kein Satz.
  if(/^\s*(?:\d+(?:[.,]\d+)?(?:\s*[½⅓⅔¼¾⅕⅙⅛])?|[½⅓⅔¼¾⅕⅙⅛])\s+\S/.test(t)&&t.length<=48&&!/[.!?]\s/.test(t))return true;
  return false;
}
function istFliesstext(z){
  const t=String(z||'').trim();
  // Lange Zeile oder mehrere Saetze -> das ist eine Anweisung, keine Zutat.
  return t.length>70||/[.!?]\s+["'(„“]?[A-ZÄÖÜ0-9]/.test(t);
}
// ── Mehrere Zutaten in EINER Zeile trennen ──────────────────────────────
// Im selben Bugreport: "½ tsp black pepper 150 g baby spinach" stand als
// eine Zutat da. Passiert, wenn beim Kopieren ein Zeilenumbruch verloren
// geht - beim Teilen aus einer App keine Seltenheit.
// ⚠ Nur angewandt, wenn die Zeile MIT einer Menge beginnt: in einem
// Anweisungssatz ("Bake at 200 C for 25 minutes") stehen ebenfalls Zahlen
// mit Einheiten, dort waere ein Trennen falsch.
const MENGE_MITTEN=/(?:^|[\s,;])((?:\d+(?:[.,\/]\d+)?(?:\s*[½⅓⅔¼¾⅕⅙⅛])?|[½⅓⅔¼¾⅕⅙⅛])\s*(?:g|kg|mg|ml|cl|l|el|tl|tbsps?|tbsp|tsps?|tsp|cups?|prise[n]?|stk|st(?:ü|ue)ck|scheiben?|zehen?|bund|dose[n]?|packung(?:en)?|pkg|tasse[n]?|glas|kugeln?|blatt|cloves?|slices?|cans?|pinch(?:es)?|handfuls?|bunch(?:es)?|sprigs?|sticks?|oz|lbs?)\b)/gi;
function trenneMehrfach(z){
  const t=String(z||'').trim();
  if(!EINHEIT.test(t))return[t];
  const stellen=[];
  MENGE_MITTEN.lastIndex=0;
  let m;
  while((m=MENGE_MITTEN.exec(t))){
    const start=m.index+(m[0].length-m[1].length);
    if(start>=8)stellen.push(start);
  }
  if(!stellen.length)return[t];
  const teile=[];
  let vor=0;
  stellen.forEach(st=>{
    const stueck=t.slice(vor,st).trim().replace(/[,;]\s*$/,'');
    if(stueck.length>=4)  {teile.push(stueck);vor=st;}
  });
  const rest=t.slice(vor).trim();
  if(rest.length>=4)teile.push(rest);
  return teile.length>1?teile:[t];
}
// ── Einen langen Absatz in Saetze zerlegen ──────────────────────────────
// Eine Wand aus Text ist im Kochmodus unbrauchbar - man will Schritt fuer
// Schritt lesen. Bewusst OHNE Lookbehind (das kennen aeltere Safari-Staende
// nicht) und mit Mindestlaenge, damit "ca." oder "z.B." nicht trennen.
function satzSplit(t){
  const out=[];let akt='';
  String(t||'').split(/\s+/).forEach(w=>{
    akt=akt?akt+' '+w:w;
    if(/[.!?]$/.test(w)&&akt.length>28){out.push(akt.trim());akt='';}
  });
  if(akt.trim())out.push(akt.trim());
  return out.filter(Boolean);
}

function zeilen(text){
  return String(text||'').replace(/\r/g,'').split('\n').map(z=>z.replace(/\s+$/,''));
}
function istLeer(z){return !z.trim();}
function ohneAufzaehlung(z){return z.replace(/^\s*[-–—•*·▢▪]\s*/,'').replace(/^\s*\d{1,2}[.)]\s*/,'').trim();}
// Fuehrende Emoji/Symbole vom Titel abschneiden, aber nichts vom Text selbst.
function putzeTitel(z){
  // Emoji stehen bei Koch-Captions fast immer VOR und HINTER dem Titel
  // ("🍝 Pasta al Limone 🔥"). Beide Seiten abschneiden, aber nichts
  // innerhalb des Textes anfassen - ein Emoji mitten im Satz gehoert dazu.
  return z.replace(/^[\s\p{Extended_Pictographic}\p{So}\p{Sk}|·•\-–—*]+/u,'')
          .replace(/[\s\p{Extended_Pictographic}\p{So}\p{Sk}|·•\-–—*]+$/u,'').trim();
}

// ── Dauer ────────────────────────────────────────────────────────────────
// Erkennt "25 min", "25 Minuten", "1 Std 30", "1h30", "1 hour", "90 mins",
// "ca. 20 Min". Gibt Minuten zurueck, auf 5er gerundet (die Auswahl im
// Formular kennt nur 5-Minuten-Schritte) - oder null, wenn nichts dasteht.
// ⚠ Nichts erfinden: ohne Fundstelle bleibt es null, das Formular nimmt dann
// seinen Standardwert und der Nutzer entscheidet.
export function parseDuration(text){
  const t=String(text||'');
  // ⚠ (?![a-z]) statt \b hinter der Einheit: bei "1h30" folgt auf das h eine
  // ZIFFER, und zwischen zwei Wortzeichen gibt es keine Wortgrenze - mit \b
  // waere die haeufigste Kurzschreibweise ueberhaupt durchgefallen.
  const std=t.match(/(\d{1,2})\s*(?:h(?![a-z])|std\.?|stunden?|hours?|hrs?)\s*(?:(\d{1,2})\s*(?:m(?![a-z])|min\.?|minuten?|minutes?)?)?/i);
  if(std){
    const m=(+std[1])*60+(std[2]?+std[2]:0);
    if(m>0&&m<=720)return runde5(m);
  }
  const min=t.match(/(\d{1,3})\s*(?:min\b|mins\b|minuten?\b|minutes?\b)/i);
  if(min){
    const m=+min[1];
    if(m>0&&m<=720)return runde5(m);
  }
  return null;
}
function runde5(m){return Math.max(5,Math.min(360,Math.round(m/5)*5));}

// ── Hashtags ─────────────────────────────────────────────────────────────
// Wird zu Tags. Reine Reichweiten-Hashtags fliegen raus - sie sagen nichts
// ueber das Gericht und wuerden die Filterleiste zumuellen.
const TAG_MUELL=new Set(['reels','reel','fyp','foryou','foryoupage','viral','trending',
  'explore','explorepage','instafood','food','foodie','foodporn','yummy','lecker',
  'essen','rezept','rezepte','recipe','recipes','cooking','kochen','tiktok','shorts']);
export function parseTags(text){
  const out=[];
  for(const m of String(text||'').matchAll(/#([\wÀ-ɏ]{2,30})/g)){
    const roh=m[1];
    if(TAG_MUELL.has(roh.toLowerCase()))continue;
    const t=roh.replace(/_/g,' ');
    const schoen=t.charAt(0).toUpperCase()+t.slice(1);
    if(!out.some(x=>x.toLowerCase()===schoen.toLowerCase()))out.push(schoen);
    if(out.length>=8)break;
  }
  return out;
}

// ── Der eigentliche Parser ───────────────────────────────────────────────
// Arbeitet in zwei Durchgaengen:
//   1. Gibt es Ueberschriften ("Zutaten:", "Zubereitung:")? Dann trennen die
//      den Text - das ist die zuverlaessigste Quelle.
//   2. Sonst nach Form entscheiden: Mengenangaben/Aufzaehlungen sind
//      Zutaten, nummerierte oder lange Saetze sind Schritte.
// Was in keine Schublade passt, geht NICHT verloren, sondern landet als
// Notiz-Block am Ende - lieber ein Absatz zu viel als ein verschluckter.
export function parseCaption(text){
  const roh=String(text||'');
  const link=detectLink(roh);
  const alle=zeilen(roh);
  const tags=parseTags(roh);

  // Link- und reine Hashtag-Zeilen spielen fuer den Inhalt keine Rolle.
  const inhalt=alle.filter(z=>{
    const t=z.trim();
    if(!t)return true;
    if(NUR_HASHTAGS.test(t))return false;
    if(/^https?:\/\/\S+$/i.test(t))return false;
    return true;
  }).map(z=>z.replace(/https?:\/\/\S+/gi,'').replace(/#[\wÀ-ɏ]+/g,'').replace(/\s+$/,''));

  let iZ=-1,iS=-1;
  inhalt.forEach((z,i)=>{
    if(iZ<0&&H_ZUTATEN.test(z))iZ=i;
    else if(iS<0&&H_SCHRITTE.test(z))iS=i;
  });

  const zutaten=[],schritte=[],rest=[];
  if(iZ>=0||iS>=0){
    // ── Durchgang 1: Ueberschriften gefunden ──
    const grenzeZ=(iS>iZ)?iS:inhalt.length;
    let abZeile=-1;   // ab hier ist es Zubereitung, obwohl keine Ueberschrift kam
    if(iZ>=0){
      for(let i=iZ+1;i<grenzeZ;i++){
        const roh=inhalt[i];
        const t=ohneAufzaehlung(roh);
        if(!t||H_SCHRITTE.test(roh))continue;
        // ⚠ Fehlt die Ueberschrift fuer die Zubereitung, muss die FORM
        // entscheiden - sonst landet die komplette Anleitung als Zutat in
        // der Liste (Bugreport 2026-09-02, per Screenshot).
        if(abZeile<0&&!istZutat(roh)&&istFliesstext(roh)){abZeile=i;break;}
        trenneMehrfach(t).forEach(x=>zutaten.push(x));
      }
    }
    if(abZeile>=0){
      for(let i=abZeile;i<grenzeZ;i++){
        const t=ohneAufzaehlung(inhalt[i]);
        if(t)schritte.push(t);
      }
    }
    if(iS>=0){
      for(let i=iS+1;i<inhalt.length;i++){
        const t=ohneAufzaehlung(inhalt[i]);
        if(t)schritte.push(t);
      }
    }
    const kopfEnde=Math.max(0,Math.min(...[iZ,iS].filter(x=>x>=0)));
    for(let i=0;i<kopfEnde;i++)if(inhalt[i].trim())rest.push(inhalt[i].trim());
  }else{
    // ── Durchgang 2: keine Ueberschriften, nach Form entscheiden ──
    let nummeriertGesehen=false;
    inhalt.forEach(z=>{
      const t=z.trim();
      if(!t)return;
      if(NUMMERIERT.test(t)){nummeriertGesehen=true;schritte.push(ohneAufzaehlung(t));return;}
      if(!nummeriertGesehen&&(EINHEIT.test(t)||(AUFZAEHLUNG.test(t)&&t.length<=70))){
        trenneMehrfach(ohneAufzaehlung(t)).forEach(x=>zutaten.push(x));return;
      }
      rest.push(t);
    });
  }

  // Titel: die erste Zeile, die weder Ueberschrift noch Zutat noch Schritt
  // ist. Faellt auf die erste Inhaltszeile ueberhaupt zurueck.
  let titel='';
  for(const z of rest.length?rest:inhalt){
    const t=putzeTitel(z);
    if(t.length>=3&&!H_ZUTATEN.test(t)&&!H_SCHRITTE.test(t)){titel=t;break;}
  }
  if(titel.length>72){
    const schnitt=titel.slice(0,72);
    const p=Math.max(schnitt.lastIndexOf(' - '),schnitt.lastIndexOf(' – '),schnitt.lastIndexOf('. '),schnitt.lastIndexOf(', '));
    titel=(p>18?schnitt.slice(0,p):schnitt).trim();
  }
  // Die Titelzeile darf nicht doppelt als Notiz stehen bleiben.
  const restOhneTitel=rest.filter(z=>putzeTitel(z)!==titel);

  // ⚠ Eine Wand aus Text ist im Kochmodus unbrauchbar. Kam die Zubereitung
  // als EIN langer Absatz (haeufig bei Instagram-Captions), wird sie in
  // Saetze zerlegt - aber nur dann: eine bereits nummerierte Anleitung
  // bleibt so, wie der Autor sie geschrieben hat.
  const feineSchritte=[];
  schritte.forEach(s2=>{
    if(s2.length>170)satzSplit(s2).forEach(x=>feineSchritte.push(x));
    else feineSchritte.push(s2);
  });

  return{
    link,
    creator:creatorFromUrl(roh)||creatorFromText(roh),
    title:titel,
    min:parseDuration(roh),
    ingredients:zutaten.filter(Boolean),
    steps:feineSchritte.filter(Boolean),
    tags,
    notes:restOhneTitel.join('\n').trim(),
  };
}

// Baut aus dem Parser-Ergebnis den Entwurf, den das Rezept-Formular erwartet.
// Nichts wird erfunden: fehlt die Dauer in der Caption, bleibt der
// Formular-Standard stehen und der Nutzer waehlt selbst.
export function captionToRecipe(text,vorlage){
  const p=parseCaption(text);
  const bloecke=[];
  if(p.steps.length){
    // Nummerierung wieder anschreiben, damit die Schritte auch im Rezept als
    // Reihenfolge lesbar sind.
    bloecke.push({t:'text',v:p.steps.map((s,i)=>`${i+1}. ${s}`).join('\n')});
  }
  if(p.notes)bloecke.push({t:'text',v:p.notes});
  if(!bloecke.length)bloecke.push({t:'text',v:''});
  return Object.assign({
    title:p.title||'',
    min:p.min||30,
    tags:p.tags,
    ingredients:p.ingredients.length?p.ingredients:[''],
    blocks:bloecke,
    source:p.link?p.link.url:'',
  },vorlage||{});
}
