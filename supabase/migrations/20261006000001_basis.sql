-- Fase 1 · Basis: extensies, enums en algemene triggerfuncties.
-- Geometrie altijd in WGS84 (EPSG:4326). QGIS mag in RD New (28992) tonen en rekent zelf om.

create extension if not exists postgis with schema extensions;

set search_path = public, extensions;

-- Rollen. beheer en onderhoudsmanager zijn globaal (profielen.globale_rol),
-- de overige drie gelden per locatie (locatie_gebruikers.rol).
create type rol as enum ('beheer', 'onderhoudsmanager', 'hoofdgreenkeeper', 'greenkeeper', 'baanmanager');

create type object_status     as enum ('in_orde', 'storing', 'in_onderhoud');
create type objectcategorie   as enum ('beregening', 'drainage', 'kabel', 'overig');
create type geometrietype     as enum ('punt', 'lijn', 'vlak');
create type baanvlak_type     as enum ('green', 'tee', 'fairway', 'bunker', 'water', 'rough');
create type leiding_type      as enum ('beregening', 'drainage', 'kabel');
create type nauwkeurigheid    as enum ('tekening', 'veld_gecontroleerd', 'rtk_gps');
create type voorstel_status   as enum ('open', 'goedgekeurd', 'afgekeurd');
create type storing_status    as enum ('gemeld', 'toegewezen', 'in_behandeling', 'opgelost', 'gecontroleerd');
create type urgentie          as enum ('laag', 'normaal', 'hoog', 'spoed');
create type taak_bron         as enum ('schema', 'storing', 'handmatig', 'dagplanning');
create type taak_status       as enum ('open', 'in_behandeling', 'afgerond', 'geannuleerd');
create type interval_eenheid  as enum ('dagen', 'weken', 'maanden', 'jaren', 'draaiuren');
-- Keuzelijsten die beheer zelf vult (objecttypes hebben een eigen tabel).
create type keuzelijst        as enum ('activiteit', 'storingstype', 'middel', 'machinetype');

-- bijgewerkt_op automatisch bijhouden
create function zet_bijgewerkt_op() returns trigger
language plpgsql as $$
begin
  new.bijgewerkt_op := now();
  return new;
end $$;
