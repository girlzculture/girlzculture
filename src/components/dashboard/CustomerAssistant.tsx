"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { Sparkles, X } from "lucide-react";
import BeautyConcierge from "@/components/public/BeautyConcierge";

export default function CustomerAssistant({ upcomingCount }: { upcomingCount: number }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const launcher = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  return <><button ref={launcher} onClick={() => { setOpen(true); dialog.current?.showModal(); }} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary-hover px-4 font-semibold text-white"><Sparkles size={18}/>GC Assistant</button>
    <dialog ref={dialog} onClose={() => { setOpen(false); launcher.current?.focus(); }} aria-label="Customer GC Assistant" className="gc-dashboard fixed inset-auto bottom-0 right-0 m-0 h-[92dvh] w-full max-w-2xl overflow-y-auto rounded-t-2xl border border-border bg-white p-4 shadow-2xl backdrop:bg-black/40 sm:bottom-4 sm:right-4 sm:rounded-2xl">
      <header className="mb-3 flex items-center justify-between"><h2 className="text-xl">Your beauty assistant</h2><button aria-label="Close customer assistant" onClick={() => dialog.current?.close()} className="grid h-11 w-11 place-items-center rounded-full border"><X size={20}/></button></header>
      {open ? <><p className="mb-4 rounded-xl bg-subtle p-4 text-sm">Your account has {upcomingCount} upcoming appointment{upcomingCount === 1 ? "" : "s"} in the loaded records. <Link href="/account?tab=upcoming" onClick={() => dialog.current?.close()} className="font-bold underline">Open bookings</Link> or <Link href="/account?tab=inbox" onClick={() => dialog.current?.close()} className="font-bold underline">message a business</Link>.</p><BeautyConcierge/></> : null}
    </dialog>
  </>;
}
