"use client";

import React from "react";

type StylistRecord = {
  id?: string;
  name?: string | null;
  specialties?: string[] | null;
  bio?: string | null;
  avatar_url?: string | null;
};

export default function SalonStylists({ stylists }: { stylists: StylistRecord[] }) {
  if (!stylists || stylists.length === 0) {
    return <div className="rounded-lg border border-plum/10 bg-blush/40 p-4 text-sm text-ink/70">No stylists listed yet.</div>;
  }
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {stylists.map((st) => (
        <div key={st.id || st.name} className="rounded-lg border border-plum/10 bg-white p-4 shadow-sm">
          <div className="flex gap-4">
            <div className="h-16 w-16 flex-shrink-0 overflow-hidden rounded-full bg-cream">
              {st.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={st.avatar_url} alt={st.name || "stylist"} className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-plum">🙂</div>
              )}
            </div>

            <div className="flex flex-1 flex-col">
              <div className="flex items-center justify-between">
                <div className="font-semibold text-plum text-sm sm:text-base">{st.name}</div>
                <div className="text-sm text-ink/60">⭐</div>
              </div>

              <div className="mt-2 flex flex-wrap gap-2">
                {(st.specialties || []).slice(0, 4).map((sp, i) => (
                  <span key={i} className="rounded-full bg-cream/80 px-2 py-0.5 text-xs font-medium text-plum">
                    {sp}
                  </span>
                ))}
              </div>

              {st.bio ? <p className="mt-3 text-sm text-ink/80">{st.bio}</p> : null}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
