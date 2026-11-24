// Bounded route names for metrics, usage events and logs. A label is built only
// from route patterns and mount paths, never from the rest of the URL, so mount
// paths passed to use() must stay static (no parameters).
const UNMATCHED = 'unmatched';
const tracked = new WeakMap();

// Router matching ignores case, so without this each spelling adds a label.
function mountOf(baseUrl) {
  return (baseUrl || '').toLowerCase();
}

// Records the mount and route as Express assigns them, because it restores
// req.baseUrl before error handlers and 'finish' listeners run.
function trackRoute(req) {
  if (tracked.has(req)) return;

  let { baseUrl, route } = req;
  const state = { mount: '', matched: null };
  tracked.set(req, state);

  function onMount(value) {
    baseUrl = value;
    const mount = mountOf(value);
    // Errors re-enter shallower mounts while unwinding; keep the deepest.
    if (mount.length > state.mount.length) state.mount = mount;
  }

  function onRoute(value) {
    route = value;
    if (value?.path) state.matched = `${mountOf(baseUrl)}${value.path}`;
  }

  onMount(baseUrl);
  onRoute(route);

  const options = { configurable: true, enumerable: true };
  Object.defineProperty(req, 'baseUrl', { ...options, get: () => baseUrl, set: onMount });
  Object.defineProperty(req, 'route', { ...options, get: () => route, set: onRoute });
}

// Matched: mount plus pattern. Answered or failed before a route matched:
// mount plus "/*". Anything else, including every 404: "unmatched".
function routeLabel(req, res) {
  const state = tracked.get(req);
  if (!state) return UNMATCHED;
  if (state.matched) return state.matched;

  const leftUnanswered = !req.baseUrl && res?.statusCode === 404;
  return state.mount && !leftUnanswered ? `${state.mount}/*` : UNMATCHED;
}

module.exports = { trackRoute, routeLabel };
