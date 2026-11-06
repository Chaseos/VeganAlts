import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router";
import { Icon } from "./icons/icon";
import { usePersonalState } from "./personal-state";
import { t } from "../i18n";

// Public pages are cached, so who is visiting and whether they saved this
// product only arrive after the page loads. The icon waits for both, unless
// that load failed: then a tap retries it.
export function SaveButton({
  productId,
  productName,
  initiallySaved = false,
  showListLink = false,
}: {
  productId: string;
  productName: string;
  initiallySaved?: boolean;
  showListLink?: boolean;
}) {
  const { user, error, saved, registerSaved, setProductSaved, retryLoad } =
    usePersonalState();
  const location = useLocation();
  const [message, setMessage] = useState<
    "saved" | "removed" | { error: string } | null
  >(null);
  const busy = useRef(false);
  const [working, setWorking] = useState(false);
  useEffect(() => registerSaved(productId), [productId, registerSaved]);
  const isSaved = saved[productId] ?? initiallySaved;
  const known =
    user !== undefined && (saved[productId] !== undefined || initiallySaved);
  const unavailable = user === undefined && !!error;

  const onClick = async () => {
    if (busy.current) return;
    if (unavailable) {
      retryLoad();
      setMessage({ error: t("save.checking") });
      return;
    }
    busy.current = true;
    setWorking(true);
    setMessage(null);
    try {
      await setProductSaved(
        productId,
        !isSaved,
        `${location.pathname}${location.search}${location.hash}`,
      );
      if (user) setMessage(isSaved ? "removed" : "saved");
    } catch (reason) {
      setMessage({
        error: reason instanceof Error ? reason.message : t("save.unchanged"),
      });
    } finally {
      busy.current = false;
      setWorking(false);
    }
  };

  return (
    <span className="va-save">
      <button
        type="button"
        className="va-icon-button va-save__button"
        aria-label={t("save.label", { name: productName })}
        aria-pressed={isSaved}
        aria-busy={working}
        title={isSaved ? t("save.titleSaved") : t("save.title")}
        disabled={!known && !error}
        onClick={() => void onClick()}
      >
        <Icon name="bookmark" size={24} />
      </button>
      <span className="va-save__status small" role="status">
        {message === "saved" &&
          (showListLink ? (
            <>
              {t("save.savedTo")} <Link to="/saved">{t("save.yourList")}</Link>.
            </>
          ) : (
            t("save.saved")
          ))}
        {message === "removed" && t("save.removed")}
        {message && typeof message === "object" && message.error}
      </span>
    </span>
  );
}
