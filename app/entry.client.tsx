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
    const { fr, errors, markets } = await import("./i18n/fr");
    addDictionary("fr", fr, errors, markets);
  }
  if (language === "ja") {
    const { ja, errors } = await import("./i18n/ja");
    addDictionary("ja", ja, errors);
  }
  if (language === "de") {
    const { de, errors, markets } = await import("./i18n/de");
    addDictionary("de", de, errors, markets);
  }
  if (language === "it") {
    const { it, errors, markets } = await import("./i18n/it");
    addDictionary("it", it, errors, markets);
  }
  if (language === "es") {
    const { es, errors, markets } = await import("./i18n/es");
    addDictionary("es", es, errors, markets);
  }
  if (language === "pt") {
    const { pt, errors, markets } = await import("./i18n/pt");
    addDictionary("pt", pt, errors, markets);
  }
  if (language === "zh-TW") {
    const { zh, errors } = await import("./i18n/zh");
    addDictionary("zh", zh, errors);
  }
  if (language === "ko") {
    const { ko, errors } = await import("./i18n/ko");
    addDictionary("ko", ko, errors);
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
