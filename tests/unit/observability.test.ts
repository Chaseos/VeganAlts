import { expect, it, vi } from "vitest";
import {
  recordEvent,
  routeLabel,
  failureKind,
} from "../../server/observability/events";

it("keeps an observable allowlisted event when Analytics Engine is unavailable without leaking input or throwing", () => {
  const log = vi.spyOn(console, "log").mockImplementation(() => {});
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    const env = {
      APP_ENV: "staging",
      APP_EVENTS: {
        writeDataPoint() {
          throw new Error("private provider response");
        },
      },
    } as Pick<Cloudflare.Env, "APP_ENV" | "APP_EVENTS">;
    expect(() => recordEvent(env, "rating_created", "rating")).not.toThrow();
    expect(JSON.parse(log.mock.calls[0]![0])).toEqual({
      event: "application_event",
      environment: "staging",
      name: "rating_created",
      route: "rating",
      outcome: "",
      value: 1,
      backend: "workers_logs",
    });
    expect(
      JSON.stringify([...error.mock.calls, ...log.mock.calls]),
    ).not.toContain("private provider");
    expect(routeLabel("/api/auth/callback/google")).toBe("auth");
    expect(
      failureKind(new Error("wrapped", { cause: new Error("D1_ERROR") })),
    ).toBe("d1");
  } finally {
    log.mockRestore();
    error.mockRestore();
  }
});
