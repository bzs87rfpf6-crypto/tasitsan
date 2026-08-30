// Ana sayfa public RPC çağrıları için dayanıklı sarmalayıcı.
// Önce tarayıcı Supabase istemcisi denenir (Lovable Cloud'daki mevcut davranış),
// başarısız olursa sunucu tarafı publishable-key fallback'i devreye girer.
import { callPublicHomeRpc } from "@/lib/home-public.functions";

type Args = { _vehicle_class?: string; _limit?: number; _offset?: number };

export async function homePublicRpc<T = unknown>(
  name: "platform_stats" | "home_new_feed" | "home_activity_feed",
  args: Args = {},
): Promise<T | null> {
  try {
    const { supabase } = await import("@/integrations/supabase/client");
    const { data, error } = await (supabase as any).rpc(name, args);
    if (!error && data != null) return data as T;
  } catch {
    // yoksay — sunucu fallback'ine düş
  }
  try {
    const res = await callPublicHomeRpc({ data: { name, args } });
    return res?.json ? (JSON.parse(res.json) as T) : null;
  } catch {
    return null;
  }
}
