import { Link } from "react-router";
import type { QueueDecisionRepository } from "@server/community/infrastructure/queue-decision-repository";
import { friendly, dateLabel } from "../lib/community";

export type ContributionDetail = Awaited<
  ReturnType<QueueDecisionRepository["detail"]>
>;
export function ProposalSummary({
  value,
  labels = {},
}: {
  value: unknown;
  labels?: Record<string, string>;
}) {
  if (!value || typeof value !== "object")
    return (
      <p>
        The submission receipt is ready. Complete its photos and final review
        from the submission page.
      </p>
    );
  const input = value as Record<string, unknown>,
    evidence =
      input.evidence && typeof input.evidence === "object"
        ? (input.evidence as Record<string, unknown>)
        : null;
  const fields = [
    "name",
    "brand",
    "country",
    "kind",
    "versionLabel",
    "effectiveDate",
    "veganStatus",
    "manufacturerLabel",
    "sameFormula",
    "specialtyFlavor",
    "status",
    "reason",
    "note",
    "statusBasis",
  ];
  const urls = [
    ...(typeof input.websiteUrl === "string" ? [input.websiteUrl] : []),
    ...(typeof input.ingredientUrl === "string" ? [input.ingredientUrl] : []),
    ...(Array.isArray(input.evidenceUrls) ? input.evidenceUrls : []),
    ...(Array.isArray(evidence?.urls) ? evidence.urls : []),
  ].filter((v): v is string => typeof v === "string");
  return (
    <>
      <dl className="review-facts">
        {fields
          .filter((key) => input[key] !== undefined)
          .map((key) => (
            <div key={key}>
              <dt>
                {friendly(key.replace(/[A-Z]/g, (c) => ` ${c.toLowerCase()}`))}
              </dt>
              <dd>
                {typeof input[key] === "boolean"
                  ? input[key]
                    ? "Yes"
                    : "No"
                  : friendly(String(input[key]))}
              </dd>
            </div>
          ))}
      </dl>
      {Array.isArray(input.aliases) && input.aliases.length > 0 && (
        <p>
          <strong>Other names:</strong> {input.aliases.map(String).join(", ")}
        </p>
      )}
      {Array.isArray(input.categoryIds) && (
        <p>
          <strong>Replacement categories:</strong>{" "}
          {input.categoryIds
            .map(String)
            .map((id) => labels[id] ?? id)
            .join(", ")}
        </p>
      )}
      {Object.hasOwn(input, "productFamilyId") && (
        <p>
          <strong>Product family:</strong>{" "}
          {typeof input.productFamilyId === "string"
            ? (labels[input.productFamilyId] ?? input.productFamilyId)
            : "No family"}
        </p>
      )}
      {typeof input.relatedProductId === "string" && (
        <p>
          <strong>Related product:</strong>{" "}
          {labels[input.relatedProductId] ?? input.relatedProductId} ·{" "}
          {friendly(String(input.relationship))}
        </p>
      )}
      {typeof input.retailerId === "string" && (
        <p>
          <strong>Retailer:</strong>{" "}
          {labels[input.retailerId] ?? input.retailerId}
        </p>
      )}
      {Array.isArray(input.categoryEligibility) && (
        <>
          <h3>Proposed ranking eligibility</h3>
          <ul>
            {input.categoryEligibility.map(
              (entry: { categoryId: string; eligible: boolean }) => (
                <li key={entry.categoryId}>
                  {labels[entry.categoryId] ?? entry.categoryId}:{" "}
                  {entry.eligible
                    ? "Eligible"
                    : "Excluded from this category's ranking"}
                </li>
              ),
            )}
          </ul>
        </>
      )}
      {typeof evidence?.note === "string" && <p>{evidence.note}</p>}
      {urls.length > 0 && (
        <ul>
          {urls.map((url, i) => (
            <li key={`${url}-${i}`}>
              <a href={url} target="_blank" rel="noreferrer">
                View evidence source ↗
              </a>
            </li>
          ))}
        </ul>
      )}
      {Array.isArray(input.certifications) &&
        input.certifications.length > 0 && (
          <>
            <h3>Third-party certification claims</h3>
            <ul>
              {input.certifications.map((c, i) => {
                const cert = c as { name: string; sourceUrl: string };
                return (
                  <li key={i}>
                    <a href={cert.sourceUrl} target="_blank" rel="noreferrer">
                      {cert.name}
                    </a>
                  </li>
                );
              })}
            </ul>
          </>
        )}
    </>
  );
}
export function AutomatedChecks({
  checks,
}: {
  checks: NonNullable<
    Extract<ContributionDetail, { automated: unknown }>["automated"]
  >;
}) {
  return (
    <section aria-labelledby="automated-checks">
      <h2 id="automated-checks">Automated checks</h2>
      <p className="small muted">
        Advisory {checks.model} answers ({friendly(checks.status)}
        {checks.errorCode ? `: ${friendly(checks.errorCode)}` : ""}). They are
        evidence, not a decision.
      </p>
      {checks.outcome && (
        <p>
          <strong>Suggested outcome:</strong>{" "}
          {friendly(checks.outcome.toLowerCase())}
        </p>
      )}
      {checks.flags.length > 0 && (
        <p>
          <strong>Signals:</strong> {checks.flags.map(friendly).join(", ")}
        </p>
      )}
      {checks.answers.length > 0 && (
        <dl className="review-facts">
          {checks.answers.map((a) => (
            <div key={a.question}>
              <dt>{friendly(a.question)}</dt>
              <dd>
                {friendly(a.option.toLowerCase())} (
                {Math.round(a.confidence * 100)}%)
              </dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}
export function ContributionContent({
  detail,
}: {
  detail: ContributionDetail;
}) {
  const product = "product" in detail ? detail.product : null;
  const automated = "automated" in detail ? detail.automated : null;
  return (
    <>
      <div className="notice">
        <strong>Status: {friendly(detail.status)}</strong>
        {detail.resolutionNote && <p>{detail.resolutionNote}</p>}
      </div>
      {detail.kind === "comment" && (
        <section aria-labelledby="held-comment">
          <h2 id="held-comment">Held comment</h2>
          <p className="small muted">
            By @{String((detail.proposed as { author: string }).author)}
          </p>
          <blockquote className="comment-body">
            {String((detail.proposed as { body: string }).body)}
          </blockquote>
        </section>
      )}
      {"reportedComment" in detail && detail.reportedComment && (
        <section aria-labelledby="reported-comment">
          <h2 id="reported-comment">Reported comment</h2>
          <p className="small muted">
            By @{detail.reportedComment.author} ·{" "}
            {friendly(detail.reportedComment.state)}
          </p>
          <blockquote className="comment-body">
            {detail.reportedComment.body}
          </blockquote>
        </section>
      )}
      {automated && <AutomatedChecks checks={automated} />}
      {detail.kind === "submission" && detail.followUpOf && (
        <p>
          Follow-up to the{" "}
          <Link to={`/my-contributions/submission/${detail.followUpOf}`}>
            original submission and evidence
          </Link>
          .
        </p>
      )}
      {"publishedProduct" in detail && detail.publishedProduct && (
        <p>
          <Link
            className="button secondary"
            to={`/us/products/${detail.publishedProduct.slug}`}
          >
            View published product →
          </Link>
        </p>
      )}
      {product && (
        <section>
          <h2>Current catalog entry</h2>
          <p>
            <Link to={`/us/products/${product.slug}`}>{product.name} ↗</Link>
          </p>
          <dl className="review-facts">
            <dt>Formula</dt>
            <dd>{product.versionLabel ?? "Current formula"}</dd>
            <dt>Lifecycle</dt>
            <dd>{friendly(product.lifecycleStatus)}</dd>
            <dt>Platform classification</dt>
            <dd>{friendly(product.veganStatus)}</dd>
            <dt>Manufacturer wording</dt>
            <dd>{friendly(product.manufacturerLabel)}</dd>
          </dl>
          <p>
            <strong>Product family:</strong>{" "}
            {product.familyId
              ? (detail.referenceLabels[product.familyId] ?? product.familyId)
              : "No family"}
          </p>
          <ul>
            {product.categories.map((c) => (
              <li key={c.categoryId}>
                {detail.referenceLabels[c.categoryId] ?? c.categoryId}:{" "}
                {c.eligible ? "Eligible for ranking" : "Excluded from ranking"}
              </li>
            ))}
          </ul>
          {product.relationships.length > 0 && (
            <ul>
              {product.relationships.map((r) => (
                <li key={`${r.productId}-${r.type}`}>
                  {detail.referenceLabels[r.productId] ?? r.productId} ·{" "}
                  {friendly(r.type)}
                </li>
              ))}
            </ul>
          )}
          {product.retailers.length > 0 && (
            <>
              <h3>Current retailer evidence</h3>
              <ul>
                {product.retailers.map((r) => (
                  <li key={r.retailerId}>
                    <strong>{r.name}</strong> · {friendly(r.status)}
                    <p>
                      {r.contributorCount} confirmations; {r.disagreementCount}{" "}
                      availability concerns. Last confirmed{" "}
                      {dateLabel(r.lastConfirmedAt)}.
                    </p>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}
      <section>
        <h2>
          {detail.kind === "report" ? "Reported concern" : "Proposed details"}
        </h2>
        <ProposalSummary
          value={detail.proposed}
          labels={detail.referenceLabels}
        />
        {"reasons" in detail && (detail.reasons?.length ?? 0) > 0 && (
          <ul>
            {detail.reasons?.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        )}
      </section>
      {"images" in detail && (detail.images?.length ?? 0) > 0 && (
        <section>
          <h2>Private evidence</h2>
          <div className="evidence-images">
            {detail.images?.map((image) => (
              <a
                key={image.id}
                href={`/api/v1/submissions/${detail.evidenceReceiptId}/media/${image.id}/${image.hasEvidence ? "evidence" : "full"}`}
                target="_blank"
                rel="noreferrer"
              >
                <img
                  src={`/api/v1/submissions/${detail.evidenceReceiptId}/media/${image.id}/thumbnail`}
                  alt={`${image.slot} evidence`}
                  width={150}
                  height={150}
                />
                {friendly(image.slot)}
              </a>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
