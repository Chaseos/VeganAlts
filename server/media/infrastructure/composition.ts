import { v7 as uuid } from "uuid";
import { UploadService } from "../application/upload-service";
import { MediaRecoveryService } from "../application/recovery-service";
import { D1MediaRepository } from "./d1-repository";
import { R2MediaStorage } from "./r2-storage";
import { CloudflareImageTransformer } from "./cloudflare-images";

export function uploadService(env: Cloudflare.Env) {
  return new UploadService(
    new D1MediaRepository(env.DB),
    new R2MediaStorage(env.MEDIA_BUCKET),
    new CloudflareImageTransformer(env.IMAGES),
    uuid,
  );
}
export function mediaRecoveryService(env: Cloudflare.Env) {
  return new MediaRecoveryService(
    new D1MediaRepository(env.DB),
    new R2MediaStorage(env.MEDIA_BUCKET),
  );
}
