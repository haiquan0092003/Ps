# PERSONAL SYSTEM — Real backend starter

A Vietnamese, sci-fi-styled personal development app starter built with React + TypeScript + Vite and Supabase.

## Included

- Email/password registration, login, logout, and session persistence.
- Supabase tables for profiles, missions, rewards, and reward transactions.
- Row Level Security policies for per-user data isolation.
- Server-side Postgres functions for mission completion and reward redemption.
- Duplicate-safe mission reward handling and request-idempotent reward redemption.
- Mission create/edit/delete, difficulty-based EXP/coins, character level progress, a reward shop, history, and profile settings.
- Responsive dark sci-fi layout.

This is an application starter, not a deployed production site. You own and control the Supabase project and deployment target.

## 1. Prerequisites

- Node.js 20.19+ or 22.12+ (recommended for Vite 7).
- A Supabase account and project.

## 2. Set up Supabase

1. Create a new project in Supabase.
2. Open the project's **SQL Editor**.
3. Paste and run `supabase/migrations/20261019000000_initial.sql`.
4. Paste and run `supabase/migrations/20261020000000_recurring_missions.sql`.
5. In **Project Settings → API** (or the project's Connect/API section), copy the Project URL and the public publishable/anon key.
6. Do **not** use or expose the `service_role` secret key in the browser.
7. For testing, check the Supabase Authentication email-confirmation configuration. If confirmations are enabled, confirm the verification email before signing in.

## 3. Run locally

From this folder:

```bash
npm install
cp .env.example .env
```

On Windows PowerShell, use:

```powershell
Copy-Item .env.example .env
```

Edit `.env` and fill in:

```dotenv
VITE_SUPABASE_URL=https://YOUR_PROJECT_ID.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_SUPABASE_PUBLISHABLE_OR_ANON_KEY
```

Then run:

```bash
npm run dev
```

Open the local URL Vite prints in your terminal.

## 4. Build check

```bash
npm run build
```

## 5. Deploy

Deploy the built Vite app to a frontend host you control (for example, Vercel, Netlify, or Cloudflare Pages). Set the same two `VITE_` environment variables in the host's project settings, and configure the production site URL in Supabase Authentication's Site URL / Redirect URLs.

The SQL migration is responsible for database access policies and reward RPCs. Do not remove RLS. Treat the publishable/anon key as public; its safety depends on RLS and database privileges. Never expose the service-role secret key.

## Notes and limitations

- AI chat integration is not included; it should be added through a server-side function and a provider API key stored as a secret.
- Goal milestones, achievements, and advanced analytics are not part of this first backend milestone yet.
- New daily and weekly missions automatically create their next occurrence after completion. Run the recurring-missions migration before using this feature.
- Review authentication email flow and RLS in your own Supabase project before sharing the app with others.
- No Supabase credentials are included. The app shows a setup screen until `.env` is configured.

For security, the migration stores its `SECURITY DEFINER` database routines in an unexposed `private` schema and exposes only narrowly-scoped `SECURITY INVOKER` RPC wrappers in `public`. Do not add `private` to the Supabase Data API's exposed schemas. This follows Supabase's guidance to pin `search_path`, verify caller ownership, and restrict function execute privileges.
