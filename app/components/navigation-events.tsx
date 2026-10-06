import { useEffect, useRef } from "react";
import { useLocation } from "react-router";

export function NavigationEvents() {
  const location = useLocation();
  const previous = useRef(`${location.pathname}${location.search}`);
  useEffect(() => {
    const next = `${location.pathname}${location.search}`;
    if (next === previous.current) return;
    previous.current = next;
    const route =
      location.pathname === "/"
        ? "home"
        : location.pathname === "/us/search"
          ? "search"
          : location.pathname.startsWith("/us/products/")
            ? "product"
            : location.pathname.startsWith("/us/")
              ? "category"
              : location.pathname.startsWith("/users/")
                ? "profile"
                : location.pathname === "/my-ratings"
                  ? "my-ratings"
                  : location.pathname === "/account"
                    ? "account"
                    : "auth";
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
