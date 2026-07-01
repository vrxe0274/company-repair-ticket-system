export const SAVE_MSG_DURATION_MS  = 2500
export const PDF_DOWNLOAD_DELAY_MS = 300
export const MAX_PHOTO_BYTES       = 10 * 1024 * 1024

export const STATUS_GUIDANCE = {
  Staff: {
    'Pending':            'Your action: review the request — approve or deny.',
    'Inspection & Quote': 'Your action: add the quotation. The technician inspects the unit and saves the diagnosis.',
    'Repair in Progress': 'Waiting for the technician to finish the repair…',
    'Done':               'Your action: collect payment and mark the ticket as Paid.',
    'Paid':               'Ticket complete — payment received.',
    'Denied':             'Request denied — no further action needed.',
  },
  Technician: {
    'Pending':            'Waiting for staff to review the request…',
    'Inspection & Quote': 'Your action: inspect the unit and save the diagnosis. Staff adds the quotation.',
    'Repair in Progress': 'Your action: finish the repair — add notes & photos, then mark Done.',
    'Done':               'Waiting for the admin to collect payment…',
    'Paid':               'Ticket complete — payment received.',
    'Denied':             'Request denied — no further action needed.',
  },
}

export const TICKET_COLUMNS = [
  'id', 'ticket_id', 'status', 'previous_status', 'created_at', 'updated_at', 'paid_at', 'receipt_number',
  'tracking_token', 'client_name', 'contact_number', 'platform', 'email',
  'address', 'unit_brand', 'unit_model', 'unit_type', 'unit_condition', 'mode_of_service',
  'preferred_date', 'preferred_time', 'accessories_included', 'issue_description',
  'diagnosis_notes', 'repair_notes', 'repair_photos',
  'labor_items', 'parts_items', 'discount_percent', 'discount_amount', 'quotation_amount', 'quotation_notes', 'final_price',
  'payment_proof_url',
  'payment_option', 'payment_partial_high_pct', 'payment_partial_low_pct',
].join(', ')
