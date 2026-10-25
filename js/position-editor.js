// =====================================================
// Herbruikbaar positie-grid: 3 rijen (Favourite / Alternative / Emergency)
// x 7 posities (SP/CV/CM/LB/RB/LA/RA). Een positie kan maar in EEN van de
// drie rijen actief zijn per speler (net als hoe position_rank() het ook
// gebruikt: favourite wint van alternative wint van emergency, dus een
// positie in twee rijen tegelijk zou alleen maar een dode, onbereikbare
// tweede vermelding zijn). Klikken op een actieve cel zet 'm weer uit.
// =====================================================

const POSITION_EDITOR_POSITIONS = ["sp", "cv", "cm", "lb", "rb", "la", "ra"];
const POSITION_EDITOR_TIERS = [
  { key: "favourite", label: "Favourite" },
  { key: "alternative", label: "Alternative" },
  { key: "emergency", label: "Emergency" },
];

function clonePositionProfile(profile) {
  return {
    favourite: [...(profile?.favourite || [])],
    alternative: [...(profile?.alternative || [])],
    emergency: [...(profile?.emergency || [])],
  };
}

function tierOf(profile, pos) {
  if (profile.favourite.includes(pos)) return "favourite";
  if (profile.alternative.includes(pos)) return "alternative";
  if (profile.emergency.includes(pos)) return "emergency";
  return null;
}

function setTier(profile, pos, tier) {
  for (const t of ["favourite", "alternative", "emergency"]) {
    profile[t] = profile[t].filter((p) => p !== pos);
  }
  if (tier) profile[tier].push(pos);
}

// Rendert het grid in `container` voor `profile` (wordt in-place aangepast).
// Roept onChange() aan na elke wijziging zodat de aanroeper opnieuw kan
// renderen/opslaan.
function renderPositionGrid(container, profile, onChange) {
  let html = `<table class="pos-grid"><thead><tr><th></th>`;
  for (const pos of POSITION_EDITOR_POSITIONS) html += `<th>${pos.toUpperCase()}</th>`;
  html += `</tr></thead><tbody>`;
  for (const tier of POSITION_EDITOR_TIERS) {
    html += `<tr><th class="pos-grid__tier">${tier.label}</th>`;
    for (const pos of POSITION_EDITOR_POSITIONS) {
      const active = tierOf(profile, pos) === tier.key;
      html += `<td><button type="button" class="pos-grid__cell${active ? " is-active" : ""}" data-pos="${pos}" data-tier="${tier.key}" aria-pressed="${active}"></button></td>`;
    }
    html += `</tr>`;
  }
  html += `</tbody></table>`;
  container.innerHTML = html;

  container.querySelectorAll(".pos-grid__cell").forEach((btn) => {
    btn.addEventListener("click", () => {
      const pos = btn.dataset.pos;
      const tier = btn.dataset.tier;
      const current = tierOf(profile, pos);
      setTier(profile, pos, current === tier ? null : tier);
      renderPositionGrid(container, profile, onChange);
      onChange();
    });
  });
}

// ---- Generieke modal (bottom sheet) ----
function openModal(title, bodyBuilder) {
  const overlay = document.getElementById("modal-overlay");
  const titleEl = document.getElementById("modal-title");
  const body = document.getElementById("modal-body");
  titleEl.textContent = title;
  body.innerHTML = "";
  bodyBuilder(body);
  overlay.hidden = false;
}

function closeModal() {
  document.getElementById("modal-overlay").hidden = true;
  document.getElementById("modal-body").innerHTML = "";
}
