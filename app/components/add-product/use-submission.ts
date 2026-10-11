import { useRef, useState } from "react";
import type {
  Candidate,
  SubmissionDecision,
  SubmissionInput,
} from "@server/community/domain/contracts";
import type { CommunityAction } from "../../lib/community";
import { PHOTO_SLOTS, type PhotoSlot } from "../../lib/product-draft";

export type SubmitOutcome =
  | {
      kind: "published";
      slug: string;
      // Saved, retried shortly, or never counting; unknown on a replay.
      rating: "saved" | "pending" | "dropped" | null;
    }
  | { kind: "held"; receiptId: string; reasons: string[] }
  | { kind: "duplicate"; candidates: Candidate[]; reasons: string[] };

/**
 * Preflight, one upload per photo, then finalization. A retry resumes with
 * the same receipt and uploads; changing the details or a photo starts a
 * fresh one, because the server checks that finalization matches the
 * preflight and an upload key always returns its first photo.
 */
export function useSubmission(action: CommunityAction) {
  const key = useRef<string | null>(null),
    receipt = useRef<string | null>(null),
    payload = useRef<string | null>(null),
    // The files the receipt was started with: a replaced photo starts afresh.
    files = useRef<Partial<Record<PhotoSlot, File>>>({}),
    uploaded = useRef(new Set<PhotoSlot>());
  const [progress, setProgress] = useState("");
  const reset = () => {
    key.current = null;
    receipt.current = null;
    payload.current = null;
    files.current = {};
    uploaded.current.clear();
  };
  const submit = (
    input: SubmissionInput,
    photos: Partial<Record<PhotoSlot, File>>,
  ) =>
    action
      .run(async (): Promise<SubmitOutcome> => {
        const body = JSON.stringify(input);
        if (
          payload.current !== body ||
          PHOTO_SLOTS.some((slot) => files.current[slot] !== photos[slot])
        )
          reset();
        payload.current = body;
        files.current = { ...photos };
        key.current ??= crypto.randomUUID();
        if (!receipt.current) {
          setProgress("Checking your product…");
          const checked = await action.request<
            SubmissionDecision & { receiptId: string | null; slug?: string }
          >("submissions/preflight", input, key.current);
          // A retried key may already have been published.
          if (checked.slug)
            return {
              kind: "published",
              slug: checked.slug,
              rating: null,
            };
          if (checked.decision === "NEEDS_CHANGES" || !checked.receiptId) {
            reset();
            return {
              kind: "duplicate",
              candidates: checked.candidates,
              reasons: checked.reasons,
            };
          }
          receipt.current = checked.receiptId;
        }
        const slots = PHOTO_SLOTS.filter((slot) =>
          input.imageSlots.includes(slot),
        );
        for (const [index, slot] of slots.entries())
          if (!uploaded.current.has(slot)) {
            setProgress(`Uploading photo ${index + 1} of ${slots.length}…`);
            const form = new FormData();
            form.set("slot", slot);
            form.set("image", photos[slot]!);
            await action.request(
              `submissions/${receipt.current}/uploads`,
              form,
              `${key.current}_${slot}`,
            );
            uploaded.current.add(slot);
          }
        setProgress("Finishing up…");
        const saved = await action.request<{
          decision: string;
          slug?: string;
          reasons?: string[];
          receiptId?: string;
          rating?: "saved" | "pending" | "dropped";
        }>(`submissions/${receipt.current}/finalize`, input, key.current);
        if (saved.decision === "READY" && saved.slug) {
          reset();
          return {
            kind: "published",
            slug: saved.slug,
            rating: saved.rating ?? null,
          };
        }
        if (saved.decision === "NEEDS_REVIEW") {
          const held = receipt.current!;
          reset();
          return {
            kind: "held",
            receiptId: held,
            reasons: saved.reasons ?? [],
          };
        }
        // Blocked or needing changes: the receipt is closed, so a corrected
        // submission starts fresh.
        reset();
        throw new Error(
          saved.reasons?.join(" ") ||
            (saved.decision === "BLOCKED"
              ? "This submission can’t be accepted."
              : "Check the product details and try again."),
        );
      })
      .finally(() => setProgress(""));
  return { submit, progress };
}
