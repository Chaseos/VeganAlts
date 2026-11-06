import { browse } from "./browse";
import { chrome } from "./chrome";
import { contribute } from "./contribute";
import { product } from "./product";

export const en = { ...chrome, ...browse, ...product, ...contribute } as const;
