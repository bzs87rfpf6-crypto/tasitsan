import { describe, expect, it } from "vitest";
import {
  buildOemSearchVariants,
  parseOnlineParcaSearch,
} from "../src/lib/onlineparca-pipeline.server";

describe("OnlineParça search parser", () => {
  it("accepts a real product row without href", () => {
    const html = `
      <table class="product-list"><thead><tr><th>Stok Kodu</th><th>Liste Fiyatı</th><th>Size Özel Fiyat</th></tr></thead>
      <tbody><tr>
        <td class="product-picture"><img src="/images/thumbs/brake-pad.jpeg" alt="CHERY"></td>
        <td><div class="mobim-product-name"><a><h3>ON FREN BALATASI</h3></a></div></td>
        <td><div class="mobim-product-sku">T1E3501080</div></td>
        <td><span class="old-price">4.396,85 ₺</span></td>
        <td><span class="actual-price">3.957,17 ₺</span></td>
        <td><div class="mobim-stock-indicator"><div>Stokta var</div></div></td>
        <td><a href="/addproducttocart/catalog/98765/1/1">Sepete ekle</a></td>
      </tr></tbody></table>`;

    const rows = parseOnlineParcaSearch(html, "https://onlineparca.com/product/search?q=T1E3501080");

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      url: null,
      name: "ON FREN BALATASI",
      brand: "CHERY",
      sku: "T1E3501080",
      productId: "98765",
      listPrice: 4396.85,
      actualPrice: 3957.17,
      stock: "in_stock",
    });
  });

  it("does not parse table headings as products", () => {
    const html = `<table class="product-list"><thead><tr><th>Stok Kodu</th><th>Liste Fiyatı</th><th>Size Özel Fiyat</th></tr></thead></table>`;
    expect(parseOnlineParcaSearch(html, "https://onlineparca.com/search")).toEqual([]);
  });

  it("builds only controlled OEM spelling variants", () => {
    expect(buildOemSearchVariants("T1E3501080")).toEqual([
      "T1E3501080",
      "T1E350 1080",
      "T1E-3501080",
      "T1E-350-1080",
    ]);
  });
});