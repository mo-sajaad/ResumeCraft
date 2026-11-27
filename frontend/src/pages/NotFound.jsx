import { Link, useLocation } from "react-router-dom";

import Button from "../components/ui/Button.jsx";
import { ROUTES } from "../constants/routes.js";

// Shown for URLs that match no route (SHELL-019). `fullPage` is set outside the
// layouts, so inside the dashboard it renders in the shell's existing <main>.
export default function NotFound({ fullPage = false }) {
  const { pathname } = useLocation();
  const inDashboard = pathname === ROUTES.DASHBOARD || pathname.startsWith(`${ROUTES.DASHBOARD}/`);

  const content = (
    <div className="ui-error-state">
      <h1 className="ui-error-title">Page not found</h1>
      <p className="ui-error-description">We could not find that page. Check the address, or go back.</p>
      <div className="ui-state-actions">
        {inDashboard ? (
          <Button as={Link} to={ROUTES.DASHBOARD}>Back to dashboard</Button>
        ) : (
          <Button as={Link} to={ROUTES.HOME}>Go to home page</Button>
        )}
      </div>
    </div>
  );

  if (!fullPage) return content;
  return (
    <main style={{ maxWidth: "40rem", margin: "0 auto", padding: "2rem 1rem" }}>
      {content}
    </main>
  );
}
