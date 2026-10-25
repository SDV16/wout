// =====================================================
// De door de computer gegenereerde opstelling omzetten naar hetzelfde
// bewerkbare model als de "Eigen" opstelling (blokken met een duur en een
// opstelling), zodat beide tabbladen dezelfde bewerker gebruiken.
//
// De computer houdt zich bij het MAKEN aan strikte regels (max 2 wissels per
// 5 minuten, niemand boven zijn max, geen wissels na minuut 80). Daarna is de
// opstelling voor de gebruiker volledig vrij te bewerken.
// =====================================================

(function (root) {
  const AUTO_LATEST_MOMENT = 80;

  function buildAutoModel(result, playerStates) {
    const blocks = result.blocks.map(([naam, minuten]) => ({
      minutes: minuten,
      lineup: Object.assign(ManualLineup.emptyLineup(), result.schedule[naam]),
    }));

    const selectie = result.selectie.slice();
    const states = {};
    const positions = {};
    for (const p of selectie) {
      const st = (playerStates && playerStates[p]) || {};
      states[p] = {
        training: result.trainingCounts && result.trainingCounts[p] !== undefined ? result.trainingCounts[p] : (st.training !== undefined ? st.training : 2),
        firstHalf: !!st.firstHalf,
        secondHalf: !!st.secondHalf,
        maxMinutes: st.maxMinutes !== undefined ? st.maxMinutes : 90,
      };
      if (result.players && result.players[p]) positions[p] = result.players[p];
    }

    const model = {
      blocks,
      currentBlock: 0,
      momentOverrides: {},
      finished: false,
      selectie,
      // De generator rekent intern met exacte streefgetallen; in de bewerker
      // tonen en gebruiken we 'recht op' als heel getal.
      targets: ManualLineup.roundTargets(result.targets),
      playerStates: states,
      positions,
      slackUsed: result.slackUsed,
    };

    // Startpunt: de computer verdeelt de wisselmomenten zelf eerlijk, volgens
    // zijn eigen regels.
    const caps = ManualLineup.computeCaps(selectie, states);
    model.momentOverrides = ManualLineup.optimizeMoments(
      model.blocks, model.targets, caps, { maxMoment: AUTO_LATEST_MOMENT }
    ).overrides;
    return model;
  }

  const AutoLineup = { AUTO_LATEST_MOMENT, buildAutoModel };
  if (typeof module !== "undefined") module.exports = AutoLineup;
  else root.AutoLineup = AutoLineup;
})(typeof window !== "undefined" ? window : globalThis);
