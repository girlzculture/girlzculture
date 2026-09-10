import Image from "next/image";
import type { BusinessPhotoAsset } from "@/lib/businessSignupMedia";

export default function BusinessPhoto({ photo, priority = false }: { photo: BusinessPhotoAsset; priority?: boolean }) {
  return <span className="business-photo" aria-hidden="true">
    <Image src={photo.src} alt="" fill unoptimized sizes="(max-width: 900px) 50vw, 25vw" priority={priority} style={{ objectFit: "cover", objectPosition: photo.position }} />
  </span>;
}
