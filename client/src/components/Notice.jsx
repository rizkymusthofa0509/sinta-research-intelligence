import Icon from './Icon.jsx';

const STYLES = {
  info: { box: 'border-brand-100 bg-brand-50/60 text-ink-2', icon: 'info', iconColor: 'text-brand-450', label: 'Note' },
  warning: { box: 'border-warn-line bg-warn-bg text-ink-2', icon: 'alert', iconColor: 'text-warn-ink', label: 'Warning' },
  error: { box: 'border-err-line bg-err-bg text-ink-2', icon: 'alert', iconColor: 'text-critical', label: 'Error' },
};

/** Status message: always icon + label + text, never color alone. */
export default function Notice({ tone = 'info', title, children, action }) {
  const s = STYLES[tone];
  return (
    <div className={`flex gap-3 rounded-xl border px-4 py-3 text-sm ${s.box}`} role={tone === 'error' ? 'alert' : 'note'}>
      <Icon name={s.icon} className={`mt-0.5 h-4 w-4 shrink-0 ${s.iconColor}`} />
      <div className="min-w-0 flex-1">
        <p className="font-medium text-ink">
          <span className="sr-only">{s.label}: </span>
          {title}
        </p>
        {children && <div className="mt-0.5 leading-relaxed">{children}</div>}
        {action && <div className="mt-2">{action}</div>}
      </div>
    </div>
  );
}

export function EmptyState({ icon = 'search', title, children, action }) {
  return (
    <div className="card mx-auto mt-10 max-w-xl p-8 text-center">
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-brand-50 text-brand-450">
        <Icon name={icon} className="h-6 w-6" />
      </div>
      <h2 className="text-lg font-semibold">{title}</h2>
      {children && <div className="mt-2 text-sm leading-relaxed text-ink-2">{children}</div>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
