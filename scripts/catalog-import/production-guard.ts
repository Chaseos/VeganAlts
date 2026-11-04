import { z } from "zod";

export const importApproval = z
  .object({
    version: z.literal(1),
    environment: z.enum(["local", "staging", "production"]),
    databaseId: z.string().min(1),
    bucket: z.string().min(1),
    operatorId: z.string().min(1),
    manifestHash: z.string().regex(/^[a-f0-9]{64}$/),
    reviewHash: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .nullable(),
    fullRun: z.boolean(),
    notReady: z.array(z.unknown()),
    createdAt: z.string().datetime(),
  })
  .passthrough();

/** A production apply must consume a successful, recent dry run for this exact target and review. */
export function assertProductionApproval(
  raw: unknown,
  expected: {
    databaseId: string;
    bucket: string;
    operatorId: string;
    manifestHash: string;
    reviewHash: string | null;
    confirmation?: string;
    fullRun: boolean;
  },
  now = Date.now(),
) {
  if (!expected.reviewHash)
    throw new Error(
      "Production requires --release-review with the cleaned catalog decisions.",
    );
  if (!expected.fullRun)
    throw new Error(
      "Production imports require a full run and full post-import verification; rehearse bounded imports locally or on staging.",
    );
  if (expected.confirmation !== expected.databaseId)
    throw new Error(
      "Production requires --confirm-production=<database ID> for the configured production database.",
    );
  const approval = importApproval.parse(raw);
  for (const key of [
    "databaseId",
    "bucket",
    "operatorId",
    "manifestHash",
    "reviewHash",
  ] as const)
    if (approval[key] !== expected[key])
      throw new Error(
        `The approved dry run has a different ${key}. Run and review a new dry run.`,
      );
  const age = now - Date.parse(approval.createdAt);
  if (
    approval.environment !== "production" ||
    !approval.fullRun ||
    approval.notReady.length ||
    age < 0 ||
    age > 24 * 60 * 60 * 1000
  )
    throw new Error(
      "Production needs a successful full dry run from the past 24 hours.",
    );
}
