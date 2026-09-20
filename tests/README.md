# Tests

Deze map bevat het bewijsmateriaal dat de JS-poort exact hetzelfde rekent als
het Python-origineel, plus smoke-tests die de hele app (vinkjes → instellingen
→ genereren → weergave) doorlopen zonder een echte browser nodig te hebben.

De app zelf (`../index.html` etc.) heeft **geen** van deze tools nodig — dit
is uitsluitend voor jou (of Claude Code) om wijzigingen te kunnen verifiëren.

## 1. Cross-validatie: JS vs. Python (het belangrijkste bewijs)

`reference.py` is het Python-bestand waar de JS-poort exact tegen is
uitgelijnd. `scenarios.json` bevat 7 vaste (niet-willekeurige) testscenario's:
een krappe 10-man-selectie die eerlijke minuten moet loslaten, een
structureel tekort aan CV'ers, een brede haalbare selectie van 16, een
1e/2e-helft-beperking die tot een tekort leidt, een scenario met meer dan 4
gelijktijdige wissels, een realistische selectie van 22, en een scenario waar
een te lage "max minuten" de zoektocht laat mislukken.

```bash
python3 dump_python_results.py   # rekent alle scenario's door met het origineel
node test_js_vs_python.js        # rekent dezelfde scenario's door met de JS-poort en vergelijkt
```

Bij een schone poort zie je: `784 checks totaal, 0 gefaald.` Dit vergelijkt
per scenario: de gekozen blokindeling, de volledige opstelling per blok, ieders
streefminuten, de benodigde slack, en dat niemand ooit op een ongeldige
positie (geen favourite/alternative/emergency) terechtkomt.

Eén ding wordt bewust **niet** op exacte gelijkheid getoetst: de precieze
wisselpaar-toewijzing bij een gelijkspel in de score. Getest en aangetoond
(zie `dump_python_results.py` met verschillende `PYTHONHASHSEED`-waarden)
dat het Python-origineel dat zelf al niet stabiel doet, dus dat is geen
porteerfout. Daar wordt in plaats daarvan op getoetst dat het totaal altijd
op 900 minuten uitkomt en er geen negatieve tijdvakken ontstaan.

## 2. Smoke-tests: de hele app, geheadless

```bash
npm install                      # eenmalig, installeert jsdom
node smoke-test.js               # 1 scenario, klikt echt door de UI heen
node smoke-test-scenarios.js     # alle 7 scenario's door de echte UI
```

Dit laadt `index.html` in een headless DOM (jsdom), vinkt spelers aan via de
echte checkboxen, klikt de generatie-knop, en controleert dat er geen
JavaScript-fouten optreden en dat de verwachte content (opstelling, wissels,
tabellen, of de juiste foutmelding) verschijnt.

## 3. Featuretests: wijzig posities, tijdelijke speler, wisselen, timing

```bash
node smoke-test-new-features.js
```

Test end-to-end door de echte UI: het positie-grid (incl. dat categorie-
indeling live meeverandert), een tijdelijke speler toevoegen, handmatig
wisselen via de bank én veld<->veld, de 80-minutengrens voor wissels, het
met de hand verschuiven van één specifiek wisselpaar, dat de "Posities"-
kolom exact optelt tot "Gekregen", en dat sessie-only data (tijdelijke
spelers, positie-overrides, niet manualMomentOverrides/lastResult zelf) een
refresh niet overleeft terwijl de opstelling dat wel doet.

## 4. Ketendetectie en score-referentie

```bash
node test-chain-and-scoring.js
```

Twee dingen die zich niet goed lenen voor de generieke UI-klikflow: een
handgeconstrueerd scenario dat een indirecte positieverschuiving forceert
(controleert dat "Nord (ra) → Dinand (la) [Chris ra → la]" correct herkend
wordt), en een herhaling van het Xander/Stijn-referentiescenario uit dit
gesprek om een regressie op de ongecapte-score-prioritering meteen te
signaleren.

## 5. Eigen (handmatige) opstelling

```bash
node test-manual-lineup.js   # kernlogica: wisselafleiding, minuten, caps, kleuren
node test-manual-ui.js       # volledige flow door de echte UI
```

De eerste test dekt de rekenkant los van de UI, inclusief het scenario waarin
je een eerder blok aanpast en de wissel daardoor verandert of verdwijnt. De
tweede loopt de hele flow door: blok bouwen, duur aanpassen, blok 2 als kopie,
wissel maken en verschuiven, heen en weer navigeren, afronden bij 90 minuten,
en controleren dat de speelminuten optellen tot 900 en dat "Genereer
opstelling" de eigen opstelling niet aanraakt.

## Als je de spelersdatabase of logica aanpast

Wijzig je `js/logic.js` of `js/data.js`? Draai daarna in elk geval
`node test_js_vs_python.js` en `node smoke-test-scenarios.js` opnieuw voordat
je de app gebruikt — dat vangt het merendeel van de fouten die je met het
blote oog mist (zoals de tie-breaking-bug die deze aanpak bij het bouwen zelf
ook al opving).

Wil je een nieuw scenario toevoegen? Voeg een object toe aan `scenarios.json`
(zelfde vorm als de bestaande) en draai stap 1 opnieuw.
