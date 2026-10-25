// Hulpfuncties en meldingen voor het resultatenscherm. De opstelling zelf
// wordt getekend door de gedeelde bewerker in render-manual.js.

function esc(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function baseOf(pos) {
  return pos.startsWith("cm") || pos.startsWith("cv") ? pos.slice(0, 2) : pos;
}

function verschilCell(diff) {
  const rounded = Math.round(diff);
  const abs = Math.abs(rounded);
  if (abs <= 4) return `<td class="num diff-ok" title="${rounded > 0 ? "+" : ""}${rounded}'">&#10003;</td>`;
  const cls = abs >= 10 ? "diff-red" : "diff-orange";
  return `<td class="num ${cls}">${rounded > 0 ? "+" : ""}${rounded}'</td>`;
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
