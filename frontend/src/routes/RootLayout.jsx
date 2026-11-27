import { useEffect, useLayoutEffect, useRef } from "react";
import { Outlet, ScrollRestoration, useLocation, useMatches, useNavigation } from "react-router-dom";

const APP_NAME = "ResumeCraft";

// Visually hidden but read by screen readers.
const SR_ONLY = {
  position: "absolute",
  width: 1,
  height: 1,
  margin: -1,
  padding: 0,
  overflow: "hidden",
  clip: "rect(0 0 0 0)",
  whiteSpace: "nowrap",
  border: 0,
};

const PENDING_BAR = {
  position: "fixed",
  top: 0,
  left: 0,
  right: 0,
  height: 3,
  zIndex: 1000,
  background: "var(--color-brand-500, #4338ca)",
};

// The deepest route with a `handle.title` names the page. A title may be a
// function of the match, for pages named by a URL parameter.
function routeTitle(matches) {
  for (let i = matches.length - 1; i >= 0; i -= 1) {
    const { title } = matches[i].handle ?? {};
    const value = typeof title === "function" ? title(matches[i]) : title;
    if (value) return value;
  }
  return null;
}

// Moves focus to the new page's heading, or its main region, so screen readers
// announce the change and keyboard users start at the content.
function focusPage() {
  const target = document.querySelector("main h1") ?? document.querySelector("main");
  if (!target) return;
  if (!target.hasAttribute("tabindex")) target.setAttribute("tabindex", "-1");
  target.focus({ preventScroll: true });
}

// Root route element: page titles, focus and scroll on navigation, and a
// pending indicator while the next page's code loads (SHELL-007).
export default function RootLayout() {
  const matches = useMatches();
  const { pathname } = useLocation();
  const navigation = useNavigation();
  const lastPathname = useRef(pathname);
  const title = routeTitle(matches);
  const pending = navigation.state === "loading";

  // A layout effect, so an error page's own (passive) title effect runs after it.
  useLayoutEffect(() => {
    document.title = title ? `${title} | ${APP_NAME}` : APP_NAME;
  }, [title]);

  // Not on the first load: focus then stays where the browser puts it.
  useEffect(() => {
    if (lastPathname.current === pathname) return;
    lastPathname.current = pathname;
    focusPage();
  }, [pathname]);

  return (
    <>
      {pending ? <div aria-hidden="true" data-testid="route-pending" style={PENDING_BAR} /> : null}
      <div aria-live="polite" style={SR_ONLY}>{pending ? "Loading page..." : ""}</div>
      <Outlet />
      <ScrollRestoration />
    </>
  );
}
