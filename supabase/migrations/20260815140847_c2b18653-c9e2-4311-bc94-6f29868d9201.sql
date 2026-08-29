ALTER TABLE public.parts ADD COLUMN IF NOT EXISTS supplier_url text;
COMMENT ON COLUMN public.parts.supplier_url IS 'Harici tedarikçi ürün sayfası URL (external_product_url)';