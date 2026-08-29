// SEO Growth 2.0 — OEM landing sayfası için 300-800 kelime benzersiz içerik üretici.
// Deterministik: aynı girdi her zaman aynı çıktıyı üretir.

export interface OemLandingInput {
  oem: string;
  vehicles: Array<{ brand: string | null; model: string | null; year: number | null }>;
  engineCodes: string[];
  supplierBrands: string[];
  categories: string[];
  equivalents: string[];
  total: number;
}

function uniq<T>(arr: T[]): T[] { return Array.from(new Set(arr.filter(Boolean))); }

function vehicleList(vs: OemLandingInput["vehicles"], max = 8): string[] {
  return uniq(vs.map((v) => [v.brand, v.model].filter(Boolean).join(" "))).slice(0, max);
}

export interface OemSection { id: string; heading: string; body: string }

export function buildOemLandingSections(d: OemLandingInput): OemSection[] {
  const oem = d.oem;
  const vehicles = vehicleList(d.vehicles, 8);
  const vehiclesStr = vehicles.length ? vehicles.join(", ") : "birden fazla araç modeli";
  const cat = d.categories[0] ?? "yedek parça";
  const brands = d.supplierBrands.slice(0, 6);
  const engines = d.engineCodes.slice(0, 6);
  const eqs = d.equivalents.slice(0, 10);

  const sections: OemSection[] = [
    {
      id: "tanitim",
      heading: `${oem} OEM Numarası Nedir?`,
      body:
        `**${oem}** OEM numarası, otomotiv üreticilerinin orijinal yedek parça tanımlama sistemine ait benzersiz bir koddur. ` +
        `Bu numara, ${cat.toLowerCase()} kategorisindeki bir parçayı temsil eder ve ${vehiclesStr} modellerinde kullanılmaktadır. ` +
        `OEM (Original Equipment Manufacturer) kodları, parçanın orijinal üretici tarafından belirlenen teknik özelliklere uygun olduğunu garanti eder. ` +
        `Taşıtsan Parça Borsası'nda ${oem} numaralı parçaları doğrulanmış satıcılardan güvenle bulabilirsiniz.`,
    },
    {
      id: "uyumlu-araclar",
      heading: `${oem} Hangi Araçlarda Kullanılır?`,
      body: vehicles.length
        ? `${oem} OEM kodu aşağıdaki araç modellerinde orijinal olarak kullanılmaktadır:\n\n` +
          vehicles.map((v) => `- ${v}`).join("\n") +
          `\n\nUyumluluk her zaman araç şasi numarası ve üretim yılı ile teyit edilmelidir. ` +
          `Aynı modelin farklı donanım seviyelerinde farklı parça numaraları kullanılabilir; satıcıyla iletişime geçerek doğrulamanızı öneririz.`
        : `${oem} OEM kodu birden fazla araç modelinde kullanılabilir. Tam uyumluluk için araç şasi numaranızı satıcıya iletmenizi öneririz.`,
    },
    ...(engines.length
      ? [{
          id: "motor-kodlari",
          heading: `Uyumlu Motor Kodları`,
          body:
            `${oem} parçası aşağıdaki motor kodları ile uyumlu çalışmaktadır: **${engines.join(", ")}**. ` +
            `Motor kodu, aracınızın motor bloğunda veya ruhsatta yer alır ve doğru parça seçimi için kritik öneme sahiptir.`,
        }]
      : []),
    ...(eqs.length
      ? [{
          id: "esdeger-kodlar",
          heading: `${oem} Eşdeğer OEM Kodları`,
          body:
            `${oem} numarasının eşdeğer (cross-reference) kodları:\n\n` +
            eqs.map((e) => `- ${e}`).join("\n") +
            `\n\nBu kodlar farklı üretici veya pazarlarda aynı parçayı temsil eder. ` +
            `Satın alma sırasında eşdeğer kodlardan biri ile karşılaşırsanız parçanın uyumlu olduğunu varsayabilirsiniz.`,
        }]
      : []),
    ...(brands.length
      ? [{
          id: "muadil-markalar",
          heading: `Muadil Üretici Markalar`,
          body:
            `${oem} parçası için Taşıtsan platformunda aktif satıcılarımızın sunduğu üretici markalar: **${brands.join(", ")}**. ` +
            `Orijinal üretici markaları (OEM), satış sonrası muadil markalar (aftermarket) ve yenilenmiş (refurbished) seçenekleri karşılaştırarak bütçenize uygun parçayı seçebilirsiniz.`,
        }]
      : []),
    {
      id: "satin-alma",
      heading: `${oem} Parçasını Nereden Satın Alabilirim?`,
      body:
        `Taşıtsan Parça Borsası, ${oem} OEM kodlu parçayı satan doğrulanmış satıcıları tek bir platformda buluşturur. ` +
        `Şu an aktif **${d.total}** ilan bulunmaktadır. Satıcılarla WhatsApp veya telefonla doğrudan iletişime geçebilir, fiyat karşılaştırması yapabilir ve teslimat seçeneklerini değerlendirebilirsiniz. ` +
        `Tüm satıcılar Taşıtsan ekibi tarafından kimlik ve işletme kontrolünden geçirilir.`,
    },
    {
      id: "degisim-notlari",
      heading: `${oem} Değişim ve Bakım Notları`,
      body:
        `${oem} parçası değişimi yetkili bir servis veya tecrübeli usta tarafından yapılmalıdır. ` +
        `Parça takılırken aracın elektrik bağlantısı kesilmeli, eski parça dikkatli sökülmeli ve yeni parça üretici talimatlarına uygun şekilde monte edilmelidir. ` +
        `Değişim sonrası araç kısa bir test sürüşü ile kontrol edilmeli; arıza ışığı yanıyorsa OBD-II tarayıcı ile hata kodları okunmalıdır. ` +
        `Garanti süresi ve faturalandırma için satıcı ile iletişime geçmeyi unutmayın.`,
    },
  ];

  return sections;
}

export function buildOemFaq(d: OemLandingInput): Array<{ q: string; a: string }> {
  const oem = d.oem;
  const vehicles = vehicleList(d.vehicles, 5);
  return [
    {
      q: `${oem} OEM numarası hangi araçlarda kullanılır?`,
      a: vehicles.length
        ? `${oem} OEM numarası ${vehicles.join(", ")} modellerinde orijinal olarak kullanılır. Tam uyumluluk için satıcıyla şasi numarası üzerinden teyit edin.`
        : `${oem} kodu birden fazla araç modelinde kullanılabilir. Tam uyumluluk için satıcıyla şasi numarası üzerinden teyit edin.`,
    },
    {
      q: `${oem} OEM numarasının eşdeğeri var mı?`,
      a: d.equivalents.length
        ? `Evet, eşdeğer OEM kodları: ${d.equivalents.slice(0, 6).join(", ")}.`
        : `Bu OEM için eşdeğer kodlar Taşıtsan veritabanında sürekli güncellenmektedir.`,
    },
    {
      q: `${oem} parçası orijinal mi olmalı, muadil mi?`,
      a: `Garanti süresi devam eden araçlarda orijinal (OEM) parça önerilir. Garanti dışı araçlarda kaliteli muadil markalar (${d.supplierBrands.slice(0, 3).join(", ") || "OEM eşdeğer üreticiler"}) uygun bir alternatif olabilir.`,
    },
    {
      q: `${oem} parçasını nereden satın alabilirim?`,
      a: `Taşıtsan Parça Borsası'nda ${d.total} aktif ilan bulunmaktadır. Doğrulanmış satıcılarla WhatsApp veya telefonla doğrudan iletişime geçebilirsiniz.`,
    },
    {
      q: `${oem} parçasının ortalama fiyatı nedir?`,
      a: `${oem} parçasının fiyatı durumuna (sıfır, ikinci el, yenilenmiş) ve satıcıya göre değişir. İlan listesinden güncel fiyatları görebilir, satıcılara teklif sunabilirsiniz.`,
    },
  ];
}
