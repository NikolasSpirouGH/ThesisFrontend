type RouteMap = Record<string, () => void>;

export function startHashRouter(routes: RouteMap, fallback?: () => void) {
  const run = () => {
    const path = location.hash.slice(1) || "/"; // e.g. "#/train/weka" -> "/train/weka"
    (routes[path] ?? fallback ?? (() => {}))();
  };
  window.addEventListener("hashchange", run);
  document.addEventListener("DOMContentLoaded", run);
  run(); // initial
}