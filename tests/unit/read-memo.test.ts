import { expect, it } from "vitest";
import { ReadMemo } from "../../server/catalog/infrastructure/read-memo";

function counted<T>(value: T) {
  const load = () => {
    load.calls += 1;
    return Promise.resolve(value);
  };
  load.calls = 0;
  return load;
}

it("reuses a read until it expires", async () => {
  let time = 0;
  const memo = new ReadMemo(60_000, () => time);
  const load = counted("markets");
  await memo.read("markets", load);
  time = 59_999;
  await memo.read("markets", load);
  expect(load.calls).toBe(1);
  time = 60_000;
  await memo.read("markets", load);
  expect(load.calls).toBe(2);
});

it("shares one read between concurrent callers", async () => {
  const memo = new ReadMemo();
  const load = counted("taxonomy");
  const [first, second] = await Promise.all([
    memo.read("taxonomy", load),
    memo.read("taxonomy", load),
  ]);
  expect([first, second, load.calls]).toEqual(["taxonomy", "taxonomy", 1]);
});

it("keeps different keys apart", async () => {
  const memo = new ReadMemo();
  await expect(memo.read("us", counted("us"))).resolves.toBe("us");
  await expect(memo.read("gb", counted("gb"))).resolves.toBe("gb");
});

it("forgets a failed read", async () => {
  const memo = new ReadMemo();
  await expect(
    memo.read("markets", () => Promise.reject(new Error("D1 failed"))),
  ).rejects.toThrow("D1 failed");
  await expect(memo.read("markets", counted("ok"))).resolves.toBe("ok");
});
