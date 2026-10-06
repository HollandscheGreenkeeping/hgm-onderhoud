-- Fase 1 · Opslag (Supabase Storage).
--   fotos     – privé; pad {locatie_id}/{tabel}/{bestand}. Toegang volgt de locatie.
--   huisstijl – openbaar leesbaar; HGM-logo en klantlogo's. Alleen beheer uploadt.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('fotos', 'fotos', false, 15 * 1024 * 1024, array['image/jpeg', 'image/png', 'image/webp', 'image/heic']),
       ('huisstijl', 'huisstijl', true, 2 * 1024 * 1024, array['image/png', 'image/svg+xml'])
on conflict (id) do nothing;

-- Eerste mapnaam als locatie_id; ongeldige paden geven null (en dus geen toegang).
create function public.locatie_uit_pad(p_naam text) returns uuid
language plpgsql immutable as $$
begin
  return split_part(p_naam, '/', 1)::uuid;
exception when invalid_text_representation then
  return null;
end $$;

create policy "fotos lezen" on storage.objects for select to authenticated
  using (bucket_id = 'fotos' and public.heeft_toegang(public.locatie_uit_pad(name)));
create policy "fotos uploaden" on storage.objects for insert to authenticated
  with check (bucket_id = 'fotos' and public.mag_registreren(public.locatie_uit_pad(name)));
create policy "fotos verwijderen" on storage.objects for delete to authenticated
  using (bucket_id = 'fotos' and public.mag_plannen(public.locatie_uit_pad(name)));

create policy "huisstijl beheren" on storage.objects for all to authenticated
  using (bucket_id = 'huisstijl' and public.is_beheer())
  with check (bucket_id = 'huisstijl' and public.is_beheer());
