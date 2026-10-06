-- Fase 1 · Rechtenfuncties en domeintriggers.
-- De rechtenfuncties zijn security definer, zodat ze profielen/locatie_gebruikers kunnen lezen
-- zonder door de RLS van die tabellen te worden geblokkeerd.

set search_path = public, extensions;

-- ── Rechtenfuncties ────────────────────────────────────────────────────────

-- Globale rol van de ingelogde gebruiker (beheer/onderhoudsmanager), anders null.
-- Als instelling mfa_verplicht aan staat, telt een globale rol alleen na tweestapsverificatie (aal2).
create function mijn_globale_rol() returns rol
language sql stable security definer set search_path = public as $$
  select p.globale_rol
  from profielen p
  where p.id = auth.uid()
    and p.actief
    and (
      not coalesce((select i.waarde::boolean from instellingen i where i.sleutel = 'mfa_verplicht'), false)
      or coalesce(auth.jwt() ->> 'aal', '') = 'aal2'
    )
$$;

-- Effectieve rol op een locatie: globale rol gaat voor, anders de rol op die locatie.
create function mijn_rol(p_locatie uuid) returns rol
language sql stable security definer set search_path = public as $$
  select coalesce(
    mijn_globale_rol(),
    (select lg.rol
       from locatie_gebruikers lg
       join profielen p on p.id = lg.profiel_id and p.actief
      where lg.profiel_id = auth.uid() and lg.locatie_id = p_locatie)
  )
$$;

create function is_beheer() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(mijn_globale_rol() = 'beheer', false)
$$;

-- beheer of onderhoudsmanager
create function is_globaal() returns boolean
language sql stable security definer set search_path = public as $$
  select mijn_globale_rol() is not null
$$;

-- Mag meekijken (alle vijf rollen).
create function heeft_toegang(p_locatie uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select mijn_rol(p_locatie) is not null
$$;

-- Mag registreren: storing melden, werk vastleggen (alles behalve baanmanager).
create function mag_registreren(p_locatie uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(mijn_rol(p_locatie) <> 'baanmanager', false)
$$;

-- Mag plannen en objecten beheren: beheer, onderhoudsmanager, hoofd-greenkeeper.
create function mag_plannen(p_locatie uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(mijn_rol(p_locatie) in ('beheer', 'onderhoudsmanager', 'hoofdgreenkeeper'), false)
$$;

-- Locaties waar de gebruiker bij kan (voor de app: locatiekeuze).
create function mijn_locaties()
returns table (locatie_id uuid, naam text, rol rol)
language sql stable security definer set search_path = public as $$
  select l.id, l.naam, mijn_rol(l.id)
  from locaties l
  where l.actief and mijn_rol(l.id) is not null
  order by l.naam
$$;

-- Deelt de ingelogde gebruiker een locatie met dit profiel? (collega's zien elkaars naam)
create function deelt_locatie_met(p_profiel uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from locatie_gebruikers a
    join locatie_gebruikers b on b.locatie_id = a.locatie_id
    where a.profiel_id = auth.uid() and b.profiel_id = p_profiel
  )
$$;

revoke execute on all functions in schema public from anon;

-- ── Nieuw account → profiel ────────────────────────────────────────────────

create function nieuw_profiel() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profielen (id, email, naam)
  values (new.id, new.email, coalesce(new.raw_user_meta_data ->> 'naam', split_part(new.email, '@', 1)));
  return new;
end $$;

create trigger nieuw_profiel after insert on auth.users
  for each row execute function nieuw_profiel();

-- Alleen beheer mag globale rollen toekennen; alleen beheer/onderhoudsmanager (de)activeren.
-- Zonder auth.uid() (service-sleutel, SQL-editor, QGIS) is alles toegestaan.
create function bewaak_profiel() returns trigger
language plpgsql as $$
begin
  if auth.uid() is null then
    return new;
  end if;
  if new.globale_rol is distinct from old.globale_rol and not is_beheer() then
    raise exception 'Alleen beheer mag een globale rol toekennen';
  end if;
  if new.actief is distinct from old.actief and not is_globaal() then
    raise exception 'Alleen beheer of onderhoudsmanager mag een account (de)activeren';
  end if;
  if new.id <> old.id or new.email is distinct from old.email then
    raise exception 'id en e-mail van een profiel zijn niet te wijzigen';
  end if;
  return new;
end $$;

create trigger bewaak_profiel before update on profielen
  for each row execute function bewaak_profiel();

-- ── Lussen en holes ────────────────────────────────────────────────────────

-- Holes ontbreken? Aanmaken tot aantal_holes. Overtollige holes blijven staan (historie).
create function lus_holes_aanvullen() returns trigger
language plpgsql as $$
begin
  insert into holes (locatie_id, lus_id, nummer)
  select new.locatie_id, new.id, n
  from generate_series(1, new.aantal_holes) n
  on conflict (lus_id, nummer) do nothing;
  return new;
end $$;

create trigger lus_holes_aanvullen after insert or update of aantal_holes on lussen
  for each row execute function lus_holes_aanvullen();

-- Een hole hoort bij dezelfde locatie als zijn lus.
create function hole_locatie_van_lus() returns trigger
language plpgsql as $$
begin
  select l.locatie_id into new.locatie_id from lussen l where l.id = new.lus_id;
  return new;
end $$;

create trigger hole_locatie_van_lus before insert or update of lus_id, locatie_id on holes
  for each row execute function hole_locatie_van_lus();

-- ── Geometrie ──────────────────────────────────────────────────────────────

create function bereken_oppervlakte() returns trigger
language plpgsql as $$
begin
  new.oppervlakte_m2 := round(st_area(new.geom::geography)::numeric, 1);
  return new;
end $$;

create trigger bereken_oppervlakte before insert or update of geom on baanvlakken
  for each row execute function bereken_oppervlakte();

-- ── Samenhang van locatie_id ───────────────────────────────────────────────

-- Gekoppelde rijen (hole, object, leiding, machine) moeten op dezelfde locatie liggen.
create function controleer_locatie() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  j jsonb := to_jsonb(new);
  kolom text;
  tabel text;
  gevonden uuid;
begin
  foreach kolom in array array['hole_id', 'object_id', 'leiding_id', 'machine_id', 'storing_id', 'schema_id', 'taak_id']
  loop
    if j ? kolom and j ->> kolom is not null then
      tabel := case kolom
        when 'hole_id' then 'holes' when 'object_id' then 'objecten'
        when 'leiding_id' then 'leidingen' when 'machine_id' then 'machines'
        when 'storing_id' then 'storingen' when 'schema_id' then 'onderhoudsschemas'
        when 'taak_id' then 'taken' end;
      execute format('select locatie_id from %I where id = $1', tabel) into gevonden using (j ->> kolom)::uuid;
      if gevonden is distinct from new.locatie_id then
        raise exception '% hoort niet bij deze locatie', kolom;
      end if;
    end if;
  end loop;
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['baanvlakken', 'objecten', 'storingen', 'onderhoudsschemas', 'taken', 'werkzaamheden']
  loop
    execute format('create trigger controleer_locatie before insert or update on %I
                    for each row execute function controleer_locatie()', t);
  end loop;
end $$;

-- ── Positievoorstellen ─────────────────────────────────────────────────────

create function positievoorstel_vullen() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  select o.locatie_id, o.geom into new.locatie_id, new.oude_geom
  from objecten o where o.id = new.object_id;
  new.status := 'open';
  new.ingediend_door := auth.uid();
  new.ingediend_op := now();
  new.beoordeeld_door := null;
  new.beoordeeld_op := null;
  return new;
end $$;

create trigger positievoorstel_vullen before insert on positievoorstellen
  for each row execute function positievoorstel_vullen();

-- Goedkeuren verschuift het object (de audit-trigger op objecten legt dat vast).
create function positievoorstel_beoordelen() returns trigger
language plpgsql as $$
begin
  if old.status <> 'open' then
    raise exception 'Dit voorstel is al beoordeeld';
  end if;
  if new.object_id <> old.object_id or new.locatie_id <> old.locatie_id
     or not st_equals(new.nieuwe_geom, old.nieuwe_geom) then
    raise exception 'Object en positie van een voorstel zijn niet te wijzigen';
  end if;
  if new.status <> 'open' then
    new.beoordeeld_door := auth.uid();
    new.beoordeeld_op := now();
  end if;
  if new.status = 'goedgekeurd' then
    update objecten set geom = new.nieuwe_geom where id = new.object_id;
  end if;
  return new;
end $$;

create trigger positievoorstel_beoordelen before update on positievoorstellen
  for each row execute function positievoorstel_beoordelen();

-- ── Draaiuren ──────────────────────────────────────────────────────────────

create function draaiuren_verwerken() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  select m.locatie_id into new.locatie_id from machines m where m.id = new.machine_id;
  update machines set draaiuren = greatest(draaiuren, new.stand) where id = new.machine_id;
  return new;
end $$;

create trigger draaiuren_verwerken before insert on draaiuren_registraties
  for each row execute function draaiuren_verwerken();

-- ── Storingen en taken: statusverloop ──────────────────────────────────────

create function storing_status_bijwerken() returns trigger
language plpgsql as $$
begin
  if new.status = 'gemeld' and new.toegewezen_aan is not null then
    new.status := 'toegewezen';
  end if;
  if new.status = 'opgelost' and (tg_op = 'INSERT' or old.status <> 'opgelost') then
    new.opgelost_op := coalesce(new.opgelost_op, now());
  end if;
  if new.status = 'gecontroleerd' and (tg_op = 'INSERT' or old.status <> 'gecontroleerd') then
    if auth.uid() is not null and not mag_plannen(new.locatie_id) then
      raise exception 'Alleen de hoofd-greenkeeper of hoger kan een storing als gecontroleerd markeren';
    end if;
    new.gecontroleerd_door := auth.uid();
    new.gecontroleerd_op := now();
  end if;
  return new;
end $$;

create trigger storing_status_bijwerken before insert or update on storingen
  for each row execute function storing_status_bijwerken();

-- Greenkeeper mag bij een eigen taak alleen de status aanpassen, niet de taak zelf.
create function taak_bijwerken() returns trigger
language plpgsql as $$
begin
  if tg_op = 'UPDATE' and auth.uid() is not null and not mag_plannen(old.locatie_id) then
    if (to_jsonb(new) - array['status', 'afgerond_op', 'afgerond_door', 'bijgewerkt_op'])
       is distinct from (to_jsonb(old) - array['status', 'afgerond_op', 'afgerond_door', 'bijgewerkt_op']) then
      raise exception 'Een greenkeeper kan alleen de status van een eigen taak wijzigen';
    end if;
  end if;
  if new.status = 'afgerond' and (tg_op = 'INSERT' or old.status <> 'afgerond') then
    new.afgerond_op := now();
    new.afgerond_door := auth.uid();
  elsif new.status <> 'afgerond' then
    new.afgerond_op := null;
    new.afgerond_door := null;
  end if;
  return new;
end $$;

create trigger taak_bijwerken before insert or update on taken
  for each row execute function taak_bijwerken();

-- ── Audit log ──────────────────────────────────────────────────────────────

create function audit() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  oud jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end;
  nieuw jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end;
begin
  if tg_op = 'UPDATE' and (oud - 'bijgewerkt_op') = (nieuw - 'bijgewerkt_op') then
    return new;
  end if;
  insert into audit_log (tabel, rij_id, locatie_id, actie, oude_waarde, nieuwe_waarde, door)
  values (tg_table_name,
          (coalesce(nieuw, oud) ->> 'id')::uuid,
          (coalesce(nieuw, oud) ->> 'locatie_id')::uuid,
          tg_op, oud, nieuw, auth.uid());
  return coalesce(new, old);
end $$;

do $$
declare t text;
begin
  foreach t in array array['objecten', 'leidingen', 'storingen', 'baanvlakken', 'holes',
                           'positievoorstellen', 'machines', 'locatie_gebruikers']
  loop
    execute format('create trigger audit after insert or update or delete on %I
                    for each row execute function audit()', t);
  end loop;
end $$;
