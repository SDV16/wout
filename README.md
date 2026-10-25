# Opstelling Generator — offline PWA

Volledig offline opstelling-generator voor het jeugdteam: eerlijke minuten,
dynamische wisselblokken, positie-eisen (favourite/alternative/emergency),
haalbaarheidscheck en wisselplanning. Geen server, geen backend, geen accounts
— alles draait lokaal in de browser/app.

Dit project is een 1-op-1 poort van de Streamlit-versie naar vanilla
HTML/CSS/JS. De kernlogica is regel-voor-regel overgezet en cross-getest
tegen het originele Python-bestand (zie `tests/`) — **784 van de 784 checks**
komen exact overeen: blokindeling, streefminuten, opstelling per blok,
positie-eisen, slack-niveaus en haalbaarheidscheck zijn bit-voor-bit gelijk
aan het origineel.

## Snel proberen

Geen installatie, geen build-stap nodig:

```
# vanuit deze map:
python3 -m http.server 8000
# open http://localhost:8000 in een browser
```

(of open `index.html` gewoon direct in een browser — alles werkt ook zonder
lokale server, al is `http(s)://` wel vereist voor de PWA-installatie en de
service worker.)

## Op je Android-telefoon zetten (PWA)

1. Host deze map ergens bereikbaar voor je telefoon: het makkelijkst is een
   gratis statische host zoals GitHub Pages, Netlify of Vercel (sleep de map
   erin); dat kan ook met alleen deze bestanden, zonder build-stap.
2. Open die URL in Chrome op Android.
3. Menu (⋮) → **App installeren** / **Toevoegen aan startscherm**.
4. Klaar — het verschijnt als een eigen app-icoon en werkt vanaf dat moment
   volledig offline (de service worker cachet de hele app bij de eerste keer
   laden).

**Een nieuwe versie uploaden?** Verhoog dan `CACHE_NAME` bovenaan
`service-worker.js` (bv. `opstelling-app-v5`). De app haalt bij internet altijd
de nieuwste bestanden op en valt zonder internet terug op de cache, dus oude en
nieuwe bestanden komen niet meer door elkaar. Het versienummer bovenin de app
laat zien welke versie je draait. Gaat er toch iets mis, dan verschijnt er een
melding met de knop "Verse versie laden" (je opgeslagen opstellingen en
instellingen blijven bewaard).

## Naar een echte `.apk`

Deze PWA is met opzet framework-vrij (geen React/build-stap), wat 'm geschikt
maakt om te wrappen. Twee bruikbare routes zodra de app ergens gehost is:

- **PWABuilder** (pwabuilder.com): URL invullen, "Package for Android" — geeft
  een kant-en-klare (signed of unsigned) APK/AAB terug, geen Android Studio
  nodig.
- **Bubblewrap** (Google's officiële CLI) of **Android Studio** lokaal, als je
  zelf de controle over signing/build wilt houden.

## Projectstructuur

```
index.html              app-shell
manifest.json           PWA-manifest (icoon, naam, standalone-modus)
service-worker.js       offline caching
css/style.css           vormgeving
js/data.js              spelersdatabase (PLAYERS)
js/logic.js             kernalgoritme: 1-op-1 poort van reference.py
js/state.js             state + localStorage-persistentie
js/manual-lineup.js     rekenkant van de bewerkbare opstelling: wissels afleiden,
                        minuten, blokduur, eerlijke wisselmomenten
js/auto-lineup.js       zet het gegenereerde resultaat om naar dat bewerkbare model
js/render-team.js       scherm 1: spelers selecteren + instellingen
js/render-results.js    meldingen voor het resultatenscherm (tekort, geen oplossing)
js/render-manual.js     de gedeelde bewerker (tabbladen "Opstelling" en "Eigen")
js/app.js               wiring: tabs, generatie-knop, bewerker-interacties
icons/                  app-iconen (+ bron-SVG)
tests/                  zie tests/README.md
```

## De spelersdatabase aanpassen

Spelers, favourite/alternative/emergency-posities: alles staat in
`js/data.js` (`PLAYERS`-object), exact dezelfde structuur als het
Python-origineel. Wijzig daar, geen andere bestanden hoeven aangepast.

## Wat bewust ongewijzigd bleef vs. wat moest wijzigen

- **Ongewijzigd**: alle scoring-structuur, ranking, bipartite matching,
  slack-niveaus, blokgenerator, positie-swap-optimalisatie (bitmask-DP) —
  1-op-1 dezelfde opzet, cross-getest.
- **Gefixt tijdens het porten**: `compute_dynamic_position_order` tie-breaking
  (zie git-historie / eerdere versie van dit bestand).
- **Twee algoritme-verbeteringen** (doorgevoerd in zowel `js/logic.js` als
  `tests/reference.py`, dus in sync en samen gevalideerd):
  1. De score-functie vergeleek tot voor kort *absolute* minuten. Een speler
     met een laag streefgetal (door "Max minuten" of weinig trainingen) leek
     daardoor vroeg in de wedstrijd al "verzadigd", zelfs met 0 gespeelde
     minuten - waardoor die zijn EIGEN favourite-positie kon verliezen aan
     een minder passende speler met een hoger streefgetal. Nu wordt relatieve
     vervulling (% van eigen streefgetal) gebruikt.
  2. "Max minuten" werd pas ÁCHTERAF gecontroleerd (heel blok laten mislukken
     als iemand erover ging), niet tijdens het kiezen zelf. Nu wordt dit
     proactief uitgesloten bij het verzamelen van kandidaten, zodat de
     backtracking gewoon een alternatief probeert.
- **Bekend, niet op te lossen verschil**: bij een gelijkspel in de
  wisselpaar-toewijzing (wie wisselt met wie) kan de exacte uitkomst afwijken
  van één specifieke Python-run. Dit komt doordat het origineel daar
  `list(set_a - set_b)` gebruikt, en Python's set-volgorde voor tekst is
  hash-gebaseerd en dus zelf al niet stabiel tussen runs (aangetoond in
  `tests/`: dezelfde input met een andere `PYTHONHASHSEED` gaf al andere
  paren in het origineel). De JS-versie is wel intern consistent en
  reproduceerbaar (dezelfde input geeft altijd dezelfde uitkomst).

## Nieuwe features

**Wijzig posities per speler** — in "Instellingen per speler" staat een
knop "Wijzig posities" die een grid opent (Favourite/Alternative/Emergency ×
alle posities). Handig als je als coach denkt dat iemand ergens ook zou
kunnen spelen, ook al staat dat niet zo in de database. Geldt alleen op dit
apparaat en verdwijnt bij het verversen van de pagina (bewust, zodat de
"echte" database-instelling niet per ongeluk blijvend verandert).

**Tijdelijke speler toevoegen** — knop onderaan het team-scherm. Voor iemand
die één keer meedoet maar niet in de vaste selectie zit. Zelfde grid om
posities te kiezen, verdwijnt ook bij het verversen van de pagina.

**De Opstelling is vrij te bewerken** — na "Genereer opstelling" zie je de
blokken één voor één ("Blok 2 van 5", met Vorig/Volgend blok) en kun je alles
aanpassen, net als bij "Eigen":
- *Wissels maken:* tik een speler aan (bank óf veld) en daarna een ander.
  Bank → veld, veld → bank en veld ↔ veld (twee spelers ruilen van plek) werken
  allemaal. Een speler op een positie waar hij niets mee kan krijgt een "!".
- *Blokduur:* met − / + of door te typen (bv. `22,5`). Omdat de opstelling al
  90 minuten vult, verschuift hierbij de blokgrens: een blok langer maakt het
  volgende korter. Wisselmomenten schuiven mee met de grens.
- *Wisselmomenten:* ◀/▶ verschuift een wissel per 2,5 minuut, zonder grens op
  het aantal wissels en zonder grens van minuut 80.
- Het minutenoverzicht onder het blok rekent na elke aanpassing meteen mee, en
  "Overzicht van alle blokken" toont alles onder elkaar om te fotograferen.
- Bewerkingen blijven bewaard na verversen; een nieuwe "Genereer opstelling"
  vervangt ze door een vers plan.

**De regels gelden alleen voor de computer, niet voor jou.** Bij het *maken*
(en bij "Verdeel wisselmomenten eerlijk") houdt de computer zich aan:
- alleen wisselen op hele 5 minuten (10, 15, 20, 25, ...), nooit op 2,5;
- niet in de 10 minuten voor of na de rust: tussen minuut 35 en 55 mag de
  computer niet wisselen (de rust zelf, 45, mag wel, en ook precies 35 en 55).
  Zo staat niemand voor minder dan 10 minuten in het veld rond de rust;
- maximaal 2 wissels per moment (bij de rust mogen ze allemaal tegelijk);
- niemand boven zijn max minuten;
- geen wissels na minuut 80 (bij de Opstelling).

Zodra je zelf bewerkt gelden die regels niet meer: met de pijltjes kun je per
2,5 minuut overal heen, ook op 40, 50 of na minuut 80.

**Eerlijke wisselmomenten** (knop in het overzicht, bij Opstelling én Eigen) —
verschuift alleen de *tijdstippen* van bestaande wissels voor eerlijkere
minuten; nooit wie er wisselt. Zonder klik staat iedereen op de blokgrens.

**Afdrukken / opslaan als PDF** ("Opslaan / printen" in het overzicht) maakt één
A4-pagina met per blok alleen de titel ("Blok 2", met de minuten), het
voetbalveld precies zoals op het scherm, en de wissels eronder. Menu, knoppen,
meldingen, uitleg en minutenoverzicht staan er niet op, en ook de kop- en
voetregel van de browser (datum, titel, bestandspad) zijn weg. Het aantal
kolommen en de schaal worden uit het aantal blokken en wissels berekend, zodat
alles altijd op één blad past. Kies in het printvenster "Opslaan als PDF".

**Minutenoverzicht: kleurcodering i.p.v. kale getallen** — een afwijking van
4 minuten of minder toont een vinkje, 5-9 minuten oranje, 10 of meer rood.
De "Posities"-kolom telt exact op tot de "Gekregen"-kolom.

**1e/2e-helft-beperking capt nu ook "Recht op"** — iemand die maar één helft
kan spelen, krijgt nooit meer dan 45 min als streefgetal (was voorheen
mogelijk hoger, terwijl fysiek meer sowieso niet kan).

**Eerlijker prioriteren bij Max minuten/helft-beperking** — de tabel toont
nog steeds het GECAPTE streefgetal ("Recht op"), maar het algoritme
prioriteert nu op basis van het ONGECAPTE streefgetal. Iemand met bv. een
cap van 45 maar een eigenlijk streefgetal van 65 werd voorheen al snel als
"verzadigd" gezien zodra hij dicht bij zijn cap zat, waardoor hij in de
praktijk (bv. 30 i.p.v. 45) tekortkwam. Nu blijft dat tekort meetellen bij
het prioriteren totdat de HARDE cap (die blijft absoluut) hem uitsluit.

**Duidelijkere wissel-weergave bij een indirecte verschuiving** — de
optimalisatie herschikt soms de posities van de blijvende spelers, waardoor
een inkomende speler niet letterlijk de plek van de uitgaande speler
overneemt. Dat wordt nu expliciet getoond:
`Nord (ra) → Dinand (la) [Chris ra → la]` in plaats van het (misleidende)
`Nord → Dinand (ra)`.

De laatst gegenereerde opstelling (incl. handmatige wissels en verschuivingen)
wordt bewaard, dus die is er ook nog als de pagina midden in een wedstrijd
ververst wordt.

**Verwijderd op verzoek**: de tekst-hint bij het wisselen, de hele
"Positie-overzicht"-tabel, en de legenda onder het minutenoverzicht.


## Eigen opstelling (derde tabblad)

Naast de automatische generator kun je op het tabblad **Eigen** zelf blok voor
blok een opstelling bouwen. Dit staat volledig los van de automatische
opstelling: op "Genereer opstelling" drukken raakt je eigen opstelling niet
aan, zodat je beide naast elkaar kunt vergelijken. De genereer-knop is op dit
tabblad ook niet zichtbaar.

**Hoe het werkt**
1. Je begint met een leeg veld en alle geselecteerde spelers op de bank. Tik
   een speler aan, tik daarna een positie aan om hem te plaatsen (geen slepen).
   Twee veldposities achter elkaar aantikken laat die spelers van plek ruilen.
2. Bovenaan stel je de duur van dit blok in (standaard 22,5 min, aan te passen
   per 2,5 min). Je ziet doorlopend hoeveel van de 90 minuten al verdeeld is.
3. "Nieuw blok" maakt een kopie van het huidige blok, zodat je alleen de
   wissels hoeft aan te brengen. Het systeem leidt zelf af wie eruit gaat, wie
   erin komt (met positie) en welke spelers alleen van plek wisselen.
4. Met "Vorig blok" / "Volgend blok" loop je vrij heen en weer. Wijzig je een
   eerder blok, dan worden de wissels opnieuw afgeleid uit de nieuwe situatie.
5. Zodra de blokken samen 90 minuten zijn, verandert "Nieuw blok" in
   "Rond af" en krijg je het totaaloverzicht.

**Het totaaloverzicht** toont alle blokken onder elkaar met hun wissels en een
minutenoverzicht, opgemaakt om te fotograferen of te printen (knop "Opslaan /
printen" gebruikt de printfunctie van je telefoon, waarmee je ook als PDF kunt
opslaan). Wisselmomenten staan standaard precies op de blokgrens en schuif je
per 2,5 minuut met de pijltjes; het minutenoverzicht rekent meteen mee.

**Verschillen tussen "Eigen" en "Opstelling"** (bewust):
- Bij "Eigen" bouw je zelf blok voor blok vanaf nul; bij "Opstelling" begin je
  met wat de computer maakte.
- "Max minuten" is bij "Eigen" geen harde grens: het verlaagt alleen het
  "recht op"-getal, maar je mag er beredeneerd overheen gaan.
- Een 1e/2e-helft-beperking is bij "Eigen" wel hard: zo'n speler is simpelweg
  niet beschikbaar in de blokken van de andere helft.
- Het "recht op"-getal wordt overal op hele minuten afgerond (gespeelde minuten
  houden hun komma, bv. 22,5).
- Onder elke speler staat bij "Eigen" "(gespeeld/recht op)" met kleurcodering
  (binnen 4 min groen; 5-9 min oranje; 10+ min rood, alleen het gespeelde
  getal). Zit iemand goed, dan verdwijnen de getallen en blijft alleen een
  vinkje op een groene achtergrond over. In het minutenoverzicht van "Eigen"
  vervangt een vinkje de groene getallen bij Gekregen en Verschil (het exacte
  getal staat als tooltip). Het tabblad "Opstelling" houdt zijn
  eigen, rustigere weergave (vinkje/kleur in de Verschil-kolom).

## Bekende en gefixte bugs

- **Modal die leeg/onsluitbaar bleef hangen (gefixt):** browsers geven het
  `hidden`-attribuut standaard geen `!important` in hun stylesheet. Omdat
  de modal-overlay óók een eigen `display: flex`-regel had, won die regel
  altijd, waardoor de (lege) modal al vanaf het laden van de pagina
  zichtbaar bleef staan. Opgelost met een expliciete
  `.modal-overlay[hidden] { display: none }`-regel; regressietest aanwezig.
- **"Posities"-kolom kwam niet overeen met "Gekregen" (gefixt):** bij een
  gestaffelde wissel kreeg de "Posities"-kolom nog de volle bloktijd
  toegerekend, terwijl "Gekregen" al gecorrigeerd was voor de werkelijke
  in-/uitstroom-timing. `computeFullTimeline` houdt nu per speeltijd-
  interval ook de bijbehorende positie bij.
- **Wisselpaar-positiebepaling gebruikte de verkeerde speler (gefixt):** de
  interne `posScore`-functie keek naar de positie van de UITGAANDE speler in
  het HUIDIGE blok - waar die niet meer in staat, dus altijd `undefined`.
  Nu wordt terecht naar diens positie in het VORIGE blok gekeken. Dit kwam
  aan het licht bij het bouwen van de keten-detectie hierboven.
- **"Recht op" respecteert altijd Max minuten én 1e/2e-helft:** een speler
  krijgt nooit een hoger streefgetal dan zijn cap toestaat.

## Tests

Zie `tests/README.md`.
