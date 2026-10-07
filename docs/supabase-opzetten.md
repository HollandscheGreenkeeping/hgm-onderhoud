# Supabase opzetten (fase 1)

## 1. Project aanmaken
1. Maak een organisatie en project aan op supabase.com.
2. **Regio: Central EU (Frankfurt)**. Dit is achteraf niet te wijzigen.
3. Sla het databasewachtwoord op in een wachtwoordmanager.
4. Sluit via Organization → Legal de verwerkersovereenkomst (DPA) af.

## 2. Database inrichten
Met de Supabase CLI (aanbevolen, `npx supabase` werkt zonder installatie):

```bash
npx supabase login
npx supabase link --project-ref <project-ref>
npx supabase db push --include-seed
```

Zonder CLI kan het ook: plak de bestanden uit `supabase/migrations/` op volgorde in de SQL-editor,
daarna `supabase/seed.sql`.

Controleer daarna de beveiliging: plak `supabase/tests/rls_rollen.sql` in de SQL-editor en voer uit.
Het eindigt met `ALLE RLS-TESTS GESLAAGD`; alles wordt teruggedraaid, er blijft geen testdata achter.

## 3. Auth
Authentication → Sign In / Providers:
- Email aan, **"Allow new users to sign up" uit** (beheer nodigt mensen uit).
- Authentication → URL Configuration: Site URL = productie-URL (bijv. `https://onderhoud.hgmgolf.nl`),
  plus `http://localhost:5173` bij Redirect URLs.
- Authentication → Multi-Factor: TOTP aan.
- Authentication → Email Templates: per mail het onderwerp en de HTML uit `supabase/templates/` plakken
  (onderwerpen staan in `supabase/config.toml`): Magic Link → `magic-link.html`, Invite user → `invite.html`,
  Reset Password → `recovery.html`, Change Email Address → `email-change.html`.
  Laat `{{ .ConfirmationURL }}`, `{{ .Email }}` en `{{ .NewEmail }}` staan. Het logo komt van
  `https://onderhoud.hgmgolf.nl/hgm-logo.png` (de app zelf), dus dat domein moet live zijn.
- Authentication → SMTP Settings: eigen SMTP met afzender `noreply@hgmgolf.nl`, naam "HGM Golf Onderhoud"
  (de ingebouwde Supabase-mail haalt maar een paar mails per uur).

## 4. Eerste beheerder
1. Authentication → Users → Invite user → je eigen e-mailadres.
2. In de SQL-editor:
   ```sql
   update profielen set globale_rol = 'beheer', naam = 'Jesse Weevers'
   where email = '<jouw e-mail>';
   ```
3. Alle andere gebruikers maak je in de app aan: **Beheer → Gebruikers** → Gebruiker toevoegen (kies daar de baan).
   Dat loopt via de Edge Function `supabase/functions/gebruikers` (de service-sleutel blijft op de
   server). Een nieuw account krijgt een tijdelijk wachtwoord dat je zelf doorgeeft; bij de eerste
   keer inloggen kiest de gebruiker een eigen wachtwoord.

   Inloglinks en "wachtwoord vergeten" per e-mail werken pas voor iedereen met een eigen SMTP-server
   (Authentication → Emails → SMTP Settings); de standaardmail van Supabase gaat alleen naar
   leden van het Supabase-team.

## 5. Vóór livegang
- `update instellingen set waarde = 'true' where sleutel = 'mfa_verplicht';`
  Beheer en onderhoudsmanager moeten dan bij inloggen een authenticator-code invoeren.
- Back-ups: Pro-plan heeft dagelijkse back-ups (7 dagen); voor 30 dagen bewaren is Point-in-Time
  Recovery of een eigen wekelijkse `pg_dump` naar een andere plek nodig. Foto's (Storage) apart meenemen.
- Elke rol één keer in de echte app testen met een testaccount.

## 6. App koppelen
Kopieer `.env.example` naar `.env.local` en vul URL en publieke sleutel in
(Project Settings → API). Daarna `npm run dev`.
