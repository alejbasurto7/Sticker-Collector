import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// Sync is OPTIONAL. The Supabase URL + anon key are injected at build time via
// Vite env vars (see .env.local locally, GitHub Actions secrets in CI). When
// they're absent the app stays fully functional on local storage — the sync UI
// simply hides itself (see SyncSection / isSyncConfigured).
const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

/** True only when both Supabase env vars are present in this build. */
export const isSyncConfigured = Boolean(url && anonKey);

/**
 * The shared Supabase client, or null when sync isn't configured. We disable
 * auth session handling entirely — this app never signs anyone in; access is
 * gated by the sync code (see the sync_pull / sync_push RPCs), not by a user.
 */
export const supabase: SupabaseClient | null = isSyncConfigured
  ? createClient(url as string, anonKey as string, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  : null;
