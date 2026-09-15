"use client";
import { useEffect, useRef, useState } from "react";
import { Mic } from "lucide-react";
import { useI18n } from "@/components/i18n/LocaleProvider";

type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: { results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
};
type SpeechWindow = Window & { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
const languages: Record<string, string> = { en: "en-US", fr: "fr-FR", wo: "wo-SN", es: "es-ES", "zh-CN": "zh-CN" };

/** Dictation only edits the composer. It cannot submit, confirm, or retain audio. */
export default function AssistantDictation({ disabled, sessionKey, value, onChange, maxLength = 2400 }: {
  disabled: boolean;
  sessionKey: number;
  value: string;
  onChange: (text: string) => void;
  maxLength?: number;
}) {
  const { locale, translateSource: t } = useI18n();
  const [listening, setListening] = useState(false);
  const [notice, setNotice] = useState("");
  const [recordingContext, setRecordingContext] = useState({ locale, sessionKey });
  const recognition = useRef<Recognition | null>(null);
  const generation = useRef(0);
  const startingText = useRef("");
  const deliveredText = useRef(value);
  const maximumTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  if (recordingContext.locale !== locale || recordingContext.sessionKey !== sessionKey) {
    setRecordingContext({ locale, sessionKey });
    setListening(false);
    setNotice("");
  }

  function clearMaximumTimer() {
    if (maximumTimer.current) clearTimeout(maximumTimer.current);
    maximumTimer.current = null;
  }

  useEffect(() => {
    const lifetime = generation;
    return () => {
      lifetime.current++;
      clearMaximumTimer();
      const current = recognition.current;
      recognition.current = null;
      if (current) {
        current.onresult = null;
        current.onerror = null;
        current.onend = null;
        current.abort();
      }
    };
  }, [locale, sessionKey]);

  useEffect(() => {
    // A keyboard edit pauses dictation before another speech event can replace
    // the correction. Tap the mic again to append to the corrected text.
    if (!recognition.current || value === deliveredText.current) return;
    generation.current++;
    recognition.current.abort();
    recognition.current = null;
    clearMaximumTimer();
    setListening(false);
    setNotice("Dictation paused while you edit. Tap the microphone to continue.");
  }, [value]);

  useEffect(() => {
    if (!disabled || !recognition.current) return;
    generation.current++;
    recognition.current.abort();
    recognition.current = null;
    clearMaximumTimer();
    setListening(false);
  }, [disabled]);

  function toggle() {
    if (recognition.current) {
      recognition.current.stop();
      return;
    }
    setListening(false);
    if (value.length >= maxLength) {
      setNotice("The message limit was reached. Review and send this part before continuing.");
      return;
    }
    const Speech = (window as SpeechWindow).SpeechRecognition || (window as SpeechWindow).webkitSpeechRecognition;
    if (!Speech) {
      setNotice("Dictation is unavailable in this browser. You can type your request.");
      return;
    }

    const current = new Speech();
    const active = ++generation.current;
    startingText.current = value.trimEnd();
    deliveredText.current = value;
    current.lang = languages[locale] || "en-US";
    current.continuous = true;
    current.interimResults = true;
    current.onresult = event => {
      if (active !== generation.current) return;
      const speech = Array.from(event.results).map(result => result[0]?.transcript || "").join(" ").replace(/\s+/gu, " ").trim();
      const transcript = `${startingText.current}${startingText.current && speech ? " " : ""}${speech}`;
      const composed = transcript.slice(0, maxLength);
      deliveredText.current = composed;
      onChange(composed);
      if (transcript.length >= maxLength) {
        generation.current++;
        recognition.current = null;
        clearMaximumTimer();
        current.abort();
        setListening(false);
        setNotice("The message limit was reached. Review and send this part before continuing.");
        return;
      }
      setNotice(Array.from(event.results).every(result => result.isFinal)
        ? "Transcript ready. You can stop recording, review it, and send when ready."
        : "Listening. Your words are appearing in the message box.");
    };
    current.onerror = event => {
      if (active !== generation.current) return;
      setNotice(event.error === "not-allowed" || event.error === "service-not-allowed"
        ? "Microphone access was not granted. You can type your request."
        : "Dictation is unavailable for this language or device. You can type your request.");
    };
    current.onend = () => {
      if (active !== generation.current) return;
      recognition.current = null;
      clearMaximumTimer();
      setListening(false);
    };
    recognition.current = current;
    try {
      current.start();
      setListening(true);
      setNotice("Listening. Your browser's speech service processes audio. Edit the text to pause; tap again to stop.");
      maximumTimer.current = setTimeout(() => {
        if (active !== generation.current || recognition.current !== current) return;
        setNotice("The ten-minute recording limit was reached. Review the transcript and send when ready.");
        current.stop();
      }, 600_000);
    } catch {
      recognition.current = null;
      setListening(false);
      setNotice("Dictation is unavailable for this language or device. You can type your request.");
    }
  }

  return <div className="relative shrink-0">
    <button
      type="button"
      disabled={disabled}
      onClick={toggle}
      aria-label={t(listening ? "Stop dictation" : "Start dictation")}
      aria-pressed={listening}
      title={t(listening ? "Stop dictation" : "Start dictation")}
      className={`grid h-10 w-10 place-items-center rounded-full transition gc-disabled-control ${listening ? "bg-red-600 text-white ring-4 ring-red-100" : "text-text-primary hover:bg-subtle"}`}
    >
      <Mic size={19} aria-hidden />
    </button>
    {notice ? <p role="status" aria-label={t("Dictation status")} className="absolute bottom-full right-0 z-10 mb-3 w-64 max-w-[75vw] rounded-xl border border-border bg-white p-3 text-xs font-medium leading-5 text-text-primary shadow-lg">{t(notice)}</p> : null}
  </div>;
}
