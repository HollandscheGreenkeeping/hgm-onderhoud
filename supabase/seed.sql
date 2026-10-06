-- Startdata. Draait na de migraties (`supabase db reset`), of eenmalig via de SQL-editor.
-- Keuzelijsten en lussen zijn alleen een startpunt; beheer past ze aan in het instellingenscherm.

set search_path = public, extensions;

insert into instellingen (sleutel, waarde) values
  -- Zet op true vóór livegang: beheer en onderhoudsmanager hebben dan tweestapsverificatie nodig.
  ('mfa_verplicht', 'false'),
  -- Nog invullen uit hgmgolf.nl (zie docs/plan.md, Huisstijl en klantlogo).
  ('huisstijl', '{"primair": null, "secundair": null, "lettertype": null, "logo_pad": null}')
on conflict (sleutel) do nothing;

-- Proefbaan. Centrumpunt is bij benadering (Almkerk); corrigeer in QGIS of via beheer.
insert into locaties (naam, klantnaam, adres, geom) values
  ('Golfpark Almkreek', 'Golfpark Almkreek', 'Almkerk',
   st_setsrid(st_makepoint(4.96, 51.77), 4326))
on conflict (naam) do nothing;

-- Voorbeeldindeling: één lus van 18 holes. Holes worden automatisch aangemaakt.
insert into lussen (locatie_id, naam, volgorde, aantal_holes)
select id, 'Hoofdbaan', 1, 18 from locaties where naam = 'Golfpark Almkreek'
on conflict (locatie_id, naam) do nothing;

insert into keuzelijst_waarden (lijst, naam, volgorde) values
  ('activiteit', 'Maaien', 1),
  ('activiteit', 'Bemesten', 2),
  ('activiteit', 'Bezanden', 3),
  ('activiteit', 'Beluchten', 4),
  ('activiteit', 'Verticuteren', 5),
  ('activiteit', 'Bespuiten', 6)
on conflict (lijst, naam) do nothing;

insert into objecttypes (naam, categorie, geometrietype, icoon, volgorde) values
  ('Sprinkler',     'beregening', 'punt', 'sprinkler', 1),
  ('Klep',          'beregening', 'punt', 'klep',      2),
  ('Pomp',          'beregening', 'punt', 'pomp',      3),
  ('Regelkast',     'beregening', 'punt', 'regelkast', 4),
  ('Boom',          'overig',     'punt', 'boom',      10),
  ('Gebouw',        'overig',     'punt', 'gebouw',    11),
  ('Bankje',        'overig',     'punt', 'bankje',    12),
  ('Ballenwasser',  'overig',     'punt', 'ballenwasser', 13)
on conflict (naam) do nothing;
