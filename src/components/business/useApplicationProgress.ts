"use client";
import { useEffect, useRef, useState } from "react";
import { getValidSessionForScope } from "@/lib/supabase";
import { readApiResponse } from "@/lib/apiResponseClient";
import { applicationProgressInput } from "@/lib/applicationProgress";
export type ApplicationProgressPayload = Omit<ReturnType<typeof applicationProgressInput>, "revision">;
type Status = "loading" | "saved" | "saving" | "error" | "conflict";
function readDraft(value: unknown) {
  if (value == null) return null;
  const row = value as { revision?: unknown; payload?: unknown };
  const { revision, ...payload } = applicationProgressInput({ ...(row.payload as object), revision: row.revision });
  if (!revision) throw new Error("The saved application could not be verified.");
  return { revision, payload, key: JSON.stringify(payload) };
}
export function useApplicationProgress(userId: string, payload: ApplicationProgressPayload, onRestore: (payload: ApplicationProgressPayload) => void) {
  const [status, setStatus] = useState<Status>("loading");
  const [error, setError] = useState("");
  const [loadedActor, setLoadedActor] = useState("");
  const [reload, setReload] = useState(0);
  const [savedKey, setSavedKey] = useState("");
  const [savedRevision, setSavedRevision] = useState<number | null>(null);
  const [retrying, setRetrying] = useState(false);
  const revision = useRef<number | null>(null), saved = useRef(""), actor = useRef("");
  const generation = useRef(0), attempted = useRef("");
  const callback = useRef(onRestore), queue = useRef(Promise.resolve());
  const blockedSave = useRef(false);
  const serialized = JSON.stringify(payload);
  const ready = Boolean(userId && loadedActor === userId);
  const blocked = status === "conflict" || status === "error";
  useEffect(() => { callback.current = onRestore; }, [onRestore]);
  useEffect(() => {
    actor.current = userId;
    const version = ++generation.current;
    if (!userId) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoadedActor(""); setStatus("loading"); setError(""); blockedSave.current = false;
      try {
        const session = await getValidSessionForScope("salon");
        if (!session || session.user.id !== userId) throw new Error("Please sign in to resume your application.");
        const response = await fetch("/api/business/application/progress", { headers: { Authorization: `Bearer ${session.access_token}` }, cache: "no-store", signal: controller.signal });
        const body = await readApiResponse(response, "Application progress could not be loaded.");
        if (!response.ok) throw new Error(body.error || "Application progress could not be loaded.");
        const draft = readDraft(body.draft);
        if (generation.current !== version || controller.signal.aborted) return;
        revision.current = draft?.revision ?? null; saved.current = draft?.key || ""; attempted.current = "";
        setSavedRevision(revision.current); setSavedKey(saved.current);
        if (draft) callback.current(draft.payload);
        setLoadedActor(userId); setStatus("saved");
      } catch (failure) {
        if (!controller.signal.aborted && generation.current === version) {
          setStatus("error"); setError(failure instanceof Error ? failure.message : "Application progress could not be loaded.");
        }
      }
    }, 0);
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [userId, reload]);
  useEffect(() => {
    if (!ready || serialized === saved.current || blocked) return;
    const version = generation.current;
    let active = true;
    const timer = window.setTimeout(() => {
      setStatus("saving");
      queue.current = queue.current.then(async () => {
        if (!active || actor.current !== userId || version !== generation.current || blockedSave.current) return;
        try {
          const session = await getValidSessionForScope("salon");
          if (!session || session.user.id !== userId) throw new Error("Please sign in again. Your unsaved edits remain here.");
          attempted.current = serialized;
          const response = await fetch("/api/business/application/progress", { method: "POST", headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" }, body: JSON.stringify({ ...JSON.parse(serialized), revision: revision.current }), cache: "no-store" });
          const body = await readApiResponse(response, "Progress could not be saved. Your edits remain here.");
          if (actor.current !== userId || version !== generation.current) return;
          if (response.status === 409) { blockedSave.current = true; setStatus("conflict"); setError(body.error || "This draft changed on another device."); return; }
          const draft = response.ok ? readDraft(body.draft) : null;
          if (!response.ok || body.verified !== true || !draft || draft.key !== serialized) throw new Error(body.error || "Progress could not be verified. Your edits remain here.");
          revision.current = draft.revision; saved.current = serialized;
          setSavedKey(serialized); setSavedRevision(draft.revision); setError(""); setStatus("saved");
        } catch (failure) {
          if (actor.current !== userId || version !== generation.current) return;
          blockedSave.current = true; setStatus("error"); setError(failure instanceof Error ? failure.message : "Progress could not be saved. Your edits remain here.");
        }
      });
    }, 600);
    return () => { active = false; window.clearTimeout(timer); };
  }, [serialized, userId, ready, blocked]);
  async function retrySave() {
    // Read back an uncertain write before retrying; preserve current edits and
    // reject newer drafts from another device rather than overwriting them.
    setRetrying(true);
    const version = generation.current;
    try {
      await queue.current;
      const session = await getValidSessionForScope("salon");
      if (!session || session.user.id !== userId) throw new Error("Please sign in again. Your unsaved edits remain here.");
      const response = await fetch("/api/business/application/progress", { headers: { Authorization: `Bearer ${session.access_token}` }, cache: "no-store" });
      const body = await readApiResponse(response, "Progress could not be checked. Your edits remain here.");
      if (!response.ok) throw new Error(body.error);
      const draft = readDraft(body.draft);
      if (actor.current !== userId || version !== generation.current) return;
      if ((draft?.revision ?? null) !== revision.current && draft?.key !== attempted.current) {
        setStatus("conflict"); setError("This draft changed on another device. Your edits are still here. Review the saved draft before continuing."); return;
      }
      revision.current = draft?.revision ?? null; setSavedRevision(revision.current);
      if (draft?.key === attempted.current) { saved.current = attempted.current; setSavedKey(saved.current); }
      blockedSave.current = false; setError(""); setStatus("saved");
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Progress could not be checked. Your edits remain here.");
    } finally { setRetrying(false); }
  }
  useEffect(() => {
    if (!ready || serialized === savedKey) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [ready, serialized, savedKey]);
  return { ready, status: ready && serialized !== savedKey && status === "saved" ? "saving" as const : status, error, revision: savedRevision, isSaved: ready && serialized === savedKey && status === "saved", retrying, retrySave, reloadSaved: () => setReload(value => value + 1) };
}
