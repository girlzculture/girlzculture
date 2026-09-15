"use client";

import { createContext, useContext } from "react";

const SiteAccessContext = createContext(false);

export default function SiteAccessProvider({
  active,
  children,
}: {
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <SiteAccessContext.Provider value={active}>
      {children}
    </SiteAccessContext.Provider>
  );
}

export function useSiteAccess() {
  return useContext(SiteAccessContext);
}
