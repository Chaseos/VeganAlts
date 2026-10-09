import { useEffect, useRef } from "react";
import { useLocation } from "react-router";
import { routeLabel } from "@server/observability/events";

export function NavigationEvents() {
  const location = useLocation();
  const previous = useRef(`${location.pathname}${location.search}`);
  useEffect(() => {
    const next = `${location.pathname}${location.search}`;
    if (next === previous.current) return;
    previous.current = next;
    const label = routeLabel(location.pathname);
    const route =
      (
        [
          "home",
          "search",
          "product",
          "category",
          "profile",
          "my-ratings",
          "account",
        ] as const
      ).find((value) => value === label) ?? "auth";
    // Document views are recorded by the gateway even on cache hits. This only
    // accounts for client navigation, including navigation using cached data.
    void fetch("/api/v1/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event: "page_view", route }),
      keepalive: true,
    }).catch(() => {});
  }, [location.pathname, location.search]);
  return null;
}
