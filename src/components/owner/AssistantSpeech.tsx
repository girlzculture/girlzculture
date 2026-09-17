"use client";
import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/components/i18n/LocaleProvider";
import { assistantLocalVoice } from "@/lib/assistantSpeechCore";

/** Explicit playback of existing text only. No provider call, recording,
 * automatic playback, or paid audio usage is introduced by this control. */
export default function AssistantSpeech({ text, sessionKey, language }: { text: string; sessionKey: number; language?: string }) {
  const { locale, translateSource: t } = useI18n();
  const current = useRef<SpeechSynthesisUtterance | null>(null);
  const [state, setState] = useState<"idle" | "speaking" | "paused">("idle");
  const [notice, setNotice] = useState("");
  useEffect(() => {
    // Some engines populate installed voices asynchronously after the first read.
    window.speechSynthesis?.getVoices();
    const active = current;
    function stop() {
      if (active.current) {
        active.current.onend = null; active.current.onerror = null; active.current = null;
        window.speechSynthesis?.cancel();
      }
      setState("idle");
    }
    window.addEventListener("gc-assistant-stop-speech", stop);
    return () => { window.removeEventListener("gc-assistant-stop-speech", stop); stop(); };
  }, [locale, sessionKey, text, language]);
  function play() {
    window.dispatchEvent(new Event("gc-assistant-stop-speech"));
    setNotice("");
    const synthesis = window.speechSynthesis;
    const voice = synthesis && assistantLocalVoice(synthesis.getVoices(), language || locale);
    if (!voice || !window.SpeechSynthesisUtterance) {
      setNotice("No on-device voice is available for this language. You can continue reading the answer."); return;
    }
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.voice = voice; utterance.lang = voice.lang;
    utterance.onend = () => { if (current.current === utterance) { current.current = null; setState("idle"); } };
    utterance.onerror = () => { if (current.current === utterance) { current.current = null; setState("idle"); setNotice("Audio stopped. You can continue reading the answer."); } };
    current.current = utterance;
    try { synthesis.speak(utterance); setState("speaking"); }
    catch { current.current = null; setState("idle"); setNotice("Audio stopped. You can continue reading the answer."); }
  }
  const control = "min-h-11 rounded-lg border border-border bg-white px-3 text-xs font-semibold text-text-primary";
  return <div className="mt-3 space-y-2">
    <div className="flex flex-wrap gap-2">
      {state === "idle" ? <button type="button" className={control} onClick={play}>{t("Read aloud")}</button> : <>
        <button type="button" className={control} onClick={() => {
          if (!current.current) return;
          if (state === "paused") { window.speechSynthesis.resume(); setState("speaking"); }
          else { window.speechSynthesis.pause(); setState("paused"); }
        }}>{t(state === "paused" ? "Resume audio" : "Pause audio")}</button>
        <button type="button" className={control} onClick={() => window.dispatchEvent(new Event("gc-assistant-stop-speech"))}>{t("Stop audio")}</button>
      </>}
    </div>
    <p className="text-xs leading-5 text-text-primary">{t("Spoken answers use an installed voice on this device. Audio is not saved.")}</p>
    {notice ? <p role="status" className="text-xs leading-5 text-text-primary">{t(notice)}</p> : null}
  </div>;
}
