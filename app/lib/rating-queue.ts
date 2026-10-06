import type {
  RatingInput,
  SavedRating,
} from "@server/ratings/domain/contracts";

export type SaveStatus =
  "idle" | "saving" | "saved" | "error" | "conflict" | "challenge";
export interface RatingControlState {
  selected: number | null;
  status: SaveStatus;
  message: string;
  tried: boolean;
}
export class SaveError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number,
  ) {
    super(message);
  }
}

// One queue per user/formula/category. Network writes are serialized; while one
// is in flight, rapid presses replace the desired value instead of racing it.
export class RatingQueue {
  private desired: RatingInput | null = null;
  private running = false;
  state: RatingControlState = {
    selected: null,
    status: "idle",
    message: "",
    tried: false,
  };
  constructor(
    private readonly write: (input: RatingInput) => Promise<SavedRating>,
    private readonly changed: (state: RatingControlState) => void,
    private readonly completed: (saved: SavedRating) => void,
  ) {}
  initialize(score: number | null, tried: boolean) {
    if (this.state.status === "idle") this.set({ selected: score, tried });
  }
  select(input: RatingInput) {
    this.desired = input;
    this.set({
      selected: input.overallSimilarity,
      status: "saving",
      message: "Saving…",
    });
    void this.flush();
  }
  private set(value: Partial<RatingControlState>) {
    this.state = { ...this.state, ...value };
    this.changed(this.state);
  }
  private async flush() {
    if (this.running) return;
    this.running = true;
    try {
      while (this.desired) {
        const input = this.desired;
        this.desired = null;
        try {
          const saved = await this.write(input);
          this.completed(saved);
          if (!this.desired)
            this.set({
              selected: saved.rating.overallSimilarity,
              tried: saved.tried,
              status: "saved",
              message: `Saved ${saved.rating.overallSimilarity}/5. You’ve tried this formula.`,
            });
        } catch (error) {
          // A newer selection remains queued after a transient failure. Never
          // use an earlier response to replace its highlighted score.
          if (
            this.desired &&
            !(
              error instanceof SaveError &&
              [401, 403, 409].includes(error.status)
            )
          )
            continue;
          this.desired = null;
          const code =
            error instanceof SaveError ? error.code : "NETWORK_ERROR";
          this.set({
            status:
              code === "NOT_RATEABLE"
                ? "conflict"
                : code === "CHALLENGE_REQUIRED"
                  ? "challenge"
                  : "error",
            message:
              error instanceof Error
                ? error.message
                : "Your rating wasn’t saved. Please retry.",
          });
        }
      }
    } finally {
      this.running = false;
    }
  }
}
