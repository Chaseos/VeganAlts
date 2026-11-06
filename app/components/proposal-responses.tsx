import { useEffect, useState, type FormEvent } from "react";
import { usePersonalState } from "./personal-state";
import { CommunityControls, CommunityFeedback } from "./community-form";
import { communityRequest, useCommunityAction } from "../lib/community";
import { t } from "../i18n";

interface OpenProposal {
  id: string;
  summary: string;
  tier: number;
  note: string;
  own: boolean;
  stance: "confirm" | "disagree" | "evidence" | null;
  confirms: number;
  disagrees: number;
  evidence: number;
  evidenceUrls: string[];
  evidenceReceiptId: string | null;
  imageIds: string[];
}

/**
 * Signed-in contributors can independently confirm, dispute or add evidence
 * to open proposals. One stance per person; the proposer cannot respond.
 */
export function ProposalResponses({ productId }: { productId: string }) {
  const { user, siteKey } = usePersonalState();
  return user ? (
    <ProposalResponsesPanel
      key={`${productId}:${user.handle}`}
      productId={productId}
      siteKey={siteKey ?? ""}
    />
  ) : null;
}

function ProposalResponsesPanel({
  productId,
  siteKey,
}: {
  productId: string;
  siteKey: string;
}) {
  const action = useCommunityAction();
  const [proposals, setProposals] = useState<OpenProposal[] | null>(null),
    [adding, setAdding] = useState<string | null>(null),
    [status, setStatus] = useState(""),
    [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    void communityRequest<OpenProposal[]>(
      `community/products/${productId}/proposals`,
      undefined,
      undefined,
      undefined,
      { signal: controller.signal },
    )
      .then((items) => {
        if (!controller.signal.aborted) setProposals(items);
      })
      .catch(() => {
        if (!controller.signal.aborted) setProposals([]);
      });
    return () => controller.abort();
  }, [productId, revision]);
  if (!proposals?.length) return null;
  async function respond(
    proposal: OpenProposal,
    stance: "confirm" | "disagree" | "evidence",
    form?: FormData,
  ) {
    const saved = await action.run(() =>
      action.request(
        `proposals/${proposal.id}/responses`,
        {
          stance,
          note: String(form?.get("note") ?? ""),
          urls: form?.get("url") ? [String(form.get("url"))] : [],
        },
        crypto.randomUUID(),
      ),
    );
    if (!saved) return;
    setAdding(null);
    setStatus(
      stance === "confirm"
        ? t("responses.confirmed")
        : stance === "disagree"
          ? t("responses.disagreed")
          : t("responses.evidenceAttached"),
    );
    setRevision((value) => value + 1);
  }
  return (
    <section className="community-panel" aria-labelledby="suggested-changes">
      <h2 id="suggested-changes">{t("responses.title")}</h2>
      <p className="small muted">{t("responses.intro")}</p>
      <CommunityControls>
        <p role="status" className="small">
          {status}
        </p>
        <ul className="comment-list">
          {proposals.map((p) => (
            <li className="comment" key={p.id}>
              <p>
                <strong>{p.summary}</strong>
              </p>
              <p className="small muted">
                {t("responses.tally", {
                  tier:
                    p.tier === 3
                      ? t("responses.protected")
                      : t("responses.communityConfirmable"),
                  confirms: t("responses.confirms", { count: p.confirms }),
                  disagrees: t("responses.disagrees", { count: p.disagrees }),
                })}
              </p>
              {p.note && <p className="comment-body">{p.note}</p>}
              {p.evidenceUrls.map((url) => (
                <p key={url} className="small">
                  <a href={url} target="_blank" rel="noreferrer">
                    {t("responses.source")}
                  </a>
                </p>
              ))}
              {p.evidenceReceiptId && p.imageIds.length > 0 && (
                <div className="evidence-images">
                  {p.imageIds.map((image) => (
                    <a
                      key={image}
                      href={`/api/v1/submissions/${p.evidenceReceiptId}/media/${image}/full`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <img
                        src={`/api/v1/submissions/${p.evidenceReceiptId}/media/${image}/thumbnail`}
                        alt={t("responses.photoAlt")}
                        width="100"
                        height="100"
                        loading="lazy"
                      />
                    </a>
                  ))}
                </div>
              )}
              {p.own ? (
                <p className="small">{t("responses.own")}</p>
              ) : (
                <div className="comment-actions">
                  <div
                    className="vote-group"
                    role="group"
                    aria-label={t("responses.respondTo", {
                      summary: p.summary,
                    })}
                  >
                    <button
                      type="button"
                      aria-pressed={p.stance === "confirm"}
                      disabled={action.busy}
                      onClick={() => void respond(p, "confirm")}
                    >
                      {t("responses.confirm")}
                    </button>
                    <button
                      type="button"
                      aria-pressed={p.stance === "disagree"}
                      aria-expanded={adding === `${p.id}:disagree`}
                      disabled={action.busy}
                      onClick={() => setAdding(`${p.id}:disagree`)}
                    >
                      {t("responses.disagree")}
                    </button>
                  </div>
                  <button
                    type="button"
                    className="link-button"
                    aria-expanded={adding === `${p.id}:evidence`}
                    onClick={() => setAdding(`${p.id}:evidence`)}
                  >
                    {t("responses.addEvidence")}
                  </button>
                </div>
              )}
              {adding?.startsWith(`${p.id}:`) && (
                <form
                  className="community-form"
                  onSubmit={(event: FormEvent<HTMLFormElement>) => {
                    event.preventDefault();
                    void respond(
                      p,
                      adding.endsWith("disagree") ? "disagree" : "evidence",
                      new FormData(event.currentTarget),
                    );
                  }}
                >
                  <label htmlFor={`response-note-${p.id}`}>
                    {adding.endsWith("disagree")
                      ? t("responses.whatIsWrong")
                      : t("responses.evidenceShows")}
                  </label>
                  <textarea
                    id={`response-note-${p.id}`}
                    name="note"
                    rows={3}
                    maxLength={2000}
                  />
                  <label htmlFor={`response-url-${p.id}`}>
                    {t("community.sourceUrl")}
                  </label>
                  <input
                    id={`response-url-${p.id}`}
                    name="url"
                    type="url"
                    placeholder="https://"
                    maxLength={1000}
                  />
                  <button className="button secondary" disabled={action.busy}>
                    {t("responses.send")}
                  </button>
                </form>
              )}
            </li>
          ))}
        </ul>
        <CommunityFeedback action={action} siteKey={siteKey} />
      </CommunityControls>
    </section>
  );
}
