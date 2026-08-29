-- Fix: translate Turkish chars BEFORE lower() so İ → I → i (not i + U+0307)
CREATE OR REPLACE FUNCTION public.tr_lower_ascii(_t text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $function$
  SELECT lower(translate(coalesce(_t,''),
    'çÇğĞıİöÖşŞüÜâÂîÎûÛ',
    'ccggiioossuuaaiiuu'))
$function$;

-- Backfill all search_doc values using the corrected normalizer
UPDATE public.parts
SET search_doc = public.tr_lower_ascii(
  coalesce(title,'') || ' ' ||
  coalesce(brand,'') || ' ' ||
  coalesce(model,'') || ' ' ||
  coalesce(description,'') || ' ' ||
  coalesce(array_to_string(oem_codes,' '),'')
);