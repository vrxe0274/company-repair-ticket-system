-- ============================================================
-- VRXE Repair Ticket System — Lock Down Deletes
--
-- WHY: the browser only holds the public `anon` key, and the original
-- policies granted DELETE to everyone (USING (true)). That let ANYONE with
-- the anon key wipe the whole tickets table + photo bucket in one request.
--
-- This script removes public DELETE. After running it, deletes are only
-- possible through the `admin-delete` Edge Function, which runs with the
-- service-role key and checks the destructive-action password server-side.
--
-- SELECT / INSERT / UPDATE are left as-is on purpose so the public submit
-- form, the customer tracking page, and the staff dashboard's realtime
-- live-updates keep working unchanged.
--
-- Run this in: Supabase → SQL Editor.
-- ============================================================


-- ── Tickets: drop the public DELETE policy ──────────────────
DROP POLICY IF EXISTS "Allow public delete" ON tickets;


-- ── Storage: drop the public DELETE policy on repair photos ──
DROP POLICY IF EXISTS "Allow public delete of repair-photos" ON storage.objects;


-- ============================================================
-- AFTER running this SQL, deploy the Edge Function + set its secret:
--
--   supabase secrets set ADMIN_DELETE_PASSWORD=<your destructive password>
--   supabase functions deploy admin-delete --no-verify-jwt
--
-- The destructive password now lives ONLY in Supabase secrets (server-side),
-- not in the client bundle. You can remove VITE_ADMIN_PASSWORD from .env.
-- ============================================================
