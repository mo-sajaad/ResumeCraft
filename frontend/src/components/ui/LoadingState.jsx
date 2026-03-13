export function LoadingState({ rows = 3 }) {
  return (
    <div className="ui-loading-state" role="status" aria-live="polite">
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="ui-skeleton" />
      ))}
    </div>
  );
}

export function ErrorState({ title = "Something went wrong", description, action }) {
  return (
    <div className="ui-error-state" role="alert">
      <h3 className="ui-error-title">{title}</h3>
      {description ? <p className="ui-error-description">{description}</p> : null}
      {action ? <div className="ui-state-actions">{action}</div> : null}
    </div>
  );
}
