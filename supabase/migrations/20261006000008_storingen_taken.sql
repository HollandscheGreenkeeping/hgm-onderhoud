-- Fase 3 · Storingen en taken: regels voor toewijzen en statusverloop, en het team per locatie.

set search_path = public, extensions;

-- Greenkeeper mag een storing alleen zelf oppakken (aan zichzelf toewijzen), niet aan een ander
-- toewijzen, en niet het object of de locatie van een melding wijzigen.
-- 'gecontroleerd' kan alleen na 'opgelost'; terug naar behandeling wist de oplosdatum.
create function bewaak_storing() returns trigger
language plpgsql set search_path = public as $$
begin
  if auth.uid() is not null and not mag_plannen(new.locatie_id) then
    if new.toegewezen_aan is not null and new.toegewezen_aan <> auth.uid()
       and (tg_op = 'INSERT' or new.toegewezen_aan is distinct from old.toegewezen_aan) then
      raise exception 'Alleen de hoofd-greenkeeper kan een storing aan een ander toewijzen';
    end if;
    if tg_op = 'UPDATE' and (new.locatie_id <> old.locatie_id
        or new.object_id is distinct from old.object_id
        or new.leiding_id is distinct from old.leiding_id
        or new.machine_id is distinct from old.machine_id
        or new.gemeld_door <> old.gemeld_door) then
      raise exception 'Object en melder van een storing zijn niet te wijzigen';
    end if;
  end if;
  if tg_op = 'UPDATE' then
    if new.status = 'gecontroleerd' and old.status not in ('opgelost', 'gecontroleerd') then
      raise exception 'Een storing kan pas gecontroleerd worden als hij is opgelost';
    end if;
    if new.status in ('gemeld', 'toegewezen', 'in_behandeling') and old.status in ('opgelost', 'gecontroleerd') then
      new.opgelost_op := null;
      new.gecontroleerd_door := null;
      new.gecontroleerd_op := null;
    end if;
  end if;
  return new;
end $$;

create trigger bewaak_storing before insert or update on storingen
  for each row execute function bewaak_storing();

-- Medewerkers van een locatie (om taken en storingen aan toe te wijzen).
create function locatie_team(p_locatie uuid)
returns table (id uuid, naam text, rol rol)
language sql stable security invoker set search_path = public as $$
  select p.id, coalesce(p.naam, p.email), lg.rol
  from locatie_gebruikers lg
  join profielen p on p.id = lg.profiel_id and p.actief
  where lg.locatie_id = p_locatie and lg.rol in ('hoofdgreenkeeper', 'greenkeeper')
  order by lg.rol, p.naam
$$;

revoke execute on function bewaak_storing() from public, anon, authenticated;
revoke execute on function locatie_team(uuid) from public, anon;
grant execute on function locatie_team(uuid) to authenticated;
