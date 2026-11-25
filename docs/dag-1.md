# Dag 1: de band is er

Dit draaiboek loopt van uitpakken tot de eerste gesynchroniseerde nacht. Volg de stappen in volgorde. Stap 3 bepaalt wat er daarna mogelijk is.

Alles wat Bluetooth raakt is tot nu toe alleen tegen een gesimuleerde band getest. Verwacht dus dat er op dag 1 iets niet meteen werkt. Noteer bij elke stap wat je ziet; de tabel onderaan is daarvoor.

## Voor je begint

- **Installeer de officiële WHOOP-app niet**, op geen enkel toestel. Staat ze er nog op: verwijder ze eerst. De app kan zonder vragen de firmware bijwerken, en firmware 50.43 of hoger geeft de geschiedenis alleen vrij met een certificaat van WHOOP. Dat is niet terug te draaien.
- Doe dit met één band tegelijk. Begin met de 5.0; de MG volgt daarna met dezelfde stappen.
- Laptop: Bluetooth aan, deze repository, en één keer `npm install` in de hoofdmap.

## Stap 1: opladen en dragen

Laad de band op en draag hem minstens een uur. Een band die niet gedragen wordt, heeft geen hartslag en weinig geschiedenis om te tonen, en dan valt uit stap 3 niets te besluiten.

Noteer de datum en het uur waarop je hem voor het eerst omdoet. Dat is je "eigenaar sinds".

## Stap 2: live hartslag, zonder koppelen

```
npm run openhoop -- live --seconds 30
```

Dit gebruikt het standaard hartslagprofiel en heeft geen koppeling nodig. Het werkt ook op een vergrendelde band.

- Zie je elke seconde een hartslag: de band leeft en de laptop kan hem horen.
- Vindt het commando geen band: zet Bluetooth uit en aan, hou de band dicht bij de laptop, en kijk of hij niet nog met een ander toestel verbonden is.

## Stap 3: triage

```
npm run openhoop -- triage
```

Triage leest alleen. Het stuurt geen enkel commando dat iets op de band verandert, en het haalt geen geschiedenis van de band. Het bewaart een momentopname in `openhoop-data/`.

De stappen die je ziet voorbijkomen:

1. Scannen en de band kiezen.
2. Diensten opsommen.
3. Firmware, serienummer en batterij lezen zonder koppeling, plus 10 s hartslag.
4. Koppelen (bonden).
5. Sessie openen: firmware, batterij, klok van de band, stand van de ringbuffer.
6. Feature flags en configuratie uitlezen.
7. Slotdetectie.

**Als het koppelen in stap 4 mislukt.** Zet de band in koppelmodus en koppel hem in de Bluetooth-instellingen van Windows. Draai triage daarna opnieuw. Een band kent één koppeling: is hij nog gekoppeld aan de telefoon van de vorige eigenaar, dan moet die koppeling daar eerst weg.

### Het oordeel

| Oordeel | Betekenis | Volgende stap |
| --- | --- | --- |
| `OPEN` | De band geeft zijn data vrij | Stap 4 |
| `OPEN`, met een waarschuwing over firmware 50.43 of hoger | De band heeft nog een geldig certificaat van een eerder lidmaatschap. Dat verloopt, uiterlijk 45 dagen na de laatste vernieuwing | Stap 4, en synchroniseer dagelijks zolang het kan |
| `LOCKED` | De firmware houdt de geschiedenis achter. OpenHoop omzeilt dat niet | Stap 6 |
| `NO DATA` | Er kwam niets, maar de firmware is ouder dan 50.43. Meestal is de band te kort gedragen | Draag de band een uur en draai triage opnieuw |

Meldt triage dat de klok van de band niet ingesteld is of meer dan 2 minuten afwijkt, lees dan eerst "Als de klok niet klopt" hieronder.

## Stap 4: eerste synchronisatie

```
npm run openhoop -- sync --owner-since 2026-12-01T18:30:00+01:00
```

Vul het moment uit stap 1 in, als datum (`2026-12-01`) of als datum en uur met tijdzone. Alles van vóór dat moment is van de vorige eigenaar: het wordt van de band gehaald en niet bewaard.

Een volle band bevat ongeveer drie weken. Op basis van metingen van anderen duurt een nacht 3 tot 4 minuten; de eerste keer kan dus lang duren. Je mag onderbreken met Ctrl+C en later verdergaan: wat op schijf staat is bevestigd, de rest blijft op de band.

Daarna:

```
npm run openhoop -- days --last 7
```

De eerste drie nachten staat er een sterretje bij Paraatheid: het model kalibreert nog.

### Als de sync stopt

| Melding | Betekenis | Wat nu |
| --- | --- | --- |
| `clock` | De klok van de band is niet ingesteld of wijkt te veel af. Er is niets gelezen en niets van de band verwijderd | Zie "Als de klok niet klopt" |
| `corrupt` | Een stuk kwam telkens beschadigd of onvolledig aan. Het is niet bevestigd en staat nog op de band | Probeer opnieuw, dichter bij de laptop. Blijft het zo bij het allereerste stuk: noteer het, dan klopt een aanname over het protocol niet |
| `locked` | Er kwam geen data en de firmware is 50.43 of hoger | Stap 6 |
| `idle` | De band stopte met sturen | Probeer opnieuw |

### Als de klok niet klopt

Na een volledig lege batterij begint de klok van de band opnieuw. De tijdstempels van nieuwe records zijn dan fout, en OpenHoop kan niet meer zien wat van vóór jouw eigenaarschap is. Daarom weigert `sync`.

Twee uitwegen:

- `npm run openhoop -- sync --owner-since <datum> --ignore-clock` bewaart alles, zonder filter. Er kan dan data van de vorige eigenaar tussen zitten, en de dagen krijgen de vlag `clock-offset`.
- De klok zetten. Dat is een schrijfcommando waarvan de exacte vorm nog niet op een band bevestigd is. Het staat op de lijst hieronder en is nog niet gebouwd.

## Stap 5: de app

```
cd apps/mobile
npm install
npx expo run:android
```

Sluit je telefoon aan met USB-foutopsporing aan. De app start met de demoband. Ga naar Instellingen, draai eerst de Zelftest, zet de databron op "band" en volg Koppelen.

Let op: de band kent één koppeling. Koppel je hem aan de telefoon, dan verliest de laptop hem, en omgekeerd. Kies per band één toestel voor de dagelijkse sync.

De database van de laptop en die van de telefoon staan los van elkaar.

## Stap 6: als de band vergrendeld is

Dan blijft de hartslagband-modus over: hartslag en R-R via het standaardprofiel, live opgenomen.

```
npm run openhoop -- live --record
```

Dit neemt elke seconde hartslag en R-R op zolang het loopt, met de laptop binnen bereik. Daarna `npm run openhoop -- recompute` en `days`.

Wat je vandaag in deze modus krijgt: hartslag, Belasting en tijd per zone. Wat nog ontbreekt: HRV, rusthartslag, ademhaling, slaap en Paraatheid. Die rekenen over een slaapperiode, en OpenHoop leidt de slaap nu af uit de toestand die de band zelf meldt. Die toestand zit in de geschiedenis die een vergrendelde band achterhoudt. De R-R-intervallen van de nacht staan wel in de database; een slaapdetectie uit hartslag alleen moet nog gebouwd worden en kan dan met terugwerkende kracht over die nachten lopen. Stappen, huidtemperatuur en SpO2 komen in deze modus nooit.

Staat één van de twee bands open en de andere op slot, gebruik dan de open band voor dagelijks gebruik.

## De MG

Dezelfde stappen. Extra voor de MG: ECG-records komen alleen live tijdens een meting. Het protocolpakket decodeert ze, maar er is nog geen scherm en geen opnamecommando. Dat is werk voor na dag 1.

## Wat we op dag 1 te weten komen

Vul in wat je ziet. Dit zijn de plekken waar de code een aanname maakt die alleen een echte band kan bevestigen.

| # | Vraag | Resultaat |
| --- | --- | --- |
| 1 | Firmwareversie van de 5.0 | |
| 2 | Firmwareversie van de MG | |
| 3 | Is de firmware leesbaar zonder koppeling (triage stap 3)? | |
| 4 | Lukt koppelen vanop Windows via het commando, of alleen via de Windows-instellingen? | |
| 5 | Werkt live hartslag terwijl de band nog aan een ander toestel gekoppeld is? | |
| 6 | Oordeel van triage per band | |
| 7 | Wijkt de klok van de band af? Hoeveel? | |
| 8 | Leest triage de waarden van de feature flags, of alleen de namen? | |
| 9 | Stuurt de band een startmarkering vóór elk stuk geschiedenis, of alleen één keer? (Zie je `corrupt` bij het eerste stuk, dan is het antwoord "anders dan aangenomen") | |
| 10 | Hoe lang duurt de sync van één nacht? | |
| 11 | Komen de nachtwaarden geloofwaardig uit (HRV, rusthartslag, ademhaling, SpO2, temperatuur)? | |
| 12 | Lukt koppelen op de Android-telefoon? | |
| 13 | Batterijduur met dagelijkse sync | |

Loopt er iets vast, bewaar dan de uitvoer van het commando en het bestand `openhoop-data/triage-*.json`. Daarmee is de oorzaak meestal te vinden.

## Wat je beter niet doet

- De band koppelen aan de officiële app, ook niet "even om te kijken".
- Een tijdelijk lidmaatschap nemen op beide bands. Het brengt de firmware naar 50.43 of hoger, en dan gaat de band 45 dagen na afloop op slot. Wil je ooit je scores naast die van WHOOP leggen, doe dat dan met één band en hou de andere schoon.
- Een band wissen of herstarten vóór de eerste sync.
