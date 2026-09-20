// =====================================================
// Rendering van het "Eigen"-scherm: zelf blok voor blok een opstelling
// bouwen (klikken i.p.v. slepen), en na 90 minuten een screenshot-
// vriendelijk totaaloverzicht met wissels en minutenoverzicht.
// =====================================================

function mEsc(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function fmtMin(v) {
  const r = Math.round(v * 10) / 10;
  return Number.isInteger(r) ? String(r) : String(r).replace(".", ",");
}

// Kleine "(gespeeld/recht op)" annotatie onder een spelernaam.
// Groen = beide getallen groen; oranje/rood = alleen het gespeelde getal
// kleurt, het recht-op-getal blijft zwart.
function minuteTag(gespeeld, target) {
  const cls = ManualLineup.diffClass(gespeeld, target);
  const targetCls = cls === "mk-green" ? "mk-green" : "mk-plain";
  return `<span class="mk-tag">(<span class="${cls}">${fmtMin(gespeeld)}</span>/<span class="${targetCls}">${fmtMin(target)}</span>)</span>`;
}

// ---- Veld voor de bouwer ----
function renderManualPitch(lineup, ctx) {
  const W = 320, H = 400;
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
      const w = 86, h = 40;
      const label = pos.replace(/\d/, "").toUpperCase();

      let binnen;
      if (leeg) {
        binnen = `<text x="${x}" y="${row.y + 5}" text-anchor="middle" font-size="16" class="mk-empty-plus">+</text>`;
      } else {
        const g = ctx.minutes[naam] || 0;
        const t = ctx.targets[naam] || 0;
        const cls = ManualLineup.diffClass(g, t);
        const tCls = cls === "mk-green" ? cls : "mk-plain-svg";
        const fs = naam.length > 10 ? 10.5 : 12;
        binnen =
          `<text x="${x}" y="${row.y - 1}" text-anchor="middle" font-size="${fs}" font-weight="700" class="mk-chip-name">${mEsc(naam)}</text>` +
          `<text x="${x}" y="${row.y + 12}" text-anchor="middle" font-size="9.5" class="mk-chip-min">` +
          `<tspan class="${cls}-svg">${fmtMin(g)}</tspan><tspan class="mk-plain-svg">/${fmtMin(t)}</tspan></text>`;
      }

      chips += `<g class="mk-slot${geselecteerd ? " is-picked" : ""}${leeg ? " is-empty" : ""}" data-mk-slot="${pos}">
        <text x="${x}" y="${row.y - h / 2 - 5}" class="mk-pos-label" text-anchor="middle">${label}</text>
        <rect x="${x - w / 2}" y="${row.y - h / 2}" width="${w}" height="${h}" rx="9" class="mk-chip-bg"/>
        ${binnen}
      </g>`;
    }
  }

  return `<svg class="pitch-svg" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
    <defs><linearGradient id="mkturf" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#14503B"/><stop offset="1" stop-color="#0F3D2E"/>
    </linearGradient></defs>
    <rect width="${W}" height="${H}" fill="url(#mkturf)"/>
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
  const chips = beschikbaar.map((naam) => {
    const g = ctx.minutes[naam] || 0;
    const t = ctx.targets[naam] || 0;
    const gekozen = ctx.pick && ctx.pick.bench === naam;
    return `<button type="button" class="mk-bench-chip${gekozen ? " is-picked" : ""}" data-mk-bench="${mEsc(naam)}">
      <span class="mk-bench-name">${mEsc(naam)}</span>${minuteTag(g, t)}
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

  // Groepeer per moment, zodat gelijktijdige wissels bij elkaar staan.
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
        <button type="button" class="wissel-shift" data-mk-dir="-1" aria-label="eerder">&#9664;</button>
        <span class="wissel-row__tekst">${tekst}</span>
        <button type="button" class="wissel-shift" data-mk-dir="1" aria-label="later">&#9654;</button>
      </div>`;
    }
    html += `</div>`;
  }
  return html;
}

// ---- Minutenoverzicht (zelfde opbouw als bij "Opstelling") ----
function renderManualMinutesTable(spelers, minutes, posMinutes, targets, playerStates) {
  const rows = spelers.map((p) => {
    const g = minutes[p] || 0;
    const t = targets[p] || 0;
    const pm = posMinutes[p] || {};
    return {
      speler: p,
      training: playerStates[p] ? playerStates[p].training : 2,
      target: t,
      gekregen: g,
      posities: Object.entries(pm).map(([k, v]) => `${k}:${fmtMin(v)}`).join(", "),
    };
  });
  rows.sort((a, b) => b.training - a.training || b.gekregen - a.gekregen);

  let html = `<div class="data-table-wrap"><table class="data-table"><thead><tr>
    <th>Speler</th><th>Train.</th><th>Recht op</th><th>Gekregen</th><th>Verschil</th><th>Posities</th>
  </tr></thead><tbody>`;
  for (const r of rows) {
    const cls = ManualLineup.diffClass(r.gekregen, r.target);
    const d = r.gekregen - r.target;
    html += `<tr>
      <td>${mEsc(r.speler)}</td>
      <td class="num">${r.training}x</td>
      <td class="num">${fmtMin(r.target)}'</td>
      <td class="num ${cls}">${fmtMin(r.gekregen)}'</td>
      <td class="num ${cls}">${d > 0 ? "+" : ""}${fmtMin(d)}'</td>
      <td>${mEsc(r.posities)}</td>
    </tr>`;
  }
  return html + `</tbody></table></div>`;
}

// =====================================================
// Hoofdweergave
// =====================================================
function renderManualScreen(state, ctx) {
  const el = document.getElementById("manual-content");
  const m = state.manual;
  const spelers = getSelectedNames(state);

  if (spelers.length < 10) {
    el.innerHTML = `<div class="banner banner--info">Selecteer eerst minstens 10 spelers op het <strong>Team</strong>-tabblad. Daarna kun je hier zelf een opstelling bouwen.</div>`;
    return;
  }

  const targets = ManualLineup.computeTargets(spelers, state.players, state.bonus0, state.bonus1);
  const { minutes, posMinutes } = ManualLineup.computeMinutes(m.blocks, m.momentOverrides);
  const bounds = ManualLineup.blockBounds(m.blocks);
  const totaal = ManualLineup.totalMinutes(m.blocks);

  if (m.finished) {
    renderManualSummary(el, state, spelers, targets, minutes, posMinutes, bounds);
    return;
  }

  const idx = m.currentBlock;
  const blok = m.blocks[idx];
  const b = bounds[idx];

  // Wie mag in dit blok op de bank staan: geselecteerd, nog niet opgesteld,
  // en beschikbaar gezien zijn 1e/2e-helft-instelling.
  const opgesteld = new Set(Object.values(blok.lineup).filter(Boolean));
  const beschikbaar = spelers.filter((p) =>
    !opgesteld.has(p) && ManualLineup.availableInBlock(state.players[p], b.start)
  );

  const ingevuld = Object.values(blok.lineup).filter(Boolean).length;
  const compleet = ingevuld === ManualLineup.FIELD_POSITIONS.length;
  const isLaatsteMogelijk = totaal >= ManualLineup.TOTAL_MATCH_MINUTES - 0.001;

  let html = `
    <div class="mk-blockbar">
      <div class="mk-blockbar__row">
        <strong>Blok ${idx + 1}</strong>
        <span class="mk-blockbar__range">${fmtMin(b.start)}' – ${fmtMin(b.end)}'</span>
      </div>
      <div class="mk-blockbar__row">
        <label class="field field--inline">
          <span>Duur</span>
          <input type="number" id="mk-duration" min="2.5" max="90" step="2.5" value="${blok.minutes}" inputmode="decimal"/>
          <span>min</span>
        </label>
        <span class="mk-total ${totaal > ManualLineup.TOTAL_MATCH_MINUTES + 0.001 ? "is-over" : ""}">
          totaal ${fmtMin(totaal)}/90'
        </span>
      </div>
    </div>`;

  if (totaal > ManualLineup.TOTAL_MATCH_MINUTES + 0.001) {
    html += `<div class="banner banner--warn">De blokken tellen samen op tot meer dan 90 minuten. Verkort een blok voordat je afrondt.</div>`;
  }

  html += `<div class="block-card">
    <div class="pitch-wrap">${renderManualPitch(blok.lineup, { pick: m.pick, minutes, targets })}</div>
    ${renderManualBench(beschikbaar, { pick: m.pick, minutes, targets })}
    ${idx > 0 ? `<div class="wissels">${renderManualTransition(m.blocks, idx, m.momentOverrides, bounds)}</div>` : ""}
  </div>`;

  html += `<div class="mk-nav">
    <button type="button" id="mk-prev" class="mk-nav__btn" ${idx === 0 ? "disabled" : ""}>&#9664; Vorig blok</button>`;

  if (idx < m.blocks.length - 1) {
    html += `<button type="button" id="mk-next" class="mk-nav__btn">Volgend blok &#9654;</button>`;
  } else if (isLaatsteMogelijk) {
    html += `<button type="button" id="mk-finish" class="mk-nav__btn is-primary" ${compleet ? "" : "disabled"}>Rond af</button>`;
  } else {
    html += `<button type="button" id="mk-add" class="mk-nav__btn is-primary" ${compleet ? "" : "disabled"}>Nieuw blok &#9654;</button>`;
  }
  html += `</div>`;

  if (!compleet) {
    html += `<p class="empty-hint empty-hint--tight">Vul alle 10 posities (nu ${ingevuld}/10) om verder te kunnen.</p>`;
  }

  html += `<button type="button" id="mk-reset" class="btn-link mk-reset">Opnieuw beginnen</button>`;

  el.innerHTML = html;
}

// ---- Eindoverzicht (screenshot-vriendelijk) ----
function renderManualSummary(el, state, spelers, targets, minutes, posMinutes, bounds) {
  const m = state.manual;
  let html = `<div class="mk-summary">
    <div class="mk-nav mk-nav--top">
      <button type="button" id="mk-back-edit" class="mk-nav__btn">&#9664; Terug naar bewerken</button>
      <button type="button" id="mk-print" class="mk-nav__btn is-primary">Opslaan / printen</button>
    </div>
    <p class="empty-hint empty-hint--tight">Alles staat hieronder onder elkaar, klaar om te fotograferen of te printen. Wisselmomenten pas je aan met de pijltjes; het minutenoverzicht rekent meteen mee.</p>`;

  m.blocks.forEach((blok, idx) => {
    const b = bounds[idx];
    html += `<div class="block-card mk-summary-block">
      <div class="block-card__head">
        <span class="block-card__title">Blok ${idx + 1}</span>
        <span class="block-card__minutes">${fmtMin(b.start)}' – ${fmtMin(b.end)}' (${fmtMin(blok.minutes)} min)</span>
      </div>
      <div class="pitch-wrap">${renderManualPitch(blok.lineup, { pick: null, minutes, targets })}</div>
      <div class="wissels">${renderManualTransition(m.blocks, idx, m.momentOverrides, bounds)}</div>
    </div>`;
  });

  html += `<h2 class="section-title">Minutenoverzicht</h2>`;
  html += renderManualMinutesTable(spelers, minutes, posMinutes, targets, state.players);
  html += `</div>`;
  el.innerHTML = html;
}
