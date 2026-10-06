export const clientEvents = [
  "page_view",
  "rating_save_failed",
  "sign_in_cancelled",
] as const;
export type AppEvent =
  | (typeof clientEvents)[number]
  | "page_view"
  | "search"
  | "sign_in_started"
  | "sign_in_succeeded"
  | "sign_in_failed"
  | "rating_created"
  | "rating_updated";

export function routeLabel(path: string) {
  const value = path.replace(/\.data$/, "");
  if (value === "/" || value === "/_root") return "home";
  if (value === "/us/search" || value === "/api/v1/search") return "search";
  if (/^\/us\/products\//.test(value)) return "product";
  if (/^\/us\/[a-z0-9-]+$/.test(value)) return "category";
  if (/^\/users\//.test(value)) return "profile";
  if (value.startsWith("/api/auth/") || value === "/sign-in") return "auth";
  if (value === "/api/v1/ratings") return "rating";
  if (value.includes("media")) return "media";
  if (value === "/my-ratings") return "my-ratings";
  if (value === "/account") return "account";
  return "other";
}

export function recordEvent(
  env: Pick<Cloudflare.Env, "APP_ENV" | "APP_EVENTS">,
  event: AppEvent,
  route: string,
  outcome = "",
  value = 1,
) {
  const logEvent = () =>
    console.log(
      JSON.stringify({
        event: "application_event",
        environment: env.APP_ENV,
        name: event,
        route,
        outcome,
        value,
        backend: "workers_logs",
      }),
    );
  try {
    if (!env.APP_EVENTS) {
      logEvent();
      return;
    }
    env.APP_EVENTS.writeDataPoint({
      indexes: [env.APP_ENV],
      blobs: [event, route, outcome],
      doubles: [value],
    });
  } catch {
    // Contribution success never depends on analytics availability.
    console.error(
      JSON.stringify({ event: "analytics_failed", environment: env.APP_ENV }),
    );
    logEvent();
  }
}

export function failureKind(error: unknown) {
  const message =
    error instanceof Error
      ? `${error.message} ${error.cause instanceof Error ? error.cause.message : ""}`
      : "";
  if (/D1_|SQLITE|database/i.test(message)) return "d1";
  if (/R2|bucket|object storage/i.test(message)) return "r2";
  if (/images|transform|decode/i.test(message)) return "images";
  return "application";
}
