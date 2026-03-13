export default function BrandedLoader({ message = "Loading your workspace..." }) {
  return (
    <div className="ui-loading-state" role="status" aria-live="polite">
      <div className="ui-brand-badge" style={{ margin: "0 auto 12px" }}>✦</div>
      <p className="ui-page-subtitle">{message}</p>
    </div>
  );
}
