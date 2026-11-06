import { Link } from "react-router";
import { ButtonLink } from "../ui/button";
import { t } from "../../i18n";

/** A submission an operator will look at, and what happens next. */
export function InReview({
  receiptId,
  countryName,
  newFood,
  hasRating,
  onAnother,
}: {
  receiptId: string;
  countryName: string;
  newFood: string | null;
  hasRating: boolean;
  onAnother: () => void;
}) {
  return (
    <div className="va-in-review">
      <p>{t("addProduct.reviewThanks")}</p>
      <h3 className="va-heading-s">{t("addProduct.whatNext")}</h3>
      <ol className="va-in-review__steps">
        <li>
          {newFood
            ? t("addProduct.checkNewFood", { name: newFood })
            : t("addProduct.checkDetails")}
        </li>
        <li>
          {hasRating
            ? t("addProduct.acceptedRated", { country: countryName })
            : t("addProduct.accepted", { country: countryName })}
        </li>
        <li>
          {t("addProduct.followBefore")}{" "}
          <Link to={`/my-contributions/submission/${receiptId}`}>
            {t("myContributions.title")}
          </Link>
          {t("addProduct.followAfter")}
        </li>
      </ol>
      <div className="button-row">
        <ButtonLink to={`/my-contributions/submission/${receiptId}`}>
          {t("addProduct.viewSubmission")}
        </ButtonLink>
        <button type="button" className="button secondary" onClick={onAnother}>
          {t("addProduct.addAnother")}
        </button>
      </div>
    </div>
  );
}
