import { Fragment } from 'react'
import {
  Clock, Search, Wrench, CheckCircle, CreditCard, Minus, Lock,
} from 'lucide-react'
import { STATUS_ORDER } from '../../../lib/utils'

export function LineItem({ item, onChange, onRemove, canRemove }) {
  return (
    <div className="flex items-center gap-2 min-w-0">
      <input
        type="text"
        value={item.description}
        onChange={e => onChange(item.id, 'description', e.target.value)}
        placeholder="Description"
        className="input-field flex-1 min-w-0 text-sm"
      />
      <div className="relative w-24 sm:w-32 shrink-0">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-mono">₱</span>
        <input
          type="number"
          min="0"
          step="0.01"
          value={item.amount}
          onChange={e => onChange(item.id, 'amount', e.target.value)}
          placeholder="0.00"
          className="input-field pl-7 text-sm text-right font-mono w-full"
        />
      </div>
      <button
        type="button"
        onClick={() => onRemove(item.id)}
        disabled={!canRemove}
        className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-20 disabled:pointer-events-none shrink-0"
        aria-label="Remove line item"
      >
        <Minus className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}

export function SummaryLine({ label, value, valueClass = 'text-gray-800' }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="font-body text-gray-500">{label}</span>
      <span className={`font-mono font-semibold ${valueClass}`}>{value}</span>
    </div>
  )
}

export function InfoBox({ label, value, accent = false }) {
  return (
    <div className={`rounded-lg px-2.5 py-1.5 border ${accent ? 'bg-brand-50 border-brand-100' : 'bg-gray-50 border-gray-100'}`}>
      <p className="text-[10px] font-mono uppercase tracking-widest text-gray-500 mb-0">{label}</p>
      <p className={`text-xs font-sans font-semibold leading-snug ${accent ? 'text-brand-700' : 'text-gray-800'}`}>
        {value || <span className="text-gray-300 italic font-normal">—</span>}
      </p>
    </div>
  )
}

export function TabButton({ active, onClick, icon: Icon, label, badge }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-4 py-3 text-sm font-sans font-semibold transition-all whitespace-nowrap border-b-2 rounded-t-lg
        ${active
          ? 'text-white border-brand-500'
          : 'text-gray-400 border-transparent hover:text-gray-200 hover:bg-white/5'
        }`}
    >
      <Icon className="w-3.5 h-3.5" />
      {label}
      {badge && (
        <span className="ml-1 text-xs font-mono bg-brand-100 text-brand-700 px-1.5 py-0.5 rounded-full">
          {badge}
        </span>
      )}
    </button>
  )
}

export function LockedSection({ message }) {
  return (
    <div className="flex flex-col items-center justify-center py-10 gap-3 text-center">
      <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center">
        <Lock className="w-5 h-5 text-gray-400" />
      </div>
      <p className="text-sm font-body text-gray-500 max-w-xs">{message}</p>
    </div>
  )
}

const STEP_ICONS = {
  'Pending':            Clock,
  'Inspection & Quote': Search,
  'Repair in Progress': Wrench,
  'Done':               CheckCircle,
  'Paid':               CreditCard,
}

export function ProgressCard({ status, guidance, className = '' }) {
  const progressIdx  = STATUS_ORDER.indexOf(status)
  const isActionable = guidance?.startsWith('Your action')

  return (
    <div className={`card overflow-hidden ${className}`}>
      {/* Step track */}
      <div className="px-3 sm:px-4 py-4">
        <div className="flex items-center w-full">
          {STATUS_ORDER.map((s, i) => {
            const isComplete = i < progressIdx
            const isCurrent  = i === progressIdx
            const isLast     = i === STATUS_ORDER.length - 1
            const Icon       = STEP_ICONS[s]

            return (
              <Fragment key={s}>
                {/* Node */}
                <div className="shrink-0">
                  <div className={`w-7 h-7 sm:w-9 sm:h-9 rounded-lg sm:rounded-xl flex items-center justify-center transition-all duration-300
                    ${isComplete
                      ? 'bg-emerald-500 text-white shadow-sm'
                      : isCurrent
                        ? 'bg-dark-900 text-white shadow-md ring-2 ring-brand-400 ring-offset-1 sm:ring-offset-2'
                        : 'bg-gray-100 text-gray-300'
                    }`}
                  >
                    {isComplete
                      ? <CheckCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                      : <Icon className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                    }
                  </div>
                </div>

                {/* Connector — flex-1 fills equally between identical-width nodes */}
                {!isLast && (
                  <div className="flex-1 h-0.5 mx-1.5 sm:mx-4 bg-gray-100 rounded-full overflow-hidden">
                    <div className={`h-full bg-emerald-500 transition-all duration-700 ${isComplete ? 'w-full' : 'w-0'}`} />
                  </div>
                )}
              </Fragment>
            )
          })}
        </div>
      </div>

      {/* Guidance banner */}
      {guidance && (
        <div className={`flex items-center gap-3 px-5 py-2.5 border-t
          ${isActionable ? 'bg-brand-50 border-brand-100' : 'bg-gray-50 border-gray-100'}`}
        >
          <div className={`w-1 self-stretch rounded-full shrink-0 ${isActionable ? 'bg-brand-400' : 'bg-gray-300'}`} />
          <p className={`text-xs font-body ${isActionable ? 'text-brand-700 font-semibold' : 'text-gray-500 italic'}`}>
            {guidance}
          </p>
        </div>
      )}
    </div>
  )
}
