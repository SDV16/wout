// =====================================================
// Afdrukken / opslaan als PDF: één A4-pagina met per blok alleen de titel,
// het voetbalveld (precies zoals op het scherm) en de wissels.
//
// De pagina wordt apart opgebouwd en alleen bij het printen getoond; al het
// andere (menu, knoppen, uitleg, meldingen) wordt in print verborgen. De
// kop- en voetregel van de browser (datum, titel, bestandspad) verdwijnen via
// `@page { margin: 0 }` in style.css.
//
// Om gegarandeerd op één blad te passen, berekent `layout` uit het aantal
// blokken en het aantal regels wissels hoeveel kolommen er komen en hoe ver
// alles verkleind moet worden - zonder iets te hoeven meten in de browser.
// =====================================================

(function (root) {
  const PAGE_W = 210, PAGE_H = 297;   // A4 in mm
  const PAD = 7;                       // marge rond de inhoud
  const GAP = 3;                       // ruimte tussen de blokken
  const FRAME = 1.5;                   // donkergroene rand om het veld
  const BASE_FONT_PT = 8;              // lettergrootte van de wissels bij schaal 1
  const PT_TO_MM = 0.3528;
  const TITLE_MM = 5.5;                // titelregel boven het veld (incl. witruimte)
  const PITCH_RATIO = 400 / 320;       // hoogte/breedte van het veld (viewBox)
  const MIN_READABLE_SCALE = 0.75;     // kleiner dan dit wordt de tekst (8pt x schaal) te klein
  const SAFETY = 1.05;                 // 5% speling tegen afrondings- en regelafbrekingsverschillen

  // cardsLines: per blok een lijst met de teksten van de wisselregels.
  function layout(cardsLines) {
    const N = cardsLines.length;
    const Wu = PAGE_W - 2 * PAD;
    const Hu = PAGE_H - 2 * PAD - 2;   // 2 mm extra speling onderaan
    const fontMM = BASE_FONT_PT * PT_TO_MM;
    const lineH = fontMM * 1.3;

    // Kandidaten: 1 tot 5 kolommen. Per kandidaat de schaal waarmee alles op één
    // blad past, en hoe groot het veld dan op papier wordt.
    const kandidaten = [];
    for (let c = 1; c <= Math.min(Math.max(N, 1), 5); c++) {
      const colW = (Wu - (c - 1) * GAP) / c;
      const charsPerLine = Math.max(8, Math.floor((colW - 1) / (fontMM * 0.52)));
      const pitchH = (colW - 2 * FRAME) * PITCH_RATIO + 2 * FRAME;
      let total = 0;
      for (let r = 0; r * c < N; r++) {
        let rowH = 0;
        for (let k = r * c; k < Math.min(N, (r + 1) * c); k++) {
          const regels = cardsLines[k].reduce((s, t) => s + Math.max(1, Math.ceil(t.length / charsPerLine)), 0);
          rowH = Math.max(rowH, TITLE_MM + pitchH + (regels ? regels * lineH + 1.5 : 0) + 1);
        }
        total += rowH + (r > 0 ? GAP : 0);
      }
      const sc = Math.min(1, Hu / (total * SAFETY));
      kandidaten.push({ cols: c, colW, scale: sc, metric: colW * sc, total });
    }
    // Leesbaarheid gaat voor: de tekst schaalt met alles mee, en bij een schaal
    // onder MIN_READABLE_SCALE wordt hij te klein. Kies dus bij voorkeur uit de
    // indelingen die leesbaar blijven, en daarbinnen het grootste veld. Lukt dat
    // nergens (heel veel blokken), kies dan de indeling met de grootste schaal.
    const leesbaar = kandidaten.filter((k) => k.scale >= MIN_READABLE_SCALE - 1e-9);
    let beste;
    if (leesbaar.length) {
      beste = leesbaar.reduce((a, b) => (b.metric > a.metric + 1e-9 ? b : a));
    } else {
      beste = kandidaten.reduce((a, b) => (b.scale > a.scale + 1e-9 || (Math.abs(b.scale - a.scale) <= 1e-9 && b.metric > a.metric) ? b : a));
    }
    const s = beste.scale;
    return {
      cols: beste.cols,
      scale: s,
      colW: beste.colW * s,
      gap: GAP * s,
      frame: FRAME * s,
      fontPt: BASE_FONT_PT * s,
      estimatedHeight: beste.total * s,
      availableHeight: Hu,
    };
  }

  // Wisselregels van de overgang naar blok idx, gesorteerd op minuut.
  function transitionLines(blocks, idx, overrides, bounds) {
    const { pairs } = ManualLineup.deriveTransition(blocks[idx - 1].lineup, blocks[idx].lineup);
    const grens = bounds[idx].start;
    const per = (overrides && overrides[idx]) || {};
    const regels = pairs.map((pr) => {
      const key = ManualLineup.pairKey(pr);
      const m = per[key] !== undefined ? per[key] : grens;
      const min = `${fmtMin(m)}'`;
      let tekst, html;
      if (pr.in && pr.uit) {
        const keten = pr.keten ? ` [${pr.keten.naam} ${pr.keten.van} \u2192 ${pr.keten.naar}]` : "";
        const pos = pr.pos ? ` (${pr.pos})` : "";
        tekst = `${min} ${pr.in} \u2192 ${pr.uit}${pos}${keten}`;
        html = `<span class="ps-min">${mEsc(min)}</span> <span class="ps-in">${mEsc(pr.in)}</span> \u2192 <span class="ps-out">${mEsc(pr.uit)}</span>`
          + (pr.pos ? ` <span class="ps-pos">(${mEsc(pr.pos)})</span>` : "")
          + (pr.keten ? ` <span class="ps-keten">[${mEsc(pr.keten.naam)} ${mEsc(pr.keten.van)} \u2192 ${mEsc(pr.keten.naar)}]</span>` : "");
      } else if (pr.in) {
        tekst = `${min} ${pr.in} erbij`;
        html = `<span class="ps-min">${mEsc(min)}</span> <span class="ps-in">${mEsc(pr.in)}</span> erbij`;
      } else {
        tekst = `${min} ${pr.uit} eruit`;
        html = `<span class="ps-min">${mEsc(min)}</span> <span class="ps-out">${mEsc(pr.uit)}</span> eruit`;
      }
      return { m, tekst, html };
    });
    regels.sort((a, b) => a.m - b.m);
    return regels;
  }

  // Bouwt de afdrukpagina voor een bewerker-context (zie render-manual.js).
  function build(ctx) {
    const m = ctx.model, o = ctx.options;
    const { minutes } = ManualLineup.computeMinutes(m.blocks, m.momentOverrides);
    const bounds = ManualLineup.blockBounds(m.blocks);
    // Het veld wordt getekend zoals het nu op het scherm staat.
    const viewCtx = { pick: null, minutes, targets: ctx.targets, showTags: o.showTags, rankOf: o.rankOf, gradId: "mkturf-print" };

    const kaarten = m.blocks.map((blok, idx) => ({
      idx, blok, b: bounds[idx],
      regels: idx === 0 ? [] : transitionLines(m.blocks, idx, m.momentOverrides, bounds),
    }));
    const lay = layout(kaarten.map((k) => k.regels.map((r) => r.tekst)));

    const kaartHTML = (k) => `<div class="ps-card">
      <div class="ps-title"><strong>Blok ${k.idx + 1}</strong><span>${fmtMin(k.b.start)}'\u2013${fmtMin(k.b.end)}'</span></div>
      <div class="ps-pitch">${renderManualPitch(k.blok.lineup, viewCtx)}</div>
      ${k.regels.length ? `<div class="ps-wissels">${k.regels.map((r) => `<div class="ps-line">${r.html}</div>`).join("")}</div>` : ""}
    </div>`;

    let rijen = "";
    for (let i = 0; i < kaarten.length; i += lay.cols) {
      rijen += `<div class="ps-row">${kaarten.slice(i, i + lay.cols).map(kaartHTML).join("")}</div>`;
    }

    const el = document.createElement("div");
    el.id = "print-sheet";
    el.setAttribute("aria-hidden", "true");
    el.style.cssText = `--ps-colw:${lay.colW.toFixed(2)}mm; --ps-gap:${lay.gap.toFixed(2)}mm; --ps-font:${lay.fontPt.toFixed(2)}pt; --ps-frame:${lay.frame.toFixed(2)}mm;`;
    el.innerHTML = rijen;
    return { el, layout: lay };
  }

  const PrintSheet = { layout, transitionLines, build, PAGE_W, PAGE_H, PAD, MIN_READABLE_SCALE };
  if (typeof module !== "undefined") module.exports = PrintSheet;
  else root.PrintSheet = PrintSheet;
})(typeof window !== "undefined" ? window : globalThis);
