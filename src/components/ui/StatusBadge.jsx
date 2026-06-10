import { STATUS_COLORS } from '../../lib/utils'

export default function StatusBadge({ status, size = 'md' }) {
  const colors = STATUS_COLORS[status] || { bg: 'bg-gray-100', text: 'text-gray-700', dot: 'bg-gray-400' }
  const sizes = {
    sm: 'text-xs px-2 py-0.5',
    md: 'text-xs px-2.5 py-1',
    lg: 'text-sm px-3 py-1.5',
  }
  return (
    <span className={`inline-flex items-center gap-1.5 font-sans font-semibold tracking-wide rounded-full ${colors.bg} ${colors.text} ${sizes[size]}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${colors.dot}`} />
      {status}
    </span>
  )
}
