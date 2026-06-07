export function createBrowserId(prefix = "id") {
  try {
    const randomUUID = typeof crypto !== "undefined" ? crypto.randomUUID : undefined;
    if (typeof randomUUID === "function") return `${prefix}-${randomUUID.call(crypto)}`;
  } catch {}

  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}