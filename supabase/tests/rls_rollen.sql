-- RLS-test per rol. Alles gebeurt in één transactie die aan het eind wordt teruggedraaid,
-- dus dit is veilig te draaien in de Supabase SQL-editor van een (test)project:
-- plak het hele bestand en voer uit. Eindigt met 'ALLE RLS-TESTS GESLAAGD', anders een fout
-- met de naam van de mislukte test.
-- Lokaal: npm run test:db (scripts/test-db.mjs, embedded Postgres + PostGIS).

begin;

set search_path = public, extensions;

-- ── Hulpfuncties ───────────────────────────────────────────────────────────

create schema tests;
grant usage on schema tests to authenticated;

create function tests.is(p_naam text, p_gekregen anyelement, p_verwacht anyelement) returns void
language plpgsql as $$
begin
  if p_gekregen is distinct from p_verwacht then
    raise exception 'TEST MISLUKT: % (gekregen %, verwacht %)', p_naam, p_gekregen, p_verwacht;
  end if;
end $$;

-- Verwacht dat de SQL-opdracht een fout geeft (RLS-weigering of triggerfout).
create function tests.fout(p_naam text, p_sql text) returns void
language plpgsql as $$
begin
  execute p_sql;
  raise exception 'TEST MISLUKT: % (geen fout, wel verwacht)', p_naam;
exception when others then
  if sqlerrm like 'TEST MISLUKT%' then raise; end if;
end $$;

-- Aantal rijen dat een update/delete raakt (RLS filtert stil weg: 0 = geweigerd).
create function tests.rijen(p_sql text) returns int
language plpgsql as $$
declare n int;
begin
  execute p_sql;
  get diagnostics n = row_count;
  return n;
end $$;

-- Inloggen als testgebruiker: zet JWT-claims en wissel naar de rol authenticated.
create function tests.als(p_email text, p_aal text default 'aal1') returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', (select id from auth.users where email = p_email),
                      'role', 'authenticated', 'aal', p_aal)::text, true);
  perform set_config('role', 'authenticated', true);
end $$;

grant execute on all functions in schema tests to authenticated;

-- ── Testdata (als databasebeheerder, zonder RLS) ───────────────────────────

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000001', 'beheer@test.nl'),
  ('00000000-0000-0000-0000-000000000002', 'om@test.nl'),
  ('00000000-0000-0000-0000-000000000003', 'hgk.a@test.nl'),
  ('00000000-0000-0000-0000-000000000004', 'gk.a@test.nl'),
  ('00000000-0000-0000-0000-000000000005', 'bm.a@test.nl'),
  ('00000000-0000-0000-0000-000000000006', 'gk.ab@test.nl'),
  ('00000000-0000-0000-0000-000000000007', 'bm.b@test.nl'),
  ('00000000-0000-0000-0000-000000000008', 'gk.a2@test.nl');

update profielen set globale_rol = 'beheer' where email = 'beheer@test.nl';
update profielen set globale_rol = 'onderhoudsmanager' where email = 'om@test.nl';

insert into locaties (id, naam) values
  ('aaaaaaaa-0000-0000-0000-000000000000', 'Testbaan A'),
  ('bbbbbbbb-0000-0000-0000-000000000000', 'Testbaan B');

insert into locatie_gebruikers (profiel_id, locatie_id, rol)
select p.id, l.id, x.rol::rol
from (values ('hgk.a@test.nl', 'Testbaan A', 'hoofdgreenkeeper'),
             ('gk.a@test.nl',  'Testbaan A', 'greenkeeper'),
             ('gk.a2@test.nl', 'Testbaan A', 'greenkeeper'),
             ('bm.a@test.nl',  'Testbaan A', 'baanmanager'),
             ('gk.ab@test.nl', 'Testbaan A', 'greenkeeper'),
             ('gk.ab@test.nl', 'Testbaan B', 'greenkeeper'),
             ('bm.b@test.nl',  'Testbaan B', 'baanmanager')) x(email, locatie, rol)
join profielen p on p.email = x.email
join locaties l on l.naam = x.locatie;

insert into lussen (locatie_id, naam, aantal_holes) values
  ('aaaaaaaa-0000-0000-0000-000000000000', 'Oost', 9),
  ('aaaaaaaa-0000-0000-0000-000000000000', 'West', 9),
  ('bbbbbbbb-0000-0000-0000-000000000000', '18 holes', 18);

insert into objecttypes (id, naam, categorie) values
  ('cccccccc-0000-0000-0000-000000000000', 'Test-sprinkler', 'beregening');

insert into objecten (id, locatie_id, objecttype_id, code, geom) values
  ('0b000000-0000-0000-0000-00000000000a', 'aaaaaaaa-0000-0000-0000-000000000000',
   'cccccccc-0000-0000-0000-000000000000', 'A-001', st_setsrid(st_makepoint(4.96, 51.77), 4326)),
  ('0b000000-0000-0000-0000-00000000000b', 'bbbbbbbb-0000-0000-0000-000000000000',
   'cccccccc-0000-0000-0000-000000000000', 'B-001', st_setsrid(st_makepoint(5.10, 52.10), 4326));

insert into storingen (locatie_id, object_id, omschrijving, gemeld_door, intern) values
  ('aaaaaaaa-0000-0000-0000-000000000000', '0b000000-0000-0000-0000-00000000000a', 'Lekt',
   '00000000-0000-0000-0000-000000000004', false),
  ('aaaaaaaa-0000-0000-0000-000000000000', null, 'Interne notitie',
   '00000000-0000-0000-0000-000000000004', true);

insert into taken (id, locatie_id, omschrijving, toegewezen_aan) values
  ('7a000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000000', 'Sprinkler A-001 vervangen',
   '00000000-0000-0000-0000-000000000004'),
  ('7a000000-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000000', 'Taak van collega',
   '00000000-0000-0000-0000-000000000008');

insert into uren (locatie_id, profiel_id, minuten) values
  ('aaaaaaaa-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000004', 60),
  ('aaaaaaaa-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000008', 90);

-- ── Structuur ──────────────────────────────────────────────────────────────

select tests.is('holes automatisch aangemaakt op A',
  (select count(*) from holes where locatie_id = 'aaaaaaaa-0000-0000-0000-000000000000'), 18::bigint);

insert into lussen (locatie_id, naam, aantal_holes, eerste_hole) values
  ('bbbbbbbb-0000-0000-0000-000000000000', 'Rood', 9, 10);
select tests.is('lus Rood krijgt holes 10–18',
  (select string_agg(nummer::text, ',' order by nummer) from holes h join lussen l on l.id = h.lus_id where l.naam = 'Rood'),
  '10,11,12,13,14,15,16,17,18');
update holes set speellijn = st_setsrid(st_makeline(st_makepoint(5.1, 52.1), st_makepoint(5.1, 52.102)), 4326)
  where lus_id = (select id from lussen where naam = 'Rood') and nummer = 10;
select tests.is('lengte hole 10 berekend (± 222 m)',
  (select lengte_m between 220 and 225 from holes h join lussen l on l.id = h.lus_id where l.naam = 'Rood' and nummer = 10), true);

-- ── Baanmanager A: alleen meekijken op eigen baan, geen interne zaken ──────

select tests.als('bm.a@test.nl');
select tests.is('bm.a ziet 1 locatie', (select count(*) from locaties), 1::bigint);
select tests.is('bm.a ziet alleen objecten van A', (select count(*) from objecten), 1::bigint);
select tests.is('bm.a ziet geen interne storing', (select count(*) from storingen), 1::bigint);
select tests.is('bm.a ziet geen uren', (select count(*) from uren), 0::bigint);
select tests.is('bm.a ziet holes van A', (select count(*) from holes), 18::bigint);
select tests.fout('bm.a kan geen storing melden',
  $$insert into storingen (locatie_id, omschrijving) values ('aaaaaaaa-0000-0000-0000-000000000000', 'x')$$);
select tests.is('bm.a kan geen object wijzigen',
  tests.rijen($$update objecten set merk = 'x'$$), 0);
select tests.is('bm.a kan geen taak afronden',
  tests.rijen($$update taken set status = 'afgerond'$$), 0);
reset role;

-- ── Baanmanager B ziet niets van A ─────────────────────────────────────────

select tests.als('bm.b@test.nl');
select tests.is('bm.b ziet alleen B', (select string_agg(naam, ',') from locaties), 'Testbaan B');
select tests.is('bm.b ziet geen storingen van A', (select count(*) from storingen), 0::bigint);
select tests.is('bm.b ziet geen profielen van A',
  (select count(*) from profielen where email = 'gk.a@test.nl'), 0::bigint);
reset role;

-- ── Greenkeeper A: registreren, eigen taken, positie voorstellen ───────────

select tests.als('gk.a@test.nl');
select tests.is('gk.a ziet ook interne storing', (select count(*) from storingen), 2::bigint);
select tests.is('gk.a ziet alleen eigen uren', (select count(*) from uren), 1::bigint);
insert into storingen (locatie_id, omschrijving, geom)
  values ('aaaaaaaa-0000-0000-0000-000000000000', 'Natte plek', st_setsrid(st_makepoint(4.961, 51.771), 4326));
insert into uren (locatie_id, minuten) values ('aaaaaaaa-0000-0000-0000-000000000000', 30);
select tests.fout('gk.a kan geen storing op B melden',
  $$insert into storingen (locatie_id, omschrijving) values ('bbbbbbbb-0000-0000-0000-000000000000', 'x')$$);
select tests.fout('gk.a kan geen object toevoegen',
  $$insert into objecten (locatie_id, objecttype_id, geom) values ('aaaaaaaa-0000-0000-0000-000000000000',
    'cccccccc-0000-0000-0000-000000000000', st_setsrid(st_makepoint(4.96, 51.77), 4326))$$);
select tests.is('gk.a kan object niet direct verplaatsen',
  tests.rijen($$update objecten set geom = st_setsrid(st_makepoint(4.97, 51.77), 4326)$$), 0);
select tests.is('gk.a kan eigen taak afronden',
  tests.rijen($$update taken set status = 'afgerond' where id = '7a000000-0000-0000-0000-000000000001'$$), 1);
select tests.is('gk.a kan taak van collega niet afronden',
  tests.rijen($$update taken set status = 'afgerond' where id = '7a000000-0000-0000-0000-000000000002'$$), 0);
select tests.fout('gk.a kan omschrijving van eigen taak niet wijzigen',
  $$update taken set omschrijving = 'x' where id = '7a000000-0000-0000-0000-000000000001'$$);
select tests.fout('gk.a kan geen taak plannen',
  $$insert into taken (locatie_id, omschrijving) values ('aaaaaaaa-0000-0000-0000-000000000000', 'x')$$);
select tests.fout('gk.a kan zichzelf geen globale rol geven',
  $$update profielen set globale_rol = 'beheer' where id = auth.uid()$$);
insert into positievoorstellen (object_id, nieuwe_geom, toelichting)
  values ('0b000000-0000-0000-0000-00000000000a', st_setsrid(st_makepoint(4.9605, 51.7702), 4326), 'Staat 5 m verderop');
select tests.fout('gk.a kan storing niet aan collega toewijzen',
  $$update storingen set toegewezen_aan = '00000000-0000-0000-0000-000000000008' where omschrijving = 'Lekt'$$);
update storingen set toegewezen_aan = auth.uid() where omschrijving = 'Lekt';
select tests.is('gk.a pakt storing zelf op (status toegewezen)',
  (select status::text from storingen where omschrijving = 'Lekt'), 'toegewezen');
select tests.fout('gk.a kan storing niet als gecontroleerd markeren',
  $$update storingen set status = 'gecontroleerd' where omschrijving = 'Natte plek'$$);
select tests.is('gk.a ziet team van A (hgk + 3 gk)',
  (select count(*) from locatie_team('aaaaaaaa-0000-0000-0000-000000000000')), 4::bigint);
select tests.is('gk.a kan eigen voorstel niet goedkeuren',
  tests.rijen($$update positievoorstellen set status = 'goedgekeurd'$$), 0);
reset role;

select tests.is('taak afgerond_door gevuld',
  (select afgerond_door from taken where id = '7a000000-0000-0000-0000-000000000001'),
  '00000000-0000-0000-0000-000000000004'::uuid);

-- ── Kaartlagen volgen de rechten ───────────────────────────────────────────

select tests.als('gk.a@test.nl');
select tests.is('kaart: object met open storing is rood',
  (select f -> 'properties' ->> 'kaartstatus'
     from jsonb_array_elements(kaart_lagen('aaaaaaaa-0000-0000-0000-000000000000') -> 'objecten' -> 'features') f),
  'storing');
select tests.is('kaart: gk.a ziet open voorstel',
  jsonb_array_length(kaart_lagen('aaaaaaaa-0000-0000-0000-000000000000') -> 'voorstellen' -> 'features'), 1);
select tests.is('kaart: gk.a ziet melding natte plek',
  jsonb_array_length(kaart_lagen('aaaaaaaa-0000-0000-0000-000000000000') -> 'meldingen' -> 'features'), 1);
reset role;

select tests.als('bm.a@test.nl');
select tests.is('kaart: bm.a ziet geen voorstellen',
  jsonb_array_length(kaart_lagen('aaaaaaaa-0000-0000-0000-000000000000') -> 'voorstellen' -> 'features'), 0);
select tests.is('kaart: bm.a krijgt geen objecten van B',
  jsonb_array_length(kaart_lagen('bbbbbbbb-0000-0000-0000-000000000000') -> 'objecten' -> 'features'), 0);
select tests.is('kaart: bm.a ziet geen open voorstellen in lijst',
  (select count(*) from open_positievoorstellen('aaaaaaaa-0000-0000-0000-000000000000')), 0::bigint);
reset role;

-- ── Greenkeeper op twee banen ──────────────────────────────────────────────

select tests.als('gk.ab@test.nl');
select tests.is('gk.ab ziet 2 locaties', (select count(*) from locaties), 2::bigint);
select tests.is('gk.ab ziet objecten van A en B', (select count(*) from objecten), 2::bigint);
reset role;

-- ── Hoofd-greenkeeper A: plannen, objecten beheren, voorstel goedkeuren ────

select tests.als('hgk.a@test.nl');
select tests.is('hgk.a ziet alle uren van A', (select count(*) from uren), 3::bigint);
select tests.is('hgk.a ziet open voorstel', (select count(*) from positievoorstellen where status = 'open'), 1::bigint);
update positievoorstellen set status = 'goedgekeurd' where object_id = '0b000000-0000-0000-0000-00000000000a';
select tests.is('object verplaatst na goedkeuring',
  (select st_x(geom) from objecten where id = '0b000000-0000-0000-0000-00000000000a'), 4.9605::float8);
select tests.is('verplaatsing staat in audit log',
  (select count(*) from audit_log where tabel = 'objecten' and actie = 'UPDATE'
     and rij_id = '0b000000-0000-0000-0000-00000000000a'), 1::bigint);
insert into taken (locatie_id, omschrijving, toegewezen_aan)
  values ('aaaaaaaa-0000-0000-0000-000000000000', 'Pomp inspecteren', '00000000-0000-0000-0000-000000000004');
insert into objecten (locatie_id, objecttype_id, code, geom)
  values ('aaaaaaaa-0000-0000-0000-000000000000', 'cccccccc-0000-0000-0000-000000000000', 'A-002',
          st_setsrid(st_makepoint(4.962, 51.772), 4326));
select tests.fout('gecontroleerd kan niet vóór opgelost',
  $$update storingen set status = 'gecontroleerd' where omschrijving = 'Natte plek'$$);
update storingen set status = 'opgelost', oplossing = 'Lek gedicht' where omschrijving = 'Natte plek';
update storingen set status = 'gecontroleerd' where omschrijving = 'Natte plek';
select tests.is('hgk.a controleert opgeloste storing',
  (select gecontroleerd_door from storingen where omschrijving = 'Natte plek'),
  '00000000-0000-0000-0000-000000000003'::uuid);
update storingen set toegewezen_aan = '00000000-0000-0000-0000-000000000008' where omschrijving = 'Lekt';
select tests.fout('hgk.a kan geen object op B toevoegen',
  $$insert into objecten (locatie_id, objecttype_id, geom) values ('bbbbbbbb-0000-0000-0000-000000000000',
    'cccccccc-0000-0000-0000-000000000000', st_setsrid(st_makepoint(5.1, 52.1), 4326))$$);
select tests.fout('hgk.a kan geen lus aanmaken',
  $$insert into lussen (locatie_id, naam, aantal_holes) values ('aaaaaaaa-0000-0000-0000-000000000000', 'Noord', 9)$$);
select tests.fout('hgk.a kan geen gebruikers koppelen',
  $$insert into locatie_gebruikers (profiel_id, locatie_id, rol) values
    ('00000000-0000-0000-0000-000000000007', 'aaaaaaaa-0000-0000-0000-000000000000', 'baanmanager')$$);
select tests.is('hgk.a kan objecten niet verwijderen',
  tests.rijen($$delete from objecten$$), 0);
reset role;

-- ── Onderhoudsschema's en dagplanning ──────────────────────────────────────

select tests.als('hgk.a@test.nl');
insert into onderhoudsschemas (id, locatie_id, objecttype_id, omschrijving, interval_waarde, interval_eenheid,
                               volgende_datum, vooruit_dagen, toegewezen_aan)
values ('5c000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000000',
        'cccccccc-0000-0000-0000-000000000000', 'Sprinklers controleren', 3, 'maanden',
        current_date + 3, 7, '00000000-0000-0000-0000-000000000004');
select tests.is('schema maakt 1 taak aan', genereer_taken_uit_schemas('aaaaaaaa-0000-0000-0000-000000000000'), 1);
select tests.is('taak uit schema heeft deadline en uitvoerder',
  (select deadline = current_date + 3 and toegewezen_aan = '00000000-0000-0000-0000-000000000004'
     from taken where schema_id = '5c000000-0000-0000-0000-000000000001'), true);
select tests.is('volgende datum schuift 3 maanden op',
  (select volgende_datum from onderhoudsschemas where id = '5c000000-0000-0000-0000-000000000001'),
  (current_date + 3 + interval '3 months')::date);
select tests.is('tweede keer geen dubbele taak', genereer_taken_uit_schemas('aaaaaaaa-0000-0000-0000-000000000000'), 0);
select tests.fout('hgk.a kan geen taken voor B genereren',
  $$select genereer_taken_uit_schemas('bbbbbbbb-0000-0000-0000-000000000000')$$);
insert into werkzaamheden (id, locatie_id, activiteit_id, datum, medewerker_id, uitgevoerd)
values ('3e000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000000',
        (select id from keuzelijst_waarden where lijst = 'activiteit' order by volgorde limit 1),
        current_date, '00000000-0000-0000-0000-000000000004', false);
reset role;

select tests.als('gk.a@test.nl');
select tests.fout('gk.a kan geen taken uit schema''s genereren',
  $$select genereer_taken_uit_schemas('aaaaaaaa-0000-0000-0000-000000000000')$$);
select tests.is('gk.a vinkt klaargezet werk af',
  tests.rijen($$update werkzaamheden set uitgevoerd = true where id = '3e000000-0000-0000-0000-000000000001'$$), 1);
select tests.fout('gk.a kan datum van klaargezet werk niet wijzigen',
  $$update werkzaamheden set datum = current_date + 1 where id = '3e000000-0000-0000-0000-000000000001'$$);
reset role;

select tests.als('gk.a2@test.nl');
select tests.is('gk.a2 kan werk van collega niet afvinken',
  tests.rijen($$update werkzaamheden set notitie = 'x' where id = '3e000000-0000-0000-0000-000000000001'$$), 0);
reset role;

-- ── Materieel: draaiuren maken direct een onderhoudstaak aan ───────────────

select tests.als('hgk.a@test.nl');
insert into machines (id, locatie_id, naam, merk, draaiuren)
values ('3a000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000000', 'Greenmaaier 1', 'Toro', 240);
insert into onderhoudsschemas (locatie_id, machine_id, omschrijving, interval_waarde, interval_eenheid, volgende_draaiuren)
values ('aaaaaaaa-0000-0000-0000-000000000000', '3a000000-0000-0000-0000-000000000001', 'Olie verversen', 250, 'draaiuren', 250);
reset role;

select tests.als('gk.a@test.nl');
select tests.fout('gk.a kan geen machine toevoegen',
  $$insert into machines (locatie_id, naam) values ('aaaaaaaa-0000-0000-0000-000000000000', 'x')$$);
insert into draaiuren_registraties (machine_id, stand) values ('3a000000-0000-0000-0000-000000000001', 261);
select tests.fout('lagere draaiurenstand wordt geweigerd',
  $$insert into draaiuren_registraties (machine_id, stand) values ('3a000000-0000-0000-0000-000000000001', 100)$$);
select tests.is('draaiuren bijgewerkt', (select draaiuren from machines where id = '3a000000-0000-0000-0000-000000000001'), 261.0);
select tests.is('taak olie verversen direct aangemaakt',
  (select count(*) from taken where machine_id = '3a000000-0000-0000-0000-000000000001' and bron = 'schema'), 1::bigint);
select tests.is('volgende keer bij 500 draaiuren',
  (select volgende_draaiuren from onderhoudsschemas where machine_id = '3a000000-0000-0000-0000-000000000001'), 500.0);
select tests.fout('gk.a kan interne kernfunctie niet aanroepen',
  $$select maak_taken_uit_schemas('aaaaaaaa-0000-0000-0000-000000000000')$$);
reset role;

select tests.als('bm.a@test.nl');
select tests.is('dashboard bm.a telt geen interne storing',
  (select open_storingen from dashboard_cijfers('aaaaaaaa-0000-0000-0000-000000000000')),
  (select count(*) from storingen where locatie_id = 'aaaaaaaa-0000-0000-0000-000000000000'
     and status in ('gemeld', 'toegewezen', 'in_behandeling')));
select tests.is('dashboard bm.a ziet alleen eigen baan', (select count(*) from dashboard_cijfers()), 1::bigint);
select tests.is('dashboard machine met onderhoud', (select machines_onderhoud from dashboard_cijfers()), 1::bigint);
reset role;

-- ── Onderhoudsmanager: alle banen, geen instellingen ───────────────────────

select tests.als('om@test.nl');
select tests.is('om ziet alle testlocaties', (select count(*) from locaties where naam like 'Testbaan%'), 2::bigint);
select tests.is('om ziet uren van alle medewerkers',
  (select count(*) from uren where locatie_id = 'aaaaaaaa-0000-0000-0000-000000000000'), 3::bigint);
insert into locatie_gebruikers (profiel_id, locatie_id, rol)
  values ('00000000-0000-0000-0000-000000000007', 'aaaaaaaa-0000-0000-0000-000000000000', 'baanmanager');
select tests.fout('om kan geen locatie aanmaken',
  $$insert into locaties (naam) values ('Nieuwe baan')$$);
select tests.is('om kan instellingen niet wijzigen',
  tests.rijen($$update instellingen set waarde = 'true' where sleutel = 'mfa_verplicht'$$), 0);
reset role;

-- ── Beheer: alles, en tweestapsverificatie als die verplicht is ────────────

select tests.als('beheer@test.nl');
insert into locaties (naam) values ('Nieuwe baan');
select tests.is('beheer ziet alle testlocaties',
  (select count(*) from locaties where naam like 'Testbaan%' or naam = 'Nieuwe baan'), 3::bigint);
insert into instellingen (sleutel, waarde) values ('mfa_verplicht', 'true')
  on conflict (sleutel) do update set waarde = excluded.waarde;
select tests.is('beheer zonder 2FA verliest rechten', (select count(*) from locaties), 0::bigint);
reset role;

select tests.als('beheer@test.nl', 'aal2');
select tests.is('beheer met 2FA ziet alles',
  (select count(*) from locaties where naam like 'Testbaan%' or naam = 'Nieuwe baan'), 3::bigint);
reset role;

select tests.als('gk.a@test.nl');
select tests.is('greenkeeper heeft geen 2FA nodig', (select count(*) from locaties), 1::bigint);
reset role;

select 'ALLE RLS-TESTS GESLAAGD' as resultaat;

rollback;
