import { ApplicationError } from "../../shared/domain/errors";
import { isRecordId } from "../../ratings/domain/selection";
import {
  productAnalyticsSorts,
  type ProductAnalyticsRepository,
  type ProductAnalyticsSort,
} from "../domain/contracts";

const PAGE_SIZE = 50;
const MAX_SEARCH_LENGTH = 100;
const DAY_MS = 86_400_000;
export const RECENT_VIEW_DAYS = 30;

const statDate = (time: number) => new Date(time).toISOString().slice(0, 10);

export const productAnalyticsSort = (
  input: string | null,
): ProductAnalyticsSort =>
  productAnalyticsSorts.find((sort) => sort === input) ?? "views";

export class ProductAnalyticsService {
  constructor(
    private readonly repository: ProductAnalyticsRepository,
    private readonly now: () => number = Date.now,
  ) {}
  async recordView(productId: string) {
    if (!isRecordId(productId))
      throw new ApplicationError(
        "PRODUCT_NOT_FOUND",
        "This product is no longer available.",
        404,
      );
    await this.repository.addView(productId, statDate(this.now()));
  }
  async report(input: {
    sort: ProductAnalyticsSort;
    search: string;
    page: number;
  }) {
    const items = await this.repository.report({
      sort: input.sort,
      search: input.search.trim().slice(0, MAX_SEARCH_LENGTH),
      recentFrom: statDate(this.now() - (RECENT_VIEW_DAYS - 1) * DAY_MS),
      limit: PAGE_SIZE + 1,
      offset: (input.page - 1) * PAGE_SIZE,
    });
    return {
      items: items.slice(0, PAGE_SIZE),
      hasNext: items.length > PAGE_SIZE,
    };
  }
}
