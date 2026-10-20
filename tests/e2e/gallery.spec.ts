import { resolve } from "node:path";
import { getPlatformProxy } from "wrangler";
import { expect, test, type Page } from "./fixtures";
import { accessible } from "./a11y";
import { isPhone } from "./site";

// Reuse the seed's real image derivatives; these extra slot records are local
// browser fixtures only and are removed after each test.
async function extraPhotos() {
  const proxy = await getPlatformProxy<Cloudflare.Env>({
    configPath: "wrangler.jsonc",
    persist: { path: resolve(".wrangler/state/v3") },
  });
  const ids = [crypto.randomUUID(), crypto.randomUUID()];
  await proxy.env.DB.batch(
    ids.map((id, index) =>
      proxy.env.DB.prepare(
        `INSERT INTO product_images(id,product_version_id,slot,state,full_r2_key,thumbnail_r2_key,created_at,updated_at)
    SELECT ?,i.product_version_id,?,'accepted',i.full_r2_key,i.thumbnail_r2_key,1,1
    FROM product_images i JOIN product_versions v ON v.id=i.product_version_id JOIN products p ON p.id=v.product_id
    WHERE p.slug='oatly-full-fat' AND v.is_current=1 AND i.slot='front' AND i.state='accepted' LIMIT 1`,
      ).bind(id, index ? "nutrition" : "back"),
    ),
  );
  return async () => {
    await proxy.env.DB.prepare("DELETE FROM product_images WHERE id IN (?,?)")
      .bind(...ids)
      .run();
    await proxy.dispose();
  };
}

async function swipe(
  page: Page,
  direction: "left" | "right",
  stage = ".va-gallery__stage",
) {
  const box = (await page.locator(stage).boundingBox())!;
  const start = box.x + box.width * (direction === "left" ? 0.75 : 0.25);
  const end = box.x + box.width * (direction === "left" ? 0.25 : 0.75);
  const y = box.y + box.height * 0.35;
  if (isPhone(page)) {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x: start, y }],
    });
    for (let step = 1; step <= 6; step++)
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [{ x: start + ((end - start) * step) / 6, y }],
      });
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    await cdp.detach();
  } else {
    await page.mouse.move(start, y);
    await page.mouse.down();
    await page.mouse.move(end, y, { steps: 6 });
    await page.mouse.up();
  }
}

test("photo thumbnails, arrows and horizontal swipes keep the page in place", async ({
  page,
}) => {
  test.skip(
    !!process.env.TEST_BASE_URL,
    "Gallery fixture changes are local only.",
  );
  const cleanup = await extraPhotos();
  try {
    await page.goto("/us/products/oatly-full-fat?food=milk");
    const gallery = page.getByRole("group", { name: "Package photos" });
    await expect(gallery.getByRole("radio")).toHaveCount(3);
    await gallery.locator(".va-gallery__tabs").scrollIntoViewIfNeeded();
    const scroll = await page.evaluate(() => scrollY);
    await gallery.locator(".va-gallery__tab--back").click();
    await expect(
      gallery.getByRole("radio", { name: "Back", exact: true }),
    ).toBeChecked();
    expect(await page.evaluate(() => scrollY)).toBe(scroll);
    await gallery.getByRole("button", { name: "Next photo" }).click();
    await expect(
      gallery.getByRole("radio", {
        name: "Nutrition & allergens",
        exact: true,
      }),
    ).toBeChecked();
    await gallery.getByRole("button", { name: "Next photo" }).click();
    await expect(
      gallery.getByRole("radio", { name: "Front", exact: true }),
    ).toBeChecked();
    await gallery.getByRole("button", { name: "Previous photo" }).click();
    await expect(
      gallery.getByRole("radio", {
        name: "Nutrition & allergens",
        exact: true,
      }),
    ).toBeChecked();
    const before = page.url();
    await swipe(page, "right");
    await expect(
      gallery.getByRole("radio", { name: "Back", exact: true }),
    ).toBeChecked();
    await swipe(page, "left");
    await expect(
      gallery.getByRole("radio", {
        name: "Nutrition & allergens",
        exact: true,
      }),
    ).toBeChecked();
    expect(page.url()).toBe(before);
    expect(await page.evaluate(() => scrollY)).toBe(scroll);
    await expect(gallery.getByRole("link")).toHaveCount(1);
    await gallery.getByRole("button", { name: "Next photo" }).press("Enter");
    await expect(
      gallery.getByRole("radio", { name: "Front", exact: true }),
    ).toBeChecked();
    await accessible(page);
    if (isPhone(page)) {
      await page.setViewportSize({ width: 320, height: 844 });
      await accessible(page);
    }
  } finally {
    await page.close();
    await cleanup();
  }
});

test("full-size photos stay in an accessible overlay with carousel controls and focus restoration", async ({
  page,
}) => {
  test.skip(!!process.env.TEST_BASE_URL, "Gallery fixtures are local only.");
  const cleanup = await extraPhotos();
  try {
    await page.goto("/us/products/oatly-full-fat?food=milk");
    const gallery = page.getByRole("group", { name: "Package photos" });
    await gallery.locator(".va-gallery__tab--back").click();
    const opener = gallery.getByRole("link", {
      name: "Oatly Oatmilk Full Fat: Back",
      exact: true,
    });
    await opener.scrollIntoViewIfNeeded();
    const scroll = await page.evaluate(() => scrollY);
    const url = page.url();
    await opener.click();
    const viewer = page.getByRole("dialog", {
      name: "Oatly Oatmilk Full Fat photos",
      exact: true,
    });
    await expect(viewer).toBeVisible();
    await expect(viewer.getByRole("img")).toHaveAccessibleName(
      "Oatly Oatmilk Full Fat: Back",
    );
    await expect(
      viewer.getByRole("button", { name: "Close full-size photos" }),
    ).toBeFocused();
    await viewer.getByRole("button", { name: "Next full-size photo" }).click();
    await expect(viewer.getByRole("img")).toHaveAccessibleName(
      "Oatly Oatmilk Full Fat: Nutrition & allergens",
    );
    await page.keyboard.press("ArrowRight");
    await expect(viewer.getByRole("img")).toHaveAccessibleName(
      "Oatly Oatmilk Full Fat: Front",
    );
    await page.keyboard.press("ArrowLeft");
    await swipe(page, "right", ".va-photo-viewer__stage");
    await expect(viewer.getByRole("img")).toHaveAccessibleName(
      "Oatly Oatmilk Full Fat: Back",
    );
    await swipe(page, "left", ".va-photo-viewer__stage");
    await expect(viewer.getByRole("img")).toHaveAccessibleName(
      "Oatly Oatmilk Full Fat: Nutrition & allergens",
    );
    await accessible(page);
    expect(page.url()).toBe(url);
    await page.keyboard.press("Escape");
    await expect(viewer).not.toBeVisible();
    await expect(opener).toBeFocused();
    expect(await page.evaluate(() => scrollY)).toBe(scroll);
    await page.getByText("Add or improve photos", { exact: true }).click();
    await page
      .locator(".photo-slots")
      .getByRole("link", { name: "Oatly Oatmilk Full Fat: Front", exact: true })
      .click();
    await expect(viewer).toBeVisible();
    await expect(viewer.getByRole("img")).toHaveAccessibleName(
      "Oatly Oatmilk Full Fat: Front",
    );
    await viewer
      .getByRole("button", { name: "Close full-size photos" })
      .click();
    await expect(viewer).not.toBeVisible();
    expect(page.url()).toBe(url);
  } finally {
    await page.close();
    await cleanup();
  }
});

test.describe("gallery without JavaScript", () => {
  test.use({ javaScriptEnabled: false });
  test("native thumbnails and keyboard move through existing photos without scrolling", async ({
    page,
  }) => {
    test.skip(
      !!process.env.TEST_BASE_URL,
      "Gallery fixture changes are local only.",
    );
    const cleanup = await extraPhotos();
    try {
      await page.goto("/us/products/oatly-full-fat?food=milk");
      const gallery = page.getByRole("group", { name: "Package photos" });
      await gallery.locator(".va-gallery__tabs").scrollIntoViewIfNeeded();
      const scroll = await page.evaluate(() => scrollY);
      await gallery.locator(".va-gallery__tab--back").click();
      const back = gallery.getByRole("radio", { name: "Back", exact: true });
      await expect(back).toBeChecked();
      expect(await page.evaluate(() => scrollY)).toBe(scroll);
      await back.press("ArrowRight");
      await expect(
        gallery.getByRole("radio", {
          name: "Nutrition & allergens",
          exact: true,
        }),
      ).toBeChecked();
      await expect(gallery.getByRole("link")).toHaveAttribute(
        "href",
        /\/full$/,
      );
      expect(await page.evaluate(() => scrollY)).toBe(scroll);
    } finally {
      await page.close();
      await cleanup();
    }
  });
});
