export const MAX_TRENDING_VIDEO_BYTES = 25 * 1024 * 1024;
const TARGET_TRENDING_VIDEO_BYTES = 10 * 1024 * 1024;
const MAX_TRENDING_DURATION_SECONDS = 30.5;

export type VideoEditOptions = {
  startSeconds?: number;
  endSeconds?: number;
};

function videoFileName(file: File, suffix: string, extension: string) {
  return `${file.name.replace(/\.[^.]+$/, "")}-${suffix}.${extension}`;
}

function inferredMime(file: File) {
  if (file.type === "video/mp4" || file.type === "video/webm") return file.type;
  if (/\.mp4$/i.test(file.name)) return "video/mp4";
  if (/\.webm$/i.test(file.name)) return "video/webm";
  return "";
}

function videoReadFailure(video: HTMLVideoElement, file: File) {
  const mime = inferredMime(file);
  const codecUnsupported = mime && video.canPlayType(mime) === "";
  const reference = crypto.randomUUID();
  const reason = codecUnsupported
    ? "This browser does not support the video codec inside this file. Export it as H.264/AAC MP4 or VP8/VP9 WebM."
    : "The browser could not read this video container. Try H.264/AAC MP4 or VP8/VP9 WebM.";
  return new Error(`${reason} Reference ${reference}.`);
}

function loadVideo(file: File, event: "loadedmetadata" | "loadeddata") {
  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.preload = "auto";
  video.muted = true;
  video.playsInline = true;
  const ready = new Promise<HTMLVideoElement>((resolve, reject) => {
    const timeout = window.setTimeout(() => reject(videoReadFailure(video, file)), 15_000);
    video.addEventListener(event, () => { window.clearTimeout(timeout); resolve(video); }, { once: true });
    video.addEventListener("error", () => { window.clearTimeout(timeout); reject(videoReadFailure(video, file)); }, { once: true });
  });
  // Listeners must be registered before assigning src; very small local files
  // can dispatch metadata synchronously in some browser engines.
  video.src = url;
  video.load();
  return { url, video, ready };
}

function seekVideo(video: HTMLVideoElement, seconds: number) {
  if (Math.abs(video.currentTime - seconds) < 0.02) return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    const finish = () => resolve();
    video.addEventListener("seeked", finish, { once: true });
    video.addEventListener("error", () => reject(new Error("Unable to seek to that video frame.")), { once: true });
    video.currentTime = seconds;
  });
}

export async function getVideoDuration(file: File) {
  const { url, video, ready } = loadVideo(file, "loadedmetadata");
  try {
    await ready;
    if (Number.isFinite(video.duration) && video.duration > 0) return video.duration;
    // Some WebM/fragmented MP4 files report Infinity until the browser seeks.
    await new Promise<void>((resolve, reject) => {
      const timeout = window.setTimeout(() => reject(videoReadFailure(video, file)), 8_000);
      const finish = () => { window.clearTimeout(timeout); resolve(); };
      video.addEventListener("durationchange", finish, { once: true });
      video.addEventListener("timeupdate", finish, { once: true });
      video.currentTime = 1e10;
    });
    if (Number.isFinite(video.duration) && video.duration > 0) return video.duration;
    throw videoReadFailure(video, file);
  } finally {
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(url);
  }
}

export async function createVideoPoster(file: File, atSeconds: number) {
  const { url, ready } = loadVideo(file, "loadeddata");
  try {
    const video = await ready;
    if (!video.videoWidth || !video.videoHeight || !Number.isFinite(video.duration)) throw new Error("This video does not contain a usable picture track.");
    const frameTime = Math.max(0, Math.min(video.duration - 0.05, atSeconds));
    await seekVideo(video, frameTime);
    const width = Math.min(1280, video.videoWidth);
    const height = Math.max(1, Math.round(width * video.videoHeight / video.videoWidth));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) throw new Error("This browser cannot create a poster frame.");
    context.drawImage(video, 0, 0, width, height);
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error("Unable to create the poster image.")), "image/jpeg", 0.86));
    return new File([blob], videoFileName(file, "poster", "jpg"), { type: "image/jpeg", lastModified: Date.now() });
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function optimizeTrendingVideo(file: File, edits: VideoEditOptions = {}) {
  const mime = inferredMime(file);
  if (!mime) throw new Error("Upload an MP4 or WebM video.");
  if (!file.type) file = new File([file], file.name, { type: mime, lastModified: file.lastModified });
  const sourceDuration = await getVideoDuration(file);
  const start = edits.startSeconds ?? 0;
  const end = edits.endSeconds ?? sourceDuration;
  const duration = end - start;
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end > sourceDuration + 0.05 || duration <= 0) throw new Error("Choose a valid trim range inside the video.");
  if (duration > MAX_TRENDING_DURATION_SECONDS) throw new Error("Choose a clip that is 30 seconds or shorter.");
  const needsTrim = start > 0.05 || end < sourceDuration - 0.05;
  if (!needsTrim && file.size <= TARGET_TRENDING_VIDEO_BYTES) return { file, duration, sourceDuration, trimmed: false };

  const video = document.createElement("video") as HTMLVideoElement & { captureStream?: () => MediaStream };
  if (typeof MediaRecorder === "undefined" || !video.captureStream) {
    const action = needsTrim ? "trim this video" : "optimize this clip";
    throw new Error(`This browser cannot ${action}. Export a 30-second MP4/WebM under 10 MB and upload it again.`);
  }
  const url = URL.createObjectURL(file);
  try {
    video.src = url;
    video.preload = "auto";
    video.muted = true;
    video.playsInline = true;
    await new Promise<void>((resolve, reject) => {
      video.addEventListener("loadeddata", () => resolve(), { once: true });
      video.addEventListener("error", () => reject(new Error("Unable to prepare this video.")), { once: true });
    });
    await seekVideo(video, start);
    const stream = video.captureStream();
    const mime = MediaRecorder.isTypeSupported("video/webm;codecs=vp8,opus") ? "video/webm;codecs=vp8,opus" : "video/webm";
    const recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 1_800_000, audioBitsPerSecond: 96_000 });
    const chunks: Blob[] = [];
    recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
    const finished = new Promise<void>((resolve, reject) => {
      recorder.onstop = () => resolve();
      recorder.onerror = () => reject(new Error("Video optimization failed."));
    });
    const reachedEnd = new Promise<void>((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        video.pause();
        video.removeEventListener("timeupdate", checkTime);
        video.removeEventListener("ended", finish);
        resolve();
      };
      const checkTime = () => { if (video.currentTime >= end - 0.03) finish(); };
      video.addEventListener("timeupdate", checkTime);
      video.addEventListener("ended", finish, { once: true });
      window.setTimeout(finish, Math.ceil(duration * 1000) + 2000);
    });
    recorder.start(500);
    await video.play();
    await reachedEnd;
    if (recorder.state !== "inactive") recorder.stop();
    await finished;
    const blob = new Blob(chunks, { type: "video/webm" });
    if (!blob.size) throw new Error("The browser did not produce an edited video. Try a current Chrome or Edge browser.");
    const optimized = new File([blob], videoFileName(file, needsTrim ? "trimmed" : "optimized", "webm"), { type: "video/webm", lastModified: Date.now() });
    if (optimized.size > MAX_TRENDING_VIDEO_BYTES) throw new Error("The edited video is still over 25 MB. Choose a shorter range or export at a lower resolution.");
    return { file: optimized, duration: await getVideoDuration(optimized), sourceDuration, trimmed: needsTrim };
  } finally {
    URL.revokeObjectURL(url);
  }
}
