# HGM Golf – Beheer & Onderhoud

Web-app voor golfbaanbeheer: alle objecten op de kaart en al het onderhoud vastgelegd, per baan.

- Plan en rechtenmatrix: [docs/plan.md](docs/plan.md)
- Supabase opzetten: [docs/supabase-opzetten.md](docs/supabase-opzetten.md)
- QGIS koppelen: [docs/qgis.md](docs/qgis.md)
- Afspraken voor AI-coding: [CLAUDE.md](CLAUDE.md)

## Starten

```bash
npm install
```

```bash
npm run test:db
```

Kopieer `.env.example` naar `.env.local`, vul de Supabase-gegevens in, en start de app:

```bash
npm run dev
```

## Structuur

```
supabase/migrations/   databaseschema, rechtenfuncties, RLS, opslag (op volgorde)
supabase/seed.sql      proefbaan Golfpark Almkreek + startwaarden keuzelijsten
supabase/tests/        RLS-test per rol (ook te draaien in de SQL-editor)
scripts/test-db.mjs    draait migraties + tests in embedded Postgres/PostGIS
src/                   React-app (PWA)
src/styles/tokens.css  huisstijl: kleuren, lettertype, maten
```

## Status

- **Fase 1 (fundament)**: datamodel, rollen, Row Level Security, opslag, inloggen
  (wachtwoord, magic link, tweestapsverificatie), locatiekeuze, overzicht per rol.
- **Fase 2 (kaart)**: PDOK-luchtfoto en BRT, lagen aan/uit, statuskleuren, object/leiding/melding
  aantikken met eigenschappen, foto's, openstaand werk en historie; zoeken; GPS; positiecorrectie
  (direct voor hoofd-greenkeeper en hoger, als voorstel voor greenkeepers) met goedkeurlijst;
  klantlogo uploaden.
- **Fase 3 (storingen en taken)**: melden vanaf object, leiding of plek op de kaart (kruisje of GPS),
  met soort, urgentie, omschrijving en foto's (automatisch verkleind); statusverloop gemeld →
  toegewezen → in behandeling → opgelost → gecontroleerd; zelf oppakken of laten toewijzen; oplossen
  met onderdelen, tijd (intern) en foto achteraf; takenlijst "Mijn werk" en alle taken met verlopen
  deadlines; taak plannen vanaf een object; instellingen voor lussen en keuzelijsten.
- **Fase 4 (gepland onderhoud en werkzaamheden)**: onderhoudsschema's per objecttype, object, machine of
  hele baan (dagen/weken/maanden/jaren of draaiuren) die elke nacht via pg_cron automatisch taken
  aanmaken; maandkalender met taken en voorspelde schema-data; lijst verlopen taken; dagplanning
  (klaarzetten door hoofd-greenkeeper, afvinken door greenkeeper); werk registreren per hole/vlaktype
  met machine, tijd en middelen (per ha ⇄ totaal uit de ingetekende oppervlakte); middelenregister.
- **Fase 5 (materieel en rapportages)**: machinelijst met status, machinepagina met draaiuren invoeren
  (draaiuren-schema maakt direct een taak), defect melden, onderhoud en historie (defecten, taken,
  inzet, standen); dashboard per baan en overzicht over alle banen; klantrapport per maand zonder
  interne zaken (afdrukken/opslaan als PDF); CSV-export voor Excel van storingen, taken,
  werkzaamheden, middelenregister, machines en uren.
- **Baan en hoogte**: lussen met eigen nummering (bijv. Rood 10–18), speellijnen met lengte per hole,
  Golfpark Almkreek ingericht vanuit OpenStreetMap (`scripts/osm-golf.mjs`), hoogtekaart uit het AHN
  (PDOK) met baan-eigen kleurschaal, reliëfschaduw en hoogte in m NAP onder de cursor.
