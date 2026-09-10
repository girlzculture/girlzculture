import Image from "next/image";
import type { BusinessPhotoAsset } from "@/lib/businessSignupMedia";

export default function BusinessPhoto({ photo, priority = false }: { photo: BusinessPhotoAsset; priority?: boolean }) {
  return <span className="business-photo" style={{ position: "relative", display: "block", width: "100%", aspectRatio: photo.aspectRatio, height: photo.aspectRatio ? "auto" : undefined }}>
    <Image src={photo.src} alt={photo.alt} fill unoptimized sizes="(max-width: 900px) 50vw, 25vw" priority={priority} style={{ objectFit: photo.objectFit ?? "cover", objectPosition: photo.objectPosition ?? "50% 50%" }} />
  </span>;
}
