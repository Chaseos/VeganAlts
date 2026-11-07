import { startTransition, StrictMode } from "react";
import { hydrateRoot } from "react-dom/client";
import { HydratedRouter } from "react-router/dom";
import { addDictionary } from "./i18n";
import { NonceContext } from "./lib/nonce";

const nonce = document.querySelector<HTMLScriptElement>("script[nonce]")?.nonce;

// The dictionary must be here first, or hydration wouldn't match the page.
async function hydrate() {
  const language = document.documentElement.lang;
  if (language === "fr") {
    const { fr, errors } = await import("./i18n/fr");
    addDictionary("fr", fr, errors);
  }
  if (language === "ja") {
    const { ja, errors } = await import("./i18n/ja");
    addDictionary("ja", ja, errors);
  }
  if (language === "es") {
    const { es, errors, markets } = await import("./i18n/es");
    addDictionary("es", es, errors, markets);
  }
  if (language === "pt") {
    const { pt, errors, markets } = await import("./i18n/pt");
    addDictionary("pt", pt, errors, markets);
  }
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
