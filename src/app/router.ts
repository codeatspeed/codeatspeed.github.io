export type Route = { name: "home" } | { name: "read"; documentId: string };

export type RouteResult =
  | { ok: true; route: Route }
  | { ok: false; error: "invalid-route" };

export function parseRoute(hash: string): RouteResult {
  if (hash === "#/" || hash === "") {
    return { ok: true, route: { name: "home" } };
  }

  const readerMatch = /^#\/read\/([^/]+)$/u.exec(hash);
  if (readerMatch === null) {
    return { ok: false, error: "invalid-route" };
  }

  try {
    return { ok: true, route: { name: "read", documentId: decodeURIComponent(readerMatch[1]) } };
  } catch {
    return { ok: false, error: "invalid-route" };
  }
}

export function navigate(route: Route): void {
  window.location.hash = route.name === "home" ? "#/" : `#/read/${encodeURIComponent(route.documentId)}`;
}

export function listenToRoutes(onRoute: (result: RouteResult) => void): () => void {
  const update = () => onRoute(parseRoute(window.location.hash));
  window.addEventListener("hashchange", update);
  window.addEventListener("popstate", update);
  return () => {
    window.removeEventListener("hashchange", update);
    window.removeEventListener("popstate", update);
  };
}
