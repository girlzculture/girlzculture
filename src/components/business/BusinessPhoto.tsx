import Image from "next/image";
import type { CSSProperties } from "react";
import { BUSINESS_REFERENCE_PHOTO, BUSINESS_REFERENCE_SIZE, type BusinessPhotoCrop } from "@/lib/businessSignupMedia";

/** A responsive photo window into the unmodified founder reference. */
export default function BusinessPhoto({ crop, priority = false }: { crop: BusinessPhotoCrop; priority?: boolean }) {
  const style = { "--business-photo-ratio": crop.width / crop.height } as CSSProperties;
  return <span className="business-photo" style={style} aria-hidden="true">
    <span className="business-photo-window">
      <Image src={BUSINESS_REFERENCE_PHOTO} alt="" width={BUSINESS_REFERENCE_SIZE.width} height={BUSINESS_REFERENCE_SIZE.height} unoptimized priority={priority} style={{
        position: "absolute", maxWidth: "none",
        width: `${BUSINESS_REFERENCE_SIZE.width / crop.width * 100}%`,
        height: `${BUSINESS_REFERENCE_SIZE.height / crop.height * 100}%`,
        left: `${-crop.x / crop.width * 100}%`,
        top: `${-crop.y / crop.height * 100}%`,
      }} />
    </span>
  </span>;
}
