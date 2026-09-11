"""Sternenhimmel fuer die Overview-Seite - gezeichnet statt fotografiert.

⚠ WARUM NICHT AUS DEM INTERNET, obwohl der Nutzer das wollte:
Der Wunsch war "Nacht Sternenhimmel aus dem Internet, hohe Qualitaet", spaeter
praezisiert zu "weniger Sternen und schaerfer". Sechs Workflow-Laeufe gegen die
NASA-Bildbibliothek haben gezeigt, dass beides dort nicht zu haben ist:

  * Teleskopaufnahmen (Kugelsternhaufen, Nebel) haben in JEDEM Ausschnitt rund
    10000 aufloesbare Sterne - gemessen. "Weniger" ist daran nicht
    nachzubearbeiten, und die Sterne sind 5-10 Pixel breite Scheiben, also das
    Gegenteil von scharf.
  * Die duenn besetzten Treffer waren Illustrationen ("Artist's Concept") -
    der Lauf vom 2026-09-11 waehlte eine Zeichnung eines Satelliten vor der
    Erde, weil Sterndichte allein eine Grafik nicht von einem Himmel
    unterscheidet.
  * Fotos, die wie ein klassischer Nachthimmel aussehen, sind fast immer
    urheberrechtlich geschuetzt. Ein Hintergrundbild wird Teil des Repos und
    wird ausgeliefert - das schliesst sie aus.

Der Filter im Workflow meldet das inzwischen ehrlich (Lauf 6 bricht ab: "Kein
Kandidat war ein echtes Sternfeld"). Gezeichnet ist hier die bessere Antwort,
weil jede Anforderung direkt steuerbar wird: die Anzahl der Sterne ist eine
Zahl, die Schaerfe ist bauartbedingt (ein gezeichneter Punkt IST scharf), und
die Datei wiegt Kilobyte statt Megabyte.
"""
import numpy as np
from PIL import Image, ImageFilter

B, H = 1920, 1080


def himmel(seed=11, n_sterne=1300, milchstrasse=True):
    rng = np.random.default_rng(seed)
    # Grundton: sehr dunkles Blau, nicht Schwarz - reines Schwarz wirkt auf
    # einem Bildschirm wie ein Loch, nicht wie Nacht.
    bild = np.zeros((H, B, 3), np.float32)
    bild[..., 0] = 4.0
    bild[..., 1] = 6.0
    bild[..., 2] = 14.0

    if milchstrasse:
        # Ein sehr schwaches diagonales Band aus unaufgeloestem Sternlicht.
        # Es traegt Tiefe bei, OHNE die Sternzahl zu erhoehen - genau darum
        # geht es: weniger Sterne, trotzdem nicht leer.
        yy, xx = np.mgrid[0:H, 0:B].astype(np.float32)
        d = np.abs((yy - 0.42 * H) - 0.33 * (xx - B / 2)) / (0.30 * H)
        band = np.exp(-d * d * 2.2)
        # ⚠ Erste Fassung nahm ein 14x24-Gitter. Bikubisch auf 1920 Pixel
        # gezogen ergab das grosse weiche Flecken - im Bild sah es aus wie
        # Kompressionsartefakte, nicht wie ein Band. Feineres Gitter, und
        # der Beitrag bleibt klein: das Band soll man ahnen, nicht sehen.
        wolke = rng.random((70, 120)).astype(np.float32)
        wolke = np.asarray(Image.fromarray((wolke * 255).astype(np.uint8), 'L')
                           .resize((B, H), Image.BICUBIC)
                           .filter(ImageFilter.GaussianBlur(9)), np.float32) / 255.0
        band = band * (0.55 + 0.45 * wolke)
        bild[..., 0] += band * 4.0
        bild[..., 1] += band * 5.0
        bild[..., 2] += band * 9.0

    # ── Sterne ───────────────────────────────────────────────────────────
    # Helligkeitsverteilung wie am echten Himmel: sehr viele schwache, sehr
    # wenige helle. Der Exponent macht aus einer Gleichverteilung genau das.
    x = rng.integers(1, B - 1, n_sterne)
    y = rng.integers(1, H - 1, n_sterne)
    hell = np.power(rng.random(n_sterne), 2.3)          # 0..1, stark links betont
    # Farbe: die meisten Sterne weiss-blau, einige warm. Reine Weisspunkte
    # wirken wie Bildrauschen, die leichte Streuung macht sie lebendig.
    temp = rng.random(n_sterne)
    for i in range(n_sterne):
        h0 = 95 + hell[i] * 160
        t = temp[i]
        r = h0 * (1.06 if t > 0.82 else 0.94 if t < 0.25 else 1.0)
        g = h0 * (0.96 if t > 0.82 else 0.97 if t < 0.25 else 1.0)
        b = h0 * (0.82 if t > 0.82 else 1.08 if t < 0.25 else 1.0)
        # Der Kern ist EIN Pixel - daher die Schaerfe. Die Nachbarn bekommen
        # nur einen Bruchteil, damit ein heller Stern Groesse suggeriert,
        # ohne zur Scheibe zu werden.
        bild[y[i], x[i]] += (r, g, b)
        if hell[i] > 0.35:
            k = (hell[i] - 0.35) * 0.55
            for dy, dx in ((-1, 0), (1, 0), (0, -1), (0, 1)):
                bild[y[i] + dy, x[i] + dx] += (r * k, g * k, b * k)

    # ── Ankersterne ──────────────────────────────────────────────────────
    # Ein Dutzend deutlich hellerer Sterne. Ohne sie ist der Himmel gleichmaessig
    # und dadurch langweilig - das Auge braucht ein paar Punkte, an denen es
    # haengenbleibt. Sie bleiben punktfoermig; Groesse entsteht nur ueber das
    # Halo weiter unten.
    for _ in range(12):
        ax, ay = int(rng.integers(20, B - 20)), int(rng.integers(20, H - 20))
        bild[ay, ax] += (250, 252, 255)
        for dy, dx in ((-1, 0), (1, 0), (0, -1), (0, 1)):
            bild[ay + dy, ax + dx] += (110, 118, 135)

    # Halo NUR fuer die hellsten: weichgezeichnete Kopie der starken Sterne,
    # additiv daruebergelegt. Die scharfen Kerne bleiben dabei unangetastet.
    stark = np.zeros((H, B), np.float32)
    for i in range(n_sterne):
        if hell[i] > 0.72:
            stark[y[i], x[i]] = (hell[i] - 0.72) * 255
    if stark.max() > 0:
        halo = np.asarray(Image.fromarray(stark.astype(np.uint8), 'L')
                          .filter(ImageFilter.GaussianBlur(3.2)), np.float32)
        bild[..., 0] += halo * 0.55
        bild[..., 1] += halo * 0.62
        bild[..., 2] += halo * 0.85

    return Image.fromarray(np.clip(bild, 0, 255).astype(np.uint8), 'RGB')


def kennzahlen(im):
    """Sterne = lokale Maxima. Schaerfe = mittlerer Sprung zwischen
    Nachbarpixeln; hoch heisst harte Kanten, also Punkte statt Scheiben."""
    g = np.asarray(im.convert('L'), np.int16)
    kern = g[1:-1, 1:-1]
    ist_max = ((kern > 70) & (kern >= g[:-2, 1:-1]) & (kern >= g[2:, 1:-1])
               & (kern >= g[1:-1, :-2]) & (kern >= g[1:-1, 2:]))
    grad = np.abs(np.diff(g, axis=0)).mean() + np.abs(np.diff(g, axis=1)).mean()
    return int(ist_max.sum()), round(float(grad), 2)


if __name__ == '__main__':
    import os
    im = himmel()
    im.save('img/starfield.webp', 'WEBP', quality=88, method=6)
    im.resize((240, 135), Image.LANCZOS).save('img/starfield-tile.webp', 'WEBP', quality=80, method=6)
    n, s = kennzahlen(im)
    print(f'Sterne: {n}   Schaerfe: {s}   {os.path.getsize("img/starfield.webp")/1024:.0f} KB')
