"use client";

import React, { useState } from "react";

type StyleRecord = {
  id?: string;
  name?: string | null;
  price_display_min?: number | null;
  price_display_max?: number | null;
  duration_min_hours?: number | null;
  duration_max_hours?: number | null;
  length_options?: any | null;
  size_options?: any | null;
  addons?: any | null;
};

export default function SalonStyles({ styles }: { styles: StyleRecord[] }) {
  const [openId, setOpenId] = useState<string | null>(null);

  function fmtPrice(min?: number | null, max?: number | null) {
    if (min == null && max == null) return "—";
    if (min != null && max != null) return `$${min} – $${max}`;
    return `$${min ?? max}`;
  }

  function fmtDuration(min?: number | null, max?: number | null) {
    if (min == null && max == null) return "—";
    if (min != null && max != null) return `${min}–${max} hrs`;
    return `${min ?? max} hrs`;
  }

  return (
    <div className="space-y-4">
      {styles.length === 0 ? (
        <div className="rounded-lg border border-plum/10 bg-blush/40 p-4 text-sm text-ink/70">No styles listed yet.</div>
      ) : (
        styles.map((s) => {
          const id = s.id || s.name || Math.random().toString(36).slice(2, 7);
          const isOpen = openId === id;
          return (
            <div key={id} className="overflow-hidden rounded-lg border border-plum/10 bg-white p-4 shadow-sm">
              <button
                onClick={() => setOpenId(isOpen ? null : id)}
                className="flex w-full items-center justify-between gap-4 text-left"
              >
                <div>
                  <div className="flex items-baseline gap-3">
                    <h4 className="font-serif text-base font-semibold text-plum">{s.name}</h4>
                    <span className="text-sm text-ink/60">{fmtDuration(s.duration_min_hours, s.duration_max_hours)}</span>
                  </div>
                  <div className="text-sm text-ink/70">{fmtPrice(s.price_display_min, s.price_display_max)}</div>
                </div>
                <div className="text-2xl text-ink/40">{isOpen ? "−" : "+"}</div>
              </button>

              {isOpen ? (
                <div className="mt-3 border-t pt-3 text-sm text-ink/80">
                  {s.length_options && (
                    <div className="mb-3">
                          <div className="font-semibold text-plum">Length</div>
                          <ul className="mt-2 space-y-2">
                        {Array.isArray(s.length_options)
                          ? s.length_options.map((lo: any, i: number) => (
                                  <li key={i} className="flex justify-between py-1">
                                    <span className="text-sm">{lo.label || lo.name || lo}</span>
                                    <span className="text-sm text-ink/70">{lo.price ? `$${lo.price}` : ""}</span>
                                  </li>
                            ))
                          : Object.entries(s.length_options).map(([k, v]: any) => (
                                  <li key={k} className="flex justify-between py-1">
                                    <span className="text-sm">{k}</span>
                                    <span className="text-sm text-ink/70">{v?.price ? `$${v.price}` : ""}</span>
                                  </li>
                            ))}
                      </ul>
                    </div>
                  )}

                  {s.size_options && (
                    <div className="mb-3">
                      <div className="font-semibold text-plum">Size</div>
                      <ul className="mt-2 space-y-2">
                        {Array.isArray(s.size_options)
                          ? s.size_options.map((so: any, i: number) => (
                              <li key={i} className="flex justify-between py-1">
                                <span className="text-sm">{so.label || so.name || so}</span>
                                <span className="text-sm text-ink/70">{so.price ? `$${so.price}` : ""}</span>
                              </li>
                            ))
                          : Object.entries(s.size_options).map(([k, v]: any) => (
                              <li key={k} className="flex justify-between py-1">
                                <span className="text-sm">{k}</span>
                                <span className="text-sm text-ink/70">{v?.price ? `$${v.price}` : ""}</span>
                              </li>
                            ))}
                      </ul>
                    </div>
                  )}

                  {s.addons && (
                    <div>
                      <div className="font-semibold text-plum">Add-ons</div>
                      <ul className="mt-2 space-y-2">
                        {Array.isArray(s.addons)
                          ? s.addons.map((a: any, i: number) => (
                              <li key={i} className="flex justify-between py-1">
                                <span className="text-sm">{a.label || a.name || a}</span>
                                <span className="text-sm text-ink/70">{a.price ? `$${a.price}` : ""}</span>
                              </li>
                            ))
                          : Object.entries(s.addons).map(([k, v]: any) => (
                              <li key={k} className="flex justify-between py-1">
                                <span className="text-sm">{k}</span>
                                <span className="text-sm text-ink/70">{v?.price ? `$${v.price}` : ""}</span>
                              </li>
                            ))}
                      </ul>
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          );
        })
      )}
    </div>
  );
}
