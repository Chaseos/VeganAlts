import type {
  PersonalRating,
  RatingInput,
  SavedRating,
} from "@server/ratings/domain/contracts";
import type { ConventionalRecency } from "@server/ratings/domain/details";
import { plural } from "./format";

export type SaveStatus =
  "idle" | "saving" | "saved" | "error" | "conflict" | "challenge";
export interface RatingControlState {
  selected: number | null;
  // The rater's answers to the food's detail questions, by key.
  dimensions: Record<string, number>;
  recency: ConventionalRecency | null;
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

type StoredDetails = Partial<
  Pick<PersonalRating, "dimensions" | "conventionalRecency">
>;
const answered = (dimensions: RatingInput["dimensions"]) =>
  Object.fromEntries(
    Object.entries(dimensions ?? {}).filter(
      (entry): entry is [string, number] => typeof entry[1] === "number",
    ),
  );

export function savedMessage(rating: PersonalRating) {
  const details = Object.keys(rating.dimensions).length;
  return `Saved ${rating.overallSimilarity}/5${details ? ` with ${plural(details, "detail")}` : ""}. You’ve tried this formula.`;
}

// One queue per user/formula/category. Network writes are serialized; while one
// is in flight, rapid presses replace the desired value instead of racing it.
// Each write carries the whole draft (score, details, last ate), so the
// newest one always leaves the stored rating equal to what is on screen.
export class RatingQueue {
  private desired: RatingInput | null = null;
  private running = false;
  state: RatingControlState = {
    selected: null,
    dimensions: {},
    recency: null,
    status: "idle",
    message: "",
    tried: false,
  };
  constructor(
    private readonly write: (input: RatingInput) => Promise<SavedRating>,
    private readonly changed: (state: RatingControlState) => void,
    private readonly completed: (saved: SavedRating) => void,
  ) {}
  initialize(
    score: number | null,
    tried: boolean,
    details: StoredDetails = {},
  ) {
    if (this.state.status === "idle")
      this.set({
        selected: score,
        tried,
        dimensions: details.dimensions ?? {},
        recency: details.conventionalRecency ?? null,
      });
  }
  // Authentication may interrupt an older write after a newer score is queued.
  latestSelection(inFlight: RatingInput): RatingInput {
    return this.desired ?? inFlight;
  }
  select(input: RatingInput) {
    this.desired = input;
    this.set({
      selected: input.overallSimilarity,
      ...(input.dimensions ? { dimensions: answered(input.dimensions) } : {}),
      ...(input.conventionalRecency !== undefined
        ? { recency: input.conventionalRecency }
        : {}),
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
              dimensions: saved.rating.dimensions,
              recency: saved.rating.conventionalRecency,
              tried: saved.tried,
              status: "saved",
              message: savedMessage(saved.rating),
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
              code === "NOT_RATEABLE" || code === "STALE_DIMENSIONS"
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
