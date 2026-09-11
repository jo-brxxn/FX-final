"""Marmor-Hintergrund, prozedural gezeichnet.

Zwei Sackgassen auf dem Weg, beide am Bild erkannt:

1. Turbulenz zu schwach gegenueber der Sinus-Frequenz -> parallele Streifen,
   sah aus wie gebuerstetes Metall.
2. Turbulenz dann so stark, dass sie die Grundrichtung ueberlagerte -> die
   Adern schlossen sich zu Ringen, das Bild wurde eine Hoehenlinien-Karte.

Der Ausweg ist nicht die Staerke, sondern die RICHTUNG: das Verzerrungsfeld
muss ANISOTROP sein - glatt ENTLANG der Ader, fein QUER dazu. Dann bleibt die
Phase in Querrichtung monoton (keine geschlossenen Ringe), waehrend die Ader
in Laengsrichtung frei wandern kann. Genau so sieht echter Marmor aus: lange,
gerichtete, verzweigte Adern.

Technisch: das Rauschgitter bekommt getrennte Zellzahlen fuer x und y.
Wenige Zellen in x = Strukturen lang in x.
"""
import numpy as np
from PIL import Image, ImageFilter

B, H = 2560, 1440


def glatt(gy, gx, rng):
    """Rauschgitter mit getrennter Aufloesung je Achse, bikubisch hochgezogen."""
    klein = rng.random((max(2, gy), max(2, gx))).astype(np.float32)
    im = Image.fromarray((klein * 255).astype(np.uint8), "L").resize((B, H), Image.BICUBIC)
    return np.asarray(im, dtype=np.float32) / 255.0


def fbm(rng, oktaven, gy, gx, streckung=1.0):
    """Oktavsumme. streckung>1 zieht die Strukturen in x lang."""
    out = np.zeros((H, B), np.float32)
    amp = norm = 0.0
    amp = 1.0
    for _ in range(oktaven):
        out += amp * glatt(int(gy), int(max(2, gx)), rng)
        norm += amp
        amp *= 0.5
        gy *= 2
        gx *= 2
    return out / norm


def marmor(seed, freq, warp, blau, rot, grundhell, korn, dicke=10.0, neigung=0.30):
    rng = np.random.default_rng(seed)
    yy, xx = np.mgrid[0:H, 0:B].astype(np.float32)
    xx /= B
    yy /= H

    # ── Anisotropes Verzerrungsfeld: glatt in x, bewegt in y ─────────────
    # 3 Zellen in x = sehr lange Strukturen; 9 in y = die Ader wandert.
    warp_gross = fbm(rng, 4, gy=9, gx=3) - 0.5
    warp_fein = fbm(rng, 4, gy=26, gx=7) - 0.5
    kraeusel = fbm(rng, 3, gy=70, gx=30) - 0.5     # feines Zittern am Aderrand

    # Phase waechst monoton quer zur Ader -> keine geschlossenen Ringe.
    quer = yy + neigung * xx
    phase = (quer * freq + warp_gross * warp + warp_fein * (warp * 0.30)
             + kraeusel * (warp * 0.05)) * np.pi
    kante = np.clip(1.0 - np.abs(np.sin(phase)), 0, 1)

    # Aderdicke ortsabhaengig: einzelne kraeftige Adern, dazwischen Haarlinien.
    d = dicke * (0.35 + 1.9 * fbm(rng, 3, gy=4, gx=3))
    ader = np.power(kante, d)
    breit = np.power(kante, 2.0)

    wolke = fbm(rng, 4, gy=3, gx=3)

    # ── Grau-Basis ───────────────────────────────────────────────────────
    grund = grundhell - 30.0 * (wolke - 0.5) - 30.0 * breit
    grund += (fbm(rng, 2, gy=150, gx=260) - 0.5) * korn      # Steinkorn
    grau = np.clip(grund, 0, 255)
    rgb = np.stack([grau, grau * 0.997, grau * 1.006], axis=-1)

    # ── Farbzonen ────────────────────────────────────────────────────────
    zone = fbm(rng, 3, gy=3, gx=3)
    zone = (zone - zone.min()) / (np.ptp(zone) + 1e-6)
    m_blau = np.clip((zone - 0.42) * 3.2, 0, 1)
    m_rot = np.clip((0.58 - zone) * 3.2, 0, 1)

    def leuchten(maske, farbe, staerke):
        kern = np.clip(maske, 0, 1)
        bild = Image.fromarray((kern * 255).astype(np.uint8), "L")
        halo = np.asarray(bild.filter(ImageFilter.GaussianBlur(20)), np.float32) / 255.0
        weit = np.asarray(bild.filter(ImageFilter.GaussianBlur(70)), np.float32) / 255.0
        gesamt = kern + halo * 0.8 + weit * 0.45
        for k in range(3):
            rgb[..., k] += gesamt * farbe[k] * staerke

    leuchten(ader * m_blau, (0.20, 0.60, 1.00), blau)
    leuchten(ader * m_rot, (1.00, 0.24, 0.28), rot)

    # ── Dunkle Haarrisse ─────────────────────────────────────────────────
    # ⚠ In der ersten Fassung lagen sie als gleichmaessig dunkle Linien AUF
    # dem Bild und sahen aus wie Bleistiftgekritzel. Drei Korrekturen machen
    # sie zu Rissen IM Stein: (1) sie laufen nicht ueber die ganze Flaeche,
    # sondern werden von einer groben Maske ein- und ausgeblendet, (2) sie
    # sind leicht weichgezeichnet statt haarscharf, (3) sie werden dort
    # schwaecher, wo eine Leuchtader liegt - sonst kreuzt eine schwarze Linie
    # mitten durch das Leuchten.
    sx = fbm(rng, 4, gy=14, gx=4) - 0.5
    riss_ph = ((yy - 0.55 * xx) * freq * 2.1 + sx * warp * 1.1) * np.pi
    riss = np.power(np.clip(1.0 - np.abs(np.sin(riss_ph)), 0, 1), 30.0)
    vorkommen = np.clip((fbm(rng, 3, gy=5, gx=4) - 0.34) * 3.4, 0, 1)
    riss = riss * vorkommen * (1.0 - 0.85 * np.clip(ader, 0, 1))
    riss = np.asarray(
        Image.fromarray((np.clip(riss, 0, 1) * 255).astype(np.uint8), "L")
             .filter(ImageFilter.GaussianBlur(1.1)), np.float32) / 255.0
    rgb -= riss[..., None] * 26.0

    return Image.fromarray(np.clip(rgb, 0, 255).astype(np.uint8), "RGB")


VARIANTEN = {
    # name                    seed  freq warp blau rot  hell korn dicke neig
    "marmor-1-dezent.png":   (7,    5.0, 1.7, 105, 80,  234,  9, 12.0, 0.30),
    "marmor-2-kraeftig.png": (21,   4.0, 2.1, 180, 145, 227, 12,  9.0, 0.45),
    "marmor-3-dunkel.png":   (42,   4.5, 1.9, 205, 170,  84, 15,  9.0, 0.25),
}

if __name__ == "__main__":
    for name, (s, f, w, b, r, hell, korn, d, n) in VARIANTEN.items():
        marmor(s, f, w, b, r, hell, korn, d, n).save(name)
        print(name)
