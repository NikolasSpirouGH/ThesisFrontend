type RouteMap = Record<string, () => void>;

export function startHashRouter(routes: RouteMap, fallback?: () => void) {
  const run = () => {
    const raw = location.hash.slice(1) || location.pathname || "/";
    const path = raw.split('?')[0] || "/"; // ignore query when matching route

    // Try exact match first
    if (routes[path]) {
      routes[path]();
      return;
    }

    // Try pattern matching for dynamic routes like /results/:id
    for (const [pattern, handler] of Object.entries(routes)) {
      if (pattern.includes(":")) {
        const regex = new RegExp("^" + pattern.replace(/:\w+/g, "\\d+") + "$");
        if (regex.test(path)) {
          handler();
          return;
        }
      }
    }

    // Fallback
    (fallback ?? (() => {}))();
  };
  window.addEventListener("hashchange", run);
  document.addEventListener("DOMContentLoaded", run);
  run(); // initial
}
