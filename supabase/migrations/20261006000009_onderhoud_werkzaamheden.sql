-- Fase 4 · Gepland onderhoud en dagelijkse werkzaamheden.
--   * Onderhoudsschema's maken automatisch taken aan (dagelijks via pg_cron, of direct via de app).
--   * Dagplanning = werkzaamheden met uitgevoerd = false, klaargezet door de hoofd-greenkeeper;
--     de greenkeeper vinkt af (uitgevoerd = true). Zo is de planning meteen de registratie.

set search_path = public, extensions;

-- ── Onderhoudsschema's ─────────────────────────────────────────────────────

alter table onderhoudsschemas
  add column vooruit_dagen   int  not null default 7 check (vooruit_dagen between 0 and 60),
  add column toegewezen_aan  uuid references profielen,
  add column intern          boolean not null default false;

comment on column onderhoudsschemas.vooruit_dagen is
  'Zoveel dagen vóór de vervaldatum wordt de taak aangemaakt, zodat hij in de planning staat.';

-- Volgende datum na een interval.
create function volgende_vervaldatum(p_datum date, p_waarde int, p_eenheid interval_eenheid) returns date
language sql immutable set search_path = public as $$
  select (p_datum + case p_eenheid
    when 'dagen'   then make_interval(days => p_waarde)
    when 'weken'   then make_interval(weeks => p_waarde)
    when 'maanden' then make_interval(months => p_waarde)
    when 'jaren'   then make_interval(years => p_waarde)
  end)::date
$$;

-- Maakt taken aan voor schema's die (bijna) vervallen en schuift de volgende datum op.
-- Op datum: zodra volgende_datum - vooruit_dagen <= vandaag. Op draaiuren: zodra de machine
-- de stand bereikt. Achterstallige perioden leveren één taak op, niet een stapel.
-- Zonder ingelogde gebruiker (pg_cron) voor alle locaties; vanuit de app alleen voor
-- een locatie waar de gebruiker mag plannen.
create function genereer_taken_uit_schemas(p_locatie uuid default null) returns int
language plpgsql security definer set search_path = public as $$
declare
  s record;
  aantal int := 0;
  deadline date;
begin
  if auth.uid() is not null and (p_locatie is null or not mag_plannen(p_locatie)) then
    raise exception 'Alleen de hoofd-greenkeeper of hoger kan taken uit schema''s aanmaken';
  end if;

  for s in
    select o.*, m.draaiuren as machine_draaiuren
    from onderhoudsschemas o
    left join machines m on m.id = o.machine_id
    where o.actief
      and (p_locatie is null or o.locatie_id = p_locatie)
      and (
        (o.interval_eenheid <> 'draaiuren' and o.volgende_datum is not null
           and o.volgende_datum - o.vooruit_dagen <= current_date)
        or (o.interval_eenheid = 'draaiuren' and o.volgende_draaiuren is not null
           and m.draaiuren >= o.volgende_draaiuren)
      )
    for update of o
  loop
    deadline := case when s.interval_eenheid = 'draaiuren' then current_date + 7 else s.volgende_datum end;

    if not exists (select 1 from taken t where t.schema_id = s.id and t.status in ('open', 'in_behandeling')) then
      insert into taken (locatie_id, bron, schema_id, object_id, machine_id, omschrijving, deadline,
                         toegewezen_aan, intern, aangemaakt_door)
      values (s.locatie_id, 'schema', s.id, s.object_id, s.machine_id, s.omschrijving, deadline,
              s.toegewezen_aan, s.intern, null);
      aantal := aantal + 1;
    end if;

    if s.interval_eenheid = 'draaiuren' then
      update onderhoudsschemas
      set volgende_draaiuren = s.volgende_draaiuren
          + s.interval_waarde * greatest(1, ceil((s.machine_draaiuren - s.volgende_draaiuren) / s.interval_waarde + 0.0001))
      where id = s.id;
    else
      -- Doorschuiven tot een datum ná vandaag (+ vooruit), zodat een lang stilgelegen schema
      -- niet elke dag een nieuwe taak oplevert.
      deadline := s.volgende_datum;
      loop
        deadline := volgende_vervaldatum(deadline, s.interval_waarde, s.interval_eenheid);
        exit when deadline - s.vooruit_dagen > current_date;
      end loop;
      update onderhoudsschemas set volgende_datum = deadline where id = s.id;
    end if;
  end loop;

  return aantal;
end $$;

-- ── Werkzaamheden en dagplanning ───────────────────────────────────────────

alter table werkzaamheden
  add column uitgevoerd   boolean not null default true,
  add column volgorde     int not null default 0,
  add column gepland_door uuid references profielen;

create index on werkzaamheden (locatie_id, datum, uitgevoerd);
create index on werkzaamheden (medewerker_id, datum);

-- Een greenkeeper mag een klaargezette werkzaamheid afvinken en aanvullen (machine, notitie),
-- maar niet de activiteit, datum of medewerker wijzigen.
create function bewaak_werkzaamheid() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if not new.uitgevoerd then new.gepland_door := coalesce(new.gepland_door, auth.uid()); end if;
    return new;
  end if;
  if auth.uid() is not null and not mag_plannen(old.locatie_id) and old.gepland_door is not null
     and old.gepland_door <> auth.uid()
     and (new.activiteit_id <> old.activiteit_id or new.datum <> old.datum
          or new.medewerker_id <> old.medewerker_id or new.locatie_id <> old.locatie_id) then
    raise exception 'Een klaargezette werkzaamheid kun je afvinken, niet wijzigen';
  end if;
  return new;
end $$;

create trigger bewaak_werkzaamheid before insert or update on werkzaamheden
  for each row execute function bewaak_werkzaamheid();

-- ── Rechten ────────────────────────────────────────────────────────────────

revoke execute on function volgende_vervaldatum(date, int, interval_eenheid), genereer_taken_uit_schemas(uuid),
  bewaak_werkzaamheid() from public, anon;
revoke execute on function bewaak_werkzaamheid() from authenticated;
grant execute on function volgende_vervaldatum(date, int, interval_eenheid), genereer_taken_uit_schemas(uuid)
  to authenticated;

-- ── Dagelijks inplannen (alleen waar pg_cron bestaat, dus niet in de lokale testdatabase) ──
-- 03:00 UTC = 05:00 zomertijd / 04:00 wintertijd, vóór de ochtendplanning.

do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    execute 'create extension if not exists pg_cron';
    execute $c$select cron.schedule('taken-uit-onderhoudsschemas', '0 3 * * *',
                                    'select public.genereer_taken_uit_schemas()')$c$;
  end if;
end $$;
