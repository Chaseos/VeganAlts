import { productPath } from "@server/catalog/domain/markets";
import { useRef, useState, type FormEvent } from "react";
import { useNavigate } from "react-router";
import type { ImageSlot } from "@server/media/domain/media";
import type { ContributorProduct } from "@server/community/domain/moderation";
import type { CommunityAction } from "../lib/community";
import { shrinkPhoto } from "../lib/shrink-photo";
import { PhotoPicker } from "./community-form";
import { IMAGE_SLOTS, slotLabel, storedSlotLabel } from "./photo-slots";
import { inSentence } from "../lib/format";
import { t } from "../i18n";

const reasons = () => ({
  outdated_packaging: t("photoProposal.outdated"),
  blurry: t("photoProposal.blurry"),
  wrong_market: t("photoProposal.wrongMarket"),
  incorrect: t("photoProposal.incorrect"),
});

/** Propose the canonical photo for one slot through staged evidence. */
export function PhotoProposalForm({
  product,
  initialSlot,
  action,
  administrator,
}: {
  product: ContributorProduct;
  initialSlot: ImageSlot;
  action: CommunityAction;
  // An administrator's photo applies at once instead of waiting for review.
  administrator: boolean;
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
        photo.set("image", await shrinkPhoto(file));
        uploaded.current = (
          await action.request<{ imageId: string }>(
            `submissions/${receipt}/uploads`,
            photo,
            `${key.current}_${slot}`,
          )
        ).imageId;
      }
      const saved = await action.request<{ id: string; duplicateOf?: boolean }>(
        administrator ? "proposals/apply" : "proposals",
        {
          kind: "photo",
          productId: product.id,
          expectedRevision: product.revision,
          slot,
          reason: current ? form.get("reason") : "missing",
          evidenceReceiptId: receipt,
          evidence: {
            // The slot already says what the photo is.
            note: `${storedSlotLabel(slot)} photo added.`,
            urls: [],
            imageIds: [uploaded.current],
          },
        },
        key.current,
      );
      // The same photo is already proposed by someone else: the submission
      // was recorded as a confirmation of that open proposal.
      await navigate(
        administrator
          ? `/admin/moderation/products/${product.id}`
          : saved.duplicateOf
            ? `${productPath(product.countryCode, product.slug)}#suggested-changes`
            : `/my-contributions/proposal/${saved.id}`,
      );
    });
  }
  return (
    <form className="community-form" onSubmit={submit}>
      <h2>
        {current ? t("photoProposal.suggestBetter") : t("photoProposal.add")}
      </h2>
      <label htmlFor="photo-slot">{t("photoProposal.photo")}</label>
      <select
        id="photo-slot"
        value={slot}
        disabled={Boolean(receiptId)}
        onChange={(e) => setSlot(e.target.value as ImageSlot)}
      >
        {IMAGE_SLOTS.map((value) => (
          <option key={value} value={value}>
            {slotLabel(value)}
          </option>
        ))}
      </select>
      {current ? (
        <>
          <img
            className="upload-preview"
            src={`/media/${current.id}/thumbnail`}
            alt={t("photoProposal.currentAlt")}
          />
          <label htmlFor="photo-reason">{t("photoProposal.why")}</label>
          <select id="photo-reason" name="reason">
            {Object.entries(reasons()).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <p className="small muted">{t("photoProposal.reformulation")}</p>
        </>
      ) : (
        <p className="small muted">
          {t("photoProposal.noPhoto", { slot: inSentence(slotLabel(slot)) })}
        </p>
      )}
      <fieldset disabled={Boolean(receiptId)}>
        <PhotoPicker slot={slot} file={file} onChange={setFile} required />
      </fieldset>
      {!administrator && (
        <p className="small muted">
          {t("photoProposal.staysUntil")}
          {current && (slot === "ingredients" || slot === "nutrition")
            ? ` ${t("photoProposal.moderatorReview")}`
            : ""}
        </p>
      )}
      <button className="button" disabled={action.busy || !file}>
        {action.busy
          ? t("photoProposal.uploading")
          : administrator
            ? t("photoProposal.save")
            : t("photoProposal.submit")}
      </button>
    </form>
  );
}
