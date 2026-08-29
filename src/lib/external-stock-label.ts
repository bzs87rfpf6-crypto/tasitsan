/**
 * Harici (OnlineParça) stok durumunun müşteriye gösterilecek etiketi.
 *
 * Kural: "Lütfen stok sorunuz" YALNIZCA kaynak site bu bilgiyi kesin verdiyse
 * gösterilir. Doğrulanamayan (UNVERIFIED) durumda yanıltıcı etiket yazılmaz;
 * arayüz bunun yerine kısa bir "kontrol ediliyor" durumu gösterir.
 */
export type ExternalStockLike = "IN_STOCK" | "OUT_OF_STOCK" | "ASK" | "UNVERIFIED" | string;

export function externalStockLabel(status: ExternalStockLike | null | undefined): string | null {
  switch (status) {
    case "IN_STOCK":
      return null; // stok adedi gösterilir
    case "ASK":
      return "Lütfen stok sorunuz";
    case "OUT_OF_STOCK":
      return "Tedarike bağlı";
    default:
      return null; // UNVERIFIED → etiket yok
  }
}
