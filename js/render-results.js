// =====================================================
// Rendering van het "Opstelling"-scherm: banners, per blok een veld-diagram
// + bank + wissels (met verschuifknoppen), en het minutenoverzicht.
// =====================================================

function esc(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function baseOf(pos) {
  return pos.startsWith("cm") || pos.startsWith("cv") ? pos.slice(0, 2) : pos;
}

// ---- Veld-diagram ----
function buildDisplayMap(posMap, players) {
  const display = { ...posMap };
  for (const [left, right] of [["lb", "rb"], ["la", "ra"]]) {
    const pLeft = posMap[left];
    const pRight = posMap[right];
    if (!pLeft || !pRight) continue;
    const favLeft = (players[pLeft] || {}).favourite || [];
    const favRight = (players[pRight] || {}).favourite || [];
    if (favLeft.includes(baseOf(right)) && favRight.includes(baseOf(left))) {
      display[left] = pRight;
      display[right] = pLeft;
    }
  }
  return display;
}

function chipSVG(x, y, w, h, label, name, pos, block, ineligible, isPicked, isSwapTarget) {
  const nameFontSize = name.length > 9 ? 11 : 12.5;
  let groupClass = "pitch-chip-group";
  if (isPicked) groupClass += " is-picked-field";
  else if (isSwapTarget) groupClass += " is-swap-target";
  return `
    <g class="${groupClass}" data-swap-target="pitch" data-block="${esc(block)}" data-pos="${esc(pos)}" data-player="${esc(name)}">
      <text x="${x}" y="${y - h / 2 - 5}" class="pitch-label" text-anchor="middle">${esc(label)}</text>
      <rect x="${x - w / 2}" y="${y - h / 2}" width="${w}" height="${h}" rx="9" class="pitch-chip"/>
      <text x="${x}" y="${y + 4}" text-anchor="middle" font-size="${nameFontSize}" font-weight="700"
            textLength="${name.length > 10 ? w - 14 : ""}" lengthAdjust="spacingAndGlyphs" class="pitch-chip__name">${esc(name)}</text>
      ${ineligible ? `<text x="${x + w / 2 - 3}" y="${y - h / 2 + 11}" text-anchor="middle" font-size="12" class="pitch-warn">!</text>` : ""}
    </g>`;
}

function renderPitchSVG(posMap, players, block, swapPick) {
  const display = buildDisplayMap(posMap, players);
  const W = 320, H = 380;
  const rows = [
    { y: 66, slots: [["lb", 62], ["sp", 160], ["rb", 258]] },
    { y: 196, slots: [["cm1", 62], ["cm2", 160], ["cm3", 258]] },
    { y: 322, slots: [["la", 46], ["cv1", 127], ["cv2", 193], ["ra", 274]] },
  ];

  let chips = "";
  for (const row of rows) {
    for (const [pos, x] of row.slots) {
      const name = display[pos];
      if (!name) continue;
      const ineligible = OpstellingLogic.positionRank(name, pos, players) === 999;
      const isPicked = !!swapPick && swapPick.block === block && swapPick.pos === pos;
      const isSwapTarget = !!swapPick && swapPick.block === block && !isPicked;
      chips += chipSVG(x, row.y, 84, 34, pos.replace(/\d/, "").toUpperCase(), name, pos, block, ineligible, isPicked, isSwapTarget);
    }
  }

  return `
  <svg class="pitch-svg" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="turf" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#14503B"/>
        <stop offset="1" stop-color="#0F3D2E"/>
      </linearGradient>
      <style>
        .pitch-chip { fill:#F4FBF6; stroke:#C79A34; stroke-width:1.4; }
        .pitch-chip__name { fill:#12261C; }
        .pitch-label { fill:#B7CFC0; font-size:9.5px; font-weight:800; letter-spacing:.06em; }
      </style>
    </defs>
    <rect width="${W}" height="${H}" fill="url(#turf)"/>
    ${[1,2,3,4,5,6].map((i) => `<rect x="0" y="${(i-1)*H/6}" width="${W}" height="${H/6}" fill="#ffffff" opacity="${i % 2 ? 0.02 : 0}"/>`).join("")}
    <rect x="14" y="14" width="${W-28}" height="${H-28}" fill="none" stroke="#3E7A5F" stroke-width="1.5"/>
    <line x1="14" y1="${H/2+30}" x2="${W-14}" y2="${H/2+30}" stroke="#3E7A5F" stroke-width="1.5"/>
    <circle cx="${W/2}" cy="${H/2+30}" r="42" fill="none" stroke="#3E7A5F" stroke-width="1.5"/>
    <path d="M ${W/2-70} ${H-14} v-46 h140 v46" fill="none" stroke="#3E7A5F" stroke-width="1.5"/>
    ${chips}
  </svg>`;
}

// ---- Bank ----
function renderBenchHTML(block, benchPlayers, swapPick) {
  if (!benchPlayers.length) {
    return `<div class="bench"><div class="bench__label">Bank</div><p class="bench__empty">Iedereen staat dit blok op het veld.</p></div>`;
  }
  const chips = benchPlayers.map((p) => {
    const picked = swapPick && swapPick.block === block && swapPick.name === p && swapPick.pos === null;
    return `<button type="button" class="bench-chip${picked ? " is-picked" : ""}" data-swap-target="bench" data-block="${esc(block)}" data-player="${esc(p)}">${esc(p)}</button>`;
  }).join("");
  return `<div class="bench"><div class="bench__label">Bank</div><div class="bench-grid">${chips}</div></div>`;
}

// ---- Wissels (met positie van de inkomende speler + verschuifknoppen) ----
function renderWisselsHTML(view) {
  if (view.isFirst) {
    return `<p class="wissels__empty">Eerste blok — iedereen erin.</p>`;
  }
  if (view.geenWissels || !view.timeSlots || view.timeSlots.length === 0) {
    return `<p class="wissels__empty">Geen logische wissels berekend.</p>`;
  }
  // pairs: [inkomend, uitgaand, positieInkomend, keten|null]
  const infoVoorPaar = {};
  for (const [i, o, posI, keten] of view.pairs) infoVoorPaar[OpstellingSubs.pairKey(i, o)] = { posI, keten };

  let html = "";
  for (const m of view.timeSlots) {
    const pairs = view.momentPlan[m];
    if (!pairs || !pairs.length) continue;
    html += `<div class="wissel-moment"><div class="wissel-moment__min">Minuut ${m}</div>`;
    for (const [i, o] of pairs) {
      const info = infoVoorPaar[OpstellingSubs.pairKey(i, o)] || {};
      const posI = info.posI;
      const keten = info.keten;
      const baseI = posI ? baseOf(posI) : null;

      let tekst;
      if (keten) {
        // I komt niet letterlijk op O's oude plek: toon beide posities apart
        // + wie de tussenliggende verschuiving maakte.
        tekst = `<span class="in">${esc(i)}</span> <span class="wissel-pos">(${esc(baseI)})</span>
          <span class="arrow">&rarr;</span>
          <span class="out">${esc(o)}</span> <span class="wissel-pos">(${esc(keten.van)})</span>
          <span class="wissel-keten">[${esc(keten.naam)} ${esc(keten.van)} &rarr; ${esc(keten.naar)}]</span>`;
      } else {
        tekst = `<span class="in">${esc(i)}</span><span class="arrow">&rarr;</span><span class="out">${esc(o)}</span>${baseI ? ` <span class="wissel-pos">(${esc(baseI)})</span>` : ""}`;
      }

      const key = OpstellingSubs.pairKey(i, o);
      html += `<div class="wissel-row" data-block="${esc(view.blockName)}" data-pairkey="${esc(key)}">
        <button type="button" class="wissel-shift" data-dir="-5" aria-label="5 minuten eerder">&#9664;</button>
        <span class="wissel-row__tekst">${tekst}</span>
        <button type="button" class="wissel-shift" data-dir="5" aria-label="5 minuten later">&#9654;</button>
      </div>`;
    }
    html += `</div>`;
  }
  return html || `<p class="wissels__empty">Geen wissels dit blok.</p>`;
}

// ---- Minutenoverzicht ----
function verschilCell(diff) {
  const rounded = Math.round(diff);
  const abs = Math.abs(rounded);
  if (abs <= 4) return `<td class="num diff-ok" title="${rounded > 0 ? "+" : ""}${rounded}'">&#10003;</td>`;
  const cls = abs >= 10 ? "diff-red" : "diff-orange";
  return `<td class="num ${cls}">${rounded > 0 ? "+" : ""}${rounded}'</td>`;
}

function renderMinutesTable(selectie, targets, trainingCounts, allActiveIntervals, blocks, schedule) {
  const gekregen = {};
  const posMinutes = {};
  for (const p of selectie) { gekregen[p] = 0; posMinutes[p] = {}; }

  for (const [sp, pos, start, end] of allActiveIntervals) {
    if (!(sp in gekregen)) continue;
    const dur = end - start;
    gekregen[sp] += dur;
    if (pos) {
      const base = baseOf(pos);
      posMinutes[sp][base] = (posMinutes[sp][base] || 0) + dur;
    }
  }

  const rows = selectie.map((p) => ({
    speler: p,
    trainingen: trainingCounts[p],
    rechtOp: targets[p],
    gekregen: gekregen[p],
    verschil: gekregen[p] - targets[p],
    posities: Object.entries(posMinutes[p]).map(([k, v]) => `${k}:${Math.round(v)}`).join(", "),
  }));
  rows.sort((a, b) => b.trainingen - a.trainingen || b.gekregen - a.gekregen);

  let html = `<div class="data-table-wrap"><table class="data-table"><thead><tr>
    <th>Speler</th><th>Train.</th><th>Recht op</th><th>Gekregen</th><th>Verschil</th><th>Posities</th>
  </tr></thead><tbody>`;
  for (const r of rows) {
    html += `<tr>
      <td>${esc(r.speler)}</td>
      <td class="num">${r.trainingen}x</td>
      <td class="num">${Math.round(r.rechtOp)}'</td>
      <td class="num">${Math.round(r.gekregen)}'</td>
      ${verschilCell(r.verschil)}
      <td>${esc(r.posities)}</td>
    </tr>`;
  }
  html += `</tbody></table></div>`;
  return html;
}

// ---- Banners ----
function renderShortageBanner(shortages) {
  let items = "";
  for (const [helft, tekorten] of Object.entries(shortages)) {
    for (const [basis, aantal] of tekorten) {
      items += `<li>Je hebt nog <strong>${aantal}x ${basis.toUpperCase()}</strong> nodig voor de <strong>${esc(helft)}</strong> (niemand met favourite, alternative of emergency op deze positie is in die helft beschikbaar).</li>`;
    }
  }
  return `<div class="banner banner--error">
    <strong>Deze selectie kan onmogelijk een volledige opstelling vullen</strong> — dat lost geen wissel of extra/minder speeltijd op.
    <ul>${items}</ul>
  </div>
  <div class="banner banner--info">Los dit op door een speler toe te voegen die deze positie kan spelen (evt. tijdelijk), of door bij een speler de 1e/2e helft-beperking uit te zetten.</div>`;
}

function renderNoScheduleBanner() {
  return `<div class="banner banner--error">
    <strong>Geen opstelling gevonden</strong>, ook niet met extra/minder speeltijd toestaan.
  </div>
  <div class="banner banner--info">Dit ligt vermoedelijk aan de ingestelde <strong>max minuten</strong> per speler — controleer of die niet te streng zijn voor spelers die veel nodig zijn.</div>`;
}

function renderSlackWarning(selectie, targets, mins, slackUsed) {
  if (slackUsed <= OpstellingLogic.SLACK_LEVELS[0]) return "";
  const afwijkingen = selectie
    .map((p) => [p, mins[p] - targets[p]])
    .filter(([, d]) => Math.abs(d) >= 5)
    .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
  if (!afwijkingen.length) return "";
  const lijst = afwijkingen.map(([p, d]) => `${esc(p)} (${d > 0 ? "+" : ""}${Math.round(d)} min)`).join("; ");
  return `<div class="banner banner--warn"><strong>Een exact eerlijke verdeling paste niet</strong> bij deze selectie/instellingen. Om toch een volledige opstelling te maken, spelen deze spelers meer of minder dan hun streefminuten: ${lijst}.</div>`;
}

// ---- Volledige resultaatweergave ----
function renderResults(payload, swapPick) {
  const el = document.getElementById("results-content");

  if (payload.type === "shortage") {
    el.innerHTML = renderShortageBanner(payload.shortages);
    return;
  }
  if (payload.type === "no-schedule") {
    el.innerHTML = renderNoScheduleBanner();
    return;
  }

  const { selectie, blocks, schedule, targets, mins, slackUsed, trainingCounts, timeline, players } = payload;

  let html = "";
  html += renderSlackWarning(selectie, targets, mins, slackUsed);

  html += `<div class="blocks-summary">${blocks.map(([n, m]) => `<span class="block-chip">${esc(n)} &middot; ${Math.round(m)}'</span>`).join("")}</div>`;

  blocks.forEach(([bn, bm], idx) => {
    const view = timeline.blockViews[idx];
    const bench = selectie.filter((p) => !Object.values(schedule[bn]).includes(p));
    html += `<div class="block-card">
      <div class="block-card__head">
        <span class="block-card__title">Blok ${esc(bn)}</span>
        <span class="block-card__minutes">${Math.round(bm)} min</span>
      </div>
      <div class="pitch-wrap">${renderPitchSVG(schedule[bn], players, bn, swapPick)}</div>
      ${renderBenchHTML(bn, bench, swapPick)}
      <div class="wissels">${renderWisselsHTML(view)}</div>
    </div>`;
  });

  html += `<h2 class="section-title">Minutenoverzicht</h2>`;
  html += renderMinutesTable(selectie, targets, trainingCounts, timeline.allActiveIntervals, blocks, schedule);

  el.innerHTML = html;
}
