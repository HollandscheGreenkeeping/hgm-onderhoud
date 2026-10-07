-- Fase 7 · Inkoop en voorraad.
--   * Leveranciers en een productcatalogus (meststoffen, gewasbescherming met Ctgb-nummer, zaad, zand,
--     onderdelen, materialen) met eenheid en prijs. Een product kan gekoppeld zijn aan een middel uit de
--     keuzelijst; dan boekt middelengebruik bij uitgevoerd werk automatisch af van de voorraad van die baan.
--   * Voorraad per locatie (baan of de werkplaats) = som van voorraadmutaties (view voorraad).
--     Onderdelen op een werkorder (werkorder_regels.product_id) boeken af van de werkplaats.
--   * Bestellingen: aanvraag (hoofd-greenkeeper, monteur) → goedgekeurd/afgewezen (beheer, onderhoudsmanager)
--     → besteld (bestelbon als PDF/e-mail vanuit de app) → (deels) ontvangen, geboekt als voorraadmutatie.
--   * Budget per locatie per jaar of maand; kosten per maand (inkoop + werkplaats). Alleen intern:
--     beheer, onderhoudsmanager en de hoofd-greenkeeper voor de eigen baan.

set search_path = public, extensions;

-- ── Rechtenfuncties ────────────────────────────────────────────────────────

-- Hoofd-greenkeeper op minstens één baan (voor catalogus en leveranciers, die niet per baan zijn).
create function is_hoofdgreenkeeper() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from locatie_gebruikers lg join profielen p on p.id = lg.profiel_id and p.actief
    where lg.profiel_id = auth.uid() and lg.rol = 'hoofdgreenkeeper'
  )
$$;

-- Catalogus en leveranciers inzien: beheer, onderhoudsmanager, monteur, hoofd-greenkeeper.
create function is_inkoper() returns boolean
language sql stable security definer set search_path = public as $$
  select is_globaal() or is_monteur() or is_hoofdgreenkeeper()
$$;

-- Bestelaanvraag doen, voorraad en ontvangst boeken op een locatie.
create function mag_bestellen(p_locatie uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select mag_plannen(p_locatie) or is_monteur()
$$;

-- ── Leveranciers en producten ──────────────────────────────────────────────

create table leveranciers (
  id              uuid primary key default gen_random_uuid(),
  naam            text not null unique,
  contactpersoon  text,
  email           text,
  telefoon        text,
  adres           text,
  website         text,
  klantnummer     text,                 -- ons klantnummer bij deze leverancier
  afspraken       text,                 -- levertijd, minimale afname, kortingen, ...
  gearchiveerd_op timestamptz,
  aangemaakt_op   timestamptz not null default now(),
  bijgewerkt_op   timestamptz not null default now()
);

create type product_categorie as enum ('meststof', 'gewasbescherming', 'graszaad', 'zand', 'onderdeel', 'materiaal');

create table producten (
  id              uuid primary key default gen_random_uuid(),
  naam            text not null,
  categorie       product_categorie not null,
  leverancier_id  uuid references leveranciers,
  artikelnummer   text,
  eenheid         text not null,        -- kg, l, st, zak, ton, ...
  prijs           numeric(10, 2) check (prijs >= 0),   -- per eenheid, excl. btw
  ctgb_nummer     text,                 -- toelatingsnummer gewasbeschermingsmiddel
  middel_id       uuid references keuzelijst_waarden,  -- koppeling met middelengebruik (keuzelijst 'middel')
  opmerking       text,
  gearchiveerd_op timestamptz,
  aangemaakt_op   timestamptz not null default now(),
  bijgewerkt_op   timestamptz not null default now()
);
create index on producten (leverancier_id);
-- Eén actief product per middel, zodat afboeken eenduidig is.
create unique index producten_een_per_middel on producten (middel_id) where middel_id is not null and gearchiveerd_op is null;

-- ── Voorraad ───────────────────────────────────────────────────────────────

create type mutatie_soort as enum ('ontvangst', 'verbruik', 'correctie');

-- Elke wijziging van de voorraad is een mutatie (+ bij ontvangst, − bij verbruik). Nooit wijzigen;
-- een fout herstel je met een correctie. Automatische mutaties (verbruik) houden de bron bij.
create table voorraadmutaties (
  id              uuid primary key default gen_random_uuid(),
  locatie_id      uuid not null references locaties,
  product_id      uuid not null references producten,
  aantal          numeric(12, 2) not null check (aantal <> 0),
  soort           mutatie_soort not null,
  bron_tabel      text check (bron_tabel in ('bestelregels', 'middelen_gebruik', 'werkorder_regels')),
  bron_id         uuid,
  houdbaar_tot    date,                 -- partij gewasbeschermingsmiddel
  notitie         text,
  door            uuid default auth.uid() references profielen,
  op              timestamptz not null default now()
);
create index on voorraadmutaties (locatie_id, product_id);
create index on voorraadmutaties (bron_tabel, bron_id);

create table voorraad_minimum (
  locatie_id      uuid not null references locaties,
  product_id      uuid not null references producten,
  minimum         numeric(12, 2) not null check (minimum >= 0),
  primary key (locatie_id, product_id)
);

-- Stand per locatie en product. security_invoker: de RLS van mutaties en minima geldt.
create view voorraad with (security_invoker = true) as
  select coalesce(s.locatie_id, m.locatie_id) as locatie_id,
         coalesce(s.product_id, m.product_id) as product_id,
         coalesce(s.stand, 0) as stand,
         m.minimum,
         coalesce(s.stand, 0) < coalesce(m.minimum, 0) as onder_minimum
  from (select locatie_id, product_id, sum(aantal) as stand from voorraadmutaties group by locatie_id, product_id) s
  full join voorraad_minimum m on m.locatie_id = s.locatie_id and m.product_id = s.product_id;

-- ── Bestellingen ───────────────────────────────────────────────────────────

create type bestel_status as enum (
  'aanvraag', 'goedgekeurd', 'afgewezen', 'besteld', 'deels_ontvangen', 'ontvangen', 'geannuleerd'
);

create table bestellingen (
  id              uuid primary key default gen_random_uuid(),
  nummer          bigint generated always as identity unique,   -- B-12 in de app
  locatie_id      uuid not null references locaties,            -- waar het naartoe gaat (baan of werkplaats)
  leverancier_id  uuid not null references leveranciers,
  status          bestel_status not null default 'aanvraag',
  toelichting     text,
  gewenst_op      date,
  aangevraagd_door uuid default auth.uid() references profielen,
  aangevraagd_op  timestamptz not null default now(),
  beoordeeld_door uuid references profielen,
  beoordeeld_op   timestamptz,
  beoordeling     text,                 -- reden bij afwijzen
  besteld_op      timestamptz,
  ontvangen_op    timestamptz,
  aangemaakt_op   timestamptz not null default now(),
  bijgewerkt_op   timestamptz not null default now()
);
create index on bestellingen (locatie_id, status);

create table bestelregels (
  id              uuid primary key default gen_random_uuid(),
  bestelling_id   uuid not null references bestellingen on delete cascade,
  locatie_id      uuid not null references locaties,            -- overgenomen van de bestelling
  product_id      uuid not null references producten,
  aantal          numeric(12, 2) not null check (aantal > 0),
  prijs           numeric(10, 2) check (prijs >= 0),            -- per eenheid op het moment van bestellen
  ontvangen       numeric(12, 2) not null default 0,
  aangemaakt_op   timestamptz not null default now()
);
create index on bestelregels (bestelling_id);

-- ── Budget ─────────────────────────────────────────────────────────────────

create table budgetten (
  id              uuid primary key default gen_random_uuid(),
  locatie_id      uuid not null references locaties,
  jaar            int  not null check (jaar between 2000 and 2100),
  maand           int  check (maand between 1 and 12),          -- null = hele jaar
  bedrag          numeric(12, 2) not null check (bedrag >= 0),
  aangemaakt_op   timestamptz not null default now(),
  bijgewerkt_op   timestamptz not null default now()
);
create unique index budgetten_uniek on budgetten (locatie_id, jaar, coalesce(maand, 0));

-- Onderdelen op een werkorder kunnen uit de catalogus komen (afboeken van de werkplaats).
alter table werkorder_regels add column product_id uuid references producten;

-- ── Triggers ───────────────────────────────────────────────────────────────

do $$
declare t text;
begin
  foreach t in array array['leveranciers', 'producten', 'bestellingen', 'budgetten']
  loop
    execute format('create trigger zet_bijgewerkt_op before update on %I
                    for each row execute function zet_bijgewerkt_op()', t);
  end loop;
end $$;

-- Statusverloop van een bestelling. Wie niet beheer/onderhoudsmanager is, mag alleen een eigen
-- aanvraag aanpassen of annuleren. Goedkeuren, afwijzen en bestellen doet beheer/onderhoudsmanager.
create function bestelling_bijwerken() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if new.status <> 'aanvraag' then
      raise exception 'Een bestelling begint als aanvraag';
    end if;
    return new;
  end if;
  if new.locatie_id <> old.locatie_id or new.aangevraagd_door is distinct from old.aangevraagd_door then
    raise exception 'Locatie en aanvrager van een bestelling zijn niet te wijzigen';
  end if;
  if new.status is distinct from old.status then
    if auth.uid() is not null and not is_globaal()
       and not (old.status = 'aanvraag' and new.status = 'geannuleerd')
       and not (old.status in ('besteld', 'deels_ontvangen') and new.status in ('deels_ontvangen', 'ontvangen')) then
      raise exception 'Alleen beheer of de onderhoudsmanager kan een bestelling goedkeuren of bestellen';
    end if;
    if new.status in ('goedgekeurd', 'afgewezen') and old.status <> 'aanvraag' then
      raise exception 'Alleen een aanvraag kan worden goedgekeurd of afgewezen';
    end if;
    if new.status = 'besteld' and old.status <> 'goedgekeurd' then
      raise exception 'Een bestelling moet eerst zijn goedgekeurd';
    end if;
    if new.status in ('goedgekeurd', 'afgewezen') then
      new.beoordeeld_door := auth.uid();
      new.beoordeeld_op := now();
    end if;
    if new.status = 'besteld' then new.besteld_op := now(); end if;
    if new.status = 'ontvangen' then new.ontvangen_op := now(); end if;
  end if;
  return new;
end $$;

create trigger bijwerken before insert or update on bestellingen
  for each row execute function bestelling_bijwerken();

-- Regel: locatie en (standaard) prijs overnemen.
create function bestelregel_vullen() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  select b.locatie_id into new.locatie_id from bestellingen b where b.id = new.bestelling_id;
  if new.prijs is null then
    select p.prijs into new.prijs from producten p where p.id = new.product_id;
  end if;
  return new;
end $$;

create trigger vullen before insert or update on bestelregels
  for each row execute function bestelregel_vullen();

-- Mutatie: bij ontvangst op een bestelregel de regel en de bestelling bijwerken.
create function voorraadmutatie_vullen() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  r record;
begin
  if new.bron_tabel = 'bestelregels' then
    select br.*, b.status as bestelstatus into r
    from bestelregels br join bestellingen b on b.id = br.bestelling_id where br.id = new.bron_id;
    if r is null then
      raise exception 'Bestelregel niet gevonden';
    end if;
    if r.bestelstatus not in ('besteld', 'deels_ontvangen') then
      raise exception 'Alleen een bestelde bestelling kan worden ontvangen';
    end if;
    new.locatie_id := r.locatie_id;
    new.product_id := r.product_id;
    new.soort := 'ontvangst';
  end if;
  return new;
end $$;

create trigger vullen before insert on voorraadmutaties
  for each row execute function voorraadmutatie_vullen();

create function ontvangst_verwerken() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  b uuid;
begin
  if new.bron_tabel = 'bestelregels' then
    update bestelregels set ontvangen = ontvangen + new.aantal where id = new.bron_id returning bestelling_id into b;
    update bestellingen
    set status = case when exists (select 1 from bestelregels where bestelling_id = b and ontvangen < aantal)
                      then 'deels_ontvangen'::bestel_status else 'ontvangen'::bestel_status end
    where id = b;
  end if;
  return null;
end $$;

create trigger ontvangst after insert on voorraadmutaties
  for each row execute function ontvangst_verwerken();

-- Middelengebruik → verbruik. Alleen bij uitgevoerd werk en een gekoppeld product; opnieuw berekend
-- bij elke wijziging van het gebruik of van de werkzaamheid (afvinken, verplaatsen, verwijderen).
create function middelen_afboeken(p_werkzaamheid uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  delete from voorraadmutaties v
  using middelen_gebruik g
  where v.bron_tabel = 'middelen_gebruik' and v.bron_id = g.id and g.werkzaamheid_id = p_werkzaamheid;

  insert into voorraadmutaties (locatie_id, product_id, aantal, soort, bron_tabel, bron_id, door)
  select w.locatie_id, p.id, -g.hoeveelheid_totaal, 'verbruik', 'middelen_gebruik', g.id, w.medewerker_id
  from middelen_gebruik g
  join werkzaamheden w on w.id = g.werkzaamheid_id and w.uitgevoerd
  join producten p on p.middel_id = g.middel_id and p.gearchiveerd_op is null
  where g.werkzaamheid_id = p_werkzaamheid and coalesce(g.hoeveelheid_totaal, 0) > 0;
end $$;

create function middelengebruik_afboeken() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    delete from voorraadmutaties where bron_tabel = 'middelen_gebruik' and bron_id = old.id;
    perform middelen_afboeken(old.werkzaamheid_id);
  else
    perform middelen_afboeken(new.werkzaamheid_id);
    if tg_op = 'UPDATE' and old.werkzaamheid_id <> new.werkzaamheid_id then
      perform middelen_afboeken(old.werkzaamheid_id);
    end if;
  end if;
  return null;
end $$;

create trigger afboeken after insert or update or delete on middelen_gebruik
  for each row execute function middelengebruik_afboeken();

create function werkzaamheid_afboeken() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform middelen_afboeken(new.id);
  return null;
end $$;

create trigger afboeken after update of uitgevoerd, locatie_id on werkzaamheden
  for each row execute function werkzaamheid_afboeken();

-- Onderdeel uit de catalogus op een werkorder: standaardprijs en afboeken van de werkplaats.
create function werkorder_regel_product() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.product_id is not null and new.bedrag is null then
    select round(p.prijs * new.aantal, 2) into new.bedrag from producten p where p.id = new.product_id;
  end if;
  return new;
end $$;

create trigger product before insert or update on werkorder_regels
  for each row execute function werkorder_regel_product();

create function werkorder_regel_afboeken() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op <> 'INSERT' then
    delete from voorraadmutaties where bron_tabel = 'werkorder_regels' and bron_id = old.id;
  end if;
  if tg_op <> 'DELETE' and new.product_id is not null and werkplaats_id() is not null then
    insert into voorraadmutaties (locatie_id, product_id, aantal, soort, bron_tabel, bron_id, door)
    values (werkplaats_id(), new.product_id, -new.aantal, 'verbruik', 'werkorder_regels', new.id, new.toegevoegd_door);
  end if;
  return null;
end $$;

create trigger afboeken after insert or update or delete on werkorder_regels
  for each row execute function werkorder_regel_afboeken();

do $$
declare t text;
begin
  foreach t in array array['leveranciers', 'producten', 'bestellingen', 'bestelregels', 'voorraadmutaties', 'budgetten']
  loop
    execute format('create trigger audit after insert or update or delete on %I
                    for each row execute function audit()', t);
  end loop;
end $$;

-- ── Kosten en budget per maand ─────────────────────────────────────────────

-- Per locatie en maand: inkoop (waarde van wat binnenkwam), werkplaats (onderdelen + uren op werkorders
-- voor machines van die baan) en budget. Alleen voor wie mag plannen op die locatie.
create function kosten_per_maand(p_jaar int, p_locatie uuid default null)
returns table (locatie_id uuid, maand int, inkoop numeric, werkplaats numeric, budget numeric)
language sql stable security definer set search_path = public as $$
  with tarief as (
    select coalesce((select (i.waarde #>> '{}')::numeric from instellingen i where i.sleutel = 'werkplaats_uurtarief'), 0) as per_uur
  ),
  locs as (
    select l.id from locaties l
    where l.actief and (p_locatie is null or l.id = p_locatie) and mag_plannen(l.id)
  ),
  maanden as (select generate_series(1, 12) as maand),
  inkoop as (
    select v.locatie_id, extract(month from v.op)::int as maand, sum(v.aantal * coalesce(br.prijs, 0)) as bedrag
    from voorraadmutaties v join bestelregels br on br.id = v.bron_id
    where v.bron_tabel = 'bestelregels' and extract(year from v.op) = p_jaar
    group by 1, 2
  ),
  onderdelen as (
    select w.locatie_id, extract(month from r.aangemaakt_op)::int as maand, sum(coalesce(r.bedrag, 0)) as bedrag
    from werkorder_regels r join werkorders w on w.id = r.werkorder_id
    where extract(year from r.aangemaakt_op) = p_jaar
    group by 1, 2
  ),
  uren as (
    select w.locatie_id, extract(month from u.datum)::int as maand, sum(u.minuten) / 60.0 * (select per_uur from tarief) as bedrag
    from uren u join werkorders w on w.id = u.bron_id
    where u.bron_tabel = 'werkorders' and extract(year from u.datum) = p_jaar
    group by 1, 2
  )
  select l.id, m.maand,
    round(coalesce(i.bedrag, 0), 2),
    round(coalesce(o.bedrag, 0) + coalesce(u.bedrag, 0), 2),
    coalesce(
      (select b.bedrag from budgetten b where b.locatie_id = l.id and b.jaar = p_jaar and b.maand = m.maand),
      (select round(b.bedrag / 12, 2) from budgetten b where b.locatie_id = l.id and b.jaar = p_jaar and b.maand is null))
  from locs l cross join maanden m
  left join inkoop i on i.locatie_id = l.id and i.maand = m.maand
  left join onderdelen o on o.locatie_id = l.id and o.maand = m.maand
  left join uren u on u.locatie_id = l.id and u.maand = m.maand
  order by l.id, m.maand
$$;

-- ── RLS ────────────────────────────────────────────────────────────────────

do $$
declare t text;
begin
  foreach t in array array['leveranciers', 'producten', 'voorraadmutaties', 'voorraad_minimum',
                           'bestellingen', 'bestelregels', 'budgetten']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('revoke all on %I from anon', t);
  end loop;
end $$;
revoke all on voorraad from anon;

-- Catalogus en leveranciers: inzien voor inkopers, beheren door beheer en onderhoudsmanager.
create policy lezen on leveranciers for select to authenticated using (is_inkoper());
create policy beheren on leveranciers for all to authenticated using (is_globaal()) with check (is_globaal());
create policy lezen on producten for select to authenticated using (is_inkoper());
create policy beheren on producten for all to authenticated using (is_globaal()) with check (is_globaal());

-- Voorraad: hoofd-greenkeeper eigen baan, monteur, beheer en onderhoudsmanager. Handmatig boeken kan
-- alleen een ontvangst of correctie; verbruik boekt de database zelf. Mutaties zijn niet te wijzigen.
create policy lezen on voorraadmutaties for select to authenticated using (mag_bestellen(locatie_id));
create policy boeken on voorraadmutaties for insert to authenticated
  with check (mag_bestellen(locatie_id) and soort in ('ontvangst', 'correctie') and door = (select auth.uid()));
create policy lezen on voorraad_minimum for select to authenticated using (mag_bestellen(locatie_id));
create policy beheren on voorraad_minimum for all to authenticated
  using (mag_bestellen(locatie_id)) with check (mag_bestellen(locatie_id));

create policy lezen on bestellingen for select to authenticated using (mag_bestellen(locatie_id));
create policy aanvragen on bestellingen for insert to authenticated
  with check (mag_bestellen(locatie_id) and aangevraagd_door = (select auth.uid()));
-- De aanvrager past een eigen aanvraag aan of annuleert hem; de rest doet beheer/onderhoudsmanager.
-- (Ontvangst werkt de status bij via de database zelf.)
create policy wijzigen on bestellingen for update to authenticated
  using (is_globaal() or (mag_bestellen(locatie_id) and aangevraagd_door = (select auth.uid()) and status = 'aanvraag'))
  with check (mag_bestellen(locatie_id));

-- Regels: zichtbaar met de bestelling; wijzigen zolang het een aanvraag is (aanvrager) of tot het
-- bestellen (beheer, onderhoudsmanager).
create policy lezen on bestelregels for select to authenticated
  using (exists (select 1 from bestellingen b where b.id = bestelling_id));
create policy beheren on bestelregels for all to authenticated
  using (exists (select 1 from bestellingen b where b.id = bestelling_id
                 and ((b.status = 'aanvraag' and b.aangevraagd_door = (select auth.uid()))
                      or (b.status in ('aanvraag', 'goedgekeurd') and is_globaal()))))
  with check (exists (select 1 from bestellingen b where b.id = bestelling_id
                      and ((b.status = 'aanvraag' and b.aangevraagd_door = (select auth.uid()))
                           or (b.status in ('aanvraag', 'goedgekeurd') and is_globaal()))));

create policy lezen on budgetten for select to authenticated using (mag_plannen(locatie_id));
create policy beheren on budgetten for all to authenticated using (is_globaal()) with check (is_globaal());

-- ── Functierechten ─────────────────────────────────────────────────────────

revoke execute on function
  bestelling_bijwerken(), bestelregel_vullen(), voorraadmutatie_vullen(), ontvangst_verwerken(),
  middelen_afboeken(uuid), middelengebruik_afboeken(), werkzaamheid_afboeken(),
  werkorder_regel_product(), werkorder_regel_afboeken()
from public, anon, authenticated;

grant execute on function
  is_hoofdgreenkeeper(), is_inkoper(), mag_bestellen(uuid), kosten_per_maand(int, uuid)
to authenticated;
