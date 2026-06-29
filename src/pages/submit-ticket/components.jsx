import Logo from '../../components/ui/Logo.jsx'

export function PublicHeader() {
  return (
    <header className="bg-dark-900 border-b border-dark-700 px-6 py-3 flex items-center justify-between">
      <Logo size="sm" />
    </header>
  )
}

export function StepHeading({ icon: Icon, title, subtitle }) {
  return (
    <div className="flex items-start gap-3 pb-4 border-b border-gray-100 mb-2">
      <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-brand-600 to-accent-600 flex items-center justify-center shrink-0">
        <Icon className="w-5 h-5 text-white" />
      </div>
      <div>
        <h2 className="font-sans font-bold text-lg text-gray-900">{title}</h2>
        <p className="text-base font-body text-gray-500">{subtitle}</p>
      </div>
    </div>
  )
}

export function Field({ label, error, children }) {
  return (
    <div className="min-w-0">
      <label className="label">{label}</label>
      {children}
      {error && <p className="text-sm text-red-500 mt-1 font-body">{error}</p>}
    </div>
  )
}

export function SummaryRow({ label, value }) {
  if (!value) return null
  return (
    <div className="flex gap-3 text-base">
      <span className="text-gray-500 font-sans font-medium w-14 shrink-0">{label}</span>
      <span className="text-gray-800 font-body">{value}</span>
    </div>
  )
}
