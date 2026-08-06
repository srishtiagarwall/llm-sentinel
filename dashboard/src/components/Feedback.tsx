export function Spinner({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="spinner-block" role="status" aria-live="polite">
      <span className="spinner" />
      <span>{label}</span>
    </div>
  );
}

export function ErrorBanner({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="banner banner--error">
      <span>{message}</span>
      {onRetry && (
        <button type="button" className="banner__retry" onClick={onRetry}>
          Retry
        </button>
      )}
    </div>
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="empty-state-block">
      <p className="empty-state-block__title">{title}</p>
      {hint && <p className="empty-state-block__hint">{hint}</p>}
    </div>
  );
}
