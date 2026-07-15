"use client";

import { useState } from "react";
import { StyleAutocomplete } from "@/components/search/AutocompleteInputs";

export default function HeaderStyleSearch() {
  const [style, setStyle] = useState("");
  return <form action="/salons" className="w-[128px] rounded-xl border border-plum/10 bg-white/75 px-2 min-[390px]:w-[155px] md:hidden"><StyleAutocomplete value={style} onChange={setStyle} placeholder="Search style" className="[&_span]:min-h-10 [&_svg]:h-4 [&_svg]:w-4"/></form>;
}
