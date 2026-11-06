import { useEffect, useState } from "react";
import { useLocation } from "react-router";
import {
  LANGUAGE_NAMES,
  languagesOf,
  type Language,
} from "@server/catalog/domain/languages";
import { languageHref } from "@server/catalog/domain/markets";
import { t } from "../../i18n";
import { readPreference, writePreference } from "../../lib/device-preferences";
import { PREVIEW, useSiteChrome } from "../../lib/site-chrome";
import { Popover } from "../ui/popover";

const PROMPT_DISMISSED = "veganalts.language-prompt.v1";

/** Every language this page has, or nothing when it has one. */
function usePageLanguages() {
  const { country, language } = useSiteChrome();
  const { pathname, search } = useLocation();
  const page = pathname + search;
  const options = languagesOf(country.code, PREVIEW).map((code) => ({
    code,
    href: languageHref(page, code),
  }));
  const usable = options.filter((option) => option.href);
  return { language, languages: usable.length > 1 ? usable : [] };
}

// Plain links: the gateway saves the choice, so this works without JavaScript.
export function LanguageList({
  languages,
  current,
}: {
  languages: { code: Language; href: string | null }[];
  current: Language;
}) {
  return (
    <ul className="va-menu-list va-country-list">
      {languages.map(({ code, href }) => (
        <li key={code}>
          <a
            href={href!}
            rel="nofollow"
            lang={code}
            aria-current={code === current ? "true" : undefined}
          >
            <span className="va-country-list__name">
              {LANGUAGE_NAMES[code]}
            </span>
          </a>
        </li>
      ))}
    </ul>
  );
}

export function LanguageMenu() {
  const { language, languages } = usePageLanguages();
  if (!languages.length) return null;
  return (
    <Popover
      align="end"
      tone="kale"
      className="va-country-menu"
      summaryLabel={t("language.label", {
        language: LANGUAGE_NAMES[language],
        code: language.toUpperCase(),
      })}
      panelLabel={t("language.choose")}
      summary={<span>{language.toUpperCase()}</span>}
    >
      {() => (
        <nav aria-label={t("language.heading")}>
          <LanguageList languages={languages} current={language} />
        </nav>
      )}
    </Popover>
  );
}

export function PhoneLanguages() {
  const { language, languages } = usePageLanguages();
  if (!languages.length) return null;
  return (
    <section aria-labelledby="sheet-language">
      <h2 id="sheet-language" className="va-menu-heading">
        {t("language.heading")}
      </h2>
      <LanguageList languages={languages} current={language} />
    </section>
  );
}

/**
 * Offers the browser's language once, after hydration. It never redirects:
 * cached pages and crawlers see the same address for everyone.
 */
export function LanguagePrompt() {
  const { language, languages } = usePageLanguages();
  const [offer, setOffer] = useState<(typeof languages)[number] | null>(null);
  const page = languages.map((option) => option.code).join();
  useEffect(() => {
    setOffer(null);
    if (
      !page ||
      readPreference(PROMPT_DISMISSED) ||
      document.cookie.includes("va_lang=")
    )
      return;
    const wanted = navigator.languages
      .map((code) => code.slice(0, 2).toLowerCase())
      .find((code) => languages.some((option) => option.code === code));
    if (wanted && wanted !== language)
      setOffer(languages.find((option) => option.code === wanted) ?? null);
    // `languages` is rebuilt each render; `page` stands for it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, language]);
  if (!offer) return null;
  return (
    <aside className="va-language-prompt" aria-label={t("language.heading")}>
      <span>
        {t("language.prompt", { language: LANGUAGE_NAMES[offer.code] })}
      </span>
      <a className="button small-button" href={offer.href!} rel="nofollow">
        {LANGUAGE_NAMES[offer.code]}
      </a>
      <button
        type="button"
        className="link-button"
        onClick={() => {
          writePreference(PROMPT_DISMISSED, "1");
          setOffer(null);
        }}
      >
        {t("language.dismiss")}
      </button>
    </aside>
  );
}
