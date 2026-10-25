// =====================================================
// Generieke bewerker voor een opstelling in blokken. Twee tabbladen gebruiken
// dit: "Eigen" (zelf bouwen vanaf nul) en "Opstelling" (de door de computer
// gegenereerde opstelling, daarna vrij te bewerken). Verschillen tussen beide
// zitten in ctx.options:
//   ns                id-voorvoegsel (zodat ids nooit botsen)
//   mode              "builder" (blokken toevoegen, "Rond af") of "viewer"
//   showTags          gespeeld/recht-op onder de namen + groen vinkje
//   tableStyle        "new" (gekleurde cijfers) of "old" (vinkje/kleur in Verschil)
//   showTableInEditor minutenoverzicht ook onder het huidige blok tonen
//   rankOf            (speler, positie) -> 1/2/3/999, voor het "!"-icoontje
//   extraTop          (minuten) -> HTML bovenaan
// =====================================================

function mEsc(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function fmtMin(v) {
  const r = Math.round(v * 10) / 10;
  return Number.isInteger(r) ? String(r) : String(r).replace(".", ",");
}

// Kleine "(gespeeld/recht op)" annotatie. Zit iemand goed (binnen 4 min), dan
// alleen een vinkje: geen getallen meer, zodat de maker deze speler kan negeren.
function minuteTag(gespeeld, target) {
  const cls = ManualLineup.diffClass(gespeeld, target);
  if (cls === "mk-green") return `<span class="mk-check">&#10003;</span>`;
  return `<span class="mk-tag">(<span class="${cls}">${fmtMin(gespeeld)}</span>/<span class="mk-plain">${fmtMin(target)}</span>)</span>`;
}

function isOnTarget(gespeeld, target) {
  return ManualLineup.diffClass(gespeeld, target) === "mk-green";
}

// ---- Veld ----
function renderManualPitch(lineup, ctx) {
  const W = 320, H = 400;
  const tags = ctx.showTags !== false;
  // Elk veld krijgt zijn eigen gradiënt-id: staat het eerste veld met dezelfde id in
  // een verborgen scherm, dan tekent de browser de rest soms zonder verloop.
  const gid = ctx.gradId || "mkturf";
  const rows = [
    { y: 70, slots: [["lb", 62], ["sp", 160], ["rb", 258]] },
    { y: 205, slots: [["cm1", 62], ["cm2", 160], ["cm3", 258]] },
    { y: 338, slots: [["la", 46], ["cv1", 127], ["cv2", 193], ["ra", 274]] },
  ];

  let chips = "";
  for (const row of rows) {
    for (const [pos, x] of row.slots) {
      const naam = lineup[pos];
      const geselecteerd = ctx.pick && ctx.pick.pos === pos;
      const leeg = !naam;
      let klaar = false;
      const w = 86, h = 40;
      const label = pos.replace(/\d/, "").toUpperCase();

      let binnen;
      if (leeg) {
        binnen = `<text x="${x}" y="${row.y + 5}" text-anchor="middle" font-size="16" class="mk-empty-plus">+</text>`;
      } else {
        if (tags) {
          const g = ctx.minutes[naam] || 0;
          const t = ctx.targets[naam] || 0;
          const cls = ManualLineup.diffClass(g, t);
          const fs = naam.length > 10 ? 10.5 : 12;
          klaar = cls === "mk-green";
          binnen =
            `<text x="${x}" y="${row.y - 1}" text-anchor="middle" font-size="${fs}" font-weight="700" class="mk-chip-name">${mEsc(naam)}</text>` +
            (klaar
              ? `<text x="${x}" y="${row.y + 13}" text-anchor="middle" font-size="12" class="mk-check-svg">&#10003;</text>`
              : `<text x="${x}" y="${row.y + 12}" text-anchor="middle" font-size="9.5" class="mk-chip-min">` +
                `<tspan class="${cls}-svg">${fmtMin(g)}</tspan><tspan class="mk-plain-svg">/${fmtMin(t)}</tspan></text>`);
        } else {
          const fs = naam.length > 9 ? 11 : 12.5;
          binnen = `<text x="${x}" y="${row.y + 4}" text-anchor="middle" font-size="${fs}" font-weight="700" class="mk-chip-name">${mEsc(naam)}</text>`;
        }
        if (ctx.rankOf && ctx.rankOf(naam, pos) === 999) {
          binnen += `<text x="${x + w / 2 - 3}" y="${row.y - h / 2 + 11}" text-anchor="middle" font-size="12" class="pitch-warn">!</text>`;
        }
      }

      chips += `<g class="mk-slot${geselecteerd ? " is-picked" : ""}${leeg ? " is-empty" : ""}${klaar ? " is-done" : ""}" data-mk-slot="${pos}">
        <text x="${x}" y="${row.y - h / 2 - 5}" class="mk-pos-label" text-anchor="middle">${label}</text>
        <rect x="${x - w / 2}" y="${row.y - h / 2}" width="${w}" height="${h}" rx="9" class="mk-chip-bg"/>
        ${binnen}
      </g>`;
    }
  }

  return `<svg class="pitch-svg" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
    <defs><linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#14503B"/><stop offset="1" stop-color="#0F3D2E"/>
    </linearGradient></defs>
    <rect width="${W}" height="${H}" fill="url(#${gid})"/>
    <rect x="14" y="14" width="${W - 28}" height="${H - 28}" fill="none" stroke="#3E7A5F" stroke-width="1.5"/>
    <line x1="14" y1="${H / 2 + 35}" x2="${W - 14}" y2="${H / 2 + 35}" stroke="#3E7A5F" stroke-width="1.5"/>
    <circle cx="${W / 2}" cy="${H / 2 + 35}" r="42" fill="none" stroke="#3E7A5F" stroke-width="1.5"/>
    ${chips}
  </svg>`;
}

// ---- Bank ----
function renderManualBench(beschikbaar, ctx) {
  if (!beschikbaar.length) {
    return `<div class="bench"><div class="bench__label">Bank</div><p class="bench__empty">Geen spelers beschikbaar voor dit blok.</p></div>`;
  }
  const tags = ctx.showTags !== false;
  const chips = beschikbaar.map((naam) => {
    const g = ctx.minutes[naam] || 0;
    const t = ctx.targets[naam] || 0;
    const gekozen = ctx.pick && ctx.pick.bench === naam;
    const klaar = tags && isOnTarget(g, t);
    return `<button type="button" class="mk-bench-chip${gekozen ? " is-picked" : ""}${klaar ? " is-done" : ""}" data-mk-bench="${mEsc(naam)}">
      <span class="mk-bench-name">${mEsc(naam)}</span>${tags ? minuteTag(g, t) : ""}
    </button>`;
  }).join("");
  return `<div class="bench"><div class="bench__label">Bank (${beschikbaar.length})</div><div class="mk-bench-grid">${chips}</div></div>`;
}

// ---- Wissellijst tussen twee blokken ----
function renderManualTransition(blocks, idx, momentOverrides, bounds) {
  if (idx === 0) return `<p class="wissels__empty">Eerste blok — startopstelling.</p>`;
  const { pairs } = ManualLineup.deriveTransition(blocks[idx - 1].lineup, blocks[idx].lineup);
  if (!pairs.length) return `<p class="wissels__empty">Geen wissels bij dit blok.</p>`;

  const grens = bounds[idx].start;
  const overrides = momentOverrides[idx] || {};

  const perMoment = {};
  for (const pr of pairs) {
    const key = ManualLineup.pairKey(pr);
    const m = overrides[key] !== undefined ? overrides[key] : grens;
    if (!perMoment[m]) perMoment[m] = [];
    perMoment[m].push(pr);
  }

  let html = "";
  for (const m of Object.keys(perMoment).map(Number).sort((a, b) => a - b)) {
    html += `<div class="wissel-moment"><div class="wissel-moment__min">Minuut ${fmtMin(m)}</div>`;
    for (const pr of perMoment[m]) {
      const key = ManualLineup.pairKey(pr);
      let tekst;
      if (pr.in && pr.uit) {
        if (pr.keten) {
          tekst = `<span class="in">${mEsc(pr.in)}</span> <span class="wissel-pos">(${mEsc(pr.pos)})</span>`
            + ` <span class="arrow">&rarr;</span> <span class="out">${mEsc(pr.uit)}</span> <span class="wissel-pos">(${mEsc(pr.uitPos || "")})</span>`
            + `<span class="wissel-keten">[${mEsc(pr.keten.naam)} ${mEsc(pr.keten.van)} &rarr; ${mEsc(pr.keten.naar)}]</span>`;
        } else {
          tekst = `<span class="in">${mEsc(pr.in)}</span><span class="arrow">&rarr;</span><span class="out">${mEsc(pr.uit)}</span>`
            + (pr.pos ? ` <span class="wissel-pos">(${mEsc(pr.pos)})</span>` : "");
        }
      } else if (pr.in) {
        tekst = `<span class="in">${mEsc(pr.in)}</span> erbij${pr.pos ? ` <span class="wissel-pos">(${mEsc(pr.pos)})</span>` : ""}`;
      } else {
        tekst = `<span class="out">${mEsc(pr.uit)}</span> eruit`;
      }
      html += `<div class="wissel-row" data-mk-block="${idx}" data-mk-pairkey="${mEsc(key)}">
        <button type="button" class="wissel-shift" data-mk-dir="-1" aria-label="2,5 minuten eerder">&#9664;</button>
        <span class="wissel-row__tekst">${tekst}</span>
        <button type="button" class="wissel-shift" data-mk-dir="1" aria-label="2,5 minuten later">&#9654;</button>
      </div>`;
    }
    html += `</div>`;
  }
  return html;
}

// ---- Minutenoverzicht ----
function renderManualMinutesTable(spelers, minutes, posMinutes, targets, playerStates, style) {
  const rows = spelers.map((p) => {
    const g = minutes[p] || 0;
    const pm = posMinutes[p] || {};
    return {
      speler: p,
      training: playerStates[p] ? playerStates[p].training : 2,
      target: targets[p] || 0,
      gekregen: g,
      posities: Object.entries(pm).map(([k, v]) => `${k}:${fmtMin(v)}`).join(", "),
    };
  });
  rows.sort((a, b) => b.training - a.training || b.gekregen - a.gekregen);

  let html = `<div class="data-table-wrap"><table class="data-table"><thead><tr>
    <th>Speler</th><th>Train.</th><th>Recht op</th><th>Gekregen</th><th>Verschil</th><th>Posities</th>
  </tr></thead><tbody>`;
  for (const r of rows) {
    const d = r.gekregen - r.target;
    if (style === "old") {
      html += `<tr>
        <td>${mEsc(r.speler)}</td>
        <td class="num">${r.training}x</td>
        <td class="num">${fmtMin(r.target)}'</td>
        <td class="num" data-min="${r.gekregen}">${fmtMin(r.gekregen)}'</td>
        ${verschilCell(d)}
        <td>${mEsc(r.posities)}</td>
      </tr>`;
    } else {
      const cls = ManualLineup.diffClass(r.gekregen, r.target);
      if (cls === "mk-green") {
        // Zit iemand goed, dan is het exacte getal niet interessant: een vinkje
        // volstaat. De echte waarde blijft beschikbaar als tooltip en in data-min.
        const exact = `${fmtMin(r.gekregen)}' (${d > 0 ? "+" : ""}${fmtMin(d)}')`;
        html += `<tr>
        <td>${mEsc(r.speler)}</td>
        <td class="num">${r.training}x</td>
        <td class="num">${fmtMin(r.target)}'</td>
        <td class="num mk-green" data-min="${r.gekregen}" title="${exact}">&#10003;</td>
        <td class="num mk-green" title="${exact}">&#10003;</td>
        <td>${mEsc(r.posities)}</td>
      </tr>`;
      } else {
        html += `<tr>
        <td>${mEsc(r.speler)}</td>
        <td class="num">${r.training}x</td>
        <td class="num">${fmtMin(r.target)}'</td>
        <td class="num ${cls}" data-min="${r.gekregen}">${fmtMin(r.gekregen)}'</td>
        <td class="num ${cls}">${d > 0 ? "+" : ""}${fmtMin(d)}'</td>
        <td>${mEsc(r.posities)}</td>
      </tr>`;
      }
    }
  }
  return html + `</tbody></table></div>`;
}

// =====================================================
// Hoofdweergave
// =====================================================
function renderEditor(ctx) {
  const { el, model: m, spelers, targets, playerStates } = ctx;
  const o = ctx.options;
  const ns = o.ns;

  if (o.mode === "builder" && spelers.length < 10) {
    el.innerHTML = `<div class="banner banner--info">Selecteer eerst minstens 10 spelers op het <strong>Team</strong>-tabblad. Daarna kun je hier zelf een opstelling bouwen.</div>`;
    return;
  }

  if (m.currentBlock >= m.blocks.length) m.currentBlock = m.blocks.length - 1;
  if (m.currentBlock < 0) m.currentBlock = 0;

  const { minutes, posMinutes } = ManualLineup.computeMinutes(m.blocks, m.momentOverrides);
  const bounds = ManualLineup.blockBounds(m.blocks);
  const totaal = ManualLineup.totalMinutes(m.blocks);

  if (m.finished) {
    renderEditorSummary(ctx, minutes, posMinutes, bounds, totaal);
    return;
  }

  const idx = m.currentBlock;
  const blok = m.blocks[idx];
  const b = bounds[idx];

  // Wie mag in dit blok op de bank staan: geselecteerd, nog niet opgesteld,
  // en beschikbaar gezien zijn 1e/2e-helft-instelling.
  const opgesteld = new Set(Object.values(blok.lineup).filter(Boolean));
  const beschikbaar = spelers.filter((p) =>
    !opgesteld.has(p) && ManualLineup.availableInBlock(playerStates[p], b.start)
  );

  const ingevuld = opgesteld.size;
  const compleet = ingevuld === ManualLineup.FIELD_POSITIONS.length;
  const isLaatsteMogelijk = totaal >= ManualLineup.TOTAL_MATCH_MINUTES - 0.001;
  const viewCtx = { pick: m.pick, minutes, targets, showTags: o.showTags, rankOf: o.rankOf, gradId: `mkturf-${ns}` };

  let html = o.extraTop ? o.extraTop(minutes) : "";

  html += `
    <div class="mk-blockbar">
      <div class="mk-blockbar__row">
        <strong>Blok ${idx + 1}${o.mode === "viewer" ? ` van ${m.blocks.length}` : ""}</strong>
        <span class="mk-blockbar__range">${fmtMin(b.start)}' – ${fmtMin(b.end)}'</span>
      </div>
      <div class="mk-blockbar__row">
        <div class="mk-duration">
          <span class="mk-duration__label">Duur</span>
          <button type="button" class="mk-duration__step" data-mk-dur-step="-2.5" aria-label="2,5 minuten korter">&minus;</button>
          <input type="text" id="${ns}-duration" class="mk-duration__input" value="${fmtMin(blok.minutes)}" inputmode="decimal" aria-label="Blokduur in minuten"/>
          <button type="button" class="mk-duration__step" data-mk-dur-step="2.5" aria-label="2,5 minuten langer">+</button>
          <span class="mk-duration__unit">min</span>
        </div>
        <span class="mk-total ${totaal > ManualLineup.TOTAL_MATCH_MINUTES + 0.001 ? "is-over" : ""}">
          totaal ${fmtMin(totaal)}/90'
        </span>
      </div>
    </div>`;

  if (totaal > ManualLineup.TOTAL_MATCH_MINUTES + 0.001) {
    html += `<div class="banner banner--warn">De blokken tellen samen op tot meer dan 90 minuten. Verkort een blok voordat je afrondt.</div>`;
  } else if (o.mode === "viewer" && totaal < ManualLineup.TOTAL_MATCH_MINUTES - 0.001) {
    html += `<div class="banner banner--warn">De blokken tellen samen op tot ${fmtMin(totaal)} minuten in plaats van 90.</div>`;
  }

  html += `<div class="block-card">
    <div class="pitch-wrap">${renderManualPitch(blok.lineup, viewCtx)}</div>
    ${renderManualBench(beschikbaar, viewCtx)}
    ${idx > 0 ? `<div class="wissels">${renderManualTransition(m.blocks, idx, m.momentOverrides, bounds)}</div>` : ""}
  </div>`;

  html += `<div class="mk-nav">
    <button type="button" id="${ns}-prev" class="mk-nav__btn" ${idx === 0 ? "disabled" : ""}>&#9664; Vorig blok</button>`;
  if (idx < m.blocks.length - 1) {
    html += `<button type="button" id="${ns}-next" class="mk-nav__btn">Volgend blok &#9654;</button>`;
  } else if (o.mode === "builder") {
    if (isLaatsteMogelijk) {
      html += `<button type="button" id="${ns}-finish" class="mk-nav__btn is-primary" ${compleet ? "" : "disabled"}>Rond af</button>`;
    } else {
      html += `<button type="button" id="${ns}-add" class="mk-nav__btn is-primary" ${compleet ? "" : "disabled"}>Nieuw blok &#9654;</button>`;
    }
  }
  html += `</div>`;

  if (o.mode === "viewer") {
    html += `<div class="mk-nav"><button type="button" id="${ns}-finish" class="mk-nav__btn">Overzicht van alle blokken</button></div>`;
  }

  if (!compleet) {
    html += `<p class="empty-hint empty-hint--tight">Vul alle 10 posities (nu ${ingevuld}/10) om verder te kunnen.</p>`;
  }

  if (o.showTableInEditor) {
    html += `<h2 class="section-title">Minutenoverzicht</h2>`;
    html += renderManualMinutesTable(spelers, minutes, posMinutes, targets, playerStates, o.tableStyle);
  }

  if (o.mode === "builder") {
    html += `<button type="button" id="${ns}-reset" class="btn-link mk-reset">Opnieuw beginnen</button>`;
  }

  el.innerHTML = html;
}

// ---- Eindoverzicht (screenshot-vriendelijk) ----
function renderEditorSummary(ctx, minutes, posMinutes, bounds, totaal) {
  const { el, model: m, spelers, targets, playerStates } = ctx;
  const o = ctx.options;
  const ns = o.ns;
  const viewCtx = { pick: null, minutes, targets, showTags: o.showTags, rankOf: o.rankOf, gradId: `mkturf-${ns}` };

  let html = `<div class="mk-summary">
    ${o.extraTop ? o.extraTop(minutes) : ""}
    <div class="mk-nav mk-nav--top">
      <button type="button" id="${ns}-back-edit" class="mk-nav__btn">&#9664; Terug naar bewerken</button>
      <button type="button" id="${ns}-print" class="mk-nav__btn is-primary">Opslaan / printen</button>
    </div>
    <div class="mk-autobar">
      <button type="button" id="${ns}-optimize" class="mk-nav__btn is-primary">Verdeel wisselmomenten eerlijk</button>
      <button type="button" id="${ns}-resetmoments" class="btn-link">Terugzetten naar blokgrenzen</button>
    </div>
    ${m.notice ? `<div class="banner banner--info">${m.notice}</div>` : ""}
    <p class="empty-hint empty-hint--tight">Alles staat hieronder onder elkaar. Standaard wisselt iedereen precies op de blokgrens. "Verdeel wisselmomenten eerlijk" verschuift alleen de <em>tijdstippen</em> van bestaande wissels, nooit wie er wisselt. De computer wisselt daarbij alleen op hele 5 minuten, niet tussen minuut 35 en 55 (de rust zelf mag wel), maximaal 2 per moment en niemand boven zijn max. Zelf mag je met de pijltjes overal heen, per 2,5 minuut. "Opslaan / printen" maakt één A4 met alleen de blokken en de wissels: kies in het printvenster "Opslaan als PDF".</p>`;

  m.blocks.forEach((blok, idx) => {
    const b = bounds[idx];
    html += `<div class="block-card mk-summary-block">
      <div class="block-card__head">
        <span class="block-card__title">Blok ${idx + 1}</span>
        <span class="block-card__minutes">${fmtMin(b.start)}' – ${fmtMin(b.end)}' (${fmtMin(blok.minutes)} min)</span>
      </div>
      <div class="pitch-wrap">${renderManualPitch(blok.lineup, viewCtx)}</div>
      <div class="wissels">${renderManualTransition(m.blocks, idx, m.momentOverrides, bounds)}</div>
    </div>`;
  });

  html += `<h2 class="section-title">Minutenoverzicht</h2>`;
  html += renderManualMinutesTable(spelers, minutes, posMinutes, targets, playerStates, o.tableStyle);
  html += `</div>`;
  el.innerHTML = html;
}
