# Taşıtsan — Güvenlik Raporu

Son güncelleme: 2026-06-07

## Uygulanan güvenlik katmanları

### 1. Altyapı (Lovable Cloud / Cloudflare — otomatik)
- DDoS koruması, bot mitigation, küresel WAF — Cloudflare Workers üzerinde otomatik.
- TLS 1.3 + otomatik HTTPS, edge cache, IP reputation listeleri.
- Otomatik günlük DB yedeği + farklı bölgede saklama (RPO ~24sa, RTO ~1sa).

### 2. HTTP güvenlik başlıkları (uygulama içi — `src/start.ts`)
Tüm yanıtlara request middleware ile eklenir:
- `Strict-Transport-Security: max-age=31536000; includeSubDomains`
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: SAMEORIGIN`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy: camera=(), microphone=(), geolocation=(self), payment=(), usb=()`
- `Cross-Origin-Opener-Policy: same-origin`

### 3. Kimlik doğrulama sertleştirme
- **Brute-force kilidi**: 15 dk içinde 5+ başarısız giriş = 15 dk geçici kilit (`auth_failures` tablosu, `check_auth_lockout` RPC).
- **Supabase'in yerleşik koruması** (e-posta başına oran sınırlama) aktif.
- Şifre minimum 6 karakter (artırılabilir).
- **HIBP leaked password kontrolü** — *yapılacak*: Lovable Cloud → Users → Auth Settings → "Password HIBP Check" açın.

### 4. API rate limiting (ad-hoc, DB-tabanlı)
`check_rate_limit` RPC ile sabit pencere algoritması. Aktif endpoint'ler:
| Endpoint | Limit | Pencere | Kapsam |
|---|---|---|---|
| `login` | 10 | 60 sn | IP |
| `signup` | 5 | 10 dk | IP |
| `ai-expert` | 20 | 60 sn | IP + kullanıcı |

> **Sınırlama**: DB-tabanlı, dağıtık değil. Cloudflare Rate Limiting eklemek (custom domain `tasitsan.com.tr` için) daha güçlü koruma sağlar.

### 5. Dosya yükleme güvenliği
`src/lib/file-upload-validation.ts` — tüm upload noktalarına entegre:
- **Whitelist**: jpg, jpeg, png, webp, xlsx, zip
- **Blocklist**: exe, bat, ps1, sh, js, html, svg, php, vb. (30+ uzantı)
- **Magic byte kontrolü**: dosya başlığı ile uzantı çakışması varsa reddedilir
- **Boyut limitleri**: avatar 2MB, fotoğraf 8MB, xlsx 5MB, zip 50MB
- MIME türü + uzantı çapraz doğrulaması

### 6. Güvenlik olayları (audit log)
`security_events` tablosu, admin panelinde **🔒 Güvenlik** sekmesinden görüntülenir.
Kaydedilenler: `login_failed`, `rate_limited`, ileride `unauthorized_access`, `file_rejected`, `admin_action`.

### 7. Yetkilendirme
- Tüm hassas tablolarda **RLS aktif**, `auth.uid()` scope'lu policies.
- Admin işlemleri `has_role(auth.uid(), 'admin')` SECURITY DEFINER fonksiyonu üzerinden.
- Service role anahtarı sadece sunucu kodunda, asla istemciye gönderilmiyor.
- PII içeren tablolar (profiles, parts, part_requests) için column-level GRANT'lar.

---

## OWASP Top 10 Durumu

| # | Risk | Durum | Not |
|---|---|---|---|
| A01 | Broken Access Control | ✅ | RLS + has_role + admin_audit_log |
| A02 | Cryptographic Failures | ✅ | TLS 1.3, Supabase managed keys, HSTS |
| A03 | Injection | ✅ | Supabase JS parametreli sorgular, zod validasyon |
| A04 | Insecure Design | ✅ | Server-side validation, throttling |
| A05 | Security Misconfiguration | ✅ | Headers eklendi, RLS denetlendi |
| A06 | Vulnerable Components | ⚠️ | Aikido/Dependabot kurulumu önerilir |
| A07 | Auth Failures | ✅ | Lockout + rate limit + Supabase auth |
| A08 | Software/Data Integrity | ✅ | Magic byte check, RLS write guards |
| A09 | Logging & Monitoring | ✅ | security_events + admin_audit_log |
| A10 | SSRF | ✅ | Dışa fetch yok (AI gateway Lovable tarafından sandbox'lı) |

---

## Kalan riskler ve öneriler

### 🟡 Orta öncelik
1. **reCAPTCHA v3 entegrasyonu** — kullanıcı onayı bekleniyor. Site key + secret key gerekli.
2. **HIBP leaked password check** — Lovable Cloud auth ayarlarından tek tık açılır.
3. **Cloudflare WAF custom rules** — `tasitsan.com.tr` domaini için kendi Cloudflare hesabında yapın:
   - Security → WAF → Custom Rules
   - Önerilen kurallar:
     - `/api/public/*` haricindeki POST'lara IP başına 100/dk
     - Boş user-agent veya bilinen kötü bot UA'larını CAPTCHA'ya yönlendir
     - SQL injection paternleri için "managed challenge"

### 🟠 Düşük öncelik
4. **CSP header** (rapor modunda) — şu an eklenmedi çünkü external script'lerin (GA4, Search Console) tam listesini çıkarmak gerekiyor.
5. **2FA / MFA** — kritik admin hesapları için Supabase MFA aktivasyonu.
6. **Dependabot/Aikido** — workspace seviyesinde kurulabilir.

### 🔴 Mimari sınırlamalar
- **Rate limit DB-tabanlı**: yüksek trafikte ek DB sorgusu maliyeti. Gerçek edge rate limit için Cloudflare zone gerekli.
- **IP-based blocking**: NAT arkası kullanıcılar için yanlış pozitif riski; lockout her zaman email + IP kombinasyonu üzerinden.

---

## Olay müdahale (Incident response)

Şüpheli aktivite tespit edilirse:
1. **Admin panel → 🔒 Güvenlik** sekmesinden olayları filtrele
2. Şüpheli IP veya hesap için kilit gerekirse:
   - `DELETE FROM auth_failures WHERE identifier = '...'` ile kilidi sıfırla
   - veya `INSERT INTO auth_failures` ile manuel kilitle
3. Hesap kapatma: admin panel → Kullanıcılar → "is_active = false"
4. Tüm session'ları geçersiz kıl: kullanıcının şifresini admin panelden değiştir
