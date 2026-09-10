export const BUSINESS_HERO_VIDEO_KIND = "business_hero_video" as const;
export const BUSINESS_HERO_VIDEO_BUCKET = "content-media";
export const BUSINESS_HERO_VIDEO_FOLDER = "business-signup/hero";
export const BUSINESS_HERO_VIDEO_MAX_BYTES = 12 * 1024 * 1024;
export const BUSINESS_HERO_VIDEO_MAX_SECONDS = 120;

export class BusinessHeroVideoValidationError extends Error {}

const invalid = () => new BusinessHeroVideoValidationError("Choose a complete H.264 MP4 video with a readable picture track.");
type Box = { type: string; payload: number; end: number };

// Inspect bounded ISO-BMFF boxes, not MIME/filename hints or arbitrary codec
// strings in compressed media. This validates the container, not every frame.
export function inspectBusinessHeroMp4(bytes: Uint8Array) {
  if (!bytes.length || bytes.length > BUSINESS_HERO_VIDEO_MAX_BYTES) {
    throw new BusinessHeroVideoValidationError("The hero video must be 12 MB or smaller and must not be empty.");
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const ascii = (start: number, count: number) => String.fromCharCode(...bytes.subarray(start, start + count));
  const u64 = (offset: number) => {
    const value = view.getUint32(offset) * 2 ** 32 + view.getUint32(offset + 4);
    if (!Number.isSafeInteger(value)) throw invalid();
    return value;
  };
  let boxCount = 0;
  const boxes = (start: number, end: number): Box[] => {
    const result: Box[] = [];
    while (start < end) {
      if (end - start < 8 || ++boxCount > 8_000) throw invalid();
      let size = view.getUint32(start);
      let header = 8;
      if (size === 1) {
        if (end - start < 16) throw invalid();
        size = u64(start + 8);
        header = 16;
      } else if (size === 0) size = end - start;
      if (size < header || size > end - start) throw invalid();
      result.push({ type: ascii(start + 4, 4), payload: start + header, end: start + size });
      start += size;
    }
    return result;
  };
  const children = (box: Box) => boxes(box.payload, box.end);
  const top = boxes(0, bytes.length);
  const fileType = top[0];
  const movie = top.find(box => box.type === "moov");
  if (fileType?.type !== "ftyp" || fileType.end - fileType.payload < 8 || !movie || !top.some(box => box.type === "mdat" && box.end > box.payload)) throw invalid();
  const brand = ascii(fileType.payload, 4);
  if (!/^(?:isom|iso[2-9]|mp4[12]|avc1|dash|MSNV)$/.test(brand)) throw invalid();
  const movieChildren = children(movie);
  const header = movieChildren.find(box => box.type === "mvhd");
  if (!header || header.end - header.payload < 20) throw invalid();
  const version = bytes[header.payload];
  if (version !== 0 && version !== 1) throw invalid();
  if (version === 1 && header.end - header.payload < 32) throw invalid();
  const timescale = view.getUint32(header.payload + (version === 1 ? 20 : 12));
  const duration = version === 1 ? u64(header.payload + 24) : view.getUint32(header.payload + 16);
  const durationSeconds = duration / timescale;
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0 || durationSeconds > BUSINESS_HERO_VIDEO_MAX_SECONDS) {
    throw new BusinessHeroVideoValidationError("Choose a hero video between 0 and 120 seconds long.");
  }
  for (const track of movieChildren.filter(box => box.type === "trak")) {
    const trackChildren = children(track);
    const trackHeader = trackChildren.find(box => box.type === "tkhd");
    const media = trackChildren.find(box => box.type === "mdia");
    if (!trackHeader || !media) continue;
    const mediaChildren = children(media);
    const handler = mediaChildren.find(box => box.type === "hdlr");
    if (!handler || handler.end - handler.payload < 12 || ascii(handler.payload + 8, 4) !== "vide") continue;
    const information = mediaChildren.find(box => box.type === "minf");
    const sampleTable = information && children(information).find(box => box.type === "stbl");
    const descriptions = sampleTable && children(sampleTable).find(box => box.type === "stsd");
    if (!descriptions || descriptions.end - descriptions.payload < 8) throw invalid();
    const samples = boxes(descriptions.payload + 8, descriptions.end);
    if (view.getUint32(descriptions.payload + 4) !== samples.length || !samples.length || samples.some(box => !["avc1", "avc3"].includes(box.type))) throw invalid();
    for (const sample of samples) {
      if (sample.end - sample.payload < 78) throw invalid();
      const codec = boxes(sample.payload + 78, sample.end).find(box => box.type === "avcC");
      if (!codec || codec.end - codec.payload < 7 || bytes[codec.payload] !== 1) throw invalid();
    }
    if (trackHeader.end - trackHeader.payload < 84) throw invalid();
    const width = Math.round(view.getUint32(trackHeader.end - 8) / 65536);
    const height = Math.round(view.getUint32(trackHeader.end - 4) / 65536);
    if (width < 48 || height < 48 || width > 7680 || height > 7680 || width * height > 33_177_600) throw invalid();
    return { width, height, durationSeconds, mimeType: "video/mp4" as const };
  }
  throw invalid();
}

export async function normalizeBusinessHeroVideo(file: File) {
  // Generic MIME from mobile pickers is allowed only after inspecting bytes.
  if (file.type && !["video/mp4", "application/octet-stream"].includes(file.type)) {
    throw new BusinessHeroVideoValidationError("Upload an MP4 video for the business hero.");
  }
  if (!file.size || file.size > BUSINESS_HERO_VIDEO_MAX_BYTES) {
    throw new BusinessHeroVideoValidationError("The hero video must be 12 MB or smaller and must not be empty.");
  }
  const metadata = inspectBusinessHeroMp4(new Uint8Array(await file.arrayBuffer()));
  const stem = file.name.replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 60) || "business-hero";
  return { file: new File([file], `${stem}.mp4`, { type: "video/mp4", lastModified: file.lastModified }), metadata };
}
