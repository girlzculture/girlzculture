"use client";
import { useEffect } from "react";
export default function PwaRegistration(){
  useEffect(()=>{
    // Registering the production service worker while Next.js is serving
    // development chunks leaves local browser verification pinned to stale
    // bundles. Production remains installable; development stays refresh-safe.
    if (process.env.NODE_ENV !== "production") {
      if ("serviceWorker" in navigator) {
        void navigator.serviceWorker
          .getRegistrations()
          .then((registrations) =>
            Promise.all(
              registrations.map((registration) => registration.unregister()),
            ),
          )
          .catch(() => undefined);
      }
      return;
    }
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker
      .register("/sw.js", { updateViaCache: "none" })
      .then((registration) => registration.update())
      .catch(()=>undefined);
  },[]);
  return null;
}
