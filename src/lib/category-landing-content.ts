// SEO Growth 2.0 — Kategori sayfası içerik üreticisi (300+ kelime + FAQ).

export interface CategoryContentInput {
  category: string;
  total: number;
  brands: string[];
  popularOems: string[];
}

const DESCRIPTIONS: Record<string, string> = {
  "Motor":         "Motor parçaları aracın kalbi olan içten yanmalı motorun çalışmasını sağlayan tüm bileşenleri kapsar. Krank mili, piston, supap, silindir kapağı, conta takımı, eksantrik mili gibi birçok kritik parça bu kategoride yer alır.",
  "Şanzıman":      "Şanzıman parçaları, motor gücünü tekerleklere aktaran vites kutusu sistemi için gerekli yedek parçaları içerir. Otomatik ve manuel şanzıman dişlileri, debriyaj setleri, senkromeçler ve şanzıman yağ keçeleri en sık aranan parçalardır.",
  "Fren":          "Fren sistemi parçaları aracın güvenliği için en kritik kategorilerden biridir. Disk, balata, fren kaliperi, ABS sensörü, ana fren merkezi ve hidrolik hortumlar bu kategoride bulunur.",
  "Süspansiyon":   "Süspansiyon parçaları aracın yol tutuşunu ve sürüş konforunu sağlar. Amortisör, helezon yay, salıncak, rotil, rot başı ve denge çubuğu burcu en yaygın süspansiyon parçalarıdır.",
  "Elektrik":      "Elektrik sistemi parçaları aracın elektrik aksamını oluşturur. Alternatör, marş motoru, akü, sensörler, kablo demetleri, sigortalar ve aydınlatma elemanları bu kategoride yer alır.",
  "Kaporta":       "Kaporta parçaları aracın dış görünümünü oluşturan saç ve plastik bileşenlerdir. Çamurluk, kapı, kaput, tampon, ızgara, far yuvası ve eşik kaplaması en sık değişen kaporta parçalarıdır.",
  "Klima":         "Klima sistemi parçaları aracın iç mekan ısı kontrolünü sağlar. Klima kompresörü, kondenser, evaporatör, expansion valfi ve klima gazı dolum bağlantı parçaları bu kategoride yer alır.",
  "Yakıt Sistemi": "Yakıt sistemi parçaları motora yakıtın doğru basınçta ve miktarda iletilmesini sağlar. Enjektör, yakıt pompası, common rail, yakıt filtresi ve basınç regülatörü en kritik yakıt sistemi parçalarıdır.",
  "Aydınlatma":    "Aydınlatma parçaları aracın iç ve dış aydınlatma sistemini oluşturur. Far, stop, sinyal lambası, sis farı, iç tavan lambası ve LED dönüşüm kitleri bu kategoride yer alır.",
  "Marş Motoru":   "Marş motoru, içten yanmalı motoru ilk çalıştırma görevini üstlenen elektrik motorudur. Marş otomatiği, marş dişlisi, marş kömürü ve marş selenoidi en yaygın marş motoru yedek parçalarıdır.",
};

export function buildCategoryDescription(c: CategoryContentInput): string {
  const base = DESCRIPTIONS[c.category] ?? `${c.category} kategorisindeki yedek parça ilanları Taşıtsan Parça Borsası'nda listelenir.`;
  const brandsBit = c.brands.length
    ? ` Platformumuzda ${c.brands.slice(0, 6).join(", ")} gibi popüler markaların ${c.category.toLowerCase()} parçaları bulunmaktadır.`
    : "";
  const totalBit = c.total > 0
    ? ` Şu an aktif **${c.total}** ${c.category.toLowerCase()} ilanı listelenmektedir; tümü doğrulanmış satıcılardan teklif alınabilir.`
    : ` Bu kategoride şu anda aktif ilan bulunmuyor — Taşıtsan'da acil parça talebi oluşturarak satıcıların size dönmesini sağlayabilirsiniz.`;
  return base + brandsBit + totalBit;
}

export function buildCategoryFaq(c: CategoryContentInput): Array<{ q: string; a: string }> {
  return [
    {
      q: `${c.category} parçası satın alırken nelere dikkat etmeliyim?`,
      a: `OEM numarasının aracınızın şasi ve motor koduyla uyumlu olduğundan emin olun. Orijinal, muadil ve yenilenmiş seçenekleri karşılaştırın; satıcının doğrulanmış olduğunu kontrol edin ve garanti şartlarını mutlaka teyit edin.`,
    },
    {
      q: `${c.category} parçası ne sıklıkla değişmelidir?`,
      a: `Değişim sıklığı parça tipine ve kullanım koşullarına göre değişir. Üretici kullanım kılavuzunda belirtilen bakım aralıklarını takip edin; aracınız anormal davranış sergilediğinde mutlaka kontrol ettirin.`,
    },
    {
      q: `${c.category} parçası için orijinal mi muadil mi tercih etmeliyim?`,
      a: `Garanti süresi devam eden araçlarda orijinal parça önerilir. Garanti dışı araçlarda kaliteli muadil markalar uygun bir alternatif olabilir; özellikle güvenlik kritik parçalarda (fren, süspansiyon) kaliteli markaları tercih edin.`,
    },
    {
      q: `Bu kategorideki parçaları nereden satın alabilirim?`,
      a: `Taşıtsan Parça Borsası'nda doğrulanmış satıcılardan teklif alabilir, WhatsApp veya telefon ile doğrudan iletişime geçebilirsiniz. Tüm satıcılar Taşıtsan ekibi tarafından kimlik kontrolünden geçirilir.`,
    },
  ];
}
