"use client";
import { useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/LocaleProvider";
import { getSessionForScope, type AuthScope } from "@/lib/supabase";

type MessageDisplayProps = { messageId: string; bookingId: string; original: string; scope: AuthScope; autoTranslate?: boolean };
export default function MessageDisplay(props: MessageDisplayProps) {
  const { locale } = useI18n();
  // A translation, manual retry and Show original choice belong to this exact
  // message and recipient locale; none may be reused for a different message.
  return <TranslatedMessage key={JSON.stringify([props.scope, props.bookingId, props.messageId, props.original, locale])} {...props}/>;
}

function TranslatedMessage({ messageId, bookingId, original, scope, autoTranslate = true }: MessageDisplayProps) {
  const { locale, translateSource: t } = useI18n();
  const [translation, setTranslation] = useState<{ locale: string; text: string; reviewed: boolean } | null>(null);
  const [showOriginal, setShowOriginal] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!autoTranslate && attempt === 0) return;
    const controller = new AbortController();
    void (async () => {
      try {
        const session = await getSessionForScope(scope); if (!session || controller.signal.aborted) return;
        const response = await fetch("/api/messages", { method: "POST", headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" }, body: JSON.stringify({ action: "translate_display", booking_id: bookingId, message_id: messageId, locale }), signal: controller.signal });
        const result = await response.json(); if (controller.signal.aborted) return;
        if (!response.ok || !result.translation?.translated_body) { setUnavailable(true); return; }
        setTranslation({ locale, text: result.translation.translated_body, reviewed: result.translation.reviewed === true }); setUnavailable(false);
      } catch { if (!controller.signal.aborted) setUnavailable(true); }
    })();
    return () => controller.abort();
  }, [locale, messageId, bookingId, scope, attempt, autoTranslate]);
  const current = translation?.locale === locale && translation.text !== original ? translation : null;
  return <div><p data-no-translate className="whitespace-pre-wrap break-words">{current && !showOriginal ? current.text : original}</p>{current ? <div className="mt-2 flex flex-wrap items-center gap-2 text-xs"><span>{t(current.reviewed ? "Reviewed translation" : "Automatic translation")}</span><button type="button" onClick={() => setShowOriginal(!showOriginal)} className="min-h-11 underline">{t(showOriginal ? "Show translation" : "Show original")}</button></div> : <div className="mt-2 text-xs">{unavailable ? <span>{t("Translation unavailable. Showing the original message.")}</span> : null}{!autoTranslate && attempt === 0 ? <button type="button" onClick={() => setAttempt(1)} className="min-h-11 underline">{t("Translate for me")}</button> : null}</div>}</div>;
}
