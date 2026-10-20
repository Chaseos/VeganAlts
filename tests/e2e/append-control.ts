import type { Locator } from "@playwright/test";

/** A programmatic jump renders skipped rows before tapping the control.
 * WebKit can finish its scroll before those rows receive their real height. */
export async function settleResultLayout(control: Locator) {
  await control.scrollIntoViewIfNeeded();
  await control.evaluate(
    (element) =>
      new Promise<void>((resolve, reject) => {
        let previous = "",
          stable = 0,
          frames = 0;
        const frame = () => {
          const rect = element.getBoundingClientRect();
          const next = `${rect.x},${rect.y},${rect.width},${rect.height}`;
          stable = next === previous ? stable + 1 : 0;
          previous = next;
          if (stable >= 4) resolve();
          else if (++frames > 90)
            reject(
              new Error("The append control did not settle after scrolling."),
            );
          else requestAnimationFrame(frame);
        };
        requestAnimationFrame(frame);
      }),
  );
}
export async function appendControl(control: Locator) {
  await settleResultLayout(control);
  await control.click();
}
