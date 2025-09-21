type RouteMap = Record<string, () => void>;

export function startHashRouter(routes: RouteMap, fallback?: () => void) {
  const run = () => {
    const raw = location.hash.slice(1) || location.pathname || "/";
    const path = raw.split('?')[0] || "/"; // ignore query when matching route
    (routes[path] ?? fallback ?? (() => {}))();
  };
  window.addEventListener("hashchange", run);
  document.addEventListener("DOMContentLoaded", run);
  run(); // initial
}
