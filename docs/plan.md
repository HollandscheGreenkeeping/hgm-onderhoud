# Plan: Golfbaan Beheer & Onderhoud GIS – HGM Golf

6 okt 2026 · Jesse Weevers

## Doel en uitgangspunten

HGM Golf bouwt een eigen web-app waarin per golfbaan alle objecten op de kaart staan en al het onderhoud
wordt vastgelegd: storingen, gepland onderhoud, dagelijkse werkzaamheden en materieel.

- **Eén systeem, meerdere banen.** Elke locatie heeft eigen kaart, team, klantlogo en data.
- **Kaart als ingang.** Alles hangt aan een plek; onderhoud registreer je door een object aan te tikken.
- **Tekenwerk in QGIS, dagelijks gebruik in de app.** Zelfde database.
- **Altijd online.** Offline werken valt buiten de eerste versies.
- **Klant kijkt mee.** De baanmanager ziet zijn eigen baan en het onderhoud, maar wijzigt niets.
- **Eigen data.** PostgreSQL/PostGIS, geen lock-in.

## Rollen

| Rol | Wie | Bereik | Samengevat |
|---|---|---|---|
| Beheer | HGM Golf (applicatiebeheer) | Alle banen | Alles, incl. instellingen, gebruikers, huisstijl |
| Onderhoudsmanager | HGM Golf | Alle banen | Alles zien en wijzigen, behalve instellingen |
| Hoofd-greenkeeper | HGM Golf, per locatie | Eigen locatie(s) | Plant, wijst toe, beheert objecten |
| Greenkeeper | HGM Golf, per locatie | Eigen locatie(s) | Voert uit, registreert werk en storingen |
| Baanmanager | Klant (golfclub) | Eigen baan | Alleen meekijken |

### Rechtenmatrix (bevestigd)

| Actie | Beheer | OM | Hoofd-gk | Greenkeeper | Baanmanager |
|---|---|---|---|---|---|
| Kaart en objecten bekijken | Ja | Ja | Ja | Ja | Ja |
| Onderhoudshistorie en rapportages bekijken | Ja | Ja | Ja | Ja | Ja |
| Storing melden | Ja | Ja | Ja | Ja | Nee |
| Werkzaamheden registreren (uren, foto's, notities) | Ja | Ja | Ja | Ja | Nee |
| Taak afronden | Ja | Ja | Ja | Eigen taken | Nee |
| Taken plannen en toewijzen | Ja | Ja | Ja | Nee | Nee |
| Periodieke onderhoudsschema's aanmaken | Ja | Ja | Ja | Nee | Nee |
| Objecten toevoegen, verplaatsen, wijzigen | Ja | Ja | Ja | Positie voorstellen | Nee |
| Objecten archiveren | Ja | Ja | Ja | Nee | Nee |
| Materieel beheren | Ja | Ja | Ja | Gebruik en defect melden | Nee |
| Gebruikers binnen locatie beheren | Ja | Ja | Nee | Nee | Nee |
| Locaties, lussen, holes, klantlogo, huisstijl | Ja | Nee | Nee | Nee | Nee |
| Instellingen (keuzelijsten, objecttypes) | Ja | Nee | Nee | Nee | Nee |

Een medewerker kan aan meerdere locaties gekoppeld zijn. De baanmanager ziet nooit interne zaken
(uren per medewerker, interne notities).

## Functionaliteit

1. **Kaart en objecten** – PDOK-luchtfoto/BRT, lagen aan/uit, object aantikken (eigenschappen, foto's,
   taken, historie), zoeken, filter op status, eigen GPS-positie, kleur volgt status (rood = open storing,
   oranje = gepland binnen 7 dagen). Positiecorrectie door greenkeeper als voorstel; hoofd-greenkeeper
   keurt goed, pas dan verschuift het object (audit log).
2. **Storingen en reparaties** – melden vanaf object of GPS-positie; type, urgentie, omschrijving, foto's;
   gemeld → toegewezen → in behandeling → opgelost → gecontroleerd; bij oplossen: wat, onderdelen, tijd, foto.
3. **Gepland en periodiek onderhoud** – schema's per objecttype/object/machine; automatische taken op
   vervaldatum; kalender- en lijstweergave; verlopen taken.
4. **Dagelijkse werkzaamheden** – activiteit, vlakken/holes, datum, medewerker, machine; middelen met
   hoeveelheid per ha en totaal (registratieplicht); dagplanning door hoofd-greenkeeper, afvinken door greenkeepers.
5. **Materieel** – machinelijst, draaiuren, onderhoud op draaiuren of datum, defecten, reparatiehistorie,
   koppeling met werkzaamheden.
6. **Dashboard en rapportages** – per locatie en over alle banen; klantrapport per maand als PDF;
   export naar Excel/CSV.

## Datamodel (zoals gebouwd in fase 1)

Alle baandata heeft `locatie_id` (basis voor RLS). Geometrie in WGS84 (EPSG:4326), kolom `geom`.

| Tabel | Inhoud | Geometrie |
|---|---|---|
| locaties | naam, klant, klantlogo, adres, actief | Punt |
| lussen | locatie, naam, volgorde, aantal holes (holes worden automatisch aangemaakt) | – |
| profielen | Supabase-gebruiker, naam, telefoon, globale rol (beheer/OM) | – |
| locatie_gebruikers | profiel, locatie, rol op die locatie (hoofd-gk/gk/baanmanager) | – |
| holes | locatie, lus, nummer, par, naam | Multivlak |
| baanvlakken | locatie, hole, type, oppervlakte (berekend) | Multivlak |
| objecttypes | naam, categorie, geometrietype, icoon | – |
| keuzelijst_waarden | activiteiten, storingstypes, middelen (met eenheid), machinetypes | – |
| objecten | locatie, hole, type, code, merk, model, aanlegjaar, status, eigenschappen (JSON) | Punt |
| leidingen | locatie, type, materiaal, diameter, diepte, aanlegjaar, nauwkeurigheid | Lijn |
| positievoorstellen | object, oude/nieuwe positie, door wie, status, beoordeling | Punt |
| storingen | object/leiding/machine, type, urgentie, status, toewijzing, oplossing, intern | Punt |
| onderhoudsschemas | objecttype/object/machine, interval (dagen…jaren/draaiuren), volgende datum | – |
| taken | bron, omschrijving, gepland op, deadline, toegewezen aan, status, intern | – |
| werkzaamheden (+ _vlakken) | activiteit, datum, medewerker, machine, notitie; vlakken of holes | – |
| middelen_gebruik | middel, hoeveelheid totaal en per ha, eenheid | – |
| machines, draaiuren_registraties | machinegegevens; draaiurenstand (werkt machine bij) | – |
| uren | intern: medewerker, minuten, bron | – |
| fotos | gekoppeld aan tabel + id, pad in opslag, intern | – |
| instellingen | sleutel/waarde (huisstijl, mfa_verplicht) | – |
| audit_log | wie, wat, wanneer, oude en nieuwe waarde | – |

Keuzes in de uitwerking:
- **Uren in een aparte tabel** in plaats van een kolom `duur`: RLS werkt per rij, niet per kolom.
  Zo kan de baanmanager werkzaamheden zien zonder ooit uren te zien.
- **Globale rol op het profiel, locatierol in locatie_gebruikers.** Beheer/OM hoeven niet aan elke baan
  gekoppeld te worden.
- **Tweestapsverificatie afgedwongen in de database**: met `mfa_verplicht = true` werkt een globale rol
  alleen in een sessie met aal2.

## Techniek

| Onderdeel | Keuze |
|---|---|
| Backend | Supabase (PostgreSQL + PostGIS, Auth, Storage), EU-regio Frankfurt |
| Frontend | React + TypeScript, Vite, PWA |
| Kaart | MapLibre GL JS, PDOK luchtfoto en BRT |
| Tekenwerk | QGIS rechtstreeks op PostGIS |
| Hosting app | Vercel of Netlify, later eigen VPS |
| Code | GitHub, migraties in `supabase/migrations` |

## Huisstijl

HGM-logo linksboven, klantlogo per locatie rechtsboven en op rapportages (PNG/SVG, transparant).
Kleuren en lettertype als tokens in `src/styles/tokens.css`. Min. 16 px tekst, grote knoppen, hoog contrast.

Huisstijl uit hgmgolf.nl halen: open de site in Chrome, rechtsklik op het logo → "Afbeelding opslaan"
(of "Inspecteren" voor SVG); rechtsklik op een gekleurde knop → "Inspecteren" → noteer `color`,
`background-color` en `font-family`. Zet die in het tokenbestand.

## Beveiliging, privacy en back-ups

- RLS op elke tabel, per rol getest (`supabase/tests/rls_rollen.sql`).
- E-mail + wachtwoord of magic link; tweestapsverificatie voor beheer en OM.
- Alleen de publieke Supabase-sleutel in de frontend.
- AVG: vastleggen wie wat ziet, niet meer bewaren dan nodig, verwerkersovereenkomst, hosting in de EU.
- Audit log op objecten, leidingen, storingen, baanvlakken, holes, positievoorstellen, machines, koppelingen.
- Back-ups: dagelijks, min. 30 dagen, wekelijks kopie elders, foto's apart, kwartaal terugzet-test.
- De app vervangt geen KLIC-melding.

## Fasering

1. **Fundament** (1–2 wk) – Supabase, datamodel, RLS, rollen, inloggen, eerste locatie, één hole in QGIS.
   *Klaar als: elke rol logt in en ziet precies de juiste data.*
2. **Kaart** (1–2 wk) – MapLibre, lagen, objecten aantikken, zoeken, GPS, huisstijl, klantlogo.
   *Klaar als: de baanmanager van de proefbaan kan meekijken.*
3. **Storingen en taken** (2 wk) – melden met foto, toewijzen, statusverloop, takenlijst.
4. **Gepland onderhoud en werkzaamheden** (2–3 wk) – schema's met automatische taken, dagplanning, middelen.
5. **Materieel en rapportages** (2 wk) – machines, draaiuren, dashboard, PDF, export.

Proefbaan: **Golfpark Almkreek**. Parallel: tekeningen scannen, georefereren, intekenen, in het veld controleren.

## Besluiten en open punten

- [ ] HGM-logo, kleurcodes en lettertype uit hgmgolf.nl halen.
- [x] Banen, lussen en holes: per locatie in te stellen door beheer.
- [x] Proefbaan: Golfpark Almkreek.
- [x] Rechtenmatrix bevestigd.
- [x] Greenkeeper stelt positiecorrectie voor; hoofd-greenkeeper keurt goed.
- [x] Sprinklers worden ingetekend in QGIS (geen export uit beregeningssysteem).
- [x] Keuzelijsten: beheer voert ze zelf in.
- [ ] Domein: voorkeur `onderhoud.hgmgolf.nl` (DNS-record bij beheerder hgmgolf.nl).
- [x] Hosting: Supabase gehost in EU-regio (Frankfurt); zelf hosten kan later.
- [x] Uren alleen intern; geen facturatiefunctie.
