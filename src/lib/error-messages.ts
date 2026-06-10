// Translates raw backend / Supabase / network error messages into
// kullanıcıya gösterilebilecek profesyonel Türkçe mesajlar.
//
// Kural: Kullanıcıya asla teknik hata kodları veya İngilizce ham metin
// gösterme. Tanımlı olmayan hatalar için genel bir Türkçe mesaj dön.

const EXACT_MAP: Record<string, string> = {
  "invalid login credentials": "E-posta veya şifre hatalı.",
  "invalid credentials": "E-posta veya şifre hatalı.",
  "invalid email or password": "E-posta veya şifre hatalı.",
  "email not confirmed": "E-posta adresiniz henüz doğrulanmamış.",
  "email already registered": "Bu e-posta adresiyle daha önce kayıt oluşturulmuş.",
  "user already registered": "Bu e-posta adresiyle daha önce kayıt oluşturulmuş.",
  "email already exists": "Bu e-posta adresiyle daha önce kayıt oluşturulmuş.",
  "user not found": "Kullanıcı bulunamadı.",
  "password should be at least 6 characters": "Şifre en az 6 karakter olmalı.",
  "password is too short": "Şifre çok kısa.",
  "weak password": "Şifre yeterince güçlü değil.",
  "new password should be different from the old password":
    "Yeni şifre eski şifreden farklı olmalı.",
  "signup requires a valid password": "Geçerli bir şifre girin.",
  "signups not allowed for otp": "Bu numarayla kayıt oluşturulamıyor.",
  "too many requests": "Çok fazla deneme yapıldı. Lütfen daha sonra tekrar deneyin.",
  "rate limit exceeded": "Çok fazla deneme yapıldı. Lütfen daha sonra tekrar deneyin.",
  "network error": "Bağlantı hatası. İnternet bağlantınızı kontrol edin.",
  "failed to fetch": "Bağlantı hatası. İnternet bağlantınızı kontrol edin.",
  "load failed": "Bağlantı hatası. İnternet bağlantınızı kontrol edin.",
  "access denied": "Bu işlemi yapma yetkiniz bulunmuyor.",
  "permission denied": "Bu işlemi yapma yetkiniz bulunmuyor.",
  unauthorized: "Bu işlemi yapmak için giriş yapmanız gerekiyor.",
  forbidden: "Bu işlemi yapma yetkiniz bulunmuyor.",
  "not found": "Kayıt bulunamadı.",
  "bot detected": "Şüpheli aktivite algılandı. Lütfen birkaç dakika sonra tekrar deneyin.",
  "suspicious activity detected":
    "Şüpheli aktivite algılandı. Lütfen birkaç dakika sonra tekrar deneyin.",
  "captcha verification failed":
    "Güvenlik doğrulaması başarısız. Lütfen tekrar deneyin.",
  "unexpected error": "Beklenmeyen bir hata oluştu. Lütfen tekrar deneyin.",
  "unexpected error occurred": "Beklenmeyen bir hata oluştu. Lütfen tekrar deneyin.",
  "internal server error": "Sunucu hatası. Lütfen daha sonra tekrar deneyin.",
  "service unavailable": "Servis şu anda kullanılamıyor. Lütfen daha sonra tekrar deneyin.",
  "request timeout": "İstek zaman aşımına uğradı. Lütfen tekrar deneyin.",
  "payload too large": "Yüklemeye çalıştığınız dosya çok büyük.",
  "file too large": "Yüklemeye çalıştığınız dosya çok büyük.",
};

const SUBSTRING_MAP: Array<[RegExp, string]> = [
  [/invalid\s+login\s+credentials?/i, "E-posta veya şifre hatalı."],
  [/email\s+not\s+confirmed/i, "E-posta adresiniz henüz doğrulanmamış."],
  [/already\s+registered|already\s+exists/i,
    "Bu e-posta adresiyle daha önce kayıt oluşturulmuş."],
  [/rate\s*limit|too\s+many\s+requests/i,
    "Çok fazla deneme yapıldı. Lütfen daha sonra tekrar deneyin."],
  [/network|failed\s+to\s+fetch|load\s+failed|fetch\s+failed/i,
    "Bağlantı hatası. İnternet bağlantınızı kontrol edin."],
  [/timeout|timed\s*out/i, "İstek zaman aşımına uğradı. Lütfen tekrar deneyin."],
  [/permission\s+denied|not\s+authorized|forbidden|access\s+denied/i,
    "Bu işlemi yapma yetkiniz bulunmuyor."],
  [/unauthorized|jwt|token/i,
    "Oturumunuz sona ermiş olabilir. Lütfen tekrar giriş yapın."],
  [/bot|suspicious|captcha/i,
    "Şüpheli aktivite algılandı. Lütfen birkaç dakika sonra tekrar deneyin."],
  [/duplicate\s+key|unique\s+constraint/i, "Bu kayıt zaten mevcut."],
  [/violates\s+row-level\s+security|rls/i,
    "Bu işlemi yapma yetkiniz bulunmuyor."],
  [/payload\s+too\s+large|file\s+too\s+large|exceeds/i,
    "Yüklemeye çalıştığınız dosya çok büyük."],
  [/invalid\s+input|invalid\s+value|invalid\s+format/i,
    "Girilen bilgiler geçersiz. Lütfen kontrol edin."],
  [/server\s+error|internal\s+error|5\d\d/i,
    "Sunucu hatası. Lütfen daha sonra tekrar deneyin."],
];

const TURKISH_RE = /[çğıöşüÇĞİÖŞÜ]/;
const ENGLISH_HINT_RE =
  /\b(the|error|failed|invalid|please|cannot|unable|not|with|user|email|password|token|request|server)\b/i;

export function translateError(input: unknown, fallback?: string): string {
  const fb = fallback ?? "Beklenmeyen bir hata oluştu. Lütfen tekrar deneyin.";
  if (input == null) return fb;
  let raw = "";
  if (typeof input === "string") raw = input;
  else if (input instanceof Error) raw = input.message;
  else if (typeof input === "object" && "message" in (input as any))
    raw = String((input as any).message ?? "");
  else raw = String(input);

  const msg = raw.trim();
  if (!msg) return fb;

  const lower = msg.toLowerCase();
  if (EXACT_MAP[lower]) return EXACT_MAP[lower];
  for (const [re, tr] of SUBSTRING_MAP) if (re.test(msg)) return tr;

  // Already Turkish? Pass through.
  if (TURKISH_RE.test(msg)) return msg;
  // Looks English / technical → don't show raw text to the user.
  if (ENGLISH_HINT_RE.test(msg)) return fb;
  // Short non-English token (e.g. error code) → fallback.
  if (msg.length < 4 || /^[A-Z0-9_\-]+$/.test(msg)) return fb;
  return msg;
}
