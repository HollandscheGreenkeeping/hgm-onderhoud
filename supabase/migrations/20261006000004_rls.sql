-- Fase 1 · Row Level Security volgens de rechtenmatrix (docs/plan.md).
-- Geen policy = geen toegang. Er zijn geen delete-policies op objecten, leidingen,
-- baanvlakken en machines: die worden gearchiveerd, niet verwijderd.
-- QGIS werkt met een databaserol die RLS omzeilt (zie docs/qgis.md).

set search_path = public, extensions;

do $$
declare t text;
begin
  foreach t in array array['locaties', 'lussen', 'profielen', 'locatie_gebruikers', 'instellingen',
                           'keuzelijst_waarden', 'objecttypes', 'holes', 'baanvlakken', 'objecten',
                           'leidingen', 'positievoorstellen', 'machines', 'draaiuren_registraties',
                           'storingen', 'onderhoudsschemas', 'taken', 'werkzaamheden',
                           'werkzaamheden_vlakken', 'middelen_gebruik', 'uren', 'fotos', 'audit_log']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('revoke all on %I from anon', t);
  end loop;
end $$;

-- ── Organisatie ────────────────────────────────────────────────────────────

create policy lezen on locaties for select to authenticated using (heeft_toegang(id));
create policy toevoegen on locaties for insert to authenticated with check (is_beheer());
create policy wijzigen on locaties for update to authenticated using (is_beheer()) with check (is_beheer());

create policy lezen on lussen for select to authenticated using (heeft_toegang(locatie_id));
create policy beheren on lussen for all to authenticated using (is_beheer()) with check (is_beheer());

create policy lezen on profielen for select to authenticated
  using (id = (select auth.uid()) or is_globaal() or deelt_locatie_met(id));
create policy wijzigen on profielen for update to authenticated
  using (id = (select auth.uid()) or is_globaal())
  with check (id = (select auth.uid()) or is_globaal());

create policy lezen on locatie_gebruikers for select to authenticated
  using (profiel_id = (select auth.uid()) or heeft_toegang(locatie_id));
create policy beheren on locatie_gebruikers for all to authenticated
  using (is_globaal()) with check (is_globaal());

create policy lezen on instellingen for select to authenticated using (true);
create policy beheren on instellingen for all to authenticated using (is_beheer()) with check (is_beheer());

create policy lezen on keuzelijst_waarden for select to authenticated using (true);
create policy beheren on keuzelijst_waarden for all to authenticated using (is_beheer()) with check (is_beheer());

create policy lezen on objecttypes for select to authenticated using (true);
create policy beheren on objecttypes for all to authenticated using (is_beheer()) with check (is_beheer());

-- ── Baan en objecten ───────────────────────────────────────────────────────

create policy lezen on holes for select to authenticated using (heeft_toegang(locatie_id));
create policy toevoegen on holes for insert to authenticated with check (is_beheer());
create policy wijzigen on holes for update to authenticated
  using (mag_plannen(locatie_id)) with check (mag_plannen(locatie_id));
create policy verwijderen on holes for delete to authenticated using (is_beheer());

create policy lezen on baanvlakken for select to authenticated using (heeft_toegang(locatie_id));
create policy toevoegen on baanvlakken for insert to authenticated with check (mag_plannen(locatie_id));
create policy wijzigen on baanvlakken for update to authenticated
  using (mag_plannen(locatie_id)) with check (mag_plannen(locatie_id));

create policy lezen on objecten for select to authenticated using (heeft_toegang(locatie_id));
create policy toevoegen on objecten for insert to authenticated with check (mag_plannen(locatie_id));
create policy wijzigen on objecten for update to authenticated
  using (mag_plannen(locatie_id)) with check (mag_plannen(locatie_id));

create policy lezen on leidingen for select to authenticated using (heeft_toegang(locatie_id));
create policy toevoegen on leidingen for insert to authenticated with check (mag_plannen(locatie_id));
create policy wijzigen on leidingen for update to authenticated
  using (mag_plannen(locatie_id)) with check (mag_plannen(locatie_id));

-- Intern proces: de baanmanager ziet geen voorstellen.
create policy lezen on positievoorstellen for select to authenticated using (mag_registreren(locatie_id));
create policy indienen on positievoorstellen for insert to authenticated
  with check (mag_registreren(locatie_id) and ingediend_door = (select auth.uid()));
create policy beoordelen on positievoorstellen for update to authenticated
  using (mag_plannen(locatie_id)) with check (mag_plannen(locatie_id));

-- ── Materieel ──────────────────────────────────────────────────────────────

create policy lezen on machines for select to authenticated using (heeft_toegang(locatie_id));
create policy toevoegen on machines for insert to authenticated with check (mag_plannen(locatie_id));
create policy wijzigen on machines for update to authenticated
  using (mag_plannen(locatie_id)) with check (mag_plannen(locatie_id));

create policy lezen on draaiuren_registraties for select to authenticated using (heeft_toegang(locatie_id));
create policy registreren on draaiuren_registraties for insert to authenticated
  with check (mag_registreren(locatie_id));

-- ── Storingen, onderhoud en taken ──────────────────────────────────────────

create policy lezen on storingen for select to authenticated
  using (heeft_toegang(locatie_id) and (not intern or mag_registreren(locatie_id)));
create policy melden on storingen for insert to authenticated
  with check (mag_registreren(locatie_id) and gemeld_door = (select auth.uid()));
create policy wijzigen on storingen for update to authenticated
  using (mag_registreren(locatie_id)) with check (mag_registreren(locatie_id));

create policy lezen on onderhoudsschemas for select to authenticated using (heeft_toegang(locatie_id));
create policy beheren on onderhoudsschemas for all to authenticated
  using (mag_plannen(locatie_id)) with check (mag_plannen(locatie_id));

create policy lezen on taken for select to authenticated
  using (heeft_toegang(locatie_id) and (not intern or mag_registreren(locatie_id)));
create policy plannen on taken for insert to authenticated with check (mag_plannen(locatie_id));
create policy wijzigen on taken for update to authenticated
  using (mag_plannen(locatie_id)
         or (mag_registreren(locatie_id) and toegewezen_aan = (select auth.uid())))
  with check (mag_plannen(locatie_id)
              or (mag_registreren(locatie_id) and toegewezen_aan = (select auth.uid())));
create policy verwijderen on taken for delete to authenticated using (mag_plannen(locatie_id));

-- ── Werkzaamheden ──────────────────────────────────────────────────────────

create policy lezen on werkzaamheden for select to authenticated using (heeft_toegang(locatie_id));
create policy registreren on werkzaamheden for insert to authenticated
  with check (mag_plannen(locatie_id)
              or (mag_registreren(locatie_id) and medewerker_id = (select auth.uid())));
create policy wijzigen on werkzaamheden for update to authenticated
  using (mag_plannen(locatie_id)
         or (mag_registreren(locatie_id) and medewerker_id = (select auth.uid())))
  with check (mag_plannen(locatie_id)
              or (mag_registreren(locatie_id) and medewerker_id = (select auth.uid())));
create policy verwijderen on werkzaamheden for delete to authenticated
  using (mag_plannen(locatie_id)
         or (mag_registreren(locatie_id) and medewerker_id = (select auth.uid())));

-- Onderliggende rijen volgen de rechten van de werkzaamheid zelf.
create policy lezen on werkzaamheden_vlakken for select to authenticated
  using (exists (select 1 from werkzaamheden w where w.id = werkzaamheid_id));
create policy beheren on werkzaamheden_vlakken for all to authenticated
  using (exists (select 1 from werkzaamheden w where w.id = werkzaamheid_id
                 and (mag_plannen(w.locatie_id) or w.medewerker_id = (select auth.uid()))
                 and mag_registreren(w.locatie_id)))
  with check (exists (select 1 from werkzaamheden w where w.id = werkzaamheid_id
                      and (mag_plannen(w.locatie_id) or w.medewerker_id = (select auth.uid()))
                      and mag_registreren(w.locatie_id)));

create policy lezen on middelen_gebruik for select to authenticated
  using (exists (select 1 from werkzaamheden w where w.id = werkzaamheid_id));
create policy beheren on middelen_gebruik for all to authenticated
  using (exists (select 1 from werkzaamheden w where w.id = werkzaamheid_id
                 and (mag_plannen(w.locatie_id) or w.medewerker_id = (select auth.uid()))
                 and mag_registreren(w.locatie_id)))
  with check (exists (select 1 from werkzaamheden w where w.id = werkzaamheid_id
                      and (mag_plannen(w.locatie_id) or w.medewerker_id = (select auth.uid()))
                      and mag_registreren(w.locatie_id)));

-- Uren zijn intern: eigen uren, of alles voor hoofd-greenkeeper en hoger. Nooit de baanmanager.
create policy lezen on uren for select to authenticated
  using (mag_plannen(locatie_id)
         or (mag_registreren(locatie_id) and profiel_id = (select auth.uid())));
create policy beheren on uren for all to authenticated
  using (mag_plannen(locatie_id)
         or (mag_registreren(locatie_id) and profiel_id = (select auth.uid())))
  with check (mag_plannen(locatie_id)
              or (mag_registreren(locatie_id) and profiel_id = (select auth.uid())));

-- ── Foto's en audit ────────────────────────────────────────────────────────

create policy lezen on fotos for select to authenticated
  using (heeft_toegang(locatie_id) and (not intern or mag_registreren(locatie_id)));
create policy toevoegen on fotos for insert to authenticated
  with check (mag_registreren(locatie_id) and gemaakt_door = (select auth.uid()));
create policy verwijderen on fotos for delete to authenticated
  using (mag_plannen(locatie_id) or gemaakt_door = (select auth.uid()));

create policy lezen on audit_log for select to authenticated
  using (is_globaal() or (locatie_id is not null and mag_plannen(locatie_id)));
