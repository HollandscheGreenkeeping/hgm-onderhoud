-- Beveiligingsadvies Supabase opgevolgd:
-- 1. Vaste search_path op alle triggerfuncties.
-- 2. Functies niet meer aanroepbaar zonder inloggen. Postgres geeft EXECUTE standaard aan
--    PUBLIC, dus alleen 'revoke from anon' (migratie 3) was niet genoeg.
-- 3. Triggerfuncties zijn niet bedoeld als API: ook niet voor ingelogde gebruikers.
--    (Triggers vuren ook zonder EXECUTE-recht van de gebruiker.)

alter function zet_bijgewerkt_op()          set search_path = public;
alter function bewaak_profiel()             set search_path = public;
alter function lus_holes_aanvullen()        set search_path = public;
alter function hole_locatie_van_lus()       set search_path = public;
alter function bereken_oppervlakte()        set search_path = public, extensions;
alter function positievoorstel_beoordelen() set search_path = public, extensions;
alter function storing_status_bijwerken()   set search_path = public;
alter function taak_bijwerken()             set search_path = public;
alter function locatie_uit_pad(text)        set search_path = public;

revoke execute on all functions in schema public from public, anon;
alter default privileges in schema public revoke execute on functions from public, anon;

revoke execute on function
  zet_bijgewerkt_op(), bewaak_profiel(), lus_holes_aanvullen(), hole_locatie_van_lus(),
  bereken_oppervlakte(), positievoorstel_beoordelen(), storing_status_bijwerken(), taak_bijwerken(),
  nieuw_profiel(), controleer_locatie(), positievoorstel_vullen(), draaiuren_verwerken(), audit()
from authenticated;

-- Rechtenfuncties (nodig in RLS-policies) en de app-functies blijven voor ingelogde gebruikers.
grant execute on function
  mijn_globale_rol(), mijn_rol(uuid), is_beheer(), is_globaal(), heeft_toegang(uuid),
  mag_registreren(uuid), mag_plannen(uuid), mijn_locaties(), deelt_locatie_met(uuid),
  locatie_uit_pad(text), object_kaartstatus(objecten), kaart_lagen(uuid), open_positievoorstellen(uuid)
to authenticated;
