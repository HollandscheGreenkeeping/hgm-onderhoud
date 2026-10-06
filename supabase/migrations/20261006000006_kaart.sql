-- Fase 2 · Kaart: alle lagen van een locatie in één aanroep, als GeoJSON.
-- security invoker: de RLS van de gebruiker geldt, dus een baanmanager krijgt geen interne
-- storingen en geen positievoorstellen mee.

set search_path = public, extensions;

-- Kaartstatus van een object: storing (open storing) > in_onderhoud (handmatig gezet)
-- > gepland (taak of schema binnen 7 dagen) > in_orde.
create function object_kaartstatus(p_object objecten) returns text
language sql stable security invoker set search_path = public as $$
  select case
    when exists (select 1 from storingen s
                 where s.object_id = p_object.id and s.status in ('gemeld', 'toegewezen', 'in_behandeling'))
      then 'storing'
    when p_object.status = 'storing' then 'storing'
    when p_object.status = 'in_onderhoud' then 'in_onderhoud'
    when exists (select 1 from taken t
                 where t.object_id = p_object.id and t.status in ('open', 'in_behandeling')
                   and coalesce(t.gepland_op, t.deadline) <= current_date + 7)
      or exists (select 1 from onderhoudsschemas o
                 where o.actief and o.volgende_datum <= current_date + 7
                   and (o.object_id = p_object.id
                        or (o.objecttype_id = p_object.objecttype_id and o.locatie_id = p_object.locatie_id)))
      then 'gepland'
    else 'in_orde'
  end
$$;

create function kaart_lagen(p_locatie uuid) returns jsonb
language sql stable security invoker set search_path = public, extensions as $$
  select jsonb_build_object(
    'centrum', (select st_asgeojson(l.geom, 7)::jsonb from locaties l where l.id = p_locatie),
    'holes', (
      select jsonb_build_object('type', 'FeatureCollection', 'features', coalesce(jsonb_agg(jsonb_build_object(
        'type', 'Feature', 'id', h.id,
        'geometry', st_asgeojson(h.geom, 7)::jsonb,
        'properties', jsonb_build_object('id', h.id, 'nummer', h.nummer, 'par', h.par, 'naam', h.naam,
                                         'lus', l.naam, 'lus_volgorde', l.volgorde)
      ) order by l.volgorde, h.nummer), '[]'))
      from holes h join lussen l on l.id = h.lus_id
      where h.locatie_id = p_locatie and h.geom is not null
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
    -- Open meldingen zonder object (bijv. natte plek) op hun meldplek.
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

-- Open positievoorstellen met coördinaten, voor de goedkeurlijst.
create function open_positievoorstellen(p_locatie uuid)
returns table (id uuid, object_id uuid, object_code text, objecttype text, toelichting text,
               ingediend_door text, ingediend_op timestamptz, afstand_m numeric,
               oud_lon float8, oud_lat float8, nieuw_lon float8, nieuw_lat float8)
language sql stable security invoker set search_path = public, extensions as $$
  select v.id, v.object_id, o.code, t.naam, v.toelichting, p.naam, v.ingediend_op,
         round(st_distance(v.oude_geom::geography, v.nieuwe_geom::geography)::numeric, 1),
         st_x(v.oude_geom), st_y(v.oude_geom), st_x(v.nieuwe_geom), st_y(v.nieuwe_geom)
  from positievoorstellen v
  join objecten o on o.id = v.object_id
  join objecttypes t on t.id = o.objecttype_id
  left join profielen p on p.id = v.ingediend_door
  where v.locatie_id = p_locatie and v.status = 'open'
  order by v.ingediend_op
$$;

revoke execute on function object_kaartstatus(objecten), kaart_lagen(uuid), open_positievoorstellen(uuid) from anon;
