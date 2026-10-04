import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { profiles } from "../../../db/schema/app";
import { ApplicationError } from "../../shared/domain/errors";
import type { ProfilesRepository } from "../domain/profile";

export class DrizzleProfilesRepository implements ProfilesRepository {
  private readonly db;
  constructor(binding: D1Database) {
    this.db = drizzle(binding);
  }

  async find(userId: string) {
    return (
      (await this.db
        .select()
        .from(profiles)
        .where(eq(profiles.userId, userId))
        .get()) ?? null
    );
  }

  async tryCreate(userId: string, handle: string, now: number) {
    const rows = await this.db
      .insert(profiles)
      .values({ userId, handle, createdAt: now, updatedAt: now })
      .onConflictDoNothing()
      .returning();
    return rows[0] ?? null;
  }

  async update(
    userId: string,
    settings: { handle: string; displayName: string | null },
    now: number,
  ) {
    try {
      const rows = await this.db
        .update(profiles)
        .set({ ...settings, updatedAt: now })
        .where(eq(profiles.userId, userId))
        .returning();
      if (!rows[0])
        throw new ApplicationError("NOT_FOUND", "Profile not found.", 404);
      return rows[0];
    } catch (error) {
      const cause =
        error instanceof Error && error.cause instanceof Error
          ? error.cause.message
          : error instanceof Error
            ? error.message
            : "";
      if (
        /UNIQUE constraint failed:.*(profiles\.handle|ux_profiles_handle)/.test(
          cause,
        )
      ) {
        throw new ApplicationError(
          "HANDLE_TAKEN",
          "That handle is already in use.",
          409,
        );
      }
      throw error;
    }
  }
}
