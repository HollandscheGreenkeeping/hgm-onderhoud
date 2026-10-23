-- Eigen baan van de Hollandsche Golfclub (zusterbedrijf). Alleen voor deze banen haalt het
-- Stewardplatform van HGC Connect het geplande onderhoud op (taken en de dagplanning in
-- werkzaamheden, niet-intern) en toont het in de briefing van het dagrapport. Bij banen van
-- klanten staat dit uit: hun planning gaat niet naar buiten.
--
-- Connect leest server-side met de service-sleutel (die omzeilt RLS); daarom filtert Connect zelf
-- op hgc_baan = true en intern = false.
alter table locaties add column if not exists hgc_baan boolean not null default false;

comment on column locaties.hgc_baan is
  'Eigen baan van de Hollandsche Golfclub (zusterbedrijf): gepland onderhoud zichtbaar in het Stewardplatform van HGC Connect';
