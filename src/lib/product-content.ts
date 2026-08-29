// Ürün verisinden benzersiz, bölümlere ayrılmış otomatik açıklama üretir.
// Şablon tekrarını azaltmak için ID-tabanlı varyant seçimi yapılır.

export interface AutoDescInput {
  id: string;
  title: string;
  brand?: string | null;
  model?: string | null;
  year?: number | null;
  category?: string | null;
  oem_code?: string | null;
  oem_codes?: string[] | null;
  engine_code?: string | null;
  condition?: string | null;
}

function pick<T>(seed: string, arr: T[]): T {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return arr[Math.abs(h) % arr.length];
}

export function buildAutoDescription(p: AutoDescInput): string {
  const oem = p.oem_code || (Array.isArray(p.oem_codes) ? p.oem_codes.find(Boolean) ?? null : null);
  const vehicle = [p.brand, p.model, p.year].filter(Boolean).join(" ");
  const cat = p.category ?? "yedek parça";
  const seed = p.id;

  const intro = pick(seed + "i", [
    `${p.title}, ${vehicle || "ilgili araçlar"} için doğrudan kullanıma uygun bir ${cat}.`,
    `${vehicle ? `${vehicle} araçlarında kullanılan ` : ""}${p.title}, OEM standartlarına uygun olarak sunulmaktadır.`,
    `Taşıtsan üzerinden listelenen ${p.title}${vehicle ? ` ${vehicle}` : ""} aracınız için tercih edilebilecek bir ${cat} alternatifidir.`,
  ]);

  const oemBlock = oem
    ? pick(seed + "o", [
        `**OEM numarası:** ${oem}. Bu kod parça orijinalliğinin doğrulanmasında kullanılır ve satın almadan önce aracınızdaki numara ile karşılaştırılması önerilir.`,
        `**OEM kodu:** ${oem}. Üretici tarafından tanımlanan bu numara, aracınızla uyumun en güvenilir göstergesidir.`,
      ])
    : "";

  const useCase = pick(seed + "u", [
    `Kullanım amacı; ilgili sistemin sorunsuz çalışmasını sağlamak ve fabrika spesifikasyonlarını korumaktır.`,
    `Doğru parça seçimi aracınızın performansını ve uzun ömürlülüğünü doğrudan etkiler.`,
  ]);

  const techSpecs = [
    p.brand && `Marka uyumu: **${p.brand}**`,
    p.model && `Model: **${p.model}**`,
    p.year && `Üretim yılı: **${p.year}**`,
    p.engine_code && `Motor kodu: **${p.engine_code}**`,
    p.category && `Kategori: **${p.category}**`,
  ].filter(Boolean) as string[];

  const install = pick(seed + "m", [
    `Montaj sırasında üretici tork değerlerine uyulması ve çevre contaların kontrol edilmesi önerilir.`,
    `Parça değişimi sırasında bağlantı yüzeylerinin temizlenmesi ve kaçak testi yapılması ürün ömrünü uzatır.`,
  ]);

  const buyHint = pick(seed + "b", [
    `Sipariş öncesinde aracınızın şase numarası ile satıcıdan uyum teyidi almanızı öneririz.`,
    `Doğru parça için satıcı ile şase numarası paylaşarak teyitleşmek hatalı sevkiyatı önler.`,
  ]);

  return [
    intro,
    oemBlock,
    `**Kullanım amacı:** ${useCase}`,
    techSpecs.length > 0 ? `**Teknik özellikler:** ${techSpecs.join(" • ")}` : "",
    `**Montaj notları:** ${install}`,
    `**Satın alma önerisi:** ${buyHint}`,
  ].filter(Boolean).join("\n\n");
}
