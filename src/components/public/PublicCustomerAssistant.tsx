"use client";

import {useRef, useState} from "react";
import {Sparkles, X} from "lucide-react";
import BeautyConcierge from "./BeautyConcierge";

/** Public-only tools. Opening this panel never loads an owner workspace. */
export default function PublicCustomerAssistant() {
  const dialog = useRef<HTMLDialogElement>(null);
  const launcher = useRef<HTMLButtonElement>(null);
  const [started, setStarted] = useState(false);
  return <>
    <button ref={launcher} type="button" onClick={() => {setStarted(true); dialog.current?.showModal();}} className="gc-public-assistant-launcher fixed bottom-[calc(6rem+env(safe-area-inset-bottom))] right-4 z-40 flex min-h-12 items-center gap-2 rounded-full bg-primary-hover px-4 font-semibold text-white shadow-lg md:bottom-6"><Sparkles size={18} aria-hidden="true"/>GC AI Assistant</button>
    <dialog ref={dialog} onClose={() => launcher.current?.focus()} aria-label="Customer AI assistant" className="gc-dashboard fixed inset-auto bottom-0 right-0 m-0 h-[90dvh] w-full max-w-2xl overflow-y-auto rounded-t-2xl border border-border bg-white p-3 text-text-primary shadow-2xl backdrop:bg-black/40 sm:bottom-4 sm:right-4 sm:w-[calc(100%-2rem)] sm:rounded-2xl">
      <div className="sticky top-0 z-10 flex justify-end bg-white pb-2"><button type="button" aria-label="Close customer assistant" onClick={() => dialog.current?.close()} className="grid h-11 w-11 place-items-center rounded-full border"><X aria-hidden="true" size={20}/></button></div>
      {started ? <BeautyConcierge/> : null}
    </dialog>
  </>;
}
