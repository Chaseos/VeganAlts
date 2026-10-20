import { useEffect, useRef, type RefObject } from "react";
import { useBlocker } from "react-router";

/** Warn only when storage has failed or a photo write is still pending. */
export function UnsavedWorkGuard({
  atRisk,
  finished,
}: {
  atRisk: boolean;
  finished: RefObject<boolean>;
}) {
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      atRisk &&
      !finished.current &&
      currentLocation.pathname !== nextLocation.pathname,
  );
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (!atRisk) return;
    const warn = (event: BeforeUnloadEvent) => {
      if (finished.current) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [atRisk, finished]);
  useEffect(() => {
    if (blocker.state === "blocked" && !atRisk) blocker.proceed();
    else if (blocker.state === "blocked") dialog.current?.showModal();
    else dialog.current?.close();
  }, [blocker, atRisk]);
  return (
    <dialog
      className="va-leave-dialog"
      ref={dialog}
      aria-labelledby="leave-draft-title"
      onCancel={() => blocker.state === "blocked" && blocker.reset()}
    >
      <h2 id="leave-draft-title">This draft isn’t safely saved</h2>
      <p>Leaving now may lose your latest text or photos.</p>
      <div className="button-row">
        <button
          className="button"
          autoFocus
          onClick={() => blocker.state === "blocked" && blocker.reset()}
        >
          Keep editing
        </button>
        <button
          className="button secondary"
          onClick={() => blocker.state === "blocked" && blocker.proceed()}
        >
          Leave anyway
        </button>
      </div>
    </dialog>
  );
}
