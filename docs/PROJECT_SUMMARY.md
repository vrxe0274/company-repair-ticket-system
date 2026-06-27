# Project Summary

*A non-technical overview for the product owner / stakeholder.*

## What this product is
The **VRXE Repair Ticket System** is a web application that runs the entire lifecycle of a device-repair job — from the moment a customer submits a request to final payment — and gives the shop's team a single place to manage the work.

It works in any web browser and can be **installed like a mobile app** (on phones, tablets, and desktops), including offline support and push notifications.

## What it does

### For customers
- Submit a repair request through a simple guided form (no account needed).
- Receive a unique Ticket ID and a **private link to track their repair** in real time — including diagnosis notes, repair photos, and the price breakdown.
- Choose a payment plan, pick a payment method, and **upload proof of payment**.
- Download a **receipt** once paid.

### For the shop team
- **Three roles** with appropriate permissions:
  - **Admin** — runs accounts, pricing rules, reports, and has full oversight.
  - **Staff** — manages the ticket queue, approves/denies requests, prepares quotes, and collects payment.
  - **Technician** — performs inspections and repairs, logs notes and photos.
- A guided **status workflow** (Pending → Inspection & Quote → Repair in Progress → Done → Paid) that keeps everyone aligned and prevents invalid steps.
- **Quoting** with itemized labor and parts, discounts, and automatic totals.
- **Automatic receipts and quotation PDFs**, plus **Excel export** of ticket data.
- **Commission & payroll** tracking for technicians and staff.
- **Analytics** on ticket volume and revenue.
- **Real-time updates and push notifications** so the team sees new tickets and changes immediately.

## How it's delivered & hosted
- The app is hosted on **Vercel** (the public website) and **Supabase** (the database, secure server logic, and file storage).
- It is a **Progressive Web App**, so there's nothing to publish to the Apple/Google app stores — customers and staff just open a link or install it from their browser.

## Known limitations (current state)
- **Login is by role/account, not a full identity system.** It's secure (passwords are hashed and checked on the server, with lockout after repeated failures), but it's intentionally lightweight rather than enterprise SSO.
- **Customer ticket data is readable by anyone who has the tracking link.** Links are long and unguessable, but there is no customer login protecting them.
- **Repair photos are stored with public links** (unguessable, but not access-controlled).
- **Push notifications are sent to all signed-in devices**, not targeted per person.
- **Database changes and backups are managed manually** in the Supabase dashboard; there is no automated migration tooling.
- The **"Flush Database"** admin action permanently deletes data and cannot be undone.

None of these prevent day-to-day use — they're noted so the owner can decide if/when to invest in hardening.

## Recommended next steps
1. **Complete the security handover** — rotate the Supabase keys and all login passwords so the client alone controls them (the code/secrets are *not* exposed in git; this is standard handover hygiene). See [OWNERSHIP_AND_SECURITY.md](OWNERSHIP_AND_SECURITY.md). *Do this first.*
2. **Confirm automated database backups** are enabled on the Supabase plan.
3. Consider **tightening data access** (customer login or stricter rules) if customer privacy requirements grow.
4. Consider **targeted notifications** (per role/person) instead of broadcast.
5. Optional future enhancements: SMS/email notifications to customers, inventory/parts tracking, multi-branch support.

## Ownership & accounts
All accounts, credentials, and the transfer checklist are documented in [OWNERSHIP_AND_SECURITY.md](OWNERSHIP_AND_SECURITY.md). Third-party software licenses are listed in [LICENSES.md](LICENSES.md).

**Built and maintained by:** Neo Monserrat — neo.monserrat@gmail.com
