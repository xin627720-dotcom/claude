interface StatCardProps {
  label: string
  value: string | number
  sub?: string
  color?: 'default' | 'accent' | 'success' | 'warning' | 'danger'
  icon?: React.ReactNode
}

const colorMap = {
  default: 'bg-white text-text-primary',
  accent: 'bg-accent/10 text-accent',
  success: 'bg-green-50 text-success',
  warning: 'bg-orange-50 text-warning',
  danger: 'bg-red-50 text-danger',
}

export default function StatCard({ label, value, sub, color = 'default', icon }: StatCardProps) {
  return (
    <div className={`rounded-md p-4 shadow-sm animate-fade-up ${colorMap[color]}`}>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-text-secondary">{label}</span>
        {icon && <span className="opacity-60">{icon}</span>}
      </div>
      <div className="text-2xl font-bold leading-tight">{value}</div>
      {sub && <div className="text-xs text-text-tertiary mt-0.5">{sub}</div>}
    </div>
  )
}
