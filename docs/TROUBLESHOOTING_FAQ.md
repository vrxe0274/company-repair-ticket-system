# Troubleshooting & FAQ

Common questions and fixes for everyday users. For technical/hosting issues, see [DEPLOYMENT_RUNBOOK.md](DEPLOYMENT_RUNBOOK.md).

**Support contact:** Neo Monserrat — neo.monserrat@gmail.com

---

## Customers

**Q: I lost my tracking link. How do I check my repair?**
The tracking link is the only way to view a ticket without staff access. Contact the shop with your **Ticket ID** (e.g. `VR-2606-001`), name, and contact number, and staff can look it up and resend the link.

**Q: My tracking page isn't updating.**
Status updates appear in real time when you're online, and otherwise refresh roughly every 30 seconds. Refresh the page. If it still looks stale, check your internet connection.

**Q: I uploaded payment proof but the status is still "Done."**
Staff verify the proof manually before marking the ticket **Paid**. Allow some time, or contact the shop if it's urgent.

**Q: What is the ₱800 fee?**
A flat diagnosis fee applied to every new ticket. The repair quote (labor + parts, minus any discount) is shown separately on your tracker.

---

## Staff / Technician

**Q: I can't log in.**
- Make sure you picked the right **role** first, then entered credentials.
  - **Admin** = password only.
  - **Staff / Technician** = **username + password**.
- After **5 failed attempts** the account is locked for **15 minutes** — wait and try again.
- If you forgot your password, ask the **Admin** to reset it (Accounts page). You'll get a temporary password and be asked to set a new one at next login.

**Q: I keep getting "Connection error. Check your network and try again."**
This means the app couldn't reach the backend. Usually it's the network. Check your connection and retry. If it persists for everyone, the backend (Supabase) may be down — contact the dev/IT contact above. (Note: in a *local development* setup this can also be caused by a stale service worker — see [KNOWN_ISSUES.md](KNOWN_ISSUES.md).)

**Q: I don't see the Accounts / Payroll / Analytics menu.**
Those are **Admin-only**. Staff and Technicians won't see them.

**Q: I'm Admin but I can't open Earnings.**
That's intentional — Earnings is the personal commission view for Staff/Technician. Admin uses **Payroll** for team-wide figures.

**Q: I can't move a ticket to the status I want.**
Status changes are restricted by role and by the current status (the workflow is enforced). For example, a Technician can move *Repair in Progress → Done*, but only Staff/Admin can mark a ticket *Paid*. The app only shows the buttons you're allowed to use.

**Q: I made a wrong status change.**
Staff/Admin can **Undo** the most recent status change from the ticket. (Only the last change can be reverted.)

---

## Notifications & install

**Q: I'm not getting push notifications.**
- Make sure you **allowed notifications** when prompted.
- On **iPhone/iPad**, push only works after you **Add to Home Screen** (install the app), iOS 16.4+.
- Reinstalling the app or toggling notification permission in your browser/OS settings can re-trigger the prompt.

**Q: How do I install the app?**
- Android/Desktop (Chrome/Edge): browser menu → **Install app**.
- iPhone/iPad (Safari): Share → **Add to Home Screen**.

**Q: It logged me out unexpectedly.**
Without **Remember me**, sessions end when you close the tab. With Remember me (or when installed as an app), you stay signed in for 30 days of activity. After 30 days idle you'll need to log in again.

---

## When to escalate to the dev/IT contact
Contact Neo Monserrat (neo.monserrat@gmail.com) if:
- The app is down or showing "Connection error" for **all** users.
- Push notifications stopped working for everyone.
- You see data that looks wrong/corrupted, or a ticket is stuck and Undo doesn't help.
- You need a password reset for the **Admin** account itself (staff/tech resets are self-serve via Admin).
