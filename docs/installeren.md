# OpenHoop installeren

OpenHoop staat niet in de Play Store of de App Store. Je installeert de app zelf vanaf de [releasepagina](https://github.com/DarioDML/OpenHoop/releases). Bij elke versie horen twee bestanden:

| Bestand | Voor |
| --- | --- |
| `OpenHoop-android.apk` | Android-telefoons |
| `OpenHoop-ios-unsigned.ipa` | iPhones |

De app heeft geen account nodig en verstuurt niets. Alles blijft op je telefoon.

Heb je nog geen band, of wil je eerst rondkijken: kies in de app de **demoband**. Die doet alsof er een band verbonden is.

**Installeer de officiële WHOOP-app niet** naast OpenHoop. Die kan de firmware van de band bijwerken, en vanaf firmware 50.43 geeft de band zijn geschiedenis niet meer vrij. Meer daarover staat in de [README](../README.md).

## Android

1. Open de releasepagina op je telefoon en download `OpenHoop-android.apk`.
2. Open het bestand. Android vraagt of je browser of bestandsbeheerder apps mag installeren: kies **Toestaan** en ga terug.
3. Tik op **Installeren**.
4. Bij een nieuwere versie doe je hetzelfde. Je gegevens blijven bewaard.

Zegt Play Protect dat de app onbekend is: kies **Toch installeren**. Dat komt omdat de app niet via de Play Store komt.

## iPhone

Apple laat apps van buiten de App Store alleen toe als ze ondertekend zijn. Het `.ipa`-bestand is niet ondertekend: dat doe je zelf, gratis, met je eigen Apple ID. Daarvoor heb je eenmalig een computer nodig (Windows of Mac).

Er zijn twee gangbare programma's. Kies er één.

### Met Sideloadly (het eenvoudigst)

1. Installeer [Sideloadly](https://sideloadly.io) op je computer. Op Windows heb je ook iTunes en iCloud nodig, in de versie van de Apple-website, niet uit de Microsoft Store.
2. Download `OpenHoop-ios-unsigned.ipa` op je computer.
3. Sluit je iPhone met een kabel aan en tik op de iPhone op **Vertrouw**.
4. Sleep het `.ipa`-bestand in Sideloadly, vul je Apple ID in en klik op **Start**.
5. Op de iPhone: **Instellingen → Algemeen → VPN en apparaatbeheer**, kies je Apple ID en tik op **Vertrouw**.
6. Vanaf iOS 16: **Instellingen → Privacy en beveiliging → Ontwikkelaarsmodus** aanzetten. De iPhone herstart.

### Met AltStore

AltStore kan de app later zelf vernieuwen zonder kabel, zolang je computer met AltServer aan staat in hetzelfde wifinetwerk.

1. Volg de installatie op [altstore.io](https://altstore.io) om AltServer op je computer en AltStore op je iPhone te zetten.
2. Zet `OpenHoop-ios-unsigned.ipa` op je iPhone, bijvoorbeeld via iCloud Drive of AirDrop.
3. Open AltStore, ga naar **My Apps**, tik op **+** en kies het bestand.
4. Zet de Ontwikkelaarsmodus aan zoals hierboven in stap 6.

### Wat je moet weten over een gratis Apple ID

- De ondertekening is **7 dagen** geldig. Daarna start de app niet meer tot je ze opnieuw ondertekent: in Sideloadly door de stappen te herhalen, in AltStore met **Refresh All** of automatisch. Je gegevens blijven bewaard.
- Je kunt zo maximaal **3 apps** tegelijk installeren.
- Bij de eerste keer verbinden met de band vraagt iOS om Bluetooth-toegang. Tik op **Sta toe**. Heb je dat geweigerd: **Instellingen → OpenHoop → Bluetooth**.

## Problemen melden

De iPhone-versie wordt automatisch gebouwd en op een simulator gestart, maar is nooit op een echte iPhone getest. Werkt er iets niet, open dan een [issue](https://github.com/DarioDML/OpenHoop/issues) met je iPhone-model, de iOS-versie en wat je zag. Een schermafbeelding helpt.
