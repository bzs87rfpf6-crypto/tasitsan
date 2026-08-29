import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { hasAdminAccess } from "@/lib/admin-access";
import { setStaffSession } from "@/lib/analytics";


/**
 * Gerçek admin rolünü user_roles üzerinden doğrular (RLS geçerli).
 * Yalnızca UI görünürlüğü içindir; her yetkili işlem sunucu tarafında
 * ayrıca has_role ile kontrol edilmeye devam eder.
 */
export function useIsAdmin(): { isAdmin: boolean; checking: boolean } {
  const { user, loading } = useAuth();
  const [isAdmin, setIsAdmin] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let cancelled = false;
    if (loading) return;
    if (!user) {
      setIsAdmin(false);
      setStaffSession(false);
      setChecking(false);
      return;
    }
    setChecking(true);
    hasAdminAccess(user.id)
      .then((allowed) => {
        if (cancelled) return;
        setIsAdmin(allowed);
        setStaffSession(allowed);
      })
      .catch(() => {
        if (cancelled) return;
        setIsAdmin(false);
      })

      .finally(() => {
        if (cancelled) return;
        setChecking(false);
      });
    return () => { cancelled = true; };
  }, [user, loading]);

  return { isAdmin, checking };
}
