import { startTransition, StrictMode } from "react";
import { hydrateRoot } from "react-dom/client";
import { HydratedRouter } from "react-router/dom";
import { addDictionary } from "./i18n";
import { NonceContext } from "./lib/nonce";

const nonce = document.querySelector<HTMLScriptElement>("script[nonce]")?.nonce;

// The dictionary must be here first, or hydration wouldn't match the page.
async function hydrate() {
  if (document.documentElement.lang === "fr")
    addDictionary("fr", (await import("./i18n/fr")).fr);
  startTransition(() => {
    hydrateRoot(
      document,
      <StrictMode>
        <NonceContext.Provider value={nonce}>
          <HydratedRouter />
        </NonceContext.Provider>
      </StrictMode>,
    );
  });
}
void hydrate();
