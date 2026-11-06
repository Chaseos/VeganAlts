import { Link } from "react-router";
import { ButtonLink } from "../ui/button";

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
      <p>
        Thanks. We check it before it goes live. Your photos stay private until
        then.
      </p>
      <h3 className="va-heading-s">What happens next</h3>
      <ol className="va-in-review__steps">
        <li>
          {newFood
            ? `We check your new food “${newFood}” together with your product. That takes up to three days.`
            : "We check the details."}
        </li>
        <li>
          When it’s accepted, it goes live in {countryName}
          {hasRating ? " and your rating is saved." : "."}
        </li>
        <li>
          You can follow it, and answer any questions, in{" "}
          <Link to={`/my-contributions/submission/${receiptId}`}>
            My contributions
          </Link>
          .
        </li>
      </ol>
      <div className="button-row">
        <ButtonLink to={`/my-contributions/submission/${receiptId}`}>
          View your submission
        </ButtonLink>
        <button type="button" className="button secondary" onClick={onAnother}>
          Add another product
        </button>
      </div>
    </div>
  );
}
