import { useEffect, useRef, useState, type FormEvent } from "react";
import type { CommunityAction } from "../lib/community";

export function ProductRemovalControls({
  product,
  action,
  onRemoved,
}: {
  product: {
    id: string;
    name: string;
    revision: number;
    lifecycleStatus: string;
  };
  action: CommunityAction;
  onRemoved: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [removed, setRemoved] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const status = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (removed && product.lifecycleStatus === "hidden")
      status.current?.focus();
  }, [removed, product.lifecycleStatus]);
  async function remove(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const note = String(new FormData(event.currentTarget).get("note") ?? "");
    const saved = await action.run(() =>
      action.request(`admin/moderation/products/${product.id}/remove`, {
        expectedRevision: product.revision,
        note,
      }),
    );
    if (saved) {
      setRemoved(true);
      setConfirming(false);
      onRemoved();
    }
  }
  if (product.lifecycleStatus === "hidden")
    return (
      <p className="notice" role="status" ref={status} tabIndex={-1}>
        This product is removed from public view and rankings. To restore it,
        review the removal’s reversal in Decision history below.
      </p>
    );
  return (
    <section aria-label="Product removal">
      <button
        ref={trigger}
        type="button"
        className="button secondary"
        disabled={action.busy}
        aria-expanded={confirming}
        aria-controls="product-removal-form"
        onClick={() => setConfirming((value) => !value)}
      >
        Remove from catalog
      </button>
      {confirming && (
        <form
          id="product-removal-form"
          className="community-form"
          onSubmit={remove}
        >
          <h2>Remove {product.name}?</h2>
          <p>
            This removes this product from public pages, search and rankings.
            Its photos, formulas, ratings and comments are preserved. You can
            restore it through Decision history.
          </p>
          <label htmlFor="product-removal-note">Reason for removal</label>
          <textarea
            id="product-removal-note"
            name="note"
            rows={3}
            minLength={8}
            maxLength={2000}
            required
            autoFocus
          />
          <div className="button-row">
            <button className="button" disabled={action.busy}>
              Confirm removal
            </button>
            <button
              type="button"
              className="button secondary"
              disabled={action.busy}
              onClick={() => {
                setConfirming(false);
                trigger.current?.focus();
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
