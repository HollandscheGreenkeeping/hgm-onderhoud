-- Fase 5 · Materieel en rapportages.
--   * Draaiuren invoeren maakt direct een onderhoudstaak aan als een draaiuren-schema vervalt
--     (niet pas 's nachts), ook als een greenkeeper de stand invoert.
--   * dashboard_cijfers: kerncijfers per locatie; security invoker, dus RLS bepaalt wat meetelt
--     (een baanmanager telt geen interne storingen).

set search_path = public, extensions;

-- ── Taken uit schema's: interne kern + beveiligde aanroep ─────────────────

-- Interne kern, zonder rechtencontrole. Niet aanroepbaar via de API (geen EXECUTE-recht).
create function maak_taken_uit_schemas(p_locatie uuid, p_machine uuid default null) returns int
language plpgsql security definer set search_path = public as $$
declare
  s record;
  aantal int := 0;
  deadline date;
begin
  for s in
    select o.*, m.draaiuren as machine_draaiuren
    from onderhoudsschemas o
    left join machines m on m.id = o.machine_id
    where o.actief
      and (p_locatie is null or o.locatie_id = p_locatie)
      and (p_machine is null or o.machine_id = p_machine)
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

create or replace function genereer_taken_uit_schemas(p_locatie uuid default null) returns int
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and (p_locatie is null or not mag_plannen(p_locatie)) then
    raise exception 'Alleen de hoofd-greenkeeper of hoger kan taken uit schema''s aanmaken';
  end if;
  return maak_taken_uit_schemas(p_locatie);
end $$;

create function draaiuren_schemas() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform maak_taken_uit_schemas(new.locatie_id, new.machine_id);
  return null;
end $$;

create trigger draaiuren_schemas after insert on draaiuren_registraties
  for each row execute function draaiuren_schemas();

-- Een lagere stand dan de huidige is vrijwel altijd een tikfout.
create or replace function draaiuren_verwerken() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  huidig numeric;
begin
  select m.locatie_id, m.draaiuren into new.locatie_id, huidig from machines m where m.id = new.machine_id;
  if new.stand < huidig then
    raise exception 'De stand (%) is lager dan de huidige stand (%)', new.stand, huidig;
  end if;
  update machines set draaiuren = new.stand where id = new.machine_id;
  return new;
end $$;

-- ── Dashboard ──────────────────────────────────────────────────────────────

create function dashboard_cijfers(p_locatie uuid default null)
returns table (
  locatie_id uuid, naam text,
  open_storingen bigint, spoed_storingen bigint, open_taken bigint, verlopen_taken bigint,
  werk_deze_week bigint, machines_onderhoud bigint, open_voorstellen bigint
)
language sql stable security invoker set search_path = public as $$
  select l.id, l.naam,
    (select count(*) from storingen s where s.locatie_id = l.id and s.status in ('gemeld', 'toegewezen', 'in_behandeling')),
    (select count(*) from storingen s where s.locatie_id = l.id and s.status in ('gemeld', 'toegewezen', 'in_behandeling')
       and s.urgentie in ('hoog', 'spoed')),
    (select count(*) from taken t where t.locatie_id = l.id and t.status in ('open', 'in_behandeling')),
    (select count(*) from taken t where t.locatie_id = l.id and t.status in ('open', 'in_behandeling')
       and t.deadline < current_date),
    (select count(*) from werkzaamheden w where w.locatie_id = l.id and w.uitgevoerd
       and w.datum >= date_trunc('week', current_date)::date),
    (select count(distinct m.id) from machines m
       where m.locatie_id = l.id and m.gearchiveerd_op is null and (
         exists (select 1 from taken t where t.machine_id = m.id and t.status in ('open', 'in_behandeling'))
         or exists (select 1 from storingen s where s.machine_id = m.id and s.status in ('gemeld', 'toegewezen', 'in_behandeling'))
         or exists (select 1 from onderhoudsschemas o where o.machine_id = m.id and o.actief and (
              (o.interval_eenheid = 'draaiuren' and o.volgende_draaiuren - m.draaiuren <= 25)
              or o.volgende_datum <= current_date + 14))
       )),
    (select count(*) from positievoorstellen v where v.locatie_id = l.id and v.status = 'open')
  from locaties l
  where l.actief and (p_locatie is null or l.id = p_locatie)
  order by l.naam
$$;

-- ── Rechten ────────────────────────────────────────────────────────────────

revoke execute on function maak_taken_uit_schemas(uuid, uuid), draaiuren_schemas() from public, anon, authenticated;
revoke execute on function draaiuren_verwerken() from public, anon, authenticated;
revoke execute on function dashboard_cijfers(uuid) from public, anon;
grant execute on function dashboard_cijfers(uuid) to authenticated;
