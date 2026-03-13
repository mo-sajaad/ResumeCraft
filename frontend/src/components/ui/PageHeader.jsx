export default function PageHeader({ title, subtitle, actions }) {
  return (
    <header className="ui-page-header">
      <div>
        <h1 className="ui-page-title">{title}</h1>
        {subtitle ? <p className="ui-page-subtitle">{subtitle}</p> : null}
      </div>
      {actions ? <div>{actions}</div> : null}
    </header>
  );
}
