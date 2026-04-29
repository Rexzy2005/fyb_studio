import { Readable } from "node:stream";
import type { UploadApiResponse } from "cloudinary";

import { getCloudinary } from "@/backend/cloudinary/client";
import { AppError } from "@/backend/errors/app-error";

export type UploadedAsset = {
  url: string;
  publicId: string;
  width: number | null;
  height: number | null;
  bytes: number | null;
  mime: string | null;
};

function requireCloudinary() {
  const c = getCloudinary();
  if (!c) {
    throw new AppError(
      "INTERNAL_ERROR",
      "Cloudinary is not configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET.",
      500
    );
  }
  return c;
}

function toUploaded(res: UploadApiResponse): UploadedAsset {
  return {
    url: res.secure_url,
    publicId: res.public_id,
    width: typeof res.width === "number" ? res.width : null,
    height: typeof res.height === "number" ? res.height : null,
    bytes: typeof res.bytes === "number" ? res.bytes : null,
    mime: res.format ? `image/${res.format}` : null,
  };
}

export async function uploadImage(
  buffer: Buffer,
  folder: string,
  publicId?: string
): Promise<UploadedAsset> {
  const cloudinary = requireCloudinary();

  return new Promise<UploadedAsset>((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder,
        public_id: publicId,
        resource_type: "image",
        overwrite: true,
        invalidate: true,
      },
      (err, result) => {
        if (err || !result) {
          reject(err ?? new Error("Cloudinary upload returned no result"));
          return;
        }
        resolve(toUploaded(result));
      }
    );

    Readable.from(buffer).pipe(stream);
  });
}

export async function deleteAsset(publicId: string): Promise<void> {
  const cloudinary = requireCloudinary();
  try {
    await cloudinary.uploader.destroy(publicId, {
      resource_type: "image",
      invalidate: true,
    });
  } catch (err) {
    console.warn("[cloudinary] deleteAsset failed for", publicId, err);
  }
}

export async function deleteFolder(folder: string): Promise<void> {
  const cloudinary = requireCloudinary();
  try {
    await cloudinary.api.delete_resources_by_prefix(folder, {
      resource_type: "image",
      invalidate: true,
    });
  } catch (err) {
    console.warn("[cloudinary] delete_resources_by_prefix failed for", folder, err);
  }
  try {
    await cloudinary.api.delete_folder(folder);
  } catch (err) {
    console.warn("[cloudinary] delete_folder failed for", folder, err);
  }
}

export function templateFolder(templateId: string): string {
  return `fyb-studio/templates/${templateId}`;
}

export function coverFolder(templateId: string): string {
  return `${templateFolder(templateId)}/cover`;
}

export function assetsFolder(templateId: string): string {
  return `${templateFolder(templateId)}/assets`;
}

export function assetPublicIdHint(nodeId: string): string {
  return nodeId.replace(/[^a-zA-Z0-9_-]+/g, "_");
}
