import type { ReactNode } from "react";
import { PendingRatingRecovery } from "../pending-rating-recovery";
import { SiteFooter } from "./site-footer";
import { SiteHeader, type PhoneBack } from "./site-header";
import { PREVIEW } from "../../lib/site-chrome";

export type PageWidth = "full" | "wide" | "narrow" | "prose";

// Every page's frame: header, the main landmark the skip link targets, and the
// footer. "full" leaves layout to the page (home's hero, ranking grids); the
// others center content in the standard container.
export function PageShell({
  children,
  width = "wide",
  search = true,
  aisles = true,
  footer = "full",
  phoneBack,
  phoneTitle,
  minimal = false,
}: {
  children: ReactNode;
  width?: PageWidth;
  search?: boolean;
  aisles?: boolean;
  footer?: "full" | "compact";
  phoneBack?: PhoneBack;
  phoneTitle?: ReactNode;
  // The root error boundary renders outside the personal-state provider.
  minimal?: boolean;
}) {
  return (
    <div className="va-site">
      {PREVIEW && (
        <aside className="va-preview-banner" aria-label="Development preview">
          Development preview · Demo catalog and sample ratings
        </aside>
      )}
      <SiteHeader
        search={search}
        aisles={aisles}
        phoneBack={phoneBack}
        phoneTitle={phoneTitle}
      />
      <main id="main" className={`va-main va-main--${width}`} tabIndex={-1}>
        {!minimal && <PendingRatingRecovery />}
        {children}
      </main>
      <SiteFooter variant={footer} />
    </div>
  );
}
