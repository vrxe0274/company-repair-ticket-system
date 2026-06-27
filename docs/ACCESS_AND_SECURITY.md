# Access & Security

Who can do what in the app, plus a few security notes worth knowing.

## Roles & Access

| Role | Login | What they can do |
|---|---|---|
| **Admin** | Shared password | Everything Staff can do, plus: manage accounts, edit Terms, analytics, payroll, DB flush |
| **Staff** | Username + password | Ticket queue: approve/deny, quote, collect payment, mark Paid |
| **Technician** | Username + password | Diagnosis, repair notes/photos, mark Done |
| **Customer** | No login | Submit a ticket, track via private link, upload payment proof |

## Security notes

- Passwords are PBKDF2-hashed and verified server-side by Edge Functions — never shipped to the browser.
- Login is rate-limited (5 attempts / 15-min lockout).
- The app stores customer PII (name, contact, email, address, device details) and uploaded photos in the `repair-photos` Storage bucket (**public-read**).
- The `tickets` table has permissive RLS (public read/insert/update) since there's no per-user DB identity; deletes are locked to the `admin-delete` Edge Function.
- Anyone with the anon key + a tracking token can read ticket data. Tightening this is listed in [KNOWN_ISSUES.md](KNOWN_ISSUES.md).
