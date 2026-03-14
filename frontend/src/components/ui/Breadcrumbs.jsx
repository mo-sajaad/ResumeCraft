import { Link } from "react-router-dom";

export default function Breadcrumbs({ items = [] }) {
  if (!items.length) return null;

  return (
    <nav className="ui-breadcrumbs" aria-label="Breadcrumb">
      {items.map((item, index) => {
        const isCurrent = index === items.length - 1;
        return (
          <span key={item.label}>
            {isCurrent ? (
              <span className="ui-breadcrumbs-current" aria-current="page">{item.label}</span>
            ) : (
              <Link to={item.to}>{item.label}</Link>
            )}
            {!isCurrent ? " / " : ""}
          </span>
        );
      })}
    </nav>
  );
}
