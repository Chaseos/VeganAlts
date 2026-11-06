import { browse } from "./browse";
import { chrome } from "./chrome";
import { codes } from "./codes";
import { contribute } from "./contribute";
import { product } from "./product";

export const en = {
  ...chrome,
  ...codes,
  ...browse,
  ...product,
  ...contribute,
} as const;
