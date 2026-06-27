# Deployment Runbook

*Audience: developers / IT ops.* How to deploy, roll back, restart, and monitor the VRXE Repair Ticket System. Setup prerequisites are in the root [README.md](../README.md).

## Components & where they run
| Component | Hosted on | Deployed by |
|---|---|---|
| Frontend (React PWA) | **Vercel** | Git push → automatic build |
| Database, Storage, Realtime | **Supabase** | SQL run in dashboard (`sql/full-setup.sql`) |
| Edge Functions (9) | **Supabase** | `supabase functions deploy …` |
| Secrets | **Supabase** (server) + **Vercel** (`VITE_*`) | dashboards / CLI |

---

## 1. Deploy the frontend (Vercel)

**Normal flow:** push to `main` → Vercel builds (`npm run build`) and deploys automatically.

```bash
git push origin main
```

Manual deploy (if needed):
```bash
npm i -g vercel
vercel          # preview deployment
vercel --prod   # production deployment
```

**Environment variables** (Vercel → Project → Settings → Environment Variables) — must exist for the build to work:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_APP_URL` (production URL, no trailing slash)
- `VITE_VAPID_PUBLIC_KEY`

After changing any env var, **redeploy** for it to take effect. SPA routing is handled by [`vercel.json`](../vercel.json) (all paths rewrite to `/index.html`).

---

## 2. Deploy Edge Functions (Supabase)

```bash
supabase login
supabase link --project-ref <project-ref>

# Deploy one:
supabase functions deploy <name> --no-verify-jwt

# All:
for fn in verify-login staff-login tech-login staff-manage tech-manage \
          change-password admin-delete send-push manage-push; do
  supabase functions deploy "$fn" --no-verify-jwt
done
```

> `--no-verify-jwt` is required: the app uses shared-password / per-account auth, **not** Supabase Auth JWTs. Functions enforce their own auth.

**Function secrets** (set once; re-set only if you ever change them):
```bash
supabase secrets set ADMIN_PASSWORD=…           # verify-login + admin-delete
supabase secrets set STAFF_PASSWORD=…           # verify-login (legacy fallback)
supabase secrets set TECH_PASSWORD=…            # verify-login (legacy fallback)
supabase secrets set VAPID_PUBLIC_KEY=…         # send-push
supabase secrets set VAPID_PRIVATE_KEY=…        # send-push
supabase secrets set VAPID_SUBJECT=mailto:you@example.com
```
> `admin-delete` reuses `ADMIN_PASSWORD` — there is no separate delete password.
`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected automatically — do not set them manually.

---

## 3. Database changes

There is **no migration tool**; schema is applied by hand.

- **Fresh project:** run [`sql/full-setup.sql`](../sql/full-setup.sql) once in the Supabase SQL Editor.
- **Existing project:** run only the relevant section(s). The script is idempotent (`IF NOT EXISTS`, `DROP … IF EXISTS`).
- **After any schema change, update `sql/full-setup.sql`** so it stays the source of truth.

---

## 4. Rollback

| What | How |
|---|---|
| **Frontend** | Vercel → Deployments → pick the previous good deployment → **Promote to Production** (or `vercel rollback`). Instant; no rebuild. |
| **Edge Function** | Redeploy the previous commit's version: `git checkout <good-sha> -- supabase/functions/<name> && supabase functions deploy <name> --no-verify-jwt`. |
| **Database** | No automatic rollback. Restore from a Supabase **backup** (Database → Backups) or reverse the change with SQL. Test destructive changes on a branch/staging project first. |
| **Secret change** | Re-set the previous value with `supabase secrets set …` and redeploy the affected function. |

---

## 5. Restart / recover
- Edge Functions and Vercel are **serverless** — there is nothing to "restart." To force a clean state, **redeploy**.
- If the app misbehaves after a deploy, the fastest recovery is a **frontend rollback** (above).
- If users see stale content after a release, it's usually the **service worker** caching the old shell — `registerType: 'autoUpdate'` updates it on next load; a hard refresh / reopen forces it.

---

## 6. Monitoring & logs
| Signal | Where |
|---|---|
| Frontend build & runtime | Vercel → Deployments / Logs |
| Edge Function logs | Supabase → Edge Functions → (function) → Logs, or `supabase functions logs <name>` |
| Database / SQL | Supabase → Logs → Postgres; Realtime under Logs → Realtime |
| Auth lockouts / rate limits | Edge Function logs (rate-limit state lives in Deno KV) |
| Push delivery | `send-push` response `{ sent, failed, pruned }` + function logs |
| Storage | Supabase → Storage → `repair-photos` |

**Health check suggestions:** load `/submit` (frontend up), submit a test ticket (DB insert + trigger + realtime), trigger a push (VAPID config), open `/track/<token>` (public read).

---

## 7. Release checklist
1. `npm run lint && npm run test:run` pass locally.
2. Merge to `main` → confirm Vercel production deploy succeeds.
3. If functions changed: `supabase functions deploy …` for each.
4. If schema changed: run the SQL section **and** update `sql/full-setup.sql`.
5. Smoke test: submit → track → login → status change → push.
6. If anything breaks: **roll back the frontend first**, then investigate.
