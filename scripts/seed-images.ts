import sharp from "sharp";
import { seedProducts } from "../db/seed/catalog";
import { seedId } from "../db/seed/statements";
import { packageIllustration } from "../db/seed/illustrations";
import { withCatalogPlatform } from "./catalog-platform";
import { UploadService } from "../server/media/application/upload-service";
import { D1MediaRepository } from "../server/media/infrastructure/d1-repository";
import { R2MediaStorage } from "../server/media/infrastructure/r2-storage";
import { CloudflareImageTransformer } from "../server/media/infrastructure/cloudflare-images";
import { readMedia } from "../server/media/infrastructure/media-reader";

const environment = process.argv[2];
if (environment !== "local" && environment !== "staging")
  throw new Error(
    "Demo images are allowed only in local or staging. Production is prohibited.",
  );
await withCatalogPlatform(environment, async (env) => {
  const service = new UploadService(
    new D1MediaRepository(env.DB),
    new R2MediaStorage(env.MEDIA_BUCKET),
    new CloudflareImageTransformer(env.IMAGES),
    () => crypto.randomUUID(),
  );
  for (const [index, product] of seedProducts.entries()) {
    const bytes = new Uint8Array(
      await sharp(Buffer.from(packageIllustration(product, index)))
        .png()
        .toBuffer(),
    );
    const result = await service.upload({
      userId: seedId("taster:0"),
      productVersionId: seedId(`formula:${product.slug}:current`),
      slot: "front",
      idempotencyKey: `demo-package-v1-${product.slug}`,
      bytes,
    });
    if (!result.imageId) throw new Error("Missing uploaded image.");
    for (const variant of ["full", "thumbnail"]) {
      const response = await readMedia(
        env.DB,
        env.MEDIA_BUCKET,
        result.imageId,
        variant,
        new Request("https://example.invalid/media"),
      );
      if (!response.ok || !(await response.arrayBuffer()).byteLength)
        throw new Error("An uploaded derivative is unreadable.");
    }
    console.log(
      JSON.stringify({
        environment,
        product: product.slug,
        imageId: result.imageId,
        verified: true,
      }),
    );
  }
});
