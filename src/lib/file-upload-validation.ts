// Client + server safe file validator.
// Whitelists: jpg/jpeg/png/webp (images), xlsx, zip.
// Blocks everything else; checks extension, MIME and magic bytes.

export type FileKind = "image" | "spreadsheet" | "archive";

export const FILE_LIMITS = {
  image: 8 * 1024 * 1024, // 8 MB per photo
  avatar: 2 * 1024 * 1024, // 2 MB
  spreadsheet: 5 * 1024 * 1024, // 5 MB
  archive: 50 * 1024 * 1024, // 50 MB
} as const;

const ALLOWED: Record<FileKind, { ext: string[]; mime: string[] }> = {
  image: {
    ext: ["jpg", "jpeg", "png", "webp"],
    mime: ["image/jpeg", "image/png", "image/webp"],
  },
  spreadsheet: {
    ext: ["xlsx"],
    mime: [
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/octet-stream", // some browsers
    ],
  },
  archive: {
    ext: ["zip"],
    mime: ["application/zip", "application/x-zip-compressed", "application/octet-stream"],
  },
};

// Dangerous extensions — never allow even if MIME looks fine.
const BLOCKED_EXT = new Set([
  "exe", "bat", "cmd", "com", "scr", "msi", "ps1", "sh", "bash", "vbs", "js",
  "jse", "wsf", "wsh", "jar", "apk", "ipa", "app", "dmg", "deb", "rpm",
  "html", "htm", "svg", "php", "asp", "aspx", "jsp", "py", "rb", "pl",
  "dll", "so", "dylib", "lnk", "iso",
]);

function extOf(name: string): string {
  const m = name.toLowerCase().match(/\.([a-z0-9]+)$/);
  return m ? m[1] : "";
}

async function magicBytesOk(file: File, kind: FileKind): Promise<boolean> {
  const buf = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const hex = Array.from(buf).map((b) => b.toString(16).padStart(2, "0")).join("");
  if (kind === "image") {
    if (hex.startsWith("ffd8ff")) return true; // JPEG
    if (hex.startsWith("89504e470d0a1a0a")) return true; // PNG
    // WEBP: "RIFF" .... "WEBP"
    const asc = new TextDecoder().decode(buf);
    if (asc.startsWith("RIFF") && asc.slice(8, 12) === "WEBP") return true;
    return false;
  }
  if (kind === "spreadsheet" || kind === "archive") {
    // Both XLSX and ZIP start with PK\x03\x04 or PK\x05\x06 (empty) or PK\x07\x08
    return hex.startsWith("504b0304") || hex.startsWith("504b0506") || hex.startsWith("504b0708");
  }
  return false;
}

export type ValidateResult =
  | { ok: true }
  | { ok: false; reason: string };

export async function validateFile(
  file: File,
  kind: FileKind,
  opts?: { maxBytes?: number },
): Promise<ValidateResult> {
  if (!file || file.size === 0) return { ok: false, reason: "Dosya boş." };

  const ext = extOf(file.name);
  if (!ext) return { ok: false, reason: "Dosya uzantısı tanınmıyor." };
  if (BLOCKED_EXT.has(ext)) return { ok: false, reason: `Yasaklı uzantı: .${ext}` };

  const allowed = ALLOWED[kind];
  if (!allowed.ext.includes(ext)) {
    return { ok: false, reason: `İzin verilen uzantılar: ${allowed.ext.join(", ")}` };
  }

  const max = opts?.maxBytes ?? FILE_LIMITS[kind];
  if (file.size > max) {
    const mb = (max / (1024 * 1024)).toFixed(1);
    return { ok: false, reason: `Dosya çok büyük (maks ${mb} MB).` };
  }

  // MIME check (lenient — browsers can be unreliable)
  if (file.type && !allowed.mime.includes(file.type)) {
    // accept if extension matches; otherwise reject
    if (!allowed.ext.includes(ext)) {
      return { ok: false, reason: `Geçersiz MIME türü: ${file.type}` };
    }
  }

  // Magic byte check
  const magicOk = await magicBytesOk(file, kind);
  if (!magicOk) return { ok: false, reason: "Dosya içeriği uzantısıyla uyuşmuyor." };

  return { ok: true };
}
