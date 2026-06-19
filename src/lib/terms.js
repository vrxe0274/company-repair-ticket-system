import { supabase } from './supabase'

const TERMS_KEY = 'terms'

export const DEFAULT_TERMS = [
  {
    title: '1. Repair Turnaround Time',
    content: 'Minor issue repairs — estimated 2–3 business days.\nMajor issue repairs — estimated 1–2 weeks.\nRepair time may vary depending on the availability and shipping of parts.',
  },
  {
    title: '2. Inspection & Quotation',
    content: 'All units undergo a thorough inspection before any repair work begins. A repair quotation will be sent to you for approval — no work will proceed without your confirmation.\n\nAll services start with a flat rate of ₱800 for diagnosis only. Additional fees may be charged depending on the diagnosis findings, required parts, and labor involved in the repair.',
  },
  {
    title: '3. Payment',
    content: 'Full payment is required upon completion of the repair before the unit is released. If you choose to decline the quotation after inspection, a minimal inspection fee may apply.',
  },
  {
    title: '4. Data & Content',
    content: 'We are not responsible for any data, accounts, or saved content on the device. We strongly recommend backing up your data before submitting your unit for repair.',
  },
  {
    title: '5. Warranty on Repairs',
    content: 'Completed repairs carry a 30-day warranty covering the same issue that was repaired, though warranty coverage may vary depending on the type of repair performed. The warranty is void if the unit shows signs of physical damage, unauthorized tampering, or liquid exposure after it has been released to the client.',
  },
  {
    title: '6. Unclaimed Units',
    content: 'Units not claimed within 30 days after repair completion will be subject to a storage fee. Units left unclaimed for more than 90 days may be forfeited without further notice.',
  },
  {
    title: '7. Liability',
    content: 'We handle all units with the utmost care. However, we are not liable for pre-existing damage or faults unrelated to the reported issue that may become apparent during the repair process.',
  },
]

export async function getTerms() {
  const { data } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', TERMS_KEY)
    .single()
  return data ? data.value : DEFAULT_TERMS
}

export async function saveTerms(sections) {
  await supabase
    .from('app_settings')
    .upsert({ key: TERMS_KEY, value: sections })
}

export async function resetTerms() {
  await supabase
    .from('app_settings')
    .delete()
    .eq('key', TERMS_KEY)
}

export async function hasCustomTerms() {
  const { data } = await supabase
    .from('app_settings')
    .select('key')
    .eq('key', TERMS_KEY)
    .single()
  return !!data
}
