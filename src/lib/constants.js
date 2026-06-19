/** Flat diagnosis fee charged on every new ticket (PHP). */
export const DIAGNOSIS_FEE = 800

// Polling fallback intervals (ms) when the Supabase realtime channel drops.
// TrackTicketPage uses a faster cadence — clients need quicker status feedback.
// DashboardHome/TicketListPage can afford a slower cycle; admin is actively watching.
export const TRACK_POLL_INTERVAL_MS     = 30_000
export const DASHBOARD_POLL_INTERVAL_MS = 60_000
