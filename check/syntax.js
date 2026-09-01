#!/usr/bin/env node
// ── SYNTAX-WAECHTER ───────────────────────────────────────────────
// (a) JS aus den <script>-Bloecken von index.html extrahieren und pruefen.
//     ⚠ Gefiltert wird auf die ATTRIBUTE des <script>-TAGS, NICHT auf den
//     Inhalt: das grosse App-Skript enthaelt "src=" in Template-Strings und
//     wurde durch einen Inhalts-Filter jahrelang still uebersprungen.
// (b) Jede Workflow-YAML parsen und jeden run-Block mit `bash -n` pruefen.
//     ⚠ `node --check` findet einen Apostroph in einem node -e '...'-Block
//     NICHT - der prueft nur den bereits extrahierten JS-Code.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');

const F = [];
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fxcheck-'));

// ⚠ BEIDE Seiten dieses Repos pruefen, nicht nur index.html: seit dem
// 2026-09-01 liegt hier eine zweite, eigenstaendige App (Perfect Rezept,
// rezept.html + js/rezept/*). Ein Waechter, der nur index.html kennt, waere
// fuer die Haelfte des ausgelieferten Codes blind - genau der Fehler, der
// bei der Modul-Aufteilung schon einmal passiert ist (siehe check/README.md).
const SEITEN = ['index.html', 'rezept.html'].filter(f => fs.existsSync(f));
let bloecke = [];
SEITEN.forEach(datei => {
  const html = fs.readFileSync(datei, 'utf8');
  const teil = [...html.matchAll(/<script((?:\s[^>]*)?)>([\s\S]*?)<\/script>/g)]
    .filter(m => !/\ssrc=/.test(m[1]))
    .map(m => m[2]);
  if (!teil.length) F.push(`Keine Inline-<script>-Bloecke in ${datei} gefunden - Filter kaputt?`);
  bloecke = bloecke.concat(teil);
  const js = path.join(tmp, datei.replace(/\W/g, '_') + '.js');
  fs.writeFileSync(js, teil.join('\n;\n'));
  try { execSync(`node --check ${js}`, { stdio: 'pipe' }); }
  catch (e) { F.push(datei + ' JS: ' + String(e.stderr || e.message).slice(0, 600)); }
});
// Die ES-Module der Rezept-App (eigenes Verzeichnis, wird von der
// js/*.js-Schleife der uebrigen Waechter nicht miterfasst).
if (fs.existsSync('js/rezept')) {
  fs.readdirSync('js/rezept').filter(f => f.endsWith('.js')).forEach(f => {
    try { execSync(`node --check js/rezept/${f}`, { stdio: 'pipe' }); }
    catch (e) { F.push(`js/rezept/${f}: ` + String(e.stderr || e.message).slice(0, 600)); }
  });
}

let yaml = null;
try { yaml = require('js-yaml'); } catch (e) { /* Fallback ueber python3 */ }
const wfDir = '.github/workflows';
let bashBloecke = 0;
if (fs.existsSync(wfDir)) {
  fs.readdirSync(wfDir).filter(f => /\.ya?ml$/.test(f)).forEach(f => {
    const p = path.join(wfDir, f);
    let doc = null;
    if (yaml) {
      try { doc = yaml.load(fs.readFileSync(p, 'utf8')); }
      catch (e) { F.push(`${p}: YAML ungueltig - ${e.message.slice(0, 200)}`); return; }
    } else {
      try {
        doc = JSON.parse(execSync(
          `python3 -c "import yaml,json,sys;print(json.dumps(yaml.safe_load(open('${p}'))))"`,
          { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }));
      } catch (e) { F.push(`${p}: YAML ungueltig - ${String(e.stderr || e.message).slice(0, 200)}`); return; }
    }
    Object.values((doc && doc.jobs) || {}).forEach(job => {
      (job.steps || []).forEach(st => {
        if (!st.run) return;
        bashBloecke++;
        const sh = path.join(tmp, 'step' + bashBloecke + '.sh');
        fs.writeFileSync(sh, st.run);
        try { execSync(`bash -n ${sh}`, { stdio: 'pipe' }); }
        catch (e) { F.push(`${p} / "${st.name || '(ohne Namen)'}": ${String(e.stderr || e.message).slice(0, 300)}`); }
      });
    });
  });
}

fs.rmSync(tmp, { recursive: true, force: true });
if (F.length) { console.error('SYNTAX-FEHLER:\n'); F.forEach(x => console.error('  ' + x + '\n')); process.exit(1); }
console.log(`[syntax] ok (${bloecke.length} Skript-Bloecke, ${bashBloecke} run-Bloecke)`);
