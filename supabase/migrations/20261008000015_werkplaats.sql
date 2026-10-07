-- Fase 6 · Werkplaats en technische dienst (2/2).
--   * Rol monteur: HGM-breed (profielen.globale_rol), op alle locaties. Mag registreren (defect melden,
--     eigen uren), werkorders plannen en uitvoeren en keuringen bijhouden. Telt niet als 'globaal'
--     (is_globaal = beheer of onderhoudsmanager): geen gebruikersbeheer, geen kosten, geen tweestapsplicht.
--   * Eén centrale werkplaats als locatie van soort 'werkplaats'.
--   * Werkorders voor machines en installaties (objecten): uit een defectmelding (automatisch),
--     uit gepland onderhoud (schema met via_werkplaats) of handmatig. De baan van de machine
--     is de locatie_id; de machine verhuist tijdens de reparatie naar de werkplaats (huidige_locatie_id).
--   * Uren van monteurs in de bestaande tabel uren (bron_tabel 'werkorders'), onderdelen in
--     werkorder_regels. Beide nooit zichtbaar voor de baanmanager.
--   * Keuringen per machine of installatie, met geldig-tot-datum en herinnering.

set search_path = public, extensions;

-- ── Rollen en rechtenfuncties ──────────────────────────────────────────────

alter table profielen drop constraint profielen_globale_rol_check;
alter table profielen add constraint profielen_globale_rol_check
  check (globale_rol in ('beheer', 'onderhoudsmanager', 'monteur'));

-- Tweestapsverificatie (mfa_verplicht) geldt voor beheer en onderhoudsmanager, niet voor de monteur.
create or replace function mijn_globale_rol() returns rol
language sql stable security definer set search_path = public as $$
  select p.globale_rol
  from profielen p
  where p.id = auth.uid()
    and p.actief
    and (
      p.globale_rol = 'monteur'
      or not coalesce((select i.waarde::boolean from instellingen i where i.sleutel = 'mfa_verplicht'), false)
      or coalesce(auth.jwt() ->> 'aal', '') = 'aal2'
    )
$$;

-- beheer of onderhoudsmanager (dus niet de monteur)
create or replace function is_globaal() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(mijn_globale_rol() in ('beheer', 'onderhoudsmanager'), false)
$$;

create function is_monteur() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(mijn_globale_rol() = 'monteur', false)
$$;

-- Werkorders plannen en uitvoeren, keuringen bijhouden: beheer, onderhoudsmanager, monteur.
create function mag_werkplaats() returns boolean
language sql stable security definer set search_path = public as $$
  select is_globaal() or is_monteur()
$$;

-- De monteur werkt met iedereen; collega's zien de naam van de monteur op een werkorder.
drop policy lezen on profielen;
create policy lezen on profielen for select to authenticated
  using (id = (select auth.uid()) or is_globaal() or is_monteur() or deelt_locatie_met(id)
         or (globale_rol = 'monteur' and exists (
               select 1 from locatie_gebruikers lg
               where lg.profiel_id = (select auth.uid()) and lg.rol <> 'baanmanager')));

-- ── Werkplaats als locatie ─────────────────────────────────────────────────

create type locatie_soort as enum ('baan', 'werkplaats');
alter table locaties add column soort locatie_soort not null default 'baan';
create unique index locaties_een_werkplaats on locaties (soort) where soort = 'werkplaats';

insert into locaties (naam, soort, adres) values ('Centrale werkplaats', 'werkplaats', 'Almkerk')
on conflict (naam) do nothing;

-- Locatiekeuze in de app, nu met soort (banen en de werkplaats apart tonen).
drop function mijn_locaties();
create function mijn_locaties()
returns table (locatie_id uuid, naam text, rol rol, soort locatie_soort)
language sql stable security definer set search_path = public as $$
  select l.id, l.naam, mijn_rol(l.id), l.soort
  from locaties l
  where l.actief and mijn_rol(l.id) is not null
  order by l.naam
$$;

create function werkplaats_id() returns uuid
language sql stable security definer set search_path = public as $$
  select id from locaties where soort = 'werkplaats' and actief limit 1
$$;

-- ── Machines: huidige standplaats ──────────────────────────────────────────

-- locatie_id = de baan waar de machine bij hoort (rechten); huidige_locatie_id = waar hij nu is
-- (in de werkplaats, of als vervangend materieel op een andere baan).
alter table machines add column huidige_locatie_id uuid references locaties;
update machines set huidige_locatie_id = locatie_id;
alter table machines alter column huidige_locatie_id set not null;

create function machine_standplaats() returns trigger
language plpgsql set search_path = public as $$
begin
  new.huidige_locatie_id := coalesce(new.huidige_locatie_id, new.locatie_id);
  return new;
end $$;

create trigger machine_standplaats before insert on machines
  for each row execute function machine_standplaats();

-- Wie op een baan werkt, ziet ook vervangend materieel dat daar tijdelijk staat.
drop policy lezen on machines;
create policy lezen on machines for select to authenticated
  using (heeft_toegang(locatie_id) or heeft_toegang(huidige_locatie_id));

-- Onderhoud via de werkplaats: het schema maakt dan een werkorder in plaats van een taak.
alter table onderhoudsschemas add column via_werkplaats boolean not null default false;
alter table onderhoudsschemas add constraint via_werkplaats_heeft_doel
  check (not via_werkplaats or machine_id is not null or object_id is not null);

-- ── Werkorders ─────────────────────────────────────────────────────────────

create type werkorder_status as enum (
  'aangevraagd', 'ingepland', 'in_werkplaats', 'wacht_op_onderdelen', 'gereed', 'terug_op_locatie', 'geannuleerd'
);
create type werkorder_bron as enum ('defect', 'onderhoud', 'handmatig');

create table werkorders (
  id              uuid primary key default gen_random_uuid(),
  nummer          bigint generated always as identity unique,   -- WO-12 in de app
  locatie_id      uuid not null references locaties,            -- baan van de machine of het object
  machine_id      uuid references machines,
  object_id       uuid references objecten,                     -- installaties: pompstation, filter, ...
  bron            werkorder_bron not null default 'handmatig',
  storing_id      uuid references storingen,
  schema_id       uuid references onderhoudsschemas,
  omschrijving    text not null,
  urgentie        urgentie not null default 'normaal',
  status          werkorder_status not null default 'aangevraagd',
  monteur_id      uuid references profielen,
  gepland_op      date,
  bevindingen     text,
  vervangende_machine_id uuid references machines,
  aangevraagd_door uuid default auth.uid() references profielen,
  aangevraagd_op  timestamptz not null default now(),
  gereed_op       timestamptz,
  afgerond_op     timestamptz,
  aangemaakt_op   timestamptz not null default now(),
  bijgewerkt_op   timestamptz not null default now(),
  check (num_nonnulls(machine_id, object_id) = 1),
  check (vervangende_machine_id is distinct from machine_id)
);
create index on werkorders (locatie_id, status);
create index on werkorders (machine_id);
create index on werkorders (monteur_id, gepland_op);
create index on werkorders (storing_id);
create index on werkorders (schema_id);

-- Gebruikte onderdelen en materialen (uren staan in de tabel uren, bron_tabel 'werkorders').
create table werkorder_regels (
  id              uuid primary key default gen_random_uuid(),
  werkorder_id    uuid not null references werkorders on delete cascade,
  locatie_id      uuid not null references locaties,            -- overgenomen van de werkorder
  omschrijving    text not null,
  aantal          numeric(10, 2) not null default 1 check (aantal > 0),
  eenheid         text,
  bedrag          numeric(10, 2) check (bedrag >= 0),           -- kostprijs van de regel, excl. btw
  toegevoegd_door uuid default auth.uid() references profielen,
  aangemaakt_op   timestamptz not null default now()
);
create index on werkorder_regels (werkorder_id);

-- ── Keuringen ──────────────────────────────────────────────────────────────

create table keuringen (
  id              uuid primary key default gen_random_uuid(),
  locatie_id      uuid not null references locaties,            -- overgenomen van machine of object
  machine_id      uuid references machines,
  object_id       uuid references objecten,
  soort_id        uuid not null references keuzelijst_waarden,  -- keuzelijst 'keuringsoort'
  gekeurd_op      date,
  geldig_tot      date not null,
  interval_maanden int check (interval_maanden > 0),            -- voor de volgende geldig-tot-datum
  herinnering_dagen int not null default 30 check (herinnering_dagen >= 0),
  keurder         text,
  certificaat_pad text,                                         -- bucket 'fotos': {locatie_id}/keuringen/...
  opmerking       text,
  gearchiveerd_op timestamptz,
  aangemaakt_op   timestamptz not null default now(),
  bijgewerkt_op   timestamptz not null default now(),
  check (num_nonnulls(machine_id, object_id) = 1)
);
create index on keuringen (locatie_id, geldig_tot);
create index on keuringen (machine_id);

insert into keuzelijst_waarden (lijst, naam, volgorde) values
  ('keuringsoort', 'Voertuigkeuring', 1),
  ('keuringsoort', 'SKL-keuring spuitapparatuur', 2),
  ('keuringsoort', 'Veiligheidskeuring', 3)
on conflict (lijst, naam) do nothing;

-- ── Uren, foto's en certificaten ───────────────────────────────────────────

alter table uren drop constraint uren_bron_tabel_check;
alter table uren add constraint uren_bron_tabel_check
  check (bron_tabel in ('werkzaamheden', 'storingen', 'taken', 'werkorders'));

alter table fotos drop constraint fotos_tabel_check;
alter table fotos add constraint fotos_tabel_check
  check (tabel in ('objecten', 'leidingen', 'storingen', 'taken', 'werkzaamheden', 'machines',
                   'positievoorstellen', 'werkorders', 'keuringen'));

-- Keuringscertificaten zijn vaak PDF.
update storage.buckets
set allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf']
where id = 'fotos';

-- ── Triggers ───────────────────────────────────────────────────────────────

-- Locatie overnemen van machine of object; statusverloop en tijdstempels.
-- Heet 'bijwerken' zodat hij vóór 'controleer_locatie' draait (triggers gaan op naam).
create function werkorder_bijwerken() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and (new.machine_id is distinct from old.machine_id or new.object_id is distinct from old.object_id) then
    raise exception 'Machine of installatie van een werkorder is niet te wijzigen';
  end if;
  if new.machine_id is not null then
    select m.locatie_id into new.locatie_id from machines m where m.id = new.machine_id;
  else
    select o.locatie_id into new.locatie_id from objecten o where o.id = new.object_id;
  end if;

  if new.status = 'aangevraagd' and new.monteur_id is not null and new.gepland_op is not null then
    new.status := 'ingepland';
  end if;
  if new.status = 'gereed' and (tg_op = 'INSERT' or old.status <> 'gereed') then
    new.gereed_op := now();
  end if;
  if new.status in ('terug_op_locatie', 'geannuleerd') then
    if tg_op = 'INSERT' or old.status not in ('terug_op_locatie', 'geannuleerd') then
      new.afgerond_op := now();
    end if;
  else
    new.afgerond_op := null;
  end if;
  return new;
end $$;

create trigger bijwerken before insert or update on werkorders
  for each row execute function werkorder_bijwerken();
create trigger controleer_locatie before insert or update on werkorders
  for each row execute function controleer_locatie();
create trigger zet_bijgewerkt_op before update on werkorders
  for each row execute function zet_bijgewerkt_op();

-- Gevolgen van de status: machine naar de werkplaats en terug, vervangend materieel,
-- en de defectmelding opgelost zodra de reparatie gereed is.
create function werkorder_verwerken() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  in_werkplaats boolean := new.status in ('in_werkplaats', 'wacht_op_onderdelen', 'gereed');
  was_in_werkplaats boolean := tg_op = 'UPDATE' and old.status in ('in_werkplaats', 'wacht_op_onderdelen', 'gereed');
  afgerond boolean := new.status in ('terug_op_locatie', 'geannuleerd');
begin
  if new.machine_id is not null then
    if in_werkplaats and werkplaats_id() is not null then
      update machines set huidige_locatie_id = werkplaats_id() where id = new.machine_id;
    elsif was_in_werkplaats then
      update machines set huidige_locatie_id = locatie_id where id = new.machine_id;
    end if;
  end if;

  if tg_op = 'UPDATE' and old.vervangende_machine_id is not null
     and (old.vervangende_machine_id is distinct from new.vervangende_machine_id or afgerond) then
    update machines set huidige_locatie_id = locatie_id where id = old.vervangende_machine_id;
  end if;
  if new.vervangende_machine_id is not null and not afgerond then
    update machines set huidige_locatie_id = new.locatie_id where id = new.vervangende_machine_id;
  end if;

  if new.storing_id is not null and new.status in ('gereed', 'terug_op_locatie')
     and (tg_op = 'INSERT' or old.status not in ('gereed', 'terug_op_locatie')) then
    update storingen
    set status = 'opgelost',
        oplossing = coalesce(oplossing, new.bevindingen, format('Gerepareerd door de werkplaats (WO-%s)', new.nummer))
    where id = new.storing_id and status in ('gemeld', 'toegewezen', 'in_behandeling');
  end if;
  return null;
end $$;

create trigger verwerken after insert or update on werkorders
  for each row execute function werkorder_verwerken();

-- Een defect aan een machine wordt direct een werkorder (aanvraag) voor de werkplaats.
create function storing_naar_werkorder() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.machine_id is not null then
    insert into werkorders (machine_id, bron, storing_id, omschrijving, urgentie, aangevraagd_door)
    values (new.machine_id, 'defect', new.id,
            coalesce((select k.naam from keuzelijst_waarden k where k.id = new.storingstype_id), new.omschrijving, 'Defect gemeld'),
            new.urgentie, new.gemeld_door);
  end if;
  return null;
end $$;

create trigger naar_werkorder after insert on storingen
  for each row execute function storing_naar_werkorder();

-- Onderdeelregels en keuringen: locatie overnemen.
create function werkorder_regel_vullen() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  select w.locatie_id into new.locatie_id from werkorders w where w.id = new.werkorder_id;
  return new;
end $$;

create trigger vullen before insert or update on werkorder_regels
  for each row execute function werkorder_regel_vullen();

create function keuring_vullen() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.machine_id is not null then
    select m.locatie_id into new.locatie_id from machines m where m.id = new.machine_id;
  else
    select o.locatie_id into new.locatie_id from objecten o where o.id = new.object_id;
  end if;
  if not exists (select 1 from keuzelijst_waarden k where k.id = new.soort_id and k.lijst = 'keuringsoort') then
    raise exception 'Kies een soort keuring uit de keuzelijst';
  end if;
  return new;
end $$;

create trigger vullen before insert or update on keuringen
  for each row execute function keuring_vullen();
create trigger zet_bijgewerkt_op before update on keuringen
  for each row execute function zet_bijgewerkt_op();

create trigger audit after insert or update or delete on werkorders
  for each row execute function audit();
create trigger audit after insert or update or delete on keuringen
  for each row execute function audit();

-- ── Gepland onderhoud via de werkplaats ────────────────────────────────────

-- Zelfde als in fase 5, plus: een schema met via_werkplaats maakt een werkorder in plaats van een taak.
create or replace function maak_taken_uit_schemas(p_locatie uuid, p_machine uuid default null) returns int
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

    if s.via_werkplaats then
      if not exists (select 1 from werkorders w where w.schema_id = s.id
                     and w.status not in ('terug_op_locatie', 'geannuleerd')) then
        insert into werkorders (machine_id, object_id, bron, schema_id, omschrijving, aangevraagd_door)
        values (s.machine_id, s.object_id, 'onderhoud', s.id, s.omschrijving, null);
        aantal := aantal + 1;
      end if;
    elsif not exists (select 1 from taken t where t.schema_id = s.id and t.status in ('open', 'in_behandeling')) then
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

-- ── Kosten per machine ─────────────────────────────────────────────────────

-- Onderdelen plus uren (tegen het uurtarief uit instellingen 'werkplaats_uurtarief') over de hele
-- levensduur. Alleen voor wie mag plannen op de baan van de machine: beheer, onderhoudsmanager en
-- hoofd-greenkeeper (eigen baan). Niet voor de monteur en de baanmanager.
create function machine_kosten(p_locatie uuid default null)
returns table (
  machine_id uuid, locatie_id uuid, werkorders bigint, minuten bigint, onderdelen numeric, uurkosten numeric, totaal numeric
)
language sql stable security definer set search_path = public as $$
  with tarief as (
    select coalesce((select (i.waarde #>> '{}')::numeric from instellingen i where i.sleutel = 'werkplaats_uurtarief'), 0) as per_uur
  ), per_machine as (
    select m.id, m.locatie_id,
      (select count(*) from werkorders w where w.machine_id = m.id and w.status <> 'geannuleerd') as werkorders,
      coalesce((select sum(u.minuten) from uren u join werkorders w on w.id = u.bron_id
                where u.bron_tabel = 'werkorders' and w.machine_id = m.id), 0)::bigint as minuten,
      coalesce((select sum(r.bedrag) from werkorder_regels r join werkorders w on w.id = r.werkorder_id
                where w.machine_id = m.id), 0) as onderdelen
    from machines m
    where (p_locatie is null or m.locatie_id = p_locatie) and mag_plannen(m.locatie_id)
  )
  select p.id, p.locatie_id, p.werkorders, p.minuten, p.onderdelen,
         round(p.minuten / 60.0 * t.per_uur, 2), round(p.onderdelen + p.minuten / 60.0 * t.per_uur, 2)
  from per_machine p, tarief t
$$;

-- ── Dashboard: alleen banen ────────────────────────────────────────────────

create or replace function dashboard_cijfers(p_locatie uuid default null)
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
  where l.actief and l.soort = 'baan' and (p_locatie is null or l.id = p_locatie)
  order by l.naam
$$;

-- ── RLS ────────────────────────────────────────────────────────────────────

alter table werkorders enable row level security;
alter table werkorder_regels enable row level security;
alter table keuringen enable row level security;
revoke all on werkorders, werkorder_regels, keuringen from anon;

-- Werkorders zijn intern: niet voor de baanmanager.
create policy lezen on werkorders for select to authenticated using (mag_registreren(locatie_id));
-- Iedereen die registreert mag een werkorder aanvragen; plannen en uitvoeren doet de werkplaats.
create policy aanvragen on werkorders for insert to authenticated
  with check (mag_werkplaats()
              or (mag_registreren(locatie_id) and aangevraagd_door = (select auth.uid())
                  and status = 'aangevraagd' and monteur_id is null));
create policy wijzigen on werkorders for update to authenticated
  using (mag_werkplaats()) with check (mag_werkplaats());

-- Onderdelen en kosten: werkplaats en wie mag plannen op de baan.
create policy lezen on werkorder_regels for select to authenticated
  using (mag_werkplaats() or mag_plannen(locatie_id));
create policy beheren on werkorder_regels for all to authenticated
  using (mag_werkplaats()) with check (mag_werkplaats());

create policy lezen on keuringen for select to authenticated using (mag_registreren(locatie_id));
create policy toevoegen on keuringen for insert to authenticated
  with check (mag_werkplaats() or mag_plannen(locatie_id));
create policy wijzigen on keuringen for update to authenticated
  using (mag_werkplaats() or mag_plannen(locatie_id)) with check (mag_werkplaats() or mag_plannen(locatie_id));

-- ── Functierechten ─────────────────────────────────────────────────────────

revoke execute on function
  machine_standplaats(), werkorder_bijwerken(), werkorder_verwerken(), storing_naar_werkorder(),
  werkorder_regel_vullen(), keuring_vullen()
from public, anon, authenticated;

grant execute on function
  is_monteur(), mag_werkplaats(), mijn_locaties(), werkplaats_id(), machine_kosten(uuid)
to authenticated;
