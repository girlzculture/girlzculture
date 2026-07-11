"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { createStoragePath, getImageUploadError, MAX_IMAGE_UPLOAD_BYTES, optimizeImageFile } from "@/lib/imageUpload";

type ImageUploadProps = {
  bucket: "salon-photos" | "stylist-photos" | "review-photos" | string;
  value: string | string[] | null | undefined;
  onChange: (value: string | string[] | null) => void;
  label: string;
  helperText?: string;
  folder?: string;
  multiple?: boolean;
  maxFiles?: number;
  disabled?: boolean;
  className?: string;
};

function UploadSlot({ onClick, disabled, label, helper }: { onClick: () => void; disabled?: boolean; label: string; helper: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex min-h-[140px] w-full flex-col items-center justify-center rounded-[24px] border border-dashed border-plum/25 bg-cream/60 px-5 py-6 text-center transition hover:border-magenta/60 hover:bg-blush/40 disabled:cursor-not-allowed disabled:opacity-60"
    >
      <span className="text-3xl font-semibold text-plum">+</span>
      <span className="mt-2 text-sm font-semibold text-plum">{label}</span>
      <span className="mt-2 text-xs uppercase tracking-[0.24em] text-ink/60">{helper}</span>
    </button>
  );
}

function previewValues(value: string | string[] | null | undefined, multiple: boolean) {
  if (multiple) {
    return Array.isArray(value) ? value.filter(Boolean) : [];
  }

  return typeof value === "string" && value ? [value] : [];
}

export default function ImageUpload({
  bucket,
  value,
  onChange,
  label,
  helperText,
  folder,
  multiple = false,
  maxFiles = 8,
  disabled = false,
  className,
}: ImageUploadProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [userReady, setUserReady] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const currentValues = useMemo(() => previewValues(value, multiple), [multiple, value]);

  useEffect(() => {
    let active = true;

    const resolveUser = async () => {
      const { data } = await supabase.auth.getUser();
      if (!active) return;
      setIsAuthenticated(Boolean(data?.user));
      setUserReady(true);
    };

    resolveUser();

    return () => {
      active = false;
    };
  }, []);

  const openPicker = () => {
    setError(null);
    inputRef.current?.click();
  };

  const uploadFile = async (file: File) => {
    const typeError = getImageUploadError(file);
    if (typeError) {
      throw new Error(typeError);
    }

    const processedFile = await optimizeImageFile(file);
    if (processedFile.size > MAX_IMAGE_UPLOAD_BYTES) {
      throw new Error("That image is still a little large after optimization. Please choose a JPG or PNG around 2 MB or smaller.");
    }

    const path = createStoragePath(bucket, folder, processedFile.name || file.name || "image");
    const { error: uploadError } = await supabase.storage.from(bucket).upload(path, processedFile, {
      cacheControl: "3600",
      upsert: false,
      contentType: processedFile.type,
    });

    if (uploadError) {
      throw new Error(uploadError.message);
    }

    const { data } = supabase.storage.from(bucket).getPublicUrl(path);
    return data.publicUrl;
  };

  const handleFiles = async (fileList: FileList | null) => {
    if (!fileList || disabled || uploading) return;
    if (!userReady) {
      setError("Checking your sign-in status. Please try again in a moment.");
      return;
    }
    if (!isAuthenticated) {
      setError("Please sign in before uploading images.");
      return;
    }

    const files = Array.from(fileList);
    if (!files.length) return;

    setUploading(true);
    setStatusMessage(multiple ? `Uploading ${files.length} image${files.length > 1 ? "s" : ""}…` : "Uploading image…");
    setError(null);

    try {
      const urls: string[] = [];
      for (const file of files.slice(0, multiple ? maxFiles : 1)) {
        const publicUrl = await uploadFile(file);
        urls.push(publicUrl);
      }

      if (multiple) {
        const nextValue = [...currentValues, ...urls].slice(0, maxFiles);
        onChange(nextValue);
      } else {
        onChange(urls[0] ?? null);
      }

      setStatusMessage("Upload complete.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed. Please try again.");
      setStatusMessage(null);
    } finally {
      setUploading(false);
      if (inputRef.current) {
        inputRef.current.value = "";
      }
    }
  };

  const removeValue = (target: string) => {
    if (multiple) {
      onChange(currentValues.filter((item) => item !== target));
      return;
    }
    onChange(null);
  };

  const moveValue = (target: string, direction: -1 | 1) => {
    if (!multiple) return;
    const index = currentValues.indexOf(target);
    const nextIndex = index + direction;
    if (index < 0 || nextIndex < 0 || nextIndex >= currentValues.length) return;
    const reordered = [...currentValues];
    [reordered[index], reordered[nextIndex]] = [reordered[nextIndex], reordered[index]];
    onChange(reordered);
  };

  const isLocked = disabled || !userReady || !isAuthenticated;

  return (
    <div className={className}>
      <div className="flex items-end justify-between gap-4">
        <div>
          <div className="text-sm font-semibold uppercase tracking-[0.24em] text-magenta">{label}</div>
          {helperText ? <div className="mt-2 text-sm leading-6 text-ink/70">{helperText}</div> : null}
        </div>
        <div className="text-xs uppercase tracking-[0.24em] text-ink/60">JPG / PNG • up to about 2 MB</div>
      </div>

      {!userReady ? (
        <div className="mt-4 rounded-[24px] border border-plum/10 bg-blush/30 p-4 text-sm text-ink/70">Checking upload access…</div>
      ) : !isAuthenticated ? (
        <div className="mt-4 rounded-[24px] border border-plum/10 bg-blush/30 p-4 text-sm text-ink/70">Sign in to upload images to Supabase Storage.</div>
      ) : null}

      <input ref={inputRef} type="file" accept="image/jpeg,image/png" multiple={multiple} onChange={(event) => handleFiles(event.target.files)} className="hidden" />

      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {currentValues.map((src) => (
          <div key={src} className="group relative overflow-hidden rounded-[24px] border border-plum/10 bg-white shadow-sm">
            <div className="aspect-[4/3] w-full bg-cover bg-center" style={{ backgroundImage: `url(${src})` }} />
            <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 bg-gradient-to-t from-ink/70 to-transparent px-3 py-3 text-white opacity-0 transition group-hover:opacity-100">
              <span className="text-xs uppercase tracking-[0.24em]">Uploaded</span>
              <div className="flex items-center gap-2">
                {multiple ? (
                  <>
                    <button type="button" aria-label="Move image left" onClick={() => moveValue(src, -1)} className="rounded-full bg-white/20 px-2 py-1 text-xs font-semibold backdrop-blur">←</button>
                    <button type="button" aria-label="Move image right" onClick={() => moveValue(src, 1)} className="rounded-full bg-white/20 px-2 py-1 text-xs font-semibold backdrop-blur">→</button>
                  </>
                ) : null}
                {!multiple ? (
                  <button type="button" onClick={openPicker} className="rounded-full bg-white/20 px-3 py-1 text-xs font-semibold backdrop-blur">
                    Replace
                  </button>
                ) : null}
                <button type="button" onClick={() => removeValue(src)} className="rounded-full bg-white/20 px-3 py-1 text-xs font-semibold backdrop-blur">
                  Remove
                </button>
              </div>
            </div>
          </div>
        ))}

        {!multiple && currentValues.length > 0 ? null : (
          <UploadSlot onClick={openPicker} disabled={isLocked || uploading} label={uploading ? "Uploading image" : "Upload image"} helper={uploading ? "Please wait" : isLocked ? "Sign in first" : "Tap to choose a file"} />
        )}

        {multiple && currentValues.length > 0 && currentValues.length < maxFiles ? (
          <UploadSlot onClick={openPicker} disabled={isLocked || uploading} label={uploading ? "Uploading image" : "Add another image"} helper={uploading ? "Please wait" : isLocked ? "Sign in first" : `${currentValues.length}/${maxFiles} uploaded`} />
        ) : null}
      </div>

      <div className="mt-3 flex flex-wrap gap-3 text-sm text-ink/70">
        {error ? <span className="rounded-full bg-red-50 px-3 py-2 text-red-700">{error}</span> : null}
        {statusMessage ? <span className="rounded-full bg-blush/60 px-3 py-2 text-plum">{statusMessage}</span> : null}
      </div>
    </div>
  );
}
