import { startTransition, StrictMode } from "react";
import { hydrateRoot } from "react-dom/client";
import { HydratedRouter } from "react-router/dom";
import { NonceContext } from "./lib/nonce";

const nonce = document.querySelector<HTMLScriptElement>("script[nonce]")?.nonce;
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
