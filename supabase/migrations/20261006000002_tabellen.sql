-- Fase 1 · Datamodel. Alle tabellen met baandata hebben locatie_id; daarop rust de RLS.
-- Objecten, leidingen en machines worden nooit verwijderd maar gearchiveerd (gearchiveerd_op).

set search_path = public, extensions;

-- ── Organisatie ────────────────────────────────────────────────────────────

create table locaties (
  id              uuid primary key default gen_random_uuid(),
  naam            text not null unique,
  klantnaam       text,
  klantlogo_pad   text,               -- pad in storage-bucket 'huisstijl'
  adres           text,
  actief          boolean not null default true,
  geom            geometry(Point, 4326),
  aangemaakt_op   timestamptz not null default now(),
  bijgewerkt_op   timestamptz not null default now()
);

create table lussen (
  id              uuid primary key default gen_random_uuid(),
  locatie_id      uuid not null references locaties on delete cascade,
  naam            text not null,
  volgorde        int  not null default 0,
  aantal_holes    int  not null check (aantal_holes between 1 and 36),
  aangemaakt_op   timestamptz not null default now(),
  bijgewerkt_op   timestamptz not null default now(),
  unique (locatie_id, naam)
);

create table profielen (
  id              uuid primary key references auth.users on delete cascade,
  naam            text,
  email           text,
  telefoon        text,
  -- Alleen voor HGM-brede rollen; locatierollen staan in locatie_gebruikers.
  globale_rol     rol check (globale_rol in ('beheer', 'onderhoudsmanager')),
  actief          boolean not null default true,
  aangemaakt_op   timestamptz not null default now(),
  bijgewerkt_op   timestamptz not null default now()
);

create table locatie_gebruikers (
  profiel_id      uuid not null references profielen on delete cascade,
  locatie_id      uuid not null references locaties on delete cascade,
  rol             rol  not null check (rol in ('hoofdgreenkeeper', 'greenkeeper', 'baanmanager')),
  aangemaakt_op   timestamptz not null default now(),
  primary key (profiel_id, locatie_id)
);
create index on locatie_gebruikers (locatie_id);

-- Vrije sleutel/waarde-instellingen (huisstijl, mfa_verplicht, ...).
create table instellingen (
  sleutel         text primary key,
  waarde          jsonb not null,
  bijgewerkt_op   timestamptz not null default now()
);

-- ── Keuzelijsten (door beheer in te vullen) ────────────────────────────────

create table keuzelijst_waarden (
  id              uuid primary key default gen_random_uuid(),
  lijst           keuzelijst not null,
  naam            text not null,
  eenheid         text,                -- bijv. kg, l (voor middelen)
  volgorde        int  not null default 0,
  gearchiveerd    boolean not null default false,
  locatie_ids     uuid[],              -- null = geldt voor alle locaties
  aangemaakt_op   timestamptz not null default now(),
  bijgewerkt_op   timestamptz not null default now(),
  unique (lijst, naam)
);

create table objecttypes (
  id              uuid primary key default gen_random_uuid(),
  naam            text not null unique,
  categorie       objectcategorie not null,
  geometrietype   geometrietype not null default 'punt',
  icoon           text,
  volgorde        int  not null default 0,
  gearchiveerd    boolean not null default false,
  locatie_ids     uuid[],
  aangemaakt_op   timestamptz not null default now(),
  bijgewerkt_op   timestamptz not null default now()
);

-- ── Baan ───────────────────────────────────────────────────────────────────

create table holes (
  id              uuid primary key default gen_random_uuid(),
  locatie_id      uuid not null references locaties on delete cascade,
  lus_id          uuid not null references lussen on delete cascade,
  nummer          int  not null check (nummer > 0),
  par             int  check (par between 3 and 6),
  naam            text,
  geom            geometry(MultiPolygon, 4326),
  aangemaakt_op   timestamptz not null default now(),
  bijgewerkt_op   timestamptz not null default now(),
  unique (lus_id, nummer)
);
create index on holes (locatie_id);
create index on holes using gist (geom);

create table baanvlakken (
  id              uuid primary key default gen_random_uuid(),
  locatie_id      uuid not null references locaties,
  hole_id         uuid references holes,
  type            baanvlak_type not null,
  naam            text,
  oppervlakte_m2  numeric(12, 1),      -- berekend door trigger
  geom            geometry(MultiPolygon, 4326) not null,
  gearchiveerd_op timestamptz,
  aangemaakt_op   timestamptz not null default now(),
  bijgewerkt_op   timestamptz not null default now()
);
create index on baanvlakken (locatie_id);
create index on baanvlakken using gist (geom);

create table objecten (
  id              uuid primary key default gen_random_uuid(),
  locatie_id      uuid not null references locaties,
  hole_id         uuid references holes,
  objecttype_id   uuid not null references objecttypes,
  code            text,
  merk            text,
  model           text,
  aanlegjaar      int check (aanlegjaar between 1900 and 2100),
  status          object_status not null default 'in_orde',
  eigenschappen   jsonb not null default '{}',
  geom            geometry(Point, 4326) not null,
  gearchiveerd_op timestamptz,
  gearchiveerd_door uuid references profielen,
  aangemaakt_op   timestamptz not null default now(),
  bijgewerkt_op   timestamptz not null default now()
);
create unique index on objecten (locatie_id, code) where code is not null;
create index on objecten (locatie_id);
create index on objecten using gist (geom);

create table leidingen (
  id              uuid primary key default gen_random_uuid(),
  locatie_id      uuid not null references locaties,
  type            leiding_type not null,
  materiaal       text,
  diameter_mm     int check (diameter_mm > 0),
  diepte_cm       int check (diepte_cm >= 0),
  aanlegjaar      int check (aanlegjaar between 1900 and 2100),
  nauwkeurigheid  nauwkeurigheid not null default 'tekening',
  opmerking       text,
  geom            geometry(LineString, 4326) not null,
  gearchiveerd_op timestamptz,
  aangemaakt_op   timestamptz not null default now(),
  bijgewerkt_op   timestamptz not null default now()
);
create index on leidingen (locatie_id);
create index on leidingen using gist (geom);

-- Positiecorrectie door greenkeeper; pas na goedkeuring verschuift het object.
create table positievoorstellen (
  id              uuid primary key default gen_random_uuid(),
  locatie_id      uuid not null references locaties,
  object_id       uuid not null references objecten,
  oude_geom       geometry(Point, 4326),
  nieuwe_geom     geometry(Point, 4326) not null,
  toelichting     text,
  status          voorstel_status not null default 'open',
  ingediend_door  uuid not null default auth.uid() references profielen,
  ingediend_op    timestamptz not null default now(),
  beoordeeld_door uuid references profielen,
  beoordeeld_op   timestamptz,
  reden_afwijzing text
);
create index on positievoorstellen (locatie_id, status);

-- ── Materieel ──────────────────────────────────────────────────────────────

create table machines (
  id              uuid primary key default gen_random_uuid(),
  locatie_id      uuid not null references locaties,
  machinetype_id  uuid references keuzelijst_waarden,
  naam            text,
  merk            text,
  model           text,
  serienummer     text,
  aanschafjaar    int check (aanschafjaar between 1950 and 2100),
  standplaats     text,
  draaiuren       numeric(8, 1) not null default 0,
  gearchiveerd_op timestamptz,
  aangemaakt_op   timestamptz not null default now(),
  bijgewerkt_op   timestamptz not null default now()
);
create index on machines (locatie_id);

create table draaiuren_registraties (
  id              uuid primary key default gen_random_uuid(),
  locatie_id      uuid not null references locaties,   -- overgenomen van machine
  machine_id      uuid not null references machines,
  datum           date not null default current_date,
  stand           numeric(8, 1) not null check (stand >= 0),
  geregistreerd_door uuid default auth.uid() references profielen,
  aangemaakt_op   timestamptz not null default now()
);
create index on draaiuren_registraties (machine_id, datum);

-- ── Storingen, onderhoud en taken ──────────────────────────────────────────

create table storingen (
  id              uuid primary key default gen_random_uuid(),
  locatie_id      uuid not null references locaties,
  object_id       uuid references objecten,
  leiding_id      uuid references leidingen,
  machine_id      uuid references machines,
  storingstype_id uuid references keuzelijst_waarden,
  urgentie        urgentie not null default 'normaal',
  status          storing_status not null default 'gemeld',
  omschrijving    text,
  geom            geometry(Point, 4326),               -- meldplek
  gemeld_door     uuid not null default auth.uid() references profielen,
  gemeld_op       timestamptz not null default now(),
  toegewezen_aan  uuid references profielen,
  oplossing       text,
  gebruikte_onderdelen text,
  opgelost_op     timestamptz,
  gecontroleerd_door uuid references profielen,
  gecontroleerd_op timestamptz,
  intern          boolean not null default false,       -- niet zichtbaar voor baanmanager
  aangemaakt_op   timestamptz not null default now(),
  bijgewerkt_op   timestamptz not null default now(),
  check (num_nonnulls(object_id, leiding_id, machine_id) <= 1)
);
create index on storingen (locatie_id, status);
create index on storingen (object_id);

create table onderhoudsschemas (
  id              uuid primary key default gen_random_uuid(),
  locatie_id      uuid not null references locaties,
  objecttype_id   uuid references objecttypes,
  object_id       uuid references objecten,
  machine_id      uuid references machines,
  omschrijving    text not null,
  interval_waarde int  not null check (interval_waarde > 0),
  interval_eenheid interval_eenheid not null,
  volgende_datum  date,
  volgende_draaiuren numeric(8, 1),
  actief          boolean not null default true,
  aangemaakt_op   timestamptz not null default now(),
  bijgewerkt_op   timestamptz not null default now(),
  check (num_nonnulls(objecttype_id, object_id, machine_id) <= 1),
  check (interval_eenheid <> 'draaiuren' or machine_id is not null)
);
create index on onderhoudsschemas (locatie_id);

create table taken (
  id              uuid primary key default gen_random_uuid(),
  locatie_id      uuid not null references locaties,
  bron            taak_bron not null default 'handmatig',
  schema_id       uuid references onderhoudsschemas,
  storing_id      uuid references storingen,
  object_id       uuid references objecten,
  machine_id      uuid references machines,
  omschrijving    text not null,
  gepland_op      date,                                -- dagplanning
  deadline        date,
  toegewezen_aan  uuid references profielen,
  status          taak_status not null default 'open',
  afgerond_op     timestamptz,
  afgerond_door   uuid references profielen,
  intern          boolean not null default false,
  aangemaakt_door uuid default auth.uid() references profielen,
  aangemaakt_op   timestamptz not null default now(),
  bijgewerkt_op   timestamptz not null default now()
);
create index on taken (locatie_id, status);
create index on taken (toegewezen_aan, status);

-- ── Dagelijkse werkzaamheden ───────────────────────────────────────────────

create table werkzaamheden (
  id              uuid primary key default gen_random_uuid(),
  locatie_id      uuid not null references locaties,
  activiteit_id   uuid not null references keuzelijst_waarden,
  datum           date not null default current_date,
  medewerker_id   uuid not null default auth.uid() references profielen,
  machine_id      uuid references machines,
  taak_id         uuid references taken,
  notitie         text,
  aangemaakt_op   timestamptz not null default now(),
  bijgewerkt_op   timestamptz not null default now()
);
create index on werkzaamheden (locatie_id, datum);

-- Waar is het werk gedaan: per baanvlak of per hele hole.
create table werkzaamheden_vlakken (
  id              uuid primary key default gen_random_uuid(),
  werkzaamheid_id uuid not null references werkzaamheden on delete cascade,
  baanvlak_id     uuid references baanvlakken,
  hole_id         uuid references holes,
  check (num_nonnulls(baanvlak_id, hole_id) = 1)
);
create index on werkzaamheden_vlakken (werkzaamheid_id);

-- Bemesting en gewasbescherming (registratieplicht).
create table middelen_gebruik (
  id              uuid primary key default gen_random_uuid(),
  werkzaamheid_id uuid not null references werkzaamheden on delete cascade,
  middel_id       uuid not null references keuzelijst_waarden,
  hoeveelheid_totaal numeric(10, 2),
  hoeveelheid_per_ha numeric(10, 2),
  eenheid         text not null,
  oppervlakte_ha  numeric(8, 3)
);
create index on middelen_gebruik (werkzaamheid_id);

-- Uren zijn intern: aparte tabel zodat de baanmanager ze via RLS nooit ziet.
create table uren (
  id              uuid primary key default gen_random_uuid(),
  locatie_id      uuid not null references locaties,
  profiel_id      uuid not null default auth.uid() references profielen,
  datum           date not null default current_date,
  minuten         int  not null check (minuten > 0 and minuten <= 24 * 60),
  bron_tabel      text check (bron_tabel in ('werkzaamheden', 'storingen', 'taken')),
  bron_id         uuid,
  notitie         text,
  aangemaakt_op   timestamptz not null default now()
);
create index on uren (locatie_id, datum);
create index on uren (bron_tabel, bron_id);

-- ── Foto's en audit ────────────────────────────────────────────────────────

create table fotos (
  id              uuid primary key default gen_random_uuid(),
  locatie_id      uuid not null references locaties,
  tabel           text not null check (tabel in ('objecten', 'leidingen', 'storingen', 'taken',
                                                 'werkzaamheden', 'machines', 'positievoorstellen')),
  rij_id          uuid not null,
  opslag_pad      text not null unique,                -- bucket 'fotos': {locatie_id}/{tabel}/{bestand}
  omschrijving    text,
  intern          boolean not null default false,
  gemaakt_door    uuid default auth.uid() references profielen,
  gemaakt_op      timestamptz not null default now()
);
create index on fotos (tabel, rij_id);

create table audit_log (
  id              bigint generated always as identity primary key,
  tabel           text not null,
  rij_id          uuid,
  locatie_id      uuid,
  actie           text not null check (actie in ('INSERT', 'UPDATE', 'DELETE')),
  oude_waarde     jsonb,
  nieuwe_waarde   jsonb,
  door            uuid,
  op              timestamptz not null default now()
);
create index on audit_log (tabel, rij_id);
create index on audit_log (locatie_id, op);

-- ── bijgewerkt_op-triggers ─────────────────────────────────────────────────

do $$
declare t text;
begin
  foreach t in array array['locaties', 'lussen', 'profielen', 'keuzelijst_waarden', 'objecttypes',
                           'holes', 'baanvlakken', 'objecten', 'leidingen', 'machines', 'storingen',
                           'onderhoudsschemas', 'taken', 'werkzaamheden', 'instellingen']
  loop
    execute format('create trigger zet_bijgewerkt_op before update on %I
                    for each row execute function zet_bijgewerkt_op()', t);
  end loop;
end $$;
