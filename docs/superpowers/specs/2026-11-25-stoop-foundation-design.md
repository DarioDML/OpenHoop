# Stoop: ontwerp van de fundering

25 november 2026. Status: goedgekeurd door Dario in het gesprek (Android eerst, volledige omvang).

## Waarom

Dario kocht een WHOOP 5.0 en een WHOOP MG en wil ze zonder lidmaatschap gebruiken. Bestaande open apps zijn op de 5.0/MG onaf, en geen enkele meet hoe ver haar scores van die van Whoop liggen. Stoop moet dat gat vullen: lokaal, open, en eerlijk over wat gemeten en wat geschat is.

De bands zijn onderweg. Dit ontwerp dekt alles wat zonder band gebouwd en getest kan worden, zodat de eerste dag met de band een testdag is en geen bouwdag.

Bron van de eisen: de twee PRD's van 25 november 2026. Waar ze elkaar tegenspreken volgt dit ontwerp de eerste (TypeScript en Expo), met het firmwarerisico uit de tweede.

## Doelen

1. De twaalf P0-functies uit de PRD (F1 tot F12) werken van begin tot eind tegen een gesimuleerde band.
2. Op dag 1 beantwoordt één commando op de laptop de vraag die alles bepaalt: op welke firmware staat de band, en geeft hij data vrij?
3. Geen dataverlies: een stuk geschiedenis wordt pas bevestigd aan de band nadat het op schijf staat.
4. Alles is herberekenbaar uit het ruwe archief, en elke afgeleide waarde draagt de versie van haar algoritme.
5. De app toont geen getal wanneer de data het niet draagt, maar de reden.

## Niet-doelen

- P1 en P2 uit de PRD: slaapfases, stress, ECG-scherm, trilwekker, achtergrondsync, Health Connect, validatiemodus, import. Ze wachten op echte data. Het protocolpakket decodeert ECG-records wel al.
- iOS. De code blijft platformneutraal, maar alleen Android wordt gebouwd en getest.
- De WHOOP 4.0.
- Een account, een server, telemetrie of netwerkverkeer.

## Anti-doelen

Deze zouden het project doen mislukken, ook als alles technisch werkt.

- **Het firmwareslot omzeilen.** Firmware 50.43.x geeft geen geschiedenis vrij zonder een door Whoop getekend certificaat. Stoop bouwt geen enkele route om dat certificaat op te vangen, opnieuw af te spelen of na te maken. De commando's 155 tot 159 zijn in de code niet opbouwbaar.
- **Firmware schrijven.** De commando's voor firmware laden en DFU zijn evenmin opbouwbaar.
- **Een band onbruikbaar maken.** Wissen, herstarten en de leeswijzer verzetten vragen een uitdrukkelijke bevestiging.
- **Medische oordelen.** Geen ritmeclassificatie, geen bloeddrukwaarde.
- **Code of beeld van Whoop overnemen**, of code onder een licentie die niet past (NOOP is niet-commercieel, OpenStrap is AGPL). Alleen feiten uit die projecten, en code uit `wearable5.0` (MIT) met bronvermelding.
- **Data van de vorige eigenaar bewaren.** Bij het koppelen geeft de gebruiker aan sinds wanneer hij de band draagt. Oudere records worden van de band gehaald en bevestigd, maar niet opgeslagen.

## Randvoorwaarden

- De band kent één bond en één verbonden client tegelijk.
- Zonder bond werkt alleen het standaard hartslagprofiel (hartslag en R-R). Dat blijft ook op een vergrendelde band werken.
- De band bewaart ongeveer drie weken geschiedenis.
- Windows-pc met Bluetooth, Node 26, Android SDK en een draaiende emulator. Geen fysieke telefoon aangesloten en geen band: alles wat Bluetooth raakt blijft ongetest tot dag 1, en wordt zo ook gelabeld.
- TypeScript in strict mode, zonder `any`.

## Aanpakken

**A. TypeScript-monorepo met Expo, protocol overgezet uit wearable5.0 (gekozen).** Eén taal van protocol tot scherm. De kern draait op de laptop, in de app en in CI. De decoders worden gecontroleerd tegen dezelfde testvectoren als de Python-, Swift- en Kotlin-versies. Nadeel: het meeste eigen werk.

**B. OpenStrap Edge forken.** Snelst een volledige app, maar Flutter en Dart, AGPL verplicht, en het project wil Whoop uitdrukkelijk niet benaderen. Dat botst met het kernkenmerk: gemeten overeenkomst.

**C. Rust-kern met bindings.** Strikter en sneller, maar er staat geen Rust-toolchain op deze pc en elke wijziging loopt door een bindinglaag. Te zwaar voor één ontwikkelaar die vooral snel wil kunnen meten.

Dario koos A. De stack is mijn keuze binnen A, niet iets wat hij apart besliste.

## Opbouw

npm-workspaces. Pakketten exporteren hun TypeScript-bron rechtstreeks, zonder bouwstap; Node draait ze via `tsx`, de app via Metro.

```
packages/protocol    Schema, framing, decoders, commando's, veiligheidsslot. Geen afhankelijkheden.
packages/analytics   Pure, deterministische functies: van samples naar nachtwaarden en scores.
packages/core        Transport- en opslaginterfaces, sessie, sync-engine, databaseschema, pijplijn, export.
packages/sim         Gesimuleerde band die het echte protocol spreekt, met foutinjectie.
packages/ble-node    Bluetooth-transport voor de laptop (ongetest tot dag 1).
apps/cli             Werkbank: triage, live, sync, recompute, export, sim.
apps/mobile          Expo-app, Android eerst.
```

Afhankelijkheden lopen één kant op: `protocol` ← `analytics` (alleen types) ← `core` ← `sim`, `ble-node`, `cli`, `mobile`.

### protocol

- `whoop5_protocol.json` uit wearable5.0, ongewijzigd, met bronvermelding. Vaste offsets komen uit het schema; alleen matrixvormige records hebben eigen code.
- Framing: CRC16-Modbus over de header, CRC32 over de body, opvulling tot een veelvoud van 4, en een `Reassembler` die Bluetooth-fragmenten tot frames samenvoegt.
- Decoders voor commando-antwoorden, live hartslag (pakket 40), events, console, metadata en de records R16, R17, R18, R20, R21, R22 en R26. Onbekende indelingen blijven ruw bewaard en worden nooit als nul gelezen.
- Encoders voor dezelfde frames, nodig voor de gesimuleerde band en de tests.
- **Veiligheidsslot (F11).** Elk commando heeft een klasse:
  - `read`: vrij.
  - `session`: vrij; hoort bij een gewone sessie (hello, klok lezen, geschiedenis vragen, bevestigen, afbreken, live hartslag).
  - `write`: verandert instellingen op de band (klok zetten, trillen, wekker, feature flags). Vraagt een bevestiging van de aanroeper.
  - `dangerous`: wissen, herstarten, leeswijzer verzetten, kalibreren. Vraagt een bevestiging met de naam van het commando.
  - `forbidden`: firmware, DFU, certificaten, `LOCK_DEVICE`. Niet opbouwbaar; `buildCommand` gooit een fout en er bestaat geen parameter om dat te omzeilen.
  Een onbekend commandonummer is `forbidden`.
- Test: de 18 gouden vectoren uit wearable5.0, plus rondreis-tests voor elke encoder.

### analytics

Alle functies zijn puur. Elke uitkomst is `{ ok: true, value, coverage, algo }` of `{ ok: false, reason }`. `algo` is een naam met versie, bijvoorbeeld `hrv.rmssd5m@1`.

| Waarde | Methode | Niveau |
| --- | --- | --- |
| HRV | Mediaan van RMSSD over vensters van 5 minuten, elke 30 s opgeschoven, tijdens de slaap, met artefactfilter en minimale dekking per venster | A/B |
| Rusthartslag | Laagste gemiddelde over 5 minuten tijdens de slaap | A/B |
| Ademhaling | Spectrale piek van de R-R-variatie per 60 s, mediaan over de nacht | B |
| SpO2 | Mediaan per meetvenster uit R18, alleen 70 tot 100, minstens 5 geldige seconden | A |
| Huidtemperatuur | Nachtgemiddelde en afwijking tegenover de eigen baseline | A |
| Slaapperiodes | Bandtoestand SLEEP, gladgestreken over 300 s, gaten tot 600 s samengevoegd, minstens 20 minuten; segmenten minder dan 2 uur uit elkaar vormen één nacht | B |
| Slaapbehoefte en -schuld | Basis plus schuld plus behoefte uit belasting min dutjes | B |
| Slaapscore | Macht van geslapen tegenover behoefte, plus consistentie | B |
| Consistentie | Eigen methode: overeenkomst van slaap- en waaktijden over de laatste 4 nachten | C |
| Paraatheid | HRV tegenover een gekrompen eigen baseline, slaapscore tegenover het eigen gemiddelde, rusthartslag. Met de bijdrage van elk signaal | B |
| Belasting | Macht van exponentieel gewogen minuten boven een hartslagdrempel | B |
| Hartslagzones | 40, 60, 70, 80 en 90 % van de hartslagreserve | B |
| Workouts | Automatisch: aaneengesloten tijd boven zone 1; daarnaast handmatig | C |

De constanten uit wearable5.0 zijn gefit op één drager. Ze staan daarom niet in de functies maar in een `Calibration`-object met standaardwaarden, zodat de latere validatiemodus ze per gebruiker kan herfitten zonder de code te wijzigen.

Scorenamen zijn eigen: Paraatheid (Readiness), Belasting (Load) en Slaapscore (Sleep score).

### core

- **`Transport`**: verbinden, verbreken, schrijven naar een characteristic, abonneren op notificaties, een characteristic lezen, bonden, en de lijst van diensten opvragen. Drie implementaties: `sim`, `ble-node`, en in de app.
- **`Session`**: abonneert op de drie kanalen, stuurt hello, leest firmware, batterij en klok, en vraagt de stand van de ringbuffer op. Houdt volgnummers bij en koppelt antwoorden aan commando's, met time-outs.
- **Slotdetectie**: geschiedenis vragen en kijken of er data komt, daarna afbreken zonder te bevestigen. Er wordt dus niets van de band gehaald. Komt er niets en is de firmware 50.43 of hoger, dan is de toestand `locked`.
- **`SyncEngine` (F3, F4)**: per stuk geschiedenis (alles tussen HISTORY_START en HISTORY_END): frames verzamelen, in één transactie het ruwe stuk plus de gedecodeerde samples wegschrijven, en pas daarna de token van HISTORY_END bevestigen. Na een crash of verbroken verbinding begint de sync opnieuw bij het laatste bevestigde punt; dubbel ontvangen samples zijn onschadelijk door een unieke sleutel op band en seconde.
- **Hartslagband-modus**: neemt hartslag en R-R op via het standaardprofiel, zonder bond. Vult dezelfde samples-tabel, met een bronveld. Stappen, temperatuur en SpO2 ontbreken dan; de analyse meldt dat als reden.
- **Opslag**: een `SqlDriver`-interface met twee implementaties, `node:sqlite` op de laptop en `expo-sqlite` met SQLCipher in de app. Tabellen volgen het datamodel uit de PRD: `devices`, `raw_chunks`, `samples_1hz`, `rr_intervals`, `optical_bursts`, `imu_blocks`, `ecg_recordings`, `sleeps`, `workouts`, `daily_metrics`, `baselines`, `calibration`, `sync_state`, `events`, `console_log`, plus lege tabellen voor P1 (`sleep_stages`, `journal`, `oracle_values`). Ruwe stukken worden gecomprimeerd bewaard met een controlesom.
- **Pijplijn**: van samples naar slaap, nachtwaarden, scores en workouts, per fysiologische dag (van slaapbegin tot het volgende slaapbegin; zonder slaap de kalenderdag). `recompute` draait alles opnieuw vanaf het ruwe archief.
- **Export (F12)**: de volledige database, en CSV per tabel.

### sim

Een band in software die het protocol aan de bandzijde spreekt. Hij genereert geloofwaardige dagen (slaap met dalende hartslag en ademhalingsvariatie in de R-R, SpO2-vensters om de 20 minuten, stappen, temperatuur, workouts) uit een seed, zodat tests herhaalbaar zijn.

Foutinjectie: verbinding verbreken midden in een stuk, een bevestiging laten verloren gaan, een vergrendelde firmware, een geweigerde bond, een verlopen klok, een beschadigd fragment.

### apps/cli

`stoop triage` (alleen lezen: diensten, firmware, batterij, klok, ringbuffer, feature flags, slotdetectie; bewaart een momentopname), `live`, `sync`, `recompute`, `export`, `decode` en `sim`. Elk commando werkt met `--sim` tegen de gesimuleerde band.

### apps/mobile

Expo met een development build, expo-router, Nederlands en Engels.

Schermen: koppelen (F1), vandaag (F2, F10), slaap (F6, F7), paraatheid (F8), belasting en workouts (F9), trends over 7, 30 en 180 dagen (F10), band (batterij, firmware, sync, slot, veiligheid) en instellingen (profiel, taal, export, databron).

Bij elke waarde staat het pariteitsniveau (A tot D) en een uitleg wanneer er geen getal is. De databron is de echte band of de ingebouwde demoband; zo is de hele app nu al te gebruiken.

Bluetooth via `react-native-ble-manager`, omdat die het bonden uitdrukkelijk kan starten en de bondstatus kan lezen. De databasesleutel staat in de beveiligde opslag van het toestel.

## Verduidelijkingen na nalezing

Een verse lezer vond acht plekken waar een bouwer zou moeten gokken. Geen ervan vroeg een beslissing van Dario. De eerste twee zijn beantwoord door de bronnen; de rest zijn mijn keuzes.

**Het firmwareslot op de draad (bron: OpenStrap edge#673).** Een vergrendelde band verbindt, en beantwoordt elk commando met SUCCESS: hello, klok, ringbuffer, batterij, configuratie. Na `SEND_HISTORICAL_DATA` en na `TOGGLE_REALTIME_HR` komt er alleen niets op het datakanaal. De detectie is daarom:

1. Vraag de ringbuffer op. Is de achterstand groter dan 0, vraag dan geschiedenis en wacht 8 s op een eerste dataframe. Breek daarna af zonder te bevestigen.
2. Is de achterstand 0, zet dan live hartslag aan en wacht 6 s op een pakket 40. Zet daarna weer uit.
3. Geen data en firmware 50.43 of hoger: `locked`. Geen data en oudere firmware: `no-data`, met de raad om de band te dragen en opnieuw te proberen. Data: `open`.

De detectie geeft de toestand terug samen met wat er gemeten is, zodat een onverwacht geval op dag 1 leesbaar is.

**F1 tot F12 en de niveaus (bron: PRD).** F1 koppelen, F2 live hartslag, F3 geschiedenis synchroniseren, F4 ruw archief, F5 vitals per seconde, F6 slaap, F7 nachtwaarden, F8 paraatheid, F9 belasting en workouts, F10 vandaag en trends, F11 veiligheidsslot, F12 export en back-up. Het niveau ligt vast per waarde en verandert niet per nacht: A betekent dat de band het zelf meet, B een eigen model dat tegen Whoop gekalibreerd is, C een eigen methode met een andere uitkomst, D alleen ruwe data zonder oordeel.

**Schalen en koude start (mijn keuze).** Paraatheid 0 tot 100, Belasting 0 tot 21, Slaapscore 0 tot 100. Paraatheid is de REC-RHR-formule uit wearable5.0 zonder de stressterm. De eerste drie nachten toont de app de score met het label "kalibreert". De standaardwaarden in `Calibration` zijn de constanten van wearable5.0, behalve waar die persoonsgebonden zijn:

- De HRV-baseline start bij de gepubliceerde waarde en krimpt naar het eigen gemiddelde, zoals in de bron.
- De referentie voor de rusthartslag is het eigen voortschrijdend gemiddelde zodra er vier nachten zijn; tot dan de gepubliceerde waarde.
- De drempels 94 en 100 slagen per minuut in de belastingsformule worden omgerekend naar hartslagreserve (28 % en 33 %, afgeleid van de rust- en maximumhartslag van de drager uit de bron) en dan toegepast op de reserve van de gebruiker.
- De maximumhartslag is wat de gebruiker instelt, anders 208 min 0,7 maal de leeftijd.

**Wat "juist" betekent zonder echte data (mijn keuze).** De analyse wordt op drie manieren getest, en geen ervan leunt op de eigen simulator: de bekende uitkomsten uit de bron (bijvoorbeeld een gesynthetiseerde ademhaling van 9, 14 en 18 per minuut die teruggevonden wordt), vergelijking met de Python-functies van wearable5.0 op dezelfde invoer, en eigenschapstests (schaalgrenzen, monotonie). De simulator test alleen de keten, niet de juistheid van een score.

**Slaap uit de bandtoestand (mijn keuze).** Overgenomen zoals in de bron, niveau B. "Geslapen" is het aantal seconden in toestand SLEEP binnen een periode, "in bed" de duur van de periode. De bekende vertraging van ongeveer 14 minuten bij het inslapen wordt niet gecorrigeerd tot ze op eigen data bevestigd is.

**Klassen van commando's (mijn keuze).** De volledige lijst staat in het bouwplan. `HISTORICAL_DATA_RESULT` is `session`, maar alleen de sync-engine mag het sturen, en alleen na een geslaagde transactie.

**Tijd (mijn keuze).** Samples dragen de tijd van de band, in UTC. Bij het begin van elke sessie wordt het verschil tussen de klok van de band en die van het toestel gemeten en bij elk ruw stuk bewaard. Is het verschil groter dan 2 minuten, dan waarschuwt de app en stelt ze voor de klok te zetten (een `write`). Dagen worden afgebakend in de tijdzone van het toestel; de gebruikte offset wordt per dag bewaard.

**Hartslagprofiel terwijl de band elders gebonden is.** Onbekend; staat op de testlijst voor dag 1.

## Wat pas met de band getest kan worden

Deze onderdelen worden gebouwd maar blijven `ongetest` tot dag 1, en staan zo in het draaiboek:

- Bonden vanop Windows via de Node-bibliotheek, en op Android.
- Of de firmware via de standaarddienst leesbaar is zonder bond.
- De exacte body van `SET_CLOCK`.
- Doorvoersnelheid en gedrag bij een echte, volle ringbuffer.
- Alles op een MG: ECG-records komen alleen live.

## Juridisch en licenties

Apache-2.0 voor `packages/*`, GPL-3.0 voor `apps/*`. `THIRD_PARTY_NOTICES.md` vermeldt wearable5.0 (MIT). `LEGAL.md` legt de grondslag uit (interoperabiliteit, Richtlijn 2009/24/EG) en de grenzen hierboven. `docs/provenance.md` houdt per protocolfeit bij waar het vandaan komt.

De repository is privé. Publiek maken is een latere, aparte beslissing.

## Wat aan de bouwer overgelaten is

- Namen van functies en bestanden binnen de pakketten.
- De vorm van de grafieken en de schermindeling, binnen de lijst van schermen hierboven.
- De keuze van de kleine hulpbibliotheken (compressie, CSV, i18n).
- De parameters van de gesimuleerde fysiologie.
