import { ApplicationError } from "../../shared/domain/errors";
import type {
  DerivativeSpec,
  ImageInfo,
  ImageTransformer,
} from "../domain/media";

const stream = (bytes: Uint8Array) =>
  new Blob([bytes as Uint8Array<ArrayBuffer>]).stream();

export class CloudflareImageTransformer implements ImageTransformer {
  constructor(private readonly images: ImagesBinding) {}
  async inspect(bytes: Uint8Array): Promise<ImageInfo> {
    const info = await this.images.info(stream(bytes));
    if (!("width" in info))
      throw new ApplicationError(
        "INVALID_IMAGE",
        "Only raster images are accepted.",
        415,
      );
    return info;
  }
  async transform(bytes: Uint8Array, spec: DerivativeSpec) {
    const source = await this.inspect(bytes);
    const scale = Math.min(
      1,
      spec.maxEdge / Math.max(source.width, source.height),
    );
    const result = await this.images
      .input(stream(bytes))
      .transform({
        width: Math.max(1, Math.round(source.width * scale)),
        height: Math.max(1, Math.round(source.height * scale)),
        fit: "scale-down",
      })
      .output({ format: "image/webp", quality: spec.quality, anim: false });
    const output = new Uint8Array(await result.response().arrayBuffer());
    const info = await this.inspect(output);
    return { bytes: output, width: info.width, height: info.height };
  }
}
