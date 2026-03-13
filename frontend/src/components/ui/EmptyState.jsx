export default function EmptyState({ title, description, action }) {
  return (
    <div className="ui-empty-state" role="status" aria-live="polite">
      <h3 className="ui-empty-title">{title}</h3>
      <p className="ui-empty-description">{description}</p>
      {action ? <div className="ui-state-actions">{action}</div> : null}
    </div>
  );
}
