/**
 * OnlineParça OEM arama — TEK ORTAK SERVİS.
 *
 * Hem admin teknik testi hem de müşteri arama ekranı (/parts?q=OEM) yalnızca
 * bu fonksiyonu kullanır. Farklı endpoint, farklı parser veya OEM'e özel
 * hard-code davranış YOKTUR.
 */
import {
  runOnlineParcaPipeline,
  type PipelineResult,
} from "@/lib/onlineparca-pipeline.server";

export interface OnlineParcaDiagnostics {
  oem: string;
  normalizedOem: string;
  searchUrl: string | null;
  searchHttpStatus: number | null;
  resultCount: number;
  productId: string | null;
  productCode: string | null;
  detailUrl: string | null;
  detailHttpStatus: number | null;
  productName: string | null;
  brand: string | null;
  stockStatus: string;
  stockQuantity: number | null;
  supplierPrice: number | null;
  errorCode: string | null;
  finalStatus: "SUCCESS" | "PARTIAL" | "NOT_FOUND" | "ERROR";
}

function num(info: string | null, key: string): number | null {
  const m = info ? new RegExp(`${key}=(\\d+)`).exec(info) : null;
  return m ? Number(m[1]) : null;
}

export function buildDiagnostics(run: PipelineResult): OnlineParcaDiagnostics {
  const step = (name: string) => run.steps.find((s) => s.step === name) ?? null;
  const search = step("1_SEARCH");
  const parse = step("2_SEARCH_PARSE");
  const detail = step("4_DETAIL_REQUEST");

  const finalStatus: OnlineParcaDiagnostics["finalStatus"] = run.product
    ? run.errorCode
      ? "PARTIAL"
      : "SUCCESS"
    : run.errorCode
      ? "ERROR"
      : "NOT_FOUND";

  return {
    oem: run.oem,
    normalizedOem: run.normalizedOem,
    searchUrl: search?.url ?? null,
    searchHttpStatus: search?.httpStatus ?? null,
    resultCount: num(parse?.info ?? null, "RESULT_COUNT") ?? run.candidates.length,
    productId: run.product?.external_product_id ?? null,
    productCode: run.product?.product_code ?? null,
    detailUrl: detail?.url ?? run.product?.external_product_url ?? null,
    detailHttpStatus: detail?.httpStatus ?? null,
    productName: run.product?.product_name ?? null,
    brand: run.product?.brand ?? null,
    stockStatus: run.product?.stock_status ?? "unknown",
    stockQuantity: run.product?.stock_quantity ?? null,
    supplierPrice: run.product?.list_price ?? null,
    errorCode: run.errorCode,
    finalStatus,
  };
}

/**
 * Ortak OEM arama servisi. Sonuç yoksa uydurma ürün üretmez; `product` null döner.
 */
export async function searchOnlineParcaByOem(
  oem: string,
  opts: { save?: boolean; supplierId?: string } = {},
): Promise<{ run: PipelineResult; diagnostics: OnlineParcaDiagnostics }> {
  const run = await runOnlineParcaPipeline({
    oem,
    save: opts.save ?? false,
    ...(opts.supplierId ? { supplierId: opts.supplierId } : {}),
  });
  const diagnostics = buildDiagnostics(run);
  // Şifre/cookie loglanmaz; yalnızca teşhis alanları.
  console.info("[onlineparca][oem-search]", JSON.stringify(diagnostics));
  return { run, diagnostics };
}
