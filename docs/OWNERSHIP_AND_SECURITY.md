# Ownership & Security

What transfers to the owner, and the security posture at handover.

---

## Security at handover

The app was built entirely on the **company's own accounts** (Google, Supabase, Vercel, GitHub). There are no developer-owned credentials sitting outside the company, so **nothing needs to be rotated** — the company already controls every account and password.

The local `.env` is gitignored and **not in git history** (verified). `env.example` holds placeholders only. There is no exposed-secret issue to clean up.

| # | Action | Why |
|---|---|---|
| 1 | Confirm the company can log in to each account below (Google, Supabase, Vercel, GitHub) | The company holds the live values directly |
| 2 | Remove the developer's access once turnover is confirmed (see [Final Agreement](FINAL_AGREEMENT.md) §6) | Company has sole control |
| 3 | Keep `.env` out of git — never `git add -f` it | Prevents future exposure |
| 4 | Confirm Edge Function secrets are set in Supabase: `ADMIN_PASSWORD`, `STAFF_PASSWORD`, `TECH_PASSWORD`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | They power server-side auth and push |
| 5 | Confirm `VITE_VAPID_PUBLIC_KEY` is set in Vercel | Web Push needs it client-side |

> Passwords can be changed anytime in-app (Admin → Settings, and Accounts for staff/technician) if ever desired — but it's optional, not a handover requirement.

> The `VITE_*_PASSWORD` variables (`VITE_DASHBOARD_PASSWORD`, `VITE_TECH_PASSWORD`, `VITE_ADMIN_PASSWORD`) are **unused** — auth is fully server-side. Delete them from any `.env`. See [KNOWN_ISSUES.md](KNOWN_ISSUES.md).

> 🔐 Actual credential values are in **`CREDENTIALS_HANDOVER.md`** (separate, gitignored file, delivered securely), not here.

---

## Accounts to confirm

All accounts are already on the company's email (`vrxetest01@gmail.com`). Confirm access to each.

| Asset | Where | Owner |
|---|---|---|
| **GitHub repository** | https://github.com/vrxe0274/company-repair-ticket-system | `vrxe0274` |
| **Supabase project** | supabase.com | `vrxetest01@gmail.com` |
| **Vercel project** | vercel.com | `vrxetest01@gmail.com` |
| **Custom domain** | Managed in Vercel | `vrxetest01@gmail.com` |
| **VAPID key pair** | Supabase secrets + Vercel env | This app |
| **Service-role key** | Supabase → Settings → API | Supabase project |
| **Login passwords** | Supabase secrets / in-app | Company |
| **Staff/Technician accounts** | `staff_accounts` / `technician_accounts` | Created by Admin in-app |

---

## Access model (who can do what)

| Role | Login | Can do |
|---|---|---|
| **Admin** | Shared password | Everything Staff can + manage accounts, edit Terms, analytics, payroll, DB flush |
| **Staff** | Username + password | Ticket queue: approve/deny, quote, collect payment, mark Paid |
| **Technician** | Username + password | Diagnosis, repair notes/photos, mark Done |
| **Customer** | No login | Submit a ticket, track via private link, upload payment proof |

Passwords are PBKDF2-hashed and verified server-side by Edge Functions — never shipped to the browser. Login is rate-limited (5 attempts / 15-min lockout).

---

## Data & privacy notes
- The app stores customer PII (name, contact, email, address, device details) and uploaded photos in the `repair-photos` Storage bucket (**public-read**).
- `tickets` has permissive RLS (public read/insert/update) since there's no per-user DB identity; deletes are locked to the `admin-delete` Edge Function. Anyone with the anon key + a tracking token can read ticket data. Tightening this is listed in [KNOWN_ISSUES.md](KNOWN_ISSUES.md).
