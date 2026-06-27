# Ownership & Security Checklist

This document lists everything that must transfer to the new owner, plus the security actions to complete **before** final handover.

---

## ⚠️ Security actions — do these at handover

Good news: the local `.env` file is correctly listed in `.gitignore` and is **not tracked in git and not present in git history** (verified). The committed `env.example` contains placeholders only. So there is **no exposed-secret-in-history emergency** to scrub.

However, the outgoing developer's local `.env` does hold the **real, in-use** credentials in plaintext (the Supabase keys plus the current login passwords). As standard handover hygiene — and to satisfy the "remove all my access" clause of the [Final Agreement](FINAL_AGREEMENT.md) — rotate them so only the client controls the live values.

| # | Action | Why |
|---|---|---|
| 1 | **Rotate the Supabase anon key** (Supabase → Project Settings → API → roll keys) and update `VITE_SUPABASE_ANON_KEY` in Vercel + local `.env` | Removes the key the outgoing dev knows. (The anon key is public-by-design, but rotating cleanly cuts old access.) |
| 2 | **Change every login/admin password** — Admin shared password, the DB-flush password, and each staff/technician account password (current values include `VRXEADMIN`, `VRXETECH`, `VRXE12345`) | The outgoing developer knows these; rotate so the client alone holds them |
| 3 | **Keep `.env` out of git** — it is already gitignored; never `git add -f` it. Distribute credentials via the secure handover file (see below), not the repo | Prevents future accidental exposure |
| 4 | **Confirm Edge Function secrets are set in Supabase** (not in any committed file): `ADMIN_PASSWORD`, `STAFF_PASSWORD`, `TECH_PASSWORD`, `ADMIN_DELETE_PASSWORD`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | These power server-side auth and push |
| 5 | **Ensure `VITE_VAPID_PUBLIC_KEY` is set in Vercel** | Web Push subscription needs it client-side; it was absent from the local `.env` sample |
| 6 | **Re-set VAPID secrets under the client's account** and redeploy `send-push` | Push private key must stay server-only and client-owned |

> The `VITE_*_PASSWORD` variables that appeared in the local `.env` sample (`VITE_DASHBOARD_PASSWORD`, `VITE_TECH_PASSWORD`, `VITE_ADMIN_PASSWORD`) are **not used by the current code** — auth is fully server-side. Delete them from any `.env`; they are misleading. See [KNOWN_ISSUES.md](KNOWN_ISSUES.md).

> 🔐 The actual credential values are handed over in **[`CREDENTIALS_HANDOVER.md`](#credential--account-ownership-checklist)** (a separate, gitignored file — see the next section), not in this document.

---

## Account / credential transfer checklist

Transfer ownership (or confirmed access) of each item to the client. Fill in the "Current owner" and "Transferred?" columns during handover.

| Asset | Where | Current owner | Transferred? |
|---|---|---|---|
| **GitHub repository** | https://github.com/vrxe0274/company-repair-ticket-system | `vrxe0274` account | ☐ |
| **Supabase project** | supabase.com dashboard | `vrxetest01@gmail.com` | ☐ |
| **Vercel project** | vercel.com dashboard | `vrxetest01@gmail.com` | ☐ |
| **Custom domain** | Managed in Vercel | `vrxetest01@gmail.com` | ☐ |
| **VAPID key pair** | Supabase secrets + Vercel env | Generated for this app | ☐ |
| **Supabase service-role key** | Supabase → Settings → API | Internal to Supabase project | ☐ |
| **Login passwords** (Admin shared + flush) | Supabase secrets | _to confirm_ | ☐ |
| **Staff/Technician accounts** | `staff_accounts` / `technician_accounts` tables | Created by Admin in-app | ☐ |
| **Email for push subject** (`VAPID_SUBJECT`) | Supabase secret | _to confirm_ | ☐ |

### Recommended transfer method
- **Supabase / Vercel:** add the client's email as an owner/member, verify they can log in, then remove the builder's access if required.
- **GitHub:** transfer the repository to the client's org/account, or add them as an admin collaborator.
- **Domain:** push/transfer at the registrar, or repoint DNS to the client-owned Vercel project.

---

## Access model summary (who can do what)

| Role | How they log in | Capabilities |
|---|---|---|
| **Admin** | Shared password (one Admin) | Everything Staff can do + manage accounts, edit Terms, analytics, payroll, DB flush |
| **Staff** | Individual username + password | Ticket queue: approve/deny, quote, collect payment, mark Paid |
| **Technician** | Individual username + password | Diagnosis, repair notes/photos, mark Done |
| **Customer** | No login | Submit a ticket, track via private link, upload payment proof |

Passwords are never stored or shipped in plaintext to the browser — they are PBKDF2-hashed and verified by Supabase Edge Functions. Login is rate-limited (5 attempts / 15 min lockout).

---

## Data & privacy notes
- The app stores customer PII: name, contact number, email, address, device details, and uploaded payment-proof / repair photos (Supabase Storage bucket `repair-photos`, currently **public-read**).
- The `tickets` table has permissive RLS (public read/insert/update) because the app has no per-user DB identity; deletes are locked to the `admin-delete` Edge Function. The new owner should be aware that anyone with the anon key + a tracking token can read ticket data. Tightening this is listed in [KNOWN_ISSUES.md](KNOWN_ISSUES.md).
