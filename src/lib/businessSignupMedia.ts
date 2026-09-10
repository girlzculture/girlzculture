import type { CSSProperties } from "react";

export type BusinessPhotoAsset = {
  src: string;
  mobileSrc?: string;
  alt: string;
  objectFit?: CSSProperties["objectFit"];
  objectPosition?: CSSProperties["objectPosition"];
  aspectRatio?: CSSProperties["aspectRatio"];
};
export type BusinessSignupVideo = { src: string; poster: BusinessPhotoAsset; objectPosition?: string };
