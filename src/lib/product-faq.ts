// Ürün başına benzersiz FAQ üretici. Deterministik (ID'ye bağlı) ama
// ürün verisinden türetildiği için her ilan farklı bir set görür.

export interface FaqEntry {
  question: string;
  answer: string;
}

export interface FaqInput {
  id: string;
  title: string;
  brand?: string | null;
  model?: string | null;
  year?: number | null;
  oem_code?: string | null;
  oem_codes?: string[] | null;
  engine_code?: string | null;
  condition?: string | null;
  category?: string | null;
}

export function buildProductFaq(p: FaqInput): FaqEntry[] {
  const oem = p.oem_code || (Array.isArray(p.oem_codes) ? p.oem_codes.find(Boolean) ?? null : null);
  const equivalents = Array.isArray(p.oem_codes)
    ? p.oem_codes.filter((c) => c && c !== oem).slice(0, 4)
    : [];
  const vehicle = [p.brand, p.model, p.year].filter(Boolean).join(" ");
  const conditionText =
    p.condition === "new" ? "sıfır"
    : p.condition === "refurbished" ? "yenilenmiş"
    : "ikinci el / orijinal sökme";

  const faqs: FaqEntry[] = [];

  if (oem) {
    faqs.push({
      question: `${oem} OEM numarası hangi araçlara uyumludur?`,
      answer: vehicle
        ? `${oem} OEM kodu özellikle ${vehicle} modellerinde kullanılır. Satın almadan önce şase no ile satıcıdan uyum teyidi almanızı öneririz.`
        : `${oem} OEM kodu birden fazla araç modelinde kullanılabilir. Doğru uyum için araç şase numaranızla satıcıdan teyit almanız önerilir.`,
    });
  }

  faqs.push({
    question: `${p.title} orijinal midir?`,
    answer: `İlandaki ${p.title} parçası ${conditionText} durumda sunulmaktadır${oem ? ` ve OEM numarası (${oem}) ile orijinallik kontrolü yapılabilir` : ""}. Detaylar için satıcının ilan açıklamasını ve fotoğraflarını inceleyin.`,
  });

  if (equivalents.length > 0) {
    faqs.push({
      question: `${oem ?? p.title} için yan sanayi alternatifi var mı?`,
      answer: `Evet, bu parçanın eşdeğer OEM kodları arasında ${equivalents.join(", ")} yer almaktadır. Eşdeğer kodlar farklı üretici markalarında aynı işlevi gören ürünleri ifade eder.`,
    });
  } else {
    faqs.push({
      question: `Bu parça için yan sanayi alternatifi var mı?`,
      answer: `Taşıtsan platformunda satıcılarla iletişime geçerek yan sanayi alternatiflerini sorabilirsiniz. Cross reference veritabanımız sürekli güncellenmektedir.`,
    });
  }

  if (p.engine_code) {
    faqs.push({
      question: `Hangi motorlarla uyumludur?`,
      answer: `İlan, ${p.engine_code} motor koduyla uyumlu olarak sunulmaktadır. Aynı kasa farklı motor seçeneklerine sahip olabileceğinden, montajdan önce motor kodunuzu doğrulayın.`,
    });
  }

  faqs.push({
    question: `Montaj sırasında nelere dikkat edilmelidir?`,
    answer: `${p.title} montajının yetkili bir servis tarafından yapılması ve kullanıcı el kitabındaki tork değerlerine uyulması önerilir. Eski parçanın söküm sırasında çevre conta/contalarının da kontrol edilmesi olası kaçak ve arıza riskini azaltır.`,
  });

  faqs.push({
    question: `Taşıtsan'dan nasıl güvenle satın alabilirim?`,
    answer: `Taşıtsan Parça Borsası satıcı doğrulama, OEM eşleştirme ve mesajlaşma altyapısı ile çalışır. Ödemenizi yapmadan önce ürünün OEM kodunun aracınızla uyumunu satıcıya teyit ettirin.`,
  });

  return faqs.slice(0, 6);
}

export function faqJsonLd(faqs: FaqEntry[]): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((f) => ({
      "@type": "Question",
      name: f.question,
      acceptedAnswer: { "@type": "Answer", text: f.answer },
    })),
  };
}
