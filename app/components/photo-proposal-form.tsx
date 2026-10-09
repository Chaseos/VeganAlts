import { useRef, useState, type FormEvent } from "react";
import { useNavigate } from "react-router";
import type { ImageSlot } from "@server/media/domain/media";
import type { ContributorProduct } from "@server/community/domain/moderation";
import type { CommunityAction } from "../lib/community";
import { PhotoPicker } from "./community-form";
import { SLOT_LABELS } from "./photo-slots";

const REASONS = {
  outdated_packaging: "The packaging has changed",
  blurry: "The current photo is blurry or unreadable",
  wrong_market: "The current photo is from another country",
  incorrect: "The current photo shows a different product",
};

/** Propose the canonical photo for one slot through staged evidence. */
export function PhotoProposalForm({
  product,
  initialSlot,
  action,
}: {
  product: ContributorProduct;
  initialSlot: ImageSlot;
  action: CommunityAction;
}) {
  const navigate = useNavigate();
  const [slot, setSlot] = useState<ImageSlot>(initialSlot),
    [file, setFile] = useState<File | undefined>(),
    [receiptId, setReceiptId] = useState<string | null>(null);
  const key = useRef<string | null>(null),
    uploaded = useRef<string | null>(null);
  const current = product.images.find(
    (i) =>
      i.slot === slot &&
      i.state === "accepted" &&
      i.versionId === product.versionId,
  );
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) return;
    const form = new FormData(event.currentTarget);
    await action.run(async () => {
      key.current ??= crypto.randomUUID();
      let receipt = receiptId;
      if (!receipt) {
        receipt = (
          await action.request<{ receiptId: string }>(
            "submissions/evidence",
            { productId: product.id },
            key.current,
          )
        ).receiptId;
        setReceiptId(receipt);
      }
      if (!uploaded.current) {
        const photo = new FormData();
        photo.set("slot", slot);
        photo.set("image", file);
        uploaded.current = (
          await action.request<{ imageId: string }>(
            `submissions/${receipt}/uploads`,
            photo,
            `${key.current}_${slot}`,
          )
        ).imageId;
      }
      const saved = await action.request<{ id: string; duplicateOf?: boolean }>(
        "proposals",
        {
          kind: "photo",
          productId: product.id,
          expectedRevision: product.revision,
          slot,
          reason: current ? form.get("reason") : "missing",
          evidenceReceiptId: receipt,
          evidence: {
            note: String(form.get("note")),
            urls: [],
            imageIds: [uploaded.current],
          },
        },
        key.current,
      );
      // The same photo is already proposed by someone else: the submission
      // was recorded as a confirmation of that open proposal.
      await navigate(
        saved.duplicateOf
          ? `/us/products/${product.slug}#suggested-changes`
          : `/my-contributions/proposal/${saved.id}`,
      );
    });
  }
  return (
    <form className="community-form" onSubmit={submit}>
      <h2>{current ? "Suggest a better photo" : "Add a photo"}</h2>
      <label htmlFor="photo-slot">Photo</label>
      <select
        id="photo-slot"
        value={slot}
        disabled={Boolean(receiptId)}
        onChange={(e) => setSlot(e.target.value as ImageSlot)}
      >
        {Object.entries(SLOT_LABELS).map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
      {current ? (
        <>
          <img
            className="upload-preview"
            src={`/media/${current.id}/thumbnail`}
            alt="Current photo"
          />
          <label htmlFor="photo-reason">Why is a new photo better?</label>
          <select id="photo-reason" name="reason">
            {Object.entries(REASONS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <p className="small muted">
            If the ingredients changed, suggest a material reformulation instead
            so earlier ratings stay with the earlier formula.
          </p>
        </>
      ) : (
        <p className="small muted">This product has no {slot} photo yet.</p>
      )}
      <fieldset disabled={Boolean(receiptId)}>
        <PhotoPicker slot={slot} file={file} onChange={setFile} required />
      </fieldset>
      <label htmlFor="photo-note">What does the photo show?</label>
      <textarea
        id="photo-note"
        name="note"
        required
        minLength={8}
        maxLength={2000}
        rows={3}
      />
      <p className="small muted">
        The current photo stays until the new one is accepted, and earlier
        photos remain with the formula they document.
        {current && (slot === "ingredients" || slot === "nutrition")
          ? " Replacing an ingredient or nutrition photo is reviewed by a moderator."
          : ""}
      </p>
      <button className="button" disabled={action.busy || !file}>
        {action.busy ? "Uploading…" : "Submit photo"}
      </button>
    </form>
  );
}
