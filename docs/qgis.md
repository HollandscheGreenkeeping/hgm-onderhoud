# QGIS koppelen aan de database

Leidingen, baanvlakken, holes en objecten teken je in QGIS rechtstreeks in de Supabase-database.
Wat je opslaat, staat direct in de app.

## 1. Databaserol voor QGIS (eenmalig, in de Supabase SQL-editor)

QGIS logt niet in als app-gebruiker, dus de RLS-rechtenfuncties zien geen gebruiker. Maak daarom
een aparte rol die RLS omzeilt en alleen bij de kaarttabellen kan:

```sql
create role qgis_tekenaar login password '<sterk wachtwoord>' bypassrls;
grant usage on schema public, extensions to qgis_tekenaar;
grant select on all tables in schema public to qgis_tekenaar;
grant insert, update on holes, baanvlakken, objecten, leidingen, locaties to qgis_tekenaar;
```

Gebruik dit account alleen op kantoor; bewaar het wachtwoord in een wachtwoordmanager.
Wijzigingen via QGIS staan in de `audit_log` met `door = null` (geen app-gebruiker).

## 2. Verbinding in QGIS

Supabase → Project Settings → Database → Connection string → **Session pooler** (IPv4).

QGIS → Browser → PostgreSQL → Nieuwe verbinding:
- Host / Poort: uit de connection string (pooler, poort 5432)
- Database: `postgres`
- Gebruiker: `qgis_tekenaar.<project-ref>` (bij de pooler hoort de project-ref achter de naam)
- SSL-modus: `require`

## 3. Werkwijze

- Projectprojectie mag **RD New (EPSG:28992)** zijn; de lagen zelf zijn **EPSG:4326**. QGIS rekent om.
- Achtergrond: PDOK luchtfoto via WMTS `https://service.pdok.nl/hwh/luchtfotorgb/wmts/v1_0`.
- Oude tekeningen: scannen, georefereren (Georeferencer, minstens 4 paspunten op vaste punten), dan overtrekken.
- Vul altijd `locatie_id` in (tip: standaardwaarde instellen in Laageigenschappen → Attributenformulier).
- Leidingen: vul `nauwkeurigheid` eerlijk in (`tekening`, `veld_gecontroleerd`, `rtk_gps`).
- `oppervlakte_m2` van baanvlakken wordt door de database berekend; niet invullen.
- Niet verwijderen: zet `gearchiveerd_op` op de huidige datum.
- Holes bestaan al (aangemaakt via de lussen); teken alleen de geometrie en vul par/naam in.

## 4. Startpunt uit OpenStreetMap (nieuwe baan)

Veel golfbanen staan al in OpenStreetMap (speellijnen, greens, tees, bunkers). Als startpunt:

```bash
node scripts/osm-golf.mjs <zuid,west,noord,oost> > baan.sql
```

Dat levert een tijdelijke tabel `osm_golf`. Voor Golfpark Almkreek is daarmee ingericht:
lussen Geel (1–9), Rood (10–18) en Par 3|4 (1–14); per hole de speellijn, en als hole-vlak de
speellijn met 28 m eromheen plus green en tee. Greens/tees zijn gekoppeld aan de hole waarvan de
speellijn binnen 25 m (green) of 60 m (tee) eindigt/begint; een green zonder hole heet "Oefengreen".

Controleer het resultaat daarna in QGIS tegen de luchtfoto en vul par per hole in (staat niet in
OSM). Bronvermelding "© OpenStreetMap-bijdragers" staat op de kaart in de app (ODbL).

## 5. Hoogte (AHN)

De app toont een hoogtekaart uit het AHN (maaiveld, DTM 0,5 m) via PDOK, met een kleurschaal die
op de baan is afgestemd. In QGIS kun je dezelfde gegevens als WCS-laag toevoegen:
`https://service.pdok.nl/rws/ahn/wcs/v1_0` (coverage `dtm_05m`), handig voor drainage-ontwerp.

De app vervangt geen KLIC-melding. Bij graafwerk nabij openbare kabels en leidingen blijft die nodig.
