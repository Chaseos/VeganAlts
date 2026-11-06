import { productPath } from "@server/catalog/domain/markets";
import { Link } from "react-router";
import type { QueueDecisionRepository } from "@server/community/infrastructure/queue-decision-repository";
import { friendly, dateLabel, reportReasonLabel } from "../lib/community";
import { veganStatusLabel } from "./ui/badges";
import { t } from "../i18n";
import {
  allergenDeclaration,
  describeDeclaration,
} from "@server/community/domain/allergens";

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
    return <p>{t("detail.receiptReady")}</p>;
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
    "flavor",
    "lineName",
    "seasonal",
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
                    ? t("common.yes")
                    : t("common.no")
                  : key === "reason"
                    ? reportReasonLabel(String(input[key]))
                    : friendly(String(input[key]))}
              </dd>
            </div>
          ))}
      </dl>
      {Array.isArray(input.aliases) && input.aliases.length > 0 && (
        <p>
          <strong>{t("detail.otherNames")}</strong>{" "}
          {input.aliases.map(String).join(", ")}
        </p>
      )}
      {Array.isArray(input.categoryIds) && (
        <p>
          <strong>{t("detail.foodsReplaced")}</strong>{" "}
          {input.categoryIds
            .map(String)
            .map((id) => labels[id] ?? id)
            .join(", ")}
        </p>
      )}
      {typeof input.lineId === "string" && (
        <p>
          <strong>{t("detail.joinsLine")}</strong>{" "}
          {labels[input.lineId] ?? input.lineId}
        </p>
      )}
      {Object.hasOwn(input, "productFamilyId") && (
        <p>
          <strong>{t("detail.line")}</strong>{" "}
          {typeof input.productFamilyId === "string"
            ? t("detail.moveTo", {
                name: labels[input.productFamilyId] ?? input.productFamilyId,
              })
            : t("detail.keepsLine")}
        </p>
      )}
      {typeof input.relatedProductId === "string" && (
        <p>
          <strong>{t("detail.relatedProduct")}</strong>{" "}
          {t("detail.related", {
            name: labels[input.relatedProductId] ?? input.relatedProductId,
            type: friendly(String(input.relationship)),
          })}
        </p>
      )}
      {allergenDeclaration.safeParse(input.declaration).success && (
        <p>
          <strong>{t("detail.allergensLabel")}</strong>{" "}
          {describeDeclaration(allergenDeclaration.parse(input.declaration))}
          {typeof input.citedImageId === "string"
            ? ` ${t("detail.citesPhoto")}`
            : ` ${t("detail.noPhotoCited")}`}
        </p>
      )}
      {typeof input.retailerId === "string" && (
        <p>
          <strong>{t("detail.retailer")}</strong>{" "}
          {labels[input.retailerId] ?? input.retailerId}
        </p>
      )}
      {Array.isArray(input.categoryEligibility) && (
        <>
          <h3>{t("detail.eligibilityTitle")}</h3>
          <ul>
            {input.categoryEligibility.map(
              (entry: { categoryId: string; eligible: boolean }) => (
                <li key={entry.categoryId}>
                  {t("detail.nameState", {
                    name: labels[entry.categoryId] ?? entry.categoryId,
                    state: entry.eligible
                      ? t("detail.eligible")
                      : t("detail.notRanked"),
                  })}
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
                {t("detail.viewSource")}
              </a>
            </li>
          ))}
        </ul>
      )}
      {Array.isArray(input.certifications) &&
        input.certifications.length > 0 && (
          <>
            <h3>{t("detail.certifications")}</h3>
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
      <h2 id="automated-checks">{t("detail.automatedChecks")}</h2>
      <p className="small muted">
        {t("detail.advisory", {
          model: checks.model,
          status: friendly(checks.status),
          error: checks.errorCode ? `: ${friendly(checks.errorCode)}` : "",
        })}
      </p>
      {checks.outcome && (
        <p>
          <strong>{t("detail.suggestedOutcome")}</strong>{" "}
          {friendly(checks.outcome.toLowerCase())}
        </p>
      )}
      {checks.flags.length > 0 && (
        <p>
          <strong>{t("detail.signals")}</strong>{" "}
          {checks.flags.map(friendly).join(", ")}
        </p>
      )}
      {checks.safety && (
        <div>
          <p>
            {t("detail.safetyCheck", {
              model: checks.safety.model,
              reused: checks.safety.reused ? ` ${t("detail.reused")}` : "",
              result: checks.safety.result.flagged
                ? t("detail.flagged")
                : t("detail.passed"),
            })}
          </p>
          {Object.entries(checks.safety.result.categories)
            .filter(([, flag]) => flag)
            .map(([category]) => (
              <p key={category}>
                {t("detail.categoryScore", {
                  category: friendly(category),
                  score: String(
                    checks.safety!.result.scores[category]?.toFixed(3),
                  ),
                  types:
                    checks.safety!.result.appliedInputTypes[category]?.join(
                      ", ",
                    ) ?? "",
                })}
              </p>
            ))}
        </div>
      )}
      {checks.answers.length > 0 && (
        <dl className="review-facts">
          {checks.answers.map((a) => (
            <div key={a.question}>
              <dt>{friendly(a.question)}</dt>
              <dd>
                {t("detail.likely", {
                  option: friendly(a.option.toLowerCase()),
                  percent: Math.round(a.probability * 100),
                })}
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
        <strong>
          {t("myContributions.status", { status: friendly(detail.status) })}
        </strong>
        {detail.resolutionNote && <p>{detail.resolutionNote}</p>}
      </div>
      {detail.kind === "comment" && (
        <section aria-labelledby="held-comment">
          <h2 id="held-comment">{t("detail.heldComment")}</h2>
          <p className="small muted">
            {t("detail.by", {
              author: String((detail.proposed as { author: string }).author),
            })}
          </p>
          <blockquote className="comment-body">
            {String((detail.proposed as { body: string }).body)}
          </blockquote>
        </section>
      )}
      {"reportedComment" in detail && detail.reportedComment && (
        <section aria-labelledby="reported-comment">
          <h2 id="reported-comment">{t("detail.reportedComment")}</h2>
          <p className="small muted">
            {t("detail.byState", {
              author: detail.reportedComment.author,
              state: friendly(detail.reportedComment.state),
            })}
          </p>
          <blockquote className="comment-body">
            {detail.reportedComment.body}
          </blockquote>
        </section>
      )}
      {automated && <AutomatedChecks checks={automated} />}
      {detail.kind === "submission" && detail.followUpOf && (
        <p>
          {t("detail.followUpBefore")}{" "}
          <Link to={`/my-contributions/submission/${detail.followUpOf}`}>
            {t("detail.followUpLink")}
          </Link>
          {t("detail.followUpAfter")}
        </p>
      )}
      {"publishedProduct" in detail && detail.publishedProduct && (
        <p>
          <Link
            className="button secondary"
            to={productPath(
              detail.publishedProduct.country,
              detail.publishedProduct.slug,
            )}
          >
            {t("detail.viewPublished")}
          </Link>
        </p>
      )}
      {product && (
        <section>
          <h2>{t("detail.catalogEntry")}</h2>
          <p>
            <Link to={productPath(product.countryCode, product.slug)}>
              {product.name}
            </Link>
          </p>
          <dl className="review-facts">
            <dt>{t("detail.formula")}</dt>
            <dd>{product.versionLabel ?? t("detail.currentFormula")}</dd>
            <dt>{t("detail.lifecycle")}</dt>
            <dd>{friendly(product.lifecycleStatus)}</dd>
            <dt>{t("detail.classification")}</dt>
            <dd>
              {/* An unchecked formula stores only a placeholder status. */}
              {product.classification?.ingredientsChecked === false
                ? veganStatusLabel("unchecked")
                : friendly(product.veganStatus)}
            </dd>
            <dt>{t("community.manufacturerLabel")}</dt>
            <dd>{friendly(product.manufacturerLabel)}</dd>
            <dt>{t("detail.allergensOnFile")}</dt>
            <dd>
              {product.allergens
                ? describeDeclaration(
                    product.allergens,
                    Object.fromEntries(
                      product.allergenList.map((a) => [a.key, a.label]),
                    ),
                  )
                : t("allergen.notConfirmed")}
            </dd>
          </dl>
          <p>
            <strong>{t("detail.family")}</strong>{" "}
            {product.familyId
              ? (detail.referenceLabels[product.familyId] ?? product.familyId)
              : t("detail.noFamily")}
          </p>
          <ul>
            {product.categories.map((c) => (
              <li key={c.categoryId}>
                {t("detail.nameState", {
                  name: detail.referenceLabels[c.categoryId] ?? c.categoryId,
                  state: c.eligible
                    ? t("detail.eligibleRanking")
                    : t("detail.excluded"),
                })}
              </li>
            ))}
          </ul>
          {product.relationships.length > 0 && (
            <ul>
              {product.relationships.map((r) => (
                <li key={`${r.productId}-${r.type}`}>
                  {t("detail.related", {
                    name: detail.referenceLabels[r.productId] ?? r.productId,
                    type: friendly(r.type),
                  })}
                </li>
              ))}
            </ul>
          )}
          {product.retailers.length > 0 && (
            <>
              <h3>{t("detail.retailerEvidence")}</h3>
              <ul>
                {product.retailers.map((r) => (
                  <li key={r.retailerId}>
                    <strong>{r.name}</strong> · {friendly(r.status)}
                    <p>
                      {t("detail.retailerCounts", {
                        confirmations: r.contributorCount,
                        concerns: r.disagreementCount,
                        date: dateLabel(r.lastConfirmedAt),
                      })}
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
          {detail.kind === "report"
            ? t("detail.reportedConcern")
            : t("detail.proposedDetails")}
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
          <h2>{t("detail.privateEvidence")}</h2>
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
                  alt={t("detail.evidenceAlt", { slot: image.slot })}
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
