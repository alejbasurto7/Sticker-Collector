# Supabase setup for cross-device sync

This is a **one-time, ~5-minute** setup. It gives Sticker Collector a tiny cloud database so
the same collection can appear on your iOS PWA **and** a desktop browser, synced automatically.

You don't need to understand any of the SQL — just copy, paste, and run it. At the end you'll
have two values (a **Project URL** and an **anon key**) to hand back so sync can be switched on.

> **How the security model works, in one line:** pairing uses a long random *sync code*. The
> code never leaves your device — only its hash is stored — and whoever holds the code has
> access to that one collection. There are no accounts or passwords.

---

## 1. Create a free Supabase project

1. Go to **https://supabase.com** and sign up (GitHub login is fine). The free tier is plenty.
2. Click **New project**.
   - **Name:** anything, e.g. `sticker-collector`.
   - **Database password:** let it generate one; you won't need it for this app, but save it
     somewhere anyway.
   - **Region:** pick the one closest to you.
3. Click **Create new project** and wait ~1–2 minutes for it to finish provisioning.

---

## 2. Create the table and access functions

1. In your project, open the **SQL Editor** (left sidebar, the `</>` icon) → **New query**.
2. Paste the entire block below and click **Run**. You should see `Success. No rows returned`.

```sql
-- One row per collection, keyed by the HASH of the sync code (raw code never stored).
create table public.collections (
  code_hash   text primary key,
  data        jsonb       not null,
  writer_id   text        not null default '',
  version     bigint      not null default 0,
  updated_at  timestamptz not null default now()
);

-- Lock the table down. With RLS on and no policies, nobody can read or write it
-- directly — all access must go through the two functions below, which require the
-- code hash. This prevents anyone from listing or dumping other people's rows.
alter table public.collections enable row level security;

-- Read one collection by its code hash.
create or replace function public.sync_pull(p_code_hash text)
returns public.collections
language sql security definer set search_path = public as $$
  select * from public.collections where code_hash = p_code_hash;
$$;

-- Create-or-update a collection. Uses an optimistic-concurrency check on `version`
-- so two devices writing at once can't silently clobber each other unnoticed.
create or replace function public.sync_push(
  p_code_hash text, p_data jsonb, p_writer text, p_base_version bigint)
returns public.collections
language plpgsql security definer set search_path = public as $$
declare r public.collections;
begin
  insert into public.collections(code_hash, data, writer_id, version, updated_at)
  values (p_code_hash, p_data, p_writer, 1, now())
  on conflict (code_hash) do update
    set data = excluded.data, writer_id = excluded.writer_id,
        version = public.collections.version + 1, updated_at = now()
    where public.collections.version = p_base_version
  returning * into r;
  if r.code_hash is null then          -- lost the race: return current server truth
    select * into r from public.collections where code_hash = p_code_hash;
  end if;
  return r;
end;
$$;

-- Let the app (the anonymous public role) call ONLY these two functions.
grant execute on function public.sync_pull(text) to anon;
grant execute on function public.sync_push(text, jsonb, text, bigint) to anon;
```

That's the whole backend. There is nothing else to configure — no auth, no policies, no
storage buckets.

---

## 3. Copy your two connection values

1. Open **Project Settings** (the gear icon, bottom-left) → **API**.
2. Copy these two values:
   - **Project URL** — looks like `https://abcdefghijklmnop.supabase.co`
   - **anon public** key (under *Project API keys*) — a long `eyJ...` string.

> The **anon** key is safe to ship in a web app — it's designed to be public. Do **not** copy
> the `service_role` key (that one is secret; this app never uses it).

---

## 4. Hand the values back

Paste the two values back in the chat like this:

```
VITE_SUPABASE_URL = https://abcdefghijklmnop.supabase.co
VITE_SUPABASE_ANON_KEY = eyJhbGciOi...your-long-anon-key...
```

Once I have them, I'll:

- add them to your GitHub repo as **Actions secrets** (`VITE_SUPABASE_URL`,
  `VITE_SUPABASE_ANON_KEY`) so the deployed GitHub Pages build has sync enabled, and
- give you a local `.env.local` line for running `npm run dev`,

then build the in-app **Sync** feature (a new section in the ⚙️ Settings menu: create a code
on one device, enter or scan it on the other).

---

## Using it, once it's built

1. On device A (say your desktop): **Settings → Sync → Create sync code**. A code and QR appear.
2. On device B (your iPhone): **Settings → Sync → Enter code** (type it or scan the QR).
3. Both devices now share one collection. Changes push automatically and pull when you reopen
   or refocus the app.

**Good to know:** sync is **last-change-wins** on the whole collection. If you edit one device
while the other is offline and then bring the first back online, the most recent save wins — so
avoid editing both devices at the exact same time while one is offline. For one person across
two devices this is rarely an issue.

**If Supabase is ever unreachable** (or these values aren't set), the app just works fully
offline on local storage exactly as before — the Sync section simply hides itself.
