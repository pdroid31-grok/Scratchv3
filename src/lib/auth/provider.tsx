"use client";

import { useEffect, type ReactNode } from "react";
import { authClient, authEnabled, rememberBearerToken } from "./client";

/**
 * App-wide client provider mounted once near the root (in `src/routes/__root.tsx`):
 *
 *   <AuthProvider><Outlet /></AuthProvider>
 *
 * Better Auth's React client (`@/lib/auth/client`) needs NO context provider —
 * its `useSession()` works standalone. We still mount this so a live session
 * token can be remembered across visits.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  return (
    <>
      {authEnabled ? <SessionPersist /> : null}
      {children}
    </>
  );
}

function SessionPersist() {
  const { data } = authClient.useSession();
  useEffect(() => {
    rememberBearerToken(data?.session?.token);
  }, [data?.session?.token]);
  return null;
}
