/**
 * AKILLI OEM FALLBACK — yalnızca Taşıtsan'da sonuç bulunamadığında devreye girer.
 *
 * Akış: analiz → OEM sözlüğü (oem_reference) → araştırma cache → AI OEM araştırması
 *        → doğrulanmış OEM → MEVCUT OnlineParça pipeline'ı (değiştirilmedi)
 *
 * Kullanıcıya tedarikçi adı / kaynak URL / stok kodu ASLA dönmez.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export interface SmartOemPublicResult {
  title: string;
  brand: string | null;
  oem: string;
  price: number | null;
  photo: string | null;
  stock_status: string;
  stock_quantity: number | null;
  /** Müşteriye gösterilecek nötr ifade. */
  availability_label: string;
}

export interface SmartOemResponse {
  enabled: boolean;
  result: SmartOemPublicResult | null;
  /** Nötr durum mesajı (teknik süreç gösterilmez). */
  message: string | null;
}

export const smartOemSearch = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ query: z.string().trim().min(3).max(200) }).parse(d))
  .handler(async ({ data }): Promise<SmartOemResponse> => {
    const { runSmartOemSearch } = await import("./smart-oem.server");
    try {
      return await runSmartOemSearch(data.query);
    } catch (err) {
      console.warn("[smart-oem] failed", err);
      return { enabled: true, result: null, message: null };
    }
  });
