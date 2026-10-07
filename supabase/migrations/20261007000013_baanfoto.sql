-- Baanfoto per baan (tegel in "Alle banen"), net als het klantlogo in de openbare bucket 'huisstijl'.
-- Pad: baanfotos/{locatie_id}-{tijd}.jpg. Uploaden mag alleen beheer (bestaande policy "huisstijl beheren").

alter table locaties add column baanfoto_pad text;  -- pad in storage-bucket 'huisstijl'

-- Foto's zijn JPEG (de app verkleint naar max. 1600 px); logo's blijven PNG/SVG.
update storage.buckets
set allowed_mime_types = array['image/png', 'image/svg+xml', 'image/jpeg', 'image/webp']
where id = 'huisstijl';
