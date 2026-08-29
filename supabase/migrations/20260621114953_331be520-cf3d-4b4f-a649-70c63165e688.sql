-- Boş OEM görsel cache kayıtlarına 10 gün TTL ata.
-- Hepsi aynı anda yenilenmesin diye expires_at'i 10 günlük pencereye eşit dağıt.
UPDATE public.oem_research_cache
SET expires_at = now() + (random() * interval '10 days')
WHERE cache_key LIKE 'oem:img:%'
  AND jsonb_array_length(COALESCE(result->'images','[]'::jsonb)) = 0
  AND (expires_at IS NULL OR expires_at > now() + interval '10 days');