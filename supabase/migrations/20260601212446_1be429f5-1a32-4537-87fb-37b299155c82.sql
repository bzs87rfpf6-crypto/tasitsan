UPDATE public.parts
SET photos = ARRAY(
  SELECT p FROM unnest(photos) AS p
  WHERE p !~* '\.(heic|heif|dng|raw|cr2|cr3|nef|arw|orf|rw2|tif|tiff)(\?|$)'
)
WHERE photos::text ~* '\.(heic|heif|dng|raw|cr2|cr3|nef|arw|orf|rw2|tif|tiff)';