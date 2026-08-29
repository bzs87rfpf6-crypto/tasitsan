import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type SignupFunnelStats = {
  days: number;
  view: number;
  start: number;
  submit: number;
  success: number;
  error: number;
  new_users: number;
  conversion_rate: number;
  submit_success_rate: number;
  top_errors: { error_code: string; count: number }[];
};

export const getSignupFunnelStats = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ days: z.number().int().min(1).max(90).default(7) }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const { data: res, error } = await context.supabase.rpc("signup_funnel_stats" as never, {
      _days: data.days,
    } as never);
    if (error) throw new Error(error.message);
    return res as unknown as SignupFunnelStats;
  });
