"use client";
import { useEffect, useRef, useState } from "react";
import { Mic, Square } from "lucide-react";
import { useI18n } from "@/components/i18n/LocaleProvider";

type Recognition = {
  lang: string; continuous: boolean; interimResults: boolean;
  onresult: ((event: { results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onerror: ((event: { error: string }) => void) | null; onend: (() => void) | null;
  start(): void; stop(): void; abort(): void;
};
type SpeechWindow = Window & { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
const languages: Record<string, string> = { en: "en-US", fr: "fr-FR", wo: "wo-SN", es: "es-ES", "zh-CN": "zh-CN" };

/** Dictation only edits the composer. It cannot submit, confirm, or retain audio. */
export default function AssistantDictation({ disabled, sessionKey, onTranscript }: { disabled: boolean; sessionKey: number; onTranscript: (text: string) => void }) {
  const { locale, translateSource: t } = useI18n();
  const [listening, setListening] = useState(false);
  const [notice, setNotice] = useState("");
  const recognition = useRef<Recognition | null>(null);
  const generation = useRef(0);
  useEffect(() => {
    return () => {
      generation.current++;
      const current = recognition.current; recognition.current = null;
      if (current) { current.onresult = null; current.onerror = null; current.onend = null; current.abort(); }
    };
  }, [locale, sessionKey]);
  function start() {
    if (recognition.current) { recognition.current.stop(); return; }
    setListening(false);
    const Speech = (window as SpeechWindow).SpeechRecognition || (window as SpeechWindow).webkitSpeechRecognition;
    if (!Speech) { setNotice("Dictation is unavailable in this browser. You can type your request."); return; }
    const current = new Speech(); const active = ++generation.current;
    current.lang = languages[locale] || "en-US";
    current.continuous = false; current.interimResults = false;
    current.onresult = event => {
      if (active !== generation.current) return;
      const transcript = Array.from(event.results).filter(result => result.isFinal).map(result => result[0].transcript).join(" ").trim();
      if (transcript) { onTranscript(transcript); setNotice("Review or edit the transcript, then choose Ask GC Assistant. Nothing has been changed."); }
    };
    current.onerror = event => {
      if (active !== generation.current) return;
      setNotice(event.error === "not-allowed" || event.error === "service-not-allowed"
        ? "Microphone access was not granted. You can type your request."
        : "Dictation is unavailable for this language or device. You can type your request.");
    };
    current.onend = () => { if (active === generation.current) { recognition.current = null; setListening(false); } };
    recognition.current = current;
    try { current.start(); setListening(true); setNotice("Listening. Speech will appear here for you to review."); }
    catch { recognition.current = null; setListening(false); setNotice("Dictation is unavailable for this language or device. You can type your request."); }
  }
  return <div className="space-y-2"><button type="button" disabled={disabled} onClick={start} aria-pressed={listening} className="inline-flex min-h-11 items-center gap-2 rounded-full border px-4 text-sm gc-disabled-control">{listening ? <Square size={16} aria-hidden/> : <Mic size={16} aria-hidden/>}{t(listening ? "Stop dictation" : "Dictate a request")}</button><p className="text-xs">{t("Your browser may process speech using its speech service. Girlz Culture does not store raw audio.")}</p><p role="status" aria-label={t("Dictation status")} className="text-sm">{t(notice)}</p></div>;
}
