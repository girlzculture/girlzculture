"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronDown, LifeBuoy, Search } from "lucide-react";
import type { ContentSection } from "@/lib/content";

function parse(sections: ContentSection[]) {
  return sections.flatMap((section) => String(section.body || "").split("\n").map((line) => {
    const [question, ...answer] = line.split("::");
    return { category: section.title || "General", question: question.trim(), answer: answer.join("::").trim() };
  }).filter((item) => item.question && item.answer));
}

export default function HelpCenter({ sections }: { sections: ContentSection[] }) {
  const [query, setQuery] = useState("");
  const faqs = useMemo(() => parse(sections), [sections]);
  const categories = [...new Set(faqs.map((faq) => faq.category))];
  const filtered = faqs.filter((faq) => `${faq.category} ${faq.question} ${faq.answer}`.toLowerCase().includes(query.trim().toLowerCase()));
  return <div className="mx-auto w-full max-w-[1200px] px-5 py-10 sm:px-8 lg:py-14">
    <label className="mx-auto flex max-w-2xl items-center gap-3 rounded-2xl border border-plum/10 bg-white px-5 py-4 shadow-[0_10px_35px_rgba(26,18,32,.07)]"><Search className="text-magenta" size={21}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search questions and answers" className="min-w-0 flex-1 bg-transparent text-sm outline-none" /></label>
    <div className="mt-10 space-y-8">{categories.map((category) => { const rows = filtered.filter((faq) => faq.category === category); return rows.length ? <section key={category}><h2 className="font-serif text-3xl text-plum">{category}</h2><div className="mt-4 space-y-3">{rows.map((faq) => <details key={faq.question} className="group rounded-2xl border border-plum/10 bg-white p-5"><summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold text-ink [&::-webkit-details-marker]:hidden">{faq.question}<ChevronDown className="shrink-0 text-magenta transition group-open:rotate-180" size={19}/></summary><p className="mt-4 border-t border-plum/10 pt-4 text-sm leading-7 text-ink/65">{faq.answer}</p></details>)}</div></section> : null; })}</div>
    {!filtered.length ? <p className="mt-10 rounded-2xl bg-blush/35 p-8 text-center text-ink/65">No matching answer found. Our support team can help.</p> : null}
    <section className="mt-12 flex flex-col items-center rounded-3xl bg-[linear-gradient(120deg,#32123b,#5b1a6b)] px-6 py-10 text-center text-white"><LifeBuoy size={32} className="text-amber"/><h2 className="mt-3 font-serif text-3xl">Still need help?</h2><p className="mt-2 text-sm text-white/70">Send our support team a message and we’ll route it to the right person.</p><Link href="/contact" className="mt-5 rounded-lg bg-magenta px-7 py-3 text-sm font-bold text-white">Contact us</Link></section>
  </div>;
}
