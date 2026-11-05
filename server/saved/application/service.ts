import { ApplicationError } from "../../shared/domain/errors";
import { isRecordId } from "../../ratings/domain/selection";
import {
  decodeRatingCursor,
  encodeRatingCursor,
} from "../../ratings/application/personal-service";
import type { SavedProductsRepository } from "../domain/contracts";

const PAGE_SIZE = 20;
const MAX_STATE_IDS = 40;

export class SavedProductsService {
  constructor(
    private readonly repository: SavedProductsRepository,
    private readonly now: () => number = Date.now,
  ) {}
  async state(userId: string | null, input: string) {
    const values = input ? [...new Set(input.split(","))] : [];
    if (
      input.length > 4100 ||
      values.length > MAX_STATE_IDS ||
      !values.every(isRecordId)
    )
      throw new ApplicationError(
        "INVALID_PRODUCTS",
        `Request up to ${MAX_STATE_IDS} valid product IDs.`,
      );
    return userId && values.length
      ? this.repository.savedIds(userId, values)
      : [];
  }
  async save(userId: string, productId: string) {
    if (!isRecordId(productId) || !(await this.repository.exists(productId)))
      throw new ApplicationError(
        "PRODUCT_NOT_FOUND",
        "This product is no longer available.",
        404,
      );
    await this.repository.save(userId, productId, this.now());
  }
  async remove(userId: string, productId: string) {
    if (!isRecordId(productId))
      throw new ApplicationError(
        "PRODUCT_NOT_FOUND",
        "This product is no longer available.",
        404,
      );
    await this.repository.remove(userId, productId);
  }
  async list(userId: string, input: string | null) {
    const items = await this.repository.list(
      userId,
      decodeRatingCursor(
        input,
        "This page link has expired. Open Saved products again.",
      ),
      PAGE_SIZE + 1,
    );
    const page = items.slice(0, PAGE_SIZE);
    const last = page.at(-1);
    return {
      items: page,
      nextCursor:
        items.length > PAGE_SIZE && last
          ? encodeRatingCursor({ updatedAt: last.savedAt, id: last.productId })
          : null,
    };
  }
}
