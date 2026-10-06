-- Lussen met eigen nummering (bijv. Rood = holes 10–18) en een speellijn per hole.

set search_path = public, extensions;

-- Eerste holenummer van een lus. Standaard 1; Rood op een 18-holesbaan begint bij 10.
alter table lussen add column eerste_hole int not null default 1 check (eerste_hole between 1 and 99);

create or replace function lus_holes_aanvullen() returns trigger
language plpgsql set search_path = public as $$
begin
  insert into holes (locatie_id, lus_id, nummer)
  select new.locatie_id, new.id, n
  from generate_series(new.eerste_hole, new.eerste_hole + new.aantal_holes - 1) n
  on conflict (lus_id, nummer) do nothing;
  return new;
end $$;

drop trigger lus_holes_aanvullen on lussen;
create trigger lus_holes_aanvullen after insert or update of aantal_holes, eerste_hole on lussen
  for each row execute function lus_holes_aanvullen();

-- Speellijn van tee naar green (via eventuele knikpunten), en de lengte daarvan.
alter table holes
  add column speellijn geometry(LineString, 4326),
  add column lengte_m int generated always as (round(st_length(speellijn::geography))::int) stored;

-- Kaartlagen: speellijnen meesturen met de holes (ook voor holes zonder vlak).
create or replace function kaart_lagen(p_locatie uuid) returns jsonb
language sql stable security invoker set search_path = public, extensions as $$
  select jsonb_build_object(
    'centrum', (select st_asgeojson(l.geom, 7)::jsonb from locaties l where l.id = p_locatie),
    'holes', (
      select jsonb_build_object('type', 'FeatureCollection', 'features', coalesce(jsonb_agg(jsonb_build_object(
        'type', 'Feature', 'id', h.id,
        'geometry', st_asgeojson(h.geom, 7)::jsonb,
        'properties', jsonb_build_object('id', h.id, 'nummer', h.nummer, 'par', h.par, 'naam', h.naam,
                                         'lus', l.naam, 'lus_volgorde', l.volgorde, 'lengte_m', h.lengte_m)
      ) order by l.volgorde, h.nummer), '[]'))
      from holes h join lussen l on l.id = h.lus_id
      where h.locatie_id = p_locatie and h.geom is not null
    ),
    'speellijnen', (
      select jsonb_build_object('type', 'FeatureCollection', 'features', coalesce(jsonb_agg(jsonb_build_object(
        'type', 'Feature', 'id', h.id,
        'geometry', st_asgeojson(h.speellijn, 7)::jsonb,
        'properties', jsonb_build_object('id', h.id, 'nummer', h.nummer, 'lus', l.naam, 'lengte_m', h.lengte_m, 'par', h.par)
      )), '[]'))
      from holes h join lussen l on l.id = h.lus_id
      where h.locatie_id = p_locatie and h.speellijn is not null
    ),
    'baanvlakken', (
      select jsonb_build_object('type', 'FeatureCollection', 'features', coalesce(jsonb_agg(jsonb_build_object(
        'type', 'Feature', 'id', b.id,
        'geometry', st_asgeojson(b.geom, 7)::jsonb,
        'properties', jsonb_build_object('id', b.id, 'type', b.type, 'naam', b.naam,
                                         'oppervlakte_m2', b.oppervlakte_m2, 'hole_id', b.hole_id)
      )), '[]'))
      from baanvlakken b
      where b.locatie_id = p_locatie and b.gearchiveerd_op is null
    ),
    'leidingen', (
      select jsonb_build_object('type', 'FeatureCollection', 'features', coalesce(jsonb_agg(jsonb_build_object(
        'type', 'Feature', 'id', le.id,
        'geometry', st_asgeojson(le.geom, 7)::jsonb,
        'properties', jsonb_build_object(
          'id', le.id, 'soort', 'leiding', 'categorie', le.type, 'materiaal', le.materiaal,
          'diameter_mm', le.diameter_mm, 'nauwkeurigheid', le.nauwkeurigheid,
          'kaartstatus', case when exists (select 1 from storingen s where s.leiding_id = le.id
                                           and s.status in ('gemeld', 'toegewezen', 'in_behandeling'))
                              then 'storing' else 'in_orde' end)
      )), '[]'))
      from leidingen le
      where le.locatie_id = p_locatie and le.gearchiveerd_op is null
    ),
    'objecten', (
      select jsonb_build_object('type', 'FeatureCollection', 'features', coalesce(jsonb_agg(jsonb_build_object(
        'type', 'Feature', 'id', o.id,
        'geometry', st_asgeojson(o.geom, 7)::jsonb,
        'properties', jsonb_build_object(
          'id', o.id, 'soort', 'object', 'code', o.code, 'type', t.naam, 'categorie', t.categorie,
          'icoon', t.icoon, 'hole', h.nummer, 'lus', l.naam, 'kaartstatus', object_kaartstatus(o))
      )), '[]'))
      from objecten o
      join objecttypes t on t.id = o.objecttype_id
      left join holes h on h.id = o.hole_id
      left join lussen l on l.id = h.lus_id
      where o.locatie_id = p_locatie and o.gearchiveerd_op is null
    ),
    'meldingen', (
      select jsonb_build_object('type', 'FeatureCollection', 'features', coalesce(jsonb_agg(jsonb_build_object(
        'type', 'Feature', 'id', s.id,
        'geometry', st_asgeojson(s.geom, 7)::jsonb,
        'properties', jsonb_build_object('id', s.id, 'soort', 'melding', 'omschrijving', s.omschrijving,
                                         'urgentie', s.urgentie, 'status', s.status)
      )), '[]'))
      from storingen s
      where s.locatie_id = p_locatie and s.geom is not null
        and s.object_id is null and s.leiding_id is null and s.machine_id is null
        and s.status in ('gemeld', 'toegewezen', 'in_behandeling')
    ),
    'voorstellen', (
      select jsonb_build_object('type', 'FeatureCollection', 'features', coalesce(jsonb_agg(jsonb_build_object(
        'type', 'Feature', 'id', v.id,
        'geometry', st_asgeojson(st_makeline(v.oude_geom, v.nieuwe_geom), 7)::jsonb,
        'properties', jsonb_build_object('id', v.id, 'object_id', v.object_id)
      )), '[]'))
      from positievoorstellen v
      where v.locatie_id = p_locatie and v.status = 'open' and v.oude_geom is not null
    )
  )
$$;
