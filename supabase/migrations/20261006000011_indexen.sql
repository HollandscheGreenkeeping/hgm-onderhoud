-- Indexen op koppelingen die de app vaak opvraagt (prestatieadvies Supabase).
-- Koppelingen naar profielen (wie deed wat) zijn bewust overgeslagen: daar wordt niet op gezocht.

create index if not exists storingen_machine_id_idx          on storingen (machine_id);
create index if not exists storingen_leiding_id_idx          on storingen (leiding_id);
create index if not exists storingen_toegewezen_aan_idx      on storingen (toegewezen_aan, status);
create index if not exists taken_object_id_idx               on taken (object_id);
create index if not exists taken_machine_id_idx              on taken (machine_id);
create index if not exists taken_schema_id_idx               on taken (schema_id);
create index if not exists onderhoudsschemas_machine_id_idx  on onderhoudsschemas (machine_id);
create index if not exists onderhoudsschemas_object_id_idx   on onderhoudsschemas (object_id);
create index if not exists werkzaamheden_machine_id_idx      on werkzaamheden (machine_id);
create index if not exists werkzaamheden_vlakken_baanvlak_idx on werkzaamheden_vlakken (baanvlak_id);
create index if not exists werkzaamheden_vlakken_hole_idx    on werkzaamheden_vlakken (hole_id);
create index if not exists objecten_hole_id_idx              on objecten (hole_id);
create index if not exists objecten_objecttype_id_idx        on objecten (objecttype_id);
create index if not exists baanvlakken_hole_id_idx           on baanvlakken (hole_id);
create index if not exists positievoorstellen_object_id_idx  on positievoorstellen (object_id);
create index if not exists fotos_locatie_id_idx              on fotos (locatie_id);
create index if not exists draaiuren_registraties_locatie_idx on draaiuren_registraties (locatie_id);
create index if not exists middelen_gebruik_middel_id_idx    on middelen_gebruik (middel_id);
