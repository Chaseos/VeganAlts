import { useEffect, useRef, useState } from "react";

interface TurnstileApi {
  render: (
    element: HTMLElement,
    options: {
      sitekey: string;
      action: string;
      callback: (token: string) => void;
      "expired-callback": () => void;
      "error-callback": () => void;
    },
  ) => string;
  remove: (id: string) => void;
}
declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}
let loaded: Promise<void> | undefined;
function loadTurnstile() {
  if (!loaded)
    loaded = new Promise<void>((resolve, reject) => {
      if (window.turnstile) {
        resolve();
        return;
      }
      const script = document.createElement("script");
      script.src =
        "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => {
        script.remove();
        loaded = undefined;
        reject(new Error("The security check could not load."));
      };
      document.head.appendChild(script);
    });
  return loaded;
}

export function Turnstile({
  siteKey,
  action,
  onToken,
}: {
  siteKey: string | null;
  action: "rating" | "sign-in" | "community";
  onToken: (token: string) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const callback = useRef(onToken);
  callback.current = onToken;
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!siteKey) return;
    let active = true;
    let id: string | undefined;
    setError("");
    void loadTurnstile()
      .then(() => {
        if (!active || !container.current || !window.turnstile) return;
        id = window.turnstile.render(container.current, {
          sitekey: siteKey,
          action,
          callback: (token) => callback.current(token),
          "expired-callback": () => callback.current(""),
          "error-callback": () => {
            callback.current("");
            setError("The check failed. Please try again.");
          },
        });
      })
      .catch(() =>
        setError("The security check could not load. Please try again."),
      );
    return () => {
      active = false;
      if (id) window.turnstile?.remove(id);
    };
  }, [siteKey, action, attempt]);
  return (
    <div className="security-check">
      <div ref={container} />
      {(!siteKey || error) && (
        <p role="alert">
          {error ||
            "The security check is unavailable. Wait a minute and retry your save."}
        </p>
      )}
      {error && (
        <button type="button" onClick={() => setAttempt(attempt + 1)}>
          Reload security check
        </button>
      )}
    </div>
  );
}
