export type VideoProcessingJob = Record<string, unknown> & {
  id: string;
  status: string;
  progress_percent?: number;
  output_url?: string | null;
  error_reference?: string | null;
  safe_error_code?: string | null;
};

function abortError() {
  return new DOMException("Video processing cancelled.", "AbortError");
}

async function wait(milliseconds: number, signal?: AbortSignal) {
  if (signal?.aborted) throw abortError();
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, milliseconds);
    const abort = () => {
      clearTimeout(timer);
      reject(abortError());
    };
    signal?.addEventListener("abort", abort, { once: true });
    if (!signal) return;
    void Promise.resolve().then(() => {
      if (!signal.aborted) return;
      signal.removeEventListener("abort", abort);
      abort();
    });
  });
}

export async function pollVideoJobUntilReady(input: {
  jobId: string;
  getJob: () => Promise<VideoProcessingJob | null>;
  onUpdate?: (job: VideoProcessingJob) => void;
  signal?: AbortSignal;
  intervalMs?: number;
  maxAttempts?: number;
  sleep?: (milliseconds: number, signal?: AbortSignal) => Promise<void>;
  stopError?: (job: VideoProcessingJob) => unknown;
}) {
  const maxAttempts = Math.max(1, input.maxAttempts || 90);
  const sleeper = input.sleep || wait;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    if (input.signal?.aborted) throw abortError();
    const job = await input.getJob();
    if (!job || job.id !== input.jobId) {
      throw new Error(`Video job ${input.jobId} could not be found.`);
    }
    input.onUpdate?.(job);
    const stopError = input.stopError?.(job);
    if (stopError) throw stopError;
    if (job.status === "Ready") {
      if (!job.output_url) {
        throw new Error(
          `Video job ${input.jobId} completed without a browser-ready result.`,
        );
      }
      return job;
    }
    if (job.status === "Failed") {
      const reference = job.error_reference
        ? ` Reference ${job.error_reference}.`
        : "";
      throw new Error(
        `Video processing failed (${job.safe_error_code || "VIDEO_PROCESSING_FAILED"}).${reference} Video job ${input.jobId}.`,
      );
    }
    if (job.status === "Cancelled") throw abortError();
    await sleeper(input.intervalMs || 1_500, input.signal);
  }
  throw new Error(
    `Video processing is still running. Video job ${input.jobId} can be resumed without uploading the source again.`,
  );
}
