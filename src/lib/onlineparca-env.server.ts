/**
 * OnlineParça tedarikçi yapılandırması için self-host ENV fallback'i.
 *
 * Normal (Lovable Cloud) davranış DEĞİŞMEZ: yapılandırma önce veritabanındaki
 * `suppliers` + `app_secrets` tablolarından okunur. Yalnızca service-role
 * erişimi yoksa veya DB okuması boş/başarısız dönerse bu ENV değerleri kullanılır.
 *
 * Gerekli değişkenler (self-host):
 *   ONLINEPARCA_LOGIN_URL      (zorunlu)
 *   ONLINEPARCA_USERNAME       (zorunlu)
 *   ONLINEPARCA_PASSWORD       (zorunlu, gizli)
 * Opsiyonel:
 *   ONLINEPARCA_SUPPLIER_ID        - DB'deki tedarikçi UUID'si (kayıt/save için gerekir)
 *   ONLINEPARCA_SUPPLIER_NAME      - varsayılan "OnlineParca"
 *   ONLINEPARCA_MARGIN             - kâr yüzdesi, varsayılan 0
 *   ONLINEPARCA_MIN_STOCK          - varsayılan 1
 *   ONLINEPARCA_SYSTEM_SELLER_ID   - harici ürün kaydı için sistem satıcı UUID'si
 */

export interface OnlineParcaEnvConfig {
  id: string;
  name: string;
  login_url: string;
  username: string;
  password: string;
  default_margin: number;
  min_stock: number;
  system_seller_id: string | null;
}

function str(name: string): string | null {
  const v = process.env[name];
  return typeof v === "string" && v.trim().length > 0 ? v.trim() : null;
}

function numEnv(name: string, fallback: number): number {
  const v = str(name);
  const n = v == null ? NaN : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/** ENV tabanlı tedarikçi yapılandırması; eksikse null. */
export function readOnlineParcaEnvConfig(): OnlineParcaEnvConfig | null {
  const login_url = str("ONLINEPARCA_LOGIN_URL");
  const username = str("ONLINEPARCA_USERNAME");
  const password = str("ONLINEPARCA_PASSWORD");
  if (!login_url || !username || !password) return null;
  return {
    id: str("ONLINEPARCA_SUPPLIER_ID") ?? "env:onlineparca",
    name: str("ONLINEPARCA_SUPPLIER_NAME") ?? "OnlineParca",
    login_url,
    username,
    password,
    default_margin: numEnv("ONLINEPARCA_MARGIN", 0),
    min_stock: numEnv("ONLINEPARCA_MIN_STOCK", 1),
    system_seller_id: str("ONLINEPARCA_SYSTEM_SELLER_ID"),
  };
}

/** Yalnızca tedarikçi şifresi (app_secrets okunamadığında). */
export function readOnlineParcaEnvPassword(): string | null {
  return str("ONLINEPARCA_PASSWORD");
}
