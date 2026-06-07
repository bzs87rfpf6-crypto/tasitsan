import { createStart, createMiddleware } from "@tanstack/react-start";

import { attachSupabaseAuth } from "./integrations/supabase/auth-attacher";
import { renderErrorPage } from "./lib/error-page";

const errorMiddleware = createMiddleware().server(async ({ next }) => {
  try {
    return await next();
  } catch (error) {
    if (error != null && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    console.error(error);
    return new Response(renderErrorPage(), {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
});

// Adds defence-in-depth security headers to every response.
// Cloudflare/Lovable already provides DDoS/WAF; this hardens the browser side.
const securityHeadersMiddleware = createMiddleware().server(async ({ next }) => {
  const res = await next();
  try {
    const r = res as unknown as Response;
    if (r && typeof r.headers?.set === "function") {
      // HSTS — force HTTPS for 1 year (only honoured over HTTPS connections)
      r.headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
      // Block MIME sniffing
      r.headers.set("X-Content-Type-Options", "nosniff");
      // Clickjacking protection (CSP frame-ancestors is the modern equivalent)
      r.headers.set("X-Frame-Options", "SAMEORIGIN");
      // Referrer leaks
      r.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
      // Limit powerful browser APIs
      r.headers.set(
        "Permissions-Policy",
        "camera=(), microphone=(), geolocation=(self), payment=(), usb=()",
      );
      // Cross-origin isolation defaults
      r.headers.set("Cross-Origin-Opener-Policy", "same-origin");
      r.headers.set("X-XSS-Protection", "0"); // legacy filter off; CSP is the answer
    }
  } catch {
    /* ignore — never break the response because of a header */
  }
  return res;
});

export const startInstance = createStart(() => ({
  requestMiddleware: [errorMiddleware, securityHeadersMiddleware],
  functionMiddleware: [attachSupabaseAuth],
}));
