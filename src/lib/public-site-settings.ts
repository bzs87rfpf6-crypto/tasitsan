import { supabase } from "@/integrations/supabase/client";

export interface PublicSiteSettings {
  contact_phone?: string | null;
  ga4_measurement_id?: string | null;
  [key: string]: unknown;
}

let cachedSettings: PublicSiteSettings | null = null;
let pendingSettings: Promise<PublicSiteSettings> | null = null;

export function getPublicSiteSettings(): Promise<PublicSiteSettings> {
  if (cachedSettings) return Promise.resolve(cachedSettings);
  if (pendingSettings) return pendingSettings;

  pendingSettings = supabase
    .rpc("get_public_site_settings")
    .maybeSingle()
    .then(({ data, error }) => {
      if (error) throw error;
      cachedSettings = (data ?? {}) as PublicSiteSettings;
      return cachedSettings;
    })
    .finally(() => {
      pendingSettings = null;
    });

  return pendingSettings;
}
