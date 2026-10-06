-- Verwijdert de 'Demobaan (testdata)' met alles erop en eraan.
-- Draaien in de Supabase SQL-editor zodra de echte baan is ingetekend.

begin;
create temp table demo as select id from locaties where naam = 'Demobaan (testdata)';

delete from fotos              where locatie_id in (select id from demo);
delete from uren               where locatie_id in (select id from demo);
delete from werkzaamheden      where locatie_id in (select id from demo);
delete from taken              where locatie_id in (select id from demo);
delete from storingen          where locatie_id in (select id from demo);
delete from onderhoudsschemas  where locatie_id in (select id from demo);
delete from positievoorstellen where locatie_id in (select id from demo);
delete from draaiuren_registraties where locatie_id in (select id from demo);
delete from machines           where locatie_id in (select id from demo);
delete from leidingen          where locatie_id in (select id from demo);
delete from objecten           where locatie_id in (select id from demo);
delete from baanvlakken        where locatie_id in (select id from demo);
delete from audit_log          where locatie_id in (select id from demo);
delete from locaties           where id in (select id from demo);  -- lussen, holes, koppelingen via cascade
commit;
