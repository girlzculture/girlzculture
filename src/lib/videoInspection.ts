export type VideoInspection = {
  container: "mp4" | "quicktime" | "webm" | "matroska" | "unknown";
  videoCodec: "h264" | "hevc" | "vp8" | "vp9" | "av1" | "unknown";
  audioCodec: "aac" | "opus" | "vorbis" | "dolby" | "none" | "unknown";
  browserSafe: boolean;
};

export function inspectVideoBytes(
  bytes: Uint8Array,
  requestedMime = "",
): VideoInspection {
  const text = new TextDecoder("latin1").decode(bytes);
  const isIsoMedia = text.slice(4, 16).includes("ftyp");
  const webmSignature =
    bytes.length >= 4 &&
    bytes[0] === 0x1a &&
    bytes[1] === 0x45 &&
    bytes[2] === 0xdf &&
    bytes[3] === 0xa3;
  const quickTime =
    /video\/quicktime|video\/x-m4v/i.test(requestedMime) ||
    /qt  |M4V /.test(text.slice(4, 40));
  const matroska =
    webmSignature &&
    (/matroska/i.test(text) || /video\/x-matroska/i.test(requestedMime));
  const container = matroska
    ? "matroska"
    : webmSignature
      ? "webm"
      : isIsoMedia && quickTime
        ? "quicktime"
        : isIsoMedia
          ? "mp4"
          : "unknown";
  const videoCodec = /avc1|avc3/.test(text)
    ? "h264"
    : /hvc1|hev1/.test(text)
      ? "hevc"
      : /V_VP8|vp08/.test(text)
        ? "vp8"
        : /V_VP9|vp09/.test(text)
          ? "vp9"
          : /V_AV1|av01/.test(text)
            ? "av1"
            : "unknown";
  const hasAudio = /soun|mp4a|ac-3|ec-3|A_OPUS|A_VORBIS/i.test(text);
  const audioCodec = /mp4a/.test(text)
    ? "aac"
    : /A_OPUS|opus/i.test(text)
      ? "opus"
      : /A_VORBIS|vorbis/i.test(text)
        ? "vorbis"
        : /ac-3|ec-3/.test(text)
          ? "dolby"
          : hasAudio
            ? "unknown"
            : "none";
  return {
    container,
    videoCodec,
    audioCodec,
    browserSafe:
      (container === "mp4" &&
        videoCodec === "h264" &&
        (audioCodec === "aac" || audioCodec === "none")) ||
      (container === "webm" &&
        ["vp8", "vp9"].includes(videoCodec) &&
        ["opus", "vorbis", "none"].includes(audioCodec)),
  };
}

export function inspectMp4Bytes(bytes: Uint8Array) {
  return inspectVideoBytes(bytes, "video/mp4");
}
