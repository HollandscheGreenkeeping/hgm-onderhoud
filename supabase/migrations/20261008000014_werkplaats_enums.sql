-- Fase 6 · Werkplaats (1/2): nieuwe enumwaarden.
-- Apart bestand, omdat Postgres een nieuwe enumwaarde pas na een commit laat gebruiken;
-- de tabellen, functies en policies staan in 20261008000015_werkplaats.sql.

-- Monteur (technische dienst): HGM-brede rol, net als beheer en onderhoudsmanager.
alter type rol add value if not exists 'monteur';

-- Keuzelijst met soorten keuringen (voertuigkeuring, SKL, ...), door beheer in te vullen.
alter type keuzelijst add value if not exists 'keuringsoort';
