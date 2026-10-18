-- Bestandenbank (HGM → Bestanden): opgeslagen posters uit de postergenerator en losse bestanden
-- (flyers, PDF's, mails, foto's). HGM-breed materiaal, geen baandata, dus geen locatie_id.
-- Alleen voor HGM-medewerkers: niet voor iemand die alleen baanmanager is.
-- Niets echt verwijderen: gearchiveerd_op zetten.

-- ── Rechtenfunctie ─────────────────────────────────────────────────────────

-- Beheer, onderhoudsmanager, monteur, of op minstens één baan (hoofd-)greenkeeper.
create function is_hgm_medewerker() returns boolean
language sql stable security definer set search_path = public as $$
  select mag_werkplaats() or exists (
    select 1 from locatie_gebruikers lg join profielen p on p.id = lg.profiel_id
    where lg.profiel_id = auth.uid() and p.actief and lg.rol <> 'baanmanager')
$$;

-- ── Tabel ──────────────────────────────────────────────────────────────────

create table bestanden (
  id               uuid primary key default gen_random_uuid(),
  soort            text not null check (soort in ('poster', 'bestand')),
  titel            text not null check (length(trim(titel)) > 0),
  map              text,                -- vrije indeling, bijv. 'Veiligheid' of 'Flyers'
  omschrijving     text,
  poster           jsonb,               -- instellingen van de postergenerator (soort = 'poster')
  opslag_pad       text,                -- bestand in bucket 'bestanden' (of eigen foto van een poster)
  bestandsnaam     text,
  mime_type        text,
  grootte          bigint,
  aangemaakt_door  uuid not null default auth.uid() references profielen,
  aangemaakt_op    timestamptz not null default now(),
  bijgewerkt_op    timestamptz not null default now(),
  gearchiveerd_op  timestamptz,
  check (soort <> 'poster' or poster is not null),
  check (soort <> 'bestand' or opslag_pad is not null)
);
create index on bestanden (map) where gearchiveerd_op is null;

create trigger bijgewerkt_op before update on bestanden
  for each row execute function zet_bijgewerkt_op();

alter table bestanden enable row level security;

create policy lezen on bestanden for select to authenticated using (is_hgm_medewerker());
create policy toevoegen on bestanden for insert to authenticated
  with check (is_hgm_medewerker() and aangemaakt_door = (select auth.uid()));
-- Wijzigen en archiveren: wie het gemaakt heeft, of beheer en onderhoudsmanager.
create policy wijzigen on bestanden for update to authenticated
  using (is_hgm_medewerker() and (aangemaakt_door = (select auth.uid()) or is_globaal()))
  with check (is_hgm_medewerker() and (aangemaakt_door = (select auth.uid()) or is_globaal()));

-- ── Opslag ─────────────────────────────────────────────────────────────────

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('bestanden', 'bestanden', false, 50 * 1024 * 1024, array[
  'application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/svg+xml', 'text/html',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'video/mp4'])
on conflict (id) do nothing;

-- Pad begint met het profiel-id van wie uploadt. Niet te overschrijven of te verwijderen.
create policy "bestanden lezen" on storage.objects for select to authenticated
  using (bucket_id = 'bestanden' and public.is_hgm_medewerker());
create policy "bestanden uploaden" on storage.objects for insert to authenticated
  with check (bucket_id = 'bestanden' and public.is_hgm_medewerker()
              and split_part(name, '/', 1) = (select auth.uid())::text);
