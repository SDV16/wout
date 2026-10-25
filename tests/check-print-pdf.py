#!/usr/bin/env python3
"""
Controleert met een echte PDF-renderer dat de afdruk op precies één pagina past
en dat er geen app-tekst (menu, knoppen, uitleg) in terechtkomt.

Eenmalig installeren:   pip install weasyprint pymupdf
Draaien:                node make-print-sheets.js && python3 check-print-pdf.py
(optioneel: PRINTCHECK_DIR=/pad om een andere map te gebruiken; het veld wordt als
afbeelding naast de PDF gezet zodat je het ook met eigen ogen kunt bekijken)

Let op: WeasyPrint is niet Chrome. Het bewijst dat de indeling en de CSS kloppen,
maar de tekstbreedtes van jouw browser kunnen een fractie afwijken (de indeling
houdt daar 5% speling voor aan).
"""
import glob, os, re, sys, tempfile
import fitz, tinycss2
from weasyprint import HTML

HIER = os.path.dirname(os.path.abspath(__file__))
UIT = os.environ.get("PRINTCHECK_DIR") or os.path.join(tempfile.gettempdir(), "printcheck")
css = open(os.path.join(HIER, "..", "css", "style.css"), encoding="utf-8").read()

# WeasyPrint past de paginastijlen niet toe op ingebedde tekeningen (Chrome wel);
# daarom zetten we voor deze controle de veldstijlen in de tekening zelf.
root_vars = dict(re.findall(r"(--[\w-]+)\s*:\s*([^;]+);", css[: css.index("}", css.index(":root"))]))
vul = lambda t: re.sub(r"var\((--[\w-]+)\)", lambda m: root_vars.get(m.group(1), "#000").strip(), t)
SVG_SEL = (".mk-chip-bg", ".mk-slot", ".mk-pos-label", ".mk-chip-name", ".mk-empty-plus", ".mk-chip-min",
           ".mk-green-svg", ".mk-orange-svg", ".mk-red-svg", ".mk-plain-svg", ".mk-check-svg", ".pitch-warn")
svg_css = "\n".join(vul(r.serialize()) for r in tinycss2.parse_stylesheet(css, skip_comments=True, skip_whitespace=True)
                    if r.type == "qualified-rule" and any(s in tinycss2.serialize(r.prelude) for s in SVG_SEL))

bestanden = sorted(glob.glob(os.path.join(UIT, "*.html")))
if not bestanden:
    sys.exit("Geen afdrukpagina's gevonden. Draai eerst: node make-print-sheets.js")

print(f"{'scenario':12} {'paginas':>8}  {'app-tekst zichtbaar':>20}  {'bevat Blok 1':>13}")
fout = False
for f in bestanden:
    naam = os.path.basename(f)[:-5]
    sheet = open(f, encoding="utf-8").read()
    sheet = re.sub(r"(<svg[^>]*>)", lambda m: m.group(1) + "<style>" + svg_css + "</style>", sheet)
    doc = (f'<!doctype html><html lang="nl"><head><meta charset="utf-8"><style>{css}</style></head>'
           f'<body><div id="app-rest">verborgen app-tekst</div>{sheet}</body></html>')
    pdf = os.path.join(UIT, f"{naam}.pdf")
    HTML(string=doc).write_pdf(pdf)
    d = fitz.open(pdf)
    d[0].get_pixmap(dpi=90).save(os.path.join(UIT, f"{naam}.png"))
    tekst = " ".join(p.get_text() for p in d)
    app, blok = "verborgen app-tekst" in tekst, "Blok 1" in tekst
    print(f"{naam:12} {len(d):>8}  {str(app):>20}  {str(blok):>13}")
    if len(d) != 1 or app or not blok:
        fout = True
print("\nPNG's en PDF's staan in", UIT)
sys.exit(1 if fout else 0)
