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
  "user already registered":
    "Bu telefon veya e-posta ile zaten bir hesap var. Lütfen giriş yapın.",
  "email already exists": "Bu e-posta adresiyle daha önce kayıt oluşturulmuş.",
  "a user with this email address has already been registered":
    "Bu telefon veya e-posta ile zaten bir hesap var. Lütfen giriş yapın.",
  "user not found": "Kullanıcı bulunamadı.",
  "password should be at least 6 characters": "Şifre en az 6 karakter olmalı.",
  "password is too short": "Şifre çok kısa.",
  "weak password":
    "Şifreniz çok yaygın kullanılıyor ve güvenli değil. Lütfen tahmin edilmesi zor bir şifre seçin.",
  "password is known to be weak and easy to guess, please choose a different one.":
    "Şifreniz çok yaygın kullanılıyor ve güvenli değil. Lütfen büyük/küçük harf, rakam ve sembol içeren daha güçlü bir şifre seçin.",
  "new password should be different from the old password":
    "Yeni şifre eski şifreden farklı olmalı.",
  "signup requires a valid password": "Geçerli bir şifre girin.",
  "signups not allowed for otp": "Bu numarayla kayıt oluşturulamıyor.",
  "signup is disabled": "Yeni kayıt şu anda kapalı. Lütfen daha sonra tekrar deneyin.",
  "too many requests": "Çok fazla deneme yapıldı. Lütfen daha sonra tekrar deneyin.",
  "rate limit exceeded": "Çok fazla deneme yapıldı. Lütfen daha sonra tekrar deneyin.",
  "email rate limit exceeded":
    "Çok kısa sürede çok fazla deneme yaptınız. Lütfen 1 dakika sonra tekrar deneyin.",
  "network error": "Bağlantı hatası. İnternet bağlantınızı kontrol edin.",
  "failed to fetch": "Bağlantı hatası. İnternet bağlantınızı kontrol edin.",
  "load failed": "Bağlantı hatası. İnternet bağlantınızı kontrol edin.",
  "access denied": "Bu işlemi yapma yetkiniz bulunmuyor.",
  "permission denied": "Bu işlemi yapma yetkiniz bulunmuyor.",
  unauthorized: "Bu işlemi yapmak için giriş yapmanız gerekiyor.",
  forbidden: "Bu işlemi yapma yetkiniz bulunmuyor.",
  "not found": "Kayıt bulunamadı.",
  "bot detected":
    "Şüpheli aktivite algılandı. Lütfen birkaç dakika sonra tekrar deneyin.",
  "suspicious activity detected":
    "Şüpheli aktivite algılandı. Lütfen birkaç dakika sonra tekrar deneyin.",
  "captcha verification failed":
    "Güvenlik doğrulaması başarısız. Lütfen tekrar deneyin.",
  "unexpected error": "Beklenmeyen bir hata oluştu. Lütfen tekrar deneyin.",
  "unexpected error occurred": "Beklenmeyen bir hata oluştu. Lütfen tekrar deneyin.",
  "internal server error": "Sunucu hatası. Lütfen daha sonra tekrar deneyin.",
  "service unavailable":
    "Servis şu anda kullanılamıyor. Lütfen daha sonra tekrar deneyin.",
  "request timeout": "İstek zaman aşımına uğradı. Lütfen tekrar deneyin.",
  "payload too large": "Yüklemeye çalıştığınız dosya çok büyük.",
  "file too large": "Yüklemeye çalıştığınız dosya çok büyük.",
  "database error saving new user":
    "Hesap oluşturulurken bir sorun oluştu. Lütfen birkaç dakika sonra tekrar deneyin.",
};

// Supabase Auth `error_code` / `code` mapping — checked before message text.
const CODE_MAP: Record<string, string> = {
  weak_password:
    "Şifreniz çok yaygın kullanılıyor ve güvenli değil. Lütfen büyük/küçük harf, rakam ve sembol içeren daha güçlü bir şifre seçin.",
  user_already_exists:
    "Bu telefon veya e-posta ile zaten bir hesap var. Lütfen giriş yapın.",
  email_exists:
    "Bu telefon veya e-posta ile zaten bir hesap var. Lütfen giriş yapın.",
  phone_exists:
    "Bu telefon numarasıyla zaten bir hesap var. Lütfen giriş yapın.",
  email_address_invalid: "Geçersiz e-posta adresi.",
  validation_failed: "Girilen bilgiler geçersiz. Lütfen kontrol edin.",
  signup_disabled: "Yeni kayıt şu anda kapalı.",
  email_not_confirmed: "E-posta adresiniz henüz doğrulanmamış.",
  invalid_credentials: "Telefon/e-posta veya şifre hatalı.",
  over_email_send_rate_limit:
    "Çok kısa sürede çok fazla deneme yaptınız. Lütfen 1 dakika sonra tekrar deneyin.",
  over_request_rate_limit:
    "Çok fazla istek gönderildi. Lütfen biraz bekleyip tekrar deneyin.",
  over_sms_send_rate_limit:
    "Çok fazla SMS isteği. Lütfen biraz bekleyip tekrar deneyin.",
  same_password: "Yeni şifre eski şifreden farklı olmalı.",
  captcha_failed: "Güvenlik doğrulaması başarısız. Lütfen tekrar deneyin.",
  session_not_found: "Oturumunuz sona ermiş. Lütfen tekrar giriş yapın.",
  user_not_found: "Kullanıcı bulunamadı.",
};

const SUBSTRING_MAP: Array<[RegExp, string]> = [
  [/invalid\s+login\s+credentials?/i, "E-posta veya şifre hatalı."],
  [/email\s+not\s+confirmed/i, "E-posta adresiniz henüz doğrulanmamış."],
  [/pwned|known\s+to\s+be\s+weak|weak\s+password/i,
    "Şifreniz çok yaygın kullanılıyor ve güvenli değil. Lütfen büyük/küçük harf, rakam ve sembol içeren daha güçlü bir şifre seçin."],
  [/already\s+registered|already\s+exists|user_already_exists/i,
    "Bu telefon veya e-posta ile zaten bir hesap var. Lütfen giriş yapın."],
  [/for\s+security\s+purposes.*after\s+\d+\s+seconds?/i,
    "Çok kısa sürede çok fazla deneme yaptınız. Lütfen 1 dakika sonra tekrar deneyin."],
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
  [/duplicate\s+key|unique\s+constraint/i,
    "Bu kayıt zaten mevcut."],
  [/database\s+error\s+saving\s+new\s+user/i,
    "Hesap oluşturulurken bir sorun oluştu. Lütfen birkaç dakika sonra tekrar deneyin."],
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

  // Supabase Auth errors carry structured fields — prefer those over message text.
  if (typeof input === "object" && input !== null) {
    const obj = input as any;
    const code: string | undefined =
      (typeof obj.code === "string" && obj.code) ||
      (typeof obj.error_code === "string" && obj.error_code) ||
      (typeof obj.name === "string" && obj.name) ||
      undefined;
    if (code && CODE_MAP[code]) return CODE_MAP[code];
  }

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
  if (CODE_MAP[lower]) return CODE_MAP[lower];
  for (const [re, tr] of SUBSTRING_MAP) if (re.test(msg)) return tr;

  if (TURKISH_RE.test(msg)) return msg;
  if (ENGLISH_HINT_RE.test(msg)) return fb;
  if (msg.length < 4 || /^[A-Z0-9_\-]+$/.test(msg)) return fb;
  return msg;
}
