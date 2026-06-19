import { STEP_REQUIRED, EMAIL_REGEX } from './constants'

/**
 * Validate one step of the ticket submission form.
 * Returns a map of field → error string; empty object = valid.
 *
 * @param {Object} form - Current form state from SubmitTicketPage
 * @param {number} s    - Step number (1–5)
 * @returns {Record<string, string>}
 */
export function validateStep(form, s) {
  const required = STEP_REQUIRED[s] || []
  const errs = {}

  required.forEach(field => {
    const val =
      field === 'unit_brand'
        ? (form.unit_brand === 'Others' ? form.unit_brand_custom : form.unit_brand)
        : field === 'unit_type'
          ? (form.unit_type === 'Others' ? form.unit_type_custom : form.unit_type)
          : field === 'mode_of_service'
            ? (form.mode_of_service === 'Courier'
                ? form.mode_courier
                : form.mode_of_service === 'Others'
                  ? form.mode_custom
                  : form.mode_of_service)
            : form[field]
    if (!val || !String(val).trim()) errs[field] = 'Required'
  })

  if (s === 1 && form.email && !EMAIL_REGEX.test(form.email)) {
    errs.email = 'Invalid email'
  }

  return errs
}
