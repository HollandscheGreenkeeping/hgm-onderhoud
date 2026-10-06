// Draait alle migraties, de seed en de RLS-tests in een embedded Postgres + PostGIS (PGlite).
// Geen Docker of Supabase-account nodig. Supabase-specifieke onderdelen (auth, storage, rollen)
// worden hieronder minimaal nagebootst.

import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { postgis } from '@electric-sql/pglite-postgis'

const root = join(import.meta.dirname, '..')
const migraties = join(root, 'supabase', 'migrations')

const supabaseNabootsing = `
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;
  create schema extensions;
  create schema auth;
  create table auth.users (
    id uuid primary key, email text, raw_user_meta_data jsonb default '{}'
  );
  create function auth.jwt() returns jsonb language sql stable as $$
    select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
  $$;
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(auth.jwt() ->> 'sub', '')::uuid
  $$;
  create schema storage;
  create table storage.buckets (
    id text primary key, name text, public boolean,
    file_size_limit bigint, allowed_mime_types text[]
  );
  create table storage.objects (
    id uuid primary key default gen_random_uuid(), bucket_id text, name text
  );
  alter table storage.objects enable row level security;
  grant usage on schema public, auth, extensions, storage to anon, authenticated;
  grant execute on all functions in schema auth to anon, authenticated;
  alter default privileges in schema public grant all on tables to anon, authenticated;
  alter default privileges in schema public grant all on sequences to anon, authenticated;
`

const db = await PGlite.create({ extensions: { postgis } })
await db.exec(supabaseNabootsing)

for (const bestand of readdirSync(migraties).filter((f) => f.endsWith('.sql')).sort()) {
  process.stdout.write(`migratie  ${bestand} ... `)
  await db.exec(readFileSync(join(migraties, bestand), 'utf8'))
  console.log('ok')
}

process.stdout.write('seed      seed.sql ... ')
await db.exec(readFileSync(join(root, 'supabase', 'seed.sql'), 'utf8'))
console.log('ok')

const tests = join(root, 'supabase', 'tests')
for (const bestand of readdirSync(tests).filter((f) => f.endsWith('.sql')).sort()) {
  process.stdout.write(`test      ${bestand} ... `)
  try {
    const resultaten = await db.exec(readFileSync(join(tests, bestand), 'utf8'))
    const laatste = resultaten.flatMap((r) => r.rows).at(-1)
    console.log(laatste?.resultaat ?? 'ok')
  } catch (fout) {
    console.log('MISLUKT')
    console.error(fout.message)
    process.exitCode = 1
    break
  }
}

await db.close()
