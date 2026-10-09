import { useEffect, useState, type FormEvent } from "react";
import { usePersonalState } from "./personal-state";
import { CommunityControls, CommunityFeedback } from "./community-form";
import { communityRequest, useCommunityAction } from "../lib/community";

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
  const action = useCommunityAction();
  const [proposals, setProposals] = useState<OpenProposal[] | null>(null),
    [adding, setAdding] = useState<string | null>(null),
    [status, setStatus] = useState("");
  const load = () =>
    communityRequest<OpenProposal[]>(
      `community/products/${productId}/proposals`,
    )
      .then(setProposals)
      .catch(() => setProposals([]));
  useEffect(() => {
    if (user) void load();
    else setProposals(null);
  }, [user?.handle, productId]);
  if (!user || !proposals?.length) return null;
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
        ? "Thanks. Your confirmation is recorded."
        : stance === "disagree"
          ? "Thanks. A moderator will review the disagreement."
          : "Thanks. Your evidence is attached.",
    );
    await load();
  }
  return (
    <section className="community-panel" aria-labelledby="suggested-changes">
      <h2 id="suggested-changes">Suggested changes</h2>
      <p className="small muted">
        Confirm only what you have checked yourself, for example on the package.
        Low-risk changes apply after independent confirmation; protected facts
        always go to a moderator.
      </p>
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
                {p.tier === 3
                  ? "Protected · moderator decides"
                  : "Community-confirmable"}{" "}
                · {p.confirms} confirm{p.confirms === 1 ? "" : "s"} ·{" "}
                {p.disagrees} disagree
              </p>
              {p.note && <p className="comment-body">{p.note}</p>}
              {p.evidenceUrls.map((url) => (
                <p key={url} className="small">
                  <a href={url} target="_blank" rel="noreferrer">
                    Evidence source ↗
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
                        alt="Evidence photo for this proposal"
                        width="100"
                        height="100"
                        loading="lazy"
                      />
                    </a>
                  ))}
                </div>
              )}
              {p.own ? (
                <p className="small">Your proposal</p>
              ) : (
                <div className="comment-actions">
                  <div
                    className="vote-group"
                    role="group"
                    aria-label={`Respond to: ${p.summary}`}
                  >
                    <button
                      type="button"
                      aria-pressed={p.stance === "confirm"}
                      disabled={action.busy}
                      onClick={() => void respond(p, "confirm")}
                    >
                      Confirm
                    </button>
                    <button
                      type="button"
                      aria-pressed={p.stance === "disagree"}
                      aria-expanded={adding === `${p.id}:disagree`}
                      disabled={action.busy}
                      onClick={() => setAdding(`${p.id}:disagree`)}
                    >
                      Disagree
                    </button>
                  </div>
                  <button
                    type="button"
                    className="link-button"
                    aria-expanded={adding === `${p.id}:evidence`}
                    onClick={() => setAdding(`${p.id}:evidence`)}
                  >
                    Add evidence
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
                      ? "What is wrong with this change?"
                      : "What does your evidence show?"}
                  </label>
                  <textarea
                    id={`response-note-${p.id}`}
                    name="note"
                    rows={3}
                    maxLength={2000}
                  />
                  <label htmlFor={`response-url-${p.id}`}>
                    Source URL (optional)
                  </label>
                  <input
                    id={`response-url-${p.id}`}
                    name="url"
                    type="url"
                    placeholder="https://"
                    maxLength={1000}
                  />
                  <button className="button secondary" disabled={action.busy}>
                    Send
                  </button>
                </form>
              )}
            </li>
          ))}
        </ul>
        <CommunityFeedback action={action} siteKey={siteKey ?? ""} />
      </CommunityControls>
    </section>
  );
}
