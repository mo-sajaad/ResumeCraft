import { useEffect } from "react";
import { isRouteErrorResponse, Link, useLocation, useRouteError } from "react-router-dom";

import Button from "../components/ui/Button.jsx";
import { ROUTES } from "../constants/routes.js";

// Messages browsers use when a code-split chunk can no longer be loaded,
// usually because a new release replaced the hashed files.
const CHUNK_ERROR = /dynamically imported module|importing a module script failed|unable to preload css/i;
const RELOAD_KEY = "resumecraft:chunk-reload-at";
const RELOAD_WINDOW_MS = 10_000;

function isChunkError(error) {
  return CHUNK_ERROR.test(String(error?.message ?? error ?? ""));
}

// Reloads once to fetch the new release; a second failure soon after shows the page.
function reloadOnce() {
  try {
    const last = Number(sessionStorage.getItem(RELOAD_KEY));
    if (last && Date.now() - last < RELOAD_WINDOW_MS) return false;
    sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
  } catch {
    return false;
  }
  window.location.reload();
  return true;
}

// Route error boundary (SHELL-003). Shows a plain message and a way back; never
// the error text or stack. `fullPage` is set on the outermost boundary only, so
// nested ones render inside the layout's existing <main>.
export default function ErrorPage({ fullPage = false }) {
  const error = useRouteError();
  const { pathname } = useLocation();
  const notFound = isRouteErrorResponse(error) && error.status === 404;
  const chunkError = !notFound && isChunkError(error);
  const inDashboard = pathname === ROUTES.DASHBOARD || pathname.startsWith(`${ROUTES.DASHBOARD}/`);

  useEffect(() => {
    if (chunkError) reloadOnce();
  }, [chunkError]);

  const title = notFound ? "Page not found" : "Something went wrong";
  let description = "This page could not be shown. Reload to try again, or go back.";
  if (notFound) description = "We could not find that page. Check the address, or go back.";
  else if (chunkError) description = "A new version of ResumeCraft may be available. Reload the page to continue.";

  useEffect(() => {
    document.title = `${title} | ResumeCraft`;
  }, [title]);

  const content = (
    <div className="ui-error-state" role="alert">
      <h1 className="ui-error-title">{title}</h1>
      <p className="ui-error-description">{description}</p>
      <div className="ui-state-actions">
        {notFound ? null : (
          <Button type="button" onClick={() => window.location.reload()}>Reload page</Button>
        )}
        {inDashboard ? (
          <Button as={Link} to={ROUTES.DASHBOARD} variant="secondary">Back to dashboard</Button>
        ) : (
          <Button as={Link} to={ROUTES.HOME} variant="secondary">Go to home page</Button>
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
