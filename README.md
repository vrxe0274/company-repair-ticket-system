# VRXE Repair Ticket System

A full-featured repair ticket management system for **VRXE Repair Services**.

Built with **React + Tailwind CSS**, **Supabase**, **Resend**, and deployed on **Vercel**.

---

## Features

**Client Side**
- Public ticket submission form
- Auto-generated Ticket ID and tracking URL
- Confirmation email sent to client with tracking link
- Real-time public tracking page (no login required) showing status, progress, notes, photos, and pricing

**Company Dashboard**
- Password-protected staff portal
- Overview with ticket counts by status
- Full ticket database with search and filter by status
- Individual ticket detail page
- Status workflow management: Pending → Approved/Denied → Under Diagnosis → Awaiting Approval → In Queue → Repair in Progress → Done → Paid
- Add diagnosis notes, repair notes, upload repair photos
- Add quotation and final price
- Download individual ticket as PDF
- Export all tickets to XLSX
- Flush/reset database (admin password gated)

**Emails (via Resend)**
- *(Not included in this version — can be added later)*

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + Tailwind CSS |
| Database | Supabase (PostgreSQL) |
| File Storage | Supabase Storage |
| Hosting | Vercel |
| PDF | jsPDF + jspdf-autotable |
| Spreadsheet | SheetJS (xlsx) |
| Auth | Environment variable password gate |

---

## Setup Guide

### Step 1 — Prerequisites

Make sure you have these installed:
- [Node.js](https://nodejs.org/) v18 or higher
- [Git](https://git-scm.com/)
- A code editor (VS Code recommended)

---

### Step 2 — Clone / Download and Install

```bash
# If you downloaded the zip, extract it, then:
cd vrxe-tickets

# Install all dependencies
npm install
```

---

### Step 3 — Set up Supabase

1. Go to [supabase.com](https://supabase.com) and create a free account
2. Click **New Project** — give it a name like `vrxe-tickets`
3. Choose a region close to you, set a strong database password, click **Create Project**
4. Wait for the project to initialize (~1 minute)
5. In the left sidebar, click **SQL Editor**
6. Click **New query**, paste the entire contents of **`supabase-setup.sql`** from this project, and click **Run**
7. You should see `Success. No rows returned` — that means it worked
8. Repeat step 6 for the follow-up migrations (one-time runs, in this order):
   `notifications-setup.sql` → `notifications-status-update.sql` →
   `tickets-realtime-setup.sql` → `push-setup.sql` → `undo-status-setup.sql`
9. Go to **Project Settings → API** and copy:
   - **Project URL** (looks like `https://abcdefgh.supabase.co`)
   - **anon public** key (long string starting with `eyJ...`)

---

### Step 4 — Configure environment variables

Copy the example file and fill in your values:

```bash
cp .env.example .env
```

Open `.env` and fill in:

```env
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...your-anon-key...

VITE_DASHBOARD_PASSWORD=choose-a-strong-password
VITE_ADMIN_PASSWORD=choose-a-different-admin-password

VITE_APP_URL=http://localhost:5173
```

> **Never commit your `.env` file to Git!** It's already in `.gitignore`.

---

### Step 5 — Run locally

```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

- **Submit ticket form:** `http://localhost:5173/`
- **Track a ticket:** `http://localhost:5173/track/<token>`
- **Dashboard login:** `http://localhost:5173/login`
- **Dashboard:** `http://localhost:5173/dashboard`

---

### Step 6 — Deploy to Vercel

**Option A: Via GitHub (recommended)**

1. Push this project to a GitHub repository:
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git remote add origin https://github.com/YOUR_USERNAME/vrxe-tickets.git
   git push -u origin main
   ```

2. Go to [vercel.com](https://vercel.com) and sign up / log in
3. Click **Add New Project → Import Git Repository**
4. Select your `vrxe-tickets` repo
5. Vercel will auto-detect it as a Vite project. Leave build settings as default.
6. **Before deploying**, click **Environment Variables** and add each variable from your `.env` file:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `VITE_DASHBOARD_PASSWORD`
   - `VITE_ADMIN_PASSWORD`
   - `VITE_APP_URL` — set this to your actual Vercel URL (e.g. `https://vrxe-tickets.vercel.app`). You can update this after first deploy.
7. Click **Deploy**

**Option B: Via Vercel CLI**

```bash
npm install -g vercel
vercel login
vercel --prod
# Follow prompts, add env vars when asked
```

---

### Step 7 — Update VITE_APP_URL

After your first Vercel deployment, you'll have a URL like `https://vrxe-tickets.vercel.app`.

1. Go to your Vercel project → **Settings → Environment Variables**
2. Update `VITE_APP_URL` to your real Vercel URL
3. Redeploy (Vercel → **Deployments → Redeploy**)

This ensures the tracking links shown on screen after submission are correct.

---

## Environment Variables Reference

| Variable | Description |
|----------|-------------|
| `VITE_SUPABASE_URL` | Your Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon/public API key |
| `VITE_DASHBOARD_PASSWORD` | Password to access the staff dashboard |
| `VITE_ADMIN_PASSWORD` | Separate password required to flush/reset the database |
| `VITE_APP_URL` | Full URL of your deployed app (no trailing slash) |

---

## Project Structure

```
vrxe-tickets/
├── public/
│   └── vrxe-icon.svg           # Favicon
├── src/
│   ├── components/
│   │   └── ui/
│   │       ├── Logo.jsx         # VRXE brand logo
│   │       ├── ProtectedRoute.jsx
│   │       └── StatusBadge.jsx  # Colored status pill
│   ├── hooks/
│   │   └── useAuth.jsx          # Auth context + password gate
│   ├── lib/
│   │   ├── export.js            # ExcelJS XLSX export
│   │   ├── pdf.js               # jsPDF ticket PDF
│   │   ├── supabase.js          # Supabase client
│   │   └── utils.js             # IDs, tokens, status constants
│   ├── pages/
│   │   ├── dashboard/
│   │   │   ├── DashboardHome.jsx     # Overview + stats
│   │   │   ├── DashboardLayout.jsx   # Sidebar layout
│   │   │   ├── TicketDetailPage.jsx  # Full ticket editor
│   │   │   └── TicketListPage.jsx    # Filterable table
│   │   ├── LoginPage.jsx        # Staff login
│   │   ├── SubmitTicketPage.jsx # Public submission form
│   │   └── TrackTicketPage.jsx  # Public tracker
│   ├── App.jsx                  # Router
│   ├── index.css                # Tailwind + design tokens
│   └── main.jsx                 # React entry
├── supabase-setup.sql           # Run this in Supabase SQL Editor
├── .env.example                 # Copy to .env and fill in values
├── .gitignore
├── package.json
├── tailwind.config.js
├── vercel.json                  # SPA routing for Vercel
└── vite.config.js
```

---

## Notes & Security

- The dashboard is protected by a simple password stored in an environment variable. For a production app with multiple staff, consider upgrading to Supabase Auth.
- The Supabase Row Level Security policies allow public reads and writes (authenticated via password in the app layer). This is intentional for simplicity — the tracking page needs public read, and the submission form needs public insert.

---

## License

© VRXE Repair Services. All rights reserved.

SUPABASE PASSWORD:
CcRW1W8SKBaWhNOf

---

## Push Notifications & Persistent Login (Setup)

One-time setup for global Web Push:

1. **Database** — run `push-setup.sql` in the Supabase SQL Editor (creates `push_subscriptions`).
2. **VAPID keys** — already generated in `.env` (`VITE_VAPID_PUBLIC_KEY`). To rotate: `npx web-push generate-vapid-keys`.
3. **Edge Function** — deploy the sender and set its secrets:
   ```bash
   supabase functions deploy send-push --no-verify-jwt
   supabase secrets set VAPID_PUBLIC_KEY=<public key>
   supabase secrets set VAPID_PRIVATE_KEY=<private key>   # never put this in a VITE_ var
   supabase secrets set VAPID_SUBJECT=mailto:you@example.com
   ```
4. **Vercel** — add `VITE_VAPID_PUBLIC_KEY` to the project env vars and redeploy.

How it works:

- After login the dashboard shows a one-time "Enable notifications" banner. Granting it registers the device in `push_subscriptions` (re-prompt is snoozed 7 days if dismissed).
- Global pushes go to **all** subscribed devices regardless of role: automatically on new ticket submission and when a ticket is marked Paid, and manually from the Admin panel on the Notifications page. Role-scoped in-app notifications are unchanged.
- **iOS**: push requires iOS 16.4+ and the app installed via Share → Add to Home Screen. HTTPS is required everywhere (localhost is exempt for dev).
- **Persistent login**: "Remember me" (browser) or installed-PWA mode keeps the session in localStorage with a 30-day sliding expiry; logout or expiry removes the session and the device push subscription.
