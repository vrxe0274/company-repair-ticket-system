# User Guide

How to use the VRXE Repair Ticket System. This guide is split by who you are: a **customer**, or shop staff (**Admin**, **Staff**, **Technician**).

The app is a Progressive Web App (PWA). You can use it in any modern browser, or **install it** to your phone/desktop home screen for an app-like experience and push notifications (see [Installing the app](#installing-the-app)).

---

## For customers (no login needed)

### Submitting a repair request
1. Open the submission link (e.g. `https://<app-url>/submit`).
2. Complete the 5 steps:
   1. **Terms** — read and accept the Terms & Conditions (required to continue).
   2. **Your Info** — name, contact number, email, address, and how you reached us (platform).
   3. **Your Unit** — brand, model, type, and condition of the device, plus any included accessories.
   4. **Issue** — describe the problem (you can pick a common preset or type your own).
   5. **Appointment** — preferred date/time and mode of service (drop-off, courier, etc.).
3. Submit. You'll receive a **Ticket ID** (format `VR-YYMM-###`, e.g. `VR-2606-001`) and a **private tracking link**. Save the link — it's how you check your repair.

> A flat **diagnosis fee of ₱800** applies to every new ticket.

### Tracking your repair
- Open your tracking link (`/track/<your-token>`) anytime. No login required.
- You'll see the current **status**, diagnosis notes, repair photos, and the pricing breakdown once available.
- You can **download a receipt PDF** once the ticket is paid.

### Choosing a payment plan & uploading proof
- On the tracker you can choose a payment plan, which affects the maximum discount available:
  - **Pay in full now** → eligible for the highest discount.
  - **Pay half now** → eligible for a smaller discount.
  - **Pay later** → no discount.
- Select your **mode of payment** (Cash, GCash, or Bank Transfer).
- Upload a **screenshot/photo of your payment proof** directly from the tracker. Staff verify it before marking the ticket Paid.

### Repair status meanings
| Status | What it means for you |
|---|---|
| **Pending** | We received your request; staff are reviewing it. |
| **Inspection & Quote** | A technician is inspecting your unit and we're preparing a quote. |
| **Repair in Progress** | Your unit is being repaired. |
| **Done** | Repair finished — ready for payment / pickup. |
| **Paid** | Payment received. Complete. |
| **Denied** | Request was declined (no further action). |

---

## For shop staff — logging in
1. Go to `/login`.
2. **Pick your role:** Admin, Staff, or Technician.
3. Enter your credentials:
   - **Admin** → password only.
   - **Staff / Technician** → your **username + password** (your account is created by the Admin).
4. Optionally tick **Remember me** to stay signed in for 30 days. (When the app is **installed** as a PWA, you stay signed in automatically.)
5. If the Admin reset your password, you'll be prompted to set a new one on first login.

After login you land on the **Overview** dashboard. The sidebar shows only the sections your role can access.

---

## For Technicians
Your job is the hands-on repair work.

1. **Tasks** (or Overview) shows tickets waiting on you.
2. When a ticket is at **Inspection & Quote**: open it → **Tech Notes** tab → inspect the unit and **save your diagnosis notes**. (Staff add the price quote.)
3. When a ticket is at **Repair in Progress**: do the repair, add **repair notes** and **upload photos**, then mark the ticket **Done**.
4. Use **Earnings** to see your commission (a percentage of the labor on tickets you worked).

You can move a ticket: *Inspection & Quote → Repair in Progress* and *Repair in Progress → Done*.

---

## For Staff
You manage the ticket queue, pricing, and payment.

1. **Overview** — status totals and recent activity.
2. **All Tickets** — search, filter by status, open any ticket.
3. **Review a new request** (Pending): open it → approve (moves to **Inspection & Quote**) or **Deny**.
4. **Quote** (Inspection & Quote): open the **Pricing** tab → add itemized **labor** and **parts**, apply any **discount** (capped by the customer's payment plan). The total quotation is computed for you.
5. **Collect payment** (Done): verify the customer's uploaded payment proof, then mark the ticket **Paid**. A **receipt number** and receipt PDF are generated automatically.
6. **Tasks** — your outstanding actions.
7. **Earnings** — your commission (a percentage of labor after the technician's share).
8. **Undo** — Staff/Admin can revert the most recent status change on a ticket.

Status moves available to Staff: *Pending → Inspection & Quote / Denied*, *Inspection & Quote → Repair in Progress*, *Done → Paid*.

---

## For Admin
Admin can do **everything Staff can do**, plus:

- **Accounts** — create, rename, **reset password**, and delete **Staff** and **Technician** accounts. Resetting a password generates a temporary one the user must change at next login.
- **Analytics** — ticket volume and revenue/status breakdowns.
- **Payroll** — commission earnings per period for the whole team.
- **Settings → Terms & Conditions** — edit the T&C customers must accept.
- **Settings → Commission rates** — set the technician/staff commission percentages (changes are effective-dated; past tickets keep the rate that applied when they were created).
- **Flush Database** — a password-protected action that permanently clears ticket data. **Irreversible — use with extreme care.**

> Admin is intentionally **blocked from the per-user Earnings page** (Admin isn't a commissioned worker). Use **Payroll** for team-wide figures.

---

## Notifications
- **In-app:** the **Notifications** bell shows new tickets and status changes relevant to your role (real-time when connected; otherwise refreshed about once a minute). Admin sees both Staff and Technician notifications.
- **Push:** if you allow notifications (and ideally install the app), you'll get device push alerts for key events like new tickets and payments.

---

## Installing the app
- **Android / Desktop (Chrome/Edge):** open the app → browser menu → **Install app** / **Add to Home screen**.
- **iPhone/iPad (Safari):** Share → **Add to Home Screen**. (On iOS, push notifications only work after installing to the Home Screen, iOS 16.4+.)

Installing keeps you signed in and enables reliable push notifications.
