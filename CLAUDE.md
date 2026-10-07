# HGM Golf – Golfbaan Beheer & Onderhoud GIS

Web-app (PWA) waarin per golfbaan alle objecten op de kaart staan en al het onderhoud wordt vastgelegd.
Volledig plan, rechtenmatrix en fasering: [docs/plan.md](docs/plan.md).

## Stack
- Supabase (PostgreSQL + PostGIS, Auth, Storage), EU-regio (Frankfurt).
- React + TypeScript + Vite, PWA via vite-plugin-pwa. Routing: react-router.
- Kaart (fase 2): MapLibre GL JS met PDOK-luchtfoto en BRT (Web Mercator).
- Tekenwerk: in de app (knop Tekenen op de kaart, hoofd-greenkeeper en hoger; `src/kaart/tekenen.ts`)
  of met QGIS rechtstreeks op dezelfde database (zie [docs/qgis.md](docs/qgis.md)).

## Vaste afspraken
- **Geometrie altijd in WGS84 (EPSG:4326)**, kolomnaam `geom`. Nooit RD New (28992) opslaan;
  QGIS rekent zelf om. Oppervlaktes via `st_area(geom::geography)`.
- **Naamgeving in het Nederlands** (tabellen, kolommen, functies, componenten, UI-teksten).
- **Elke tabel met baandata heeft `locatie_id`** en RLS aan. Nieuwe tabel = ook policies +
  tests in `supabase/tests/rls_rollen.sql`. Gebruik de rechtenfuncties:
  `heeft_toegang(loc)` (alle rollen), `mag_registreren(loc)` (niet baanmanager),
  `mag_plannen(loc)` (hoofd-greenkeeper en hoger), `is_globaal()` (beheer, onderhoudsmanager), `is_beheer()`,
  `is_monteur()`, `mag_werkplaats()` (beheer, onderhoudsmanager, monteur).
  Inkoop: `is_inkoper()` (catalogus inzien), `mag_bestellen(loc)` (hoofd-greenkeeper eigen baan, monteur, globaal).
- **Voorraad = som van `voorraadmutaties`** (view `voorraad`, security_invoker). Mutaties nooit wijzigen; corrigeren
  met een nieuwe mutatie. Verbruik boekt de database zelf af (middelengebruik bij uitgevoerd werk via
  `producten.middel_id`, onderdelen op werkorders van de werkplaats).
- **Monteur** is een HGM-brede rol (`profielen.globale_rol`) maar telt níet als globaal: geen gebruikersbeheer,
  geen kosten, geen tweestapsplicht. Op elke locatie is `mijn_rol` = monteur (mag registreren, niet plannen).
- **Werkplaats** is één locatie met `soort = 'werkplaats'`. Banenlijsten en dashboards filteren op `soort = 'baan'`.
  Machines: `locatie_id` = eigen baan (rechten), `huidige_locatie_id` = waar hij nu staat (werkorder-triggers).
- **Niets echt verwijderen** van objecten, leidingen, baanvlakken, machines: `gearchiveerd_op` zetten.
- **Intern = onzichtbaar voor baanmanager**: kolom `intern` (storingen, taken, foto's) of een
  aparte tabel (`uren`). Uren staan nooit in tabellen die de baanmanager kan lezen.
- **Keuzelijsten, lussen en holes staan in de database**, nooit hardcoded in de app.
- **Databasewijzigingen alleen via nieuwe migraties** in `supabase/migrations/` (nooit oude aanpassen
  die al gedraaid hebben). Draai daarna `npm run test:db`.
- **Sleutels**: alleen de publieke Supabase-sleutel in de frontend. Nooit de service-sleutel.
- **UI buiten leesbaar**: op de telefoon (≤ 700 px) min. 16 px tekst en raakvlakken min. 48 px, hoog contrast.
  Kantoorschermen (desktop) zijn compact in Freshservice-stijl: 15 px in tabellen, bedieningselementen ~38–40 px.
  Kleuren en maten alleen via de tokens in `src/styles/tokens.css`.
- **App-schil** (`components/AppSchil.tsx`): links de zijbalk in HGM-olijf (baan + HGM-onderdelen), boven een kruimelpad.
  Op de telefoon kopbalk + menubalk onderaan. De kaart blijft zoals hij is.
- **Lijstschermen** bouwen met `components/tabel.tsx` (PaginaKop, Werkbalk, Weergaven, Zoekveld, FilterKeuze, DataTabel).
  Weergave, filters, zoekterm, sortering en bewerken (`?bewerk=`) staan in de URL; elk item heeft een eigen detail-URL
  (bijv. `/taken/:id`, `/werk/:id`, `/onderhoud/schemas/:id`, `/voorstellen/:id`, `/beheer/gebruikers/:id`).
- **Huisstijl "2a – Clubhuis wit"**: witte achtergrond (geen crème, geen dark mode), donker olijf +
  grasgroen, Zilla Slab (koppen), Public Sans (tekst), IBM Plex Mono (codes/tijden). Clublogo links in
  de kopbalk, "beheer door HGM" rechts. Categoriekleur in TSX via de `--c`-variabele, nooit hardcoded.

## Supabase-project
- Project `hgm-onderhoud` (ref `ugljndnlzfrlujczryyl`), organisatie HGM Golf, regio Frankfurt.
- Nieuwe migratie doorvoeren: eerst lokaal `npm run test:db`, dan de SQL uitvoeren en de versie
  vastleggen in `supabase_migrations.schema_migrations` (version = bestandsprefix, name = rest).
  Zo blijft `supabase db push` later in sync.
- Na elke DDL-wijziging de Supabase security advisors controleren.
- Edge Function `gebruikers` (supabase/functions/gebruikers): accounts aanmaken en tijdelijke
  wachtwoorden; controleert zelf `is_globaal`. Na wijzigen opnieuw deployen (verify_jwt aan).
- `Demobaan (testdata)` is nepdata om de kaart te proberen; opruimen met `supabase/demobaan_verwijderen.sql`.

## Valkuilen
- MapLibre 6 + Vite: worker expliciet zetten (`setWorkerUrl` met `?worker&url`), anders lege kaart.
- MapLibre-CSS laadt in de build ná app.css: kaartcontainer-regels specifiek genoeg maken.
- PWA-serviceworker cachet oude builds; bij testen van `npm run preview` eerst unregisteren.

## Commando's
- `npm run dev` – app lokaal (vereist `.env.local`, zie `.env.example`)
- `npm run build` – typecheck + productiebuild
- `npm run test:db` – alle migraties + seed + RLS-tests in embedded Postgres/PostGIS (geen Docker nodig)
