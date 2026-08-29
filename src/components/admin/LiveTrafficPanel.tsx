import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ChatHistoryPanel } from "./ChatHistoryPanel";
import { ChatDetailDialog } from "./ChatDetailDialog";

import {
  Users,
  MapPin,
  FileText,
  Activity,
  Smartphone,
  Monitor,
  Tablet,
  Search,
  Eye,
  Heart,
  Phone,
  MessageCircle,
  UserPlus,
  Circle,
  Flame,
  AlertTriangle,
  TrendingUp,
  Filter,
  Bell,
  BellOff,
  Bot,
  ShieldCheck,
  Globe,
  ArrowRight,
  X,
  Clock,
} from "lucide-react";
import { formatDuration } from "@/lib/fingerprint";
import {
  getLiveTraffic,
  getSessionTimeline,
  getPartsMeta,
  type LiveTraffic,
  type LiveStreamEvent,
  type LiveSession,
  type SessionKind,
  type SessionTimelineEvent,
  type PartMetaLite,
} from "@/lib/live-traffic.functions";
import {
  describePath,
  prettySource,
  stripTracking,
  type PageMeta,
} from "@/lib/live-traffic-format";
import { buildPartParam } from "@/lib/part-slug";
import { VisitorChatDialog, type VisitorChatContext } from "./VisitorChatDialog";
import { getPresenceSnapshot, type PresenceSnapshot } from "@/lib/presence.functions";

const REFRESH_MS = 5000;
const OUTREACH_DRAFT =
  "Merhaba, Taşıtsan olarak aradığınız parçayı bulmanıza yardımcı olabiliriz. Aradığınız parçanın adını veya aracın model/yıl bilgisini bize yazabilirsiniz.";
const STREAM_TOAST_TYPES = new Set([
  "signup",
  "oem_search",
  "click_whatsapp",
  "click_call",
  "favorite_add",
  "part_view",
]);

function relTime(iso: string, now: number): string {
  const ms = now - new Date(iso).getTime();
  if (ms < 5_000) return "şimdi";
  if (ms < 60_000) return `${Math.floor(ms / 1000)} sn önce`;
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)} dk önce`;
  return `${Math.floor(ms / 3_600_000)} sa önce`;
}

function timeOf(iso: string): string {
  return new Date(iso).toLocaleTimeString("tr-TR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function DeviceIcon({ d }: { d: string }) {
  const v = (d || "").toLowerCase();
  if (v === "mobile") return <Smartphone className="size-3.5" />;
  if (v === "tablet") return <Tablet className="size-3.5" />;
  if (v === "desktop") return <Monitor className="size-3.5" />;
  return <Monitor className="size-3.5 opacity-50" />;
}

type IntentBand = { label: string; color: string; bg: string; dot: string };
function intentBand(score: number): IntentBand {
  if (score >= 71)
    return {
      label: "🔴 Sıcak",
      color: "text-rose-300",
      bg: "bg-rose-500/15 border-rose-500/40",
      dot: "bg-rose-500",
    };
  if (score >= 31)
    return {
      label: "🟡 Orta",
      color: "text-amber-300",
      bg: "bg-amber-500/10 border-amber-500/30",
      dot: "bg-amber-500",
    };
  return {
    label: "🟢 Düşük",
    color: "text-emerald-300",
    bg: "bg-emerald-500/10 border-emerald-500/25",
    dot: "bg-emerald-500",
  };
}

function sourceColor(src: string): string {
  const s = (src || "").toLowerCase();
  if (/google organik|bing|yandex|duckduckgo|yahoo/.test(s))
    return "bg-blue-500/10 border-blue-500/30 text-blue-300";
  if (/reklam|ads/.test(s)) return "bg-rose-500/10 border-rose-500/30 text-rose-300";
  if (/facebook|instagram|whatsapp|tiktok|twitter|linkedin|youtube|telegram|reddit/.test(s))
    return "bg-fuchsia-500/10 border-fuchsia-500/30 text-fuchsia-300";
  if (/direkt|direct/.test(s)) return "bg-emerald-500/10 border-emerald-500/30 text-emerald-300";
  if (/iç sayfa/.test(s)) return "bg-secondary border-border text-muted-foreground";
  return "bg-amber-500/10 border-amber-500/30 text-amber-300";
}

function kindBadge(k: SessionKind): { label: string; cls: string; icon: React.ReactNode } {
  if (k === "bot")
    return {
      label: "Bot",
      cls: "bg-amber-500/10 border-amber-500/30 text-amber-300",
      icon: <Bot className="size-3" />,
    };
  if (k === "admin")
    return {
      label: "Admin / Geliştirici",
      cls: "bg-sky-500/15 border-sky-500/40 text-sky-300",
      icon: <ShieldCheck className="size-3" />,
    };
  return {
    label: "Kullanıcı",
    cls: "bg-emerald-500/10 border-emerald-500/30 text-emerald-300",
    icon: <Users className="size-3" />,
  };
}

function eventMeta(
  e: LiveStreamEvent,
  partTitles: Map<string, string>,
): { icon: React.ReactNode; label: string; detail: string } {
  const meta = describePath(e.path, {
    title: e.title,
    oem: e.oem,
    partId: e.part_id,
  });
  const enrichedTitle = e.title || (e.part_id ? partTitles.get(e.part_id) : null) || meta.name;
  switch (e.event_type) {
    case "page_exit": {
      const ms = e.duration_ms ?? 0;
      const lvl = e.engagement === "high_interest" ? "🔥 Yüksek İlgi"
        : e.engagement === "viewed" ? "👀 İncelendi"
        : "⚡ Hızlı Çıkış";
      const where = e.part_id || e.path?.startsWith("/parts/") ? "Ürün sayfasında" : `${meta.icon} ${meta.name} sayfasında`;
      return {
        icon: <Clock className="size-3.5 text-sky-400" />,
        label: "Sayfada kaldı",
        detail: `${where} ${formatDuration(ms)} kaldı · ${lvl}${e.part_id ? ` · ${enrichedTitle}` : ""}`,
      };
    }
    case "page_view":
      return {
        icon: <Circle className="size-3 fill-emerald-400 text-emerald-400" />,
        label: "Sayfa görüntüledi",
        detail: `${meta.icon} ${meta.name}`,
      };
    case "part_view":
      return {
        icon: <Eye className="size-3.5 text-gold" />,
        label: "Ürün görüntüledi",
        detail: `📦 ${enrichedTitle}${e.oem ? ` · OEM ${e.oem}` : ""}`,
      };
    case "search":
      return {
        icon: <Search className="size-3.5 text-blue-400" />,
        label: "Arama yaptı",
        detail: `${e.query || "—"}${typeof e.results === "number" ? ` (${e.results} sonuç)` : ""}`,
      };
    case "oem_search":
      return {
        icon: <Search className="size-3.5 text-amber-400" />,
        label: "OEM arama",
        detail: e.oem || e.query || "—",
      };
    case "click_whatsapp":
      return {
        icon: <MessageCircle className="size-3.5 text-emerald-500" />,
        label: "WhatsApp tıkladı",
        detail: enrichedTitle,
      };
    case "click_call":
      return {
        icon: <Phone className="size-3.5 text-gold" />,
        label: "Telefon tıkladı",
        detail: enrichedTitle,
      };
    case "favorite_add":
      return {
        icon: <Heart className="size-3.5 text-rose-400" />,
        label: "Favorilere ekledi",
        detail: enrichedTitle,
      };
    case "signup":
      return {
        icon: <UserPlus className="size-3.5 text-emerald-400" />,
        label: "Yeni ziyaretçi",
        detail: `${meta.icon} ${meta.name}`,
      };
    default:
      return {
        icon: <Activity className="size-3.5 text-muted-foreground" />,
        label: e.event_type,
        detail: `${meta.icon} ${meta.name}`,
      };
  }
}

function toastFor(e: LiveStreamEvent) {
  const tail = e.city ? ` · ${e.city}` : "";
  switch (e.event_type) {
    case "signup":
      return toast.success(`🔔 Yeni ziyaretçi${tail}`, { description: e.path || "/" });
    case "oem_search":
      return toast.info(`🔍 OEM arandı: ${e.oem || e.query || "—"}${tail}`);
    case "search":
      if (typeof e.results === "number" && e.results === 0)
        return toast.warning(`⚠️ Sonuçsuz arama: "${e.query || ""}"${tail}`);
      return toast.message(`🔎 Arama: "${e.query || ""}"${tail}`);
    case "click_whatsapp":
      return toast.success(`💬 WhatsApp tıklandı${tail}`, { description: e.title || e.path || "" });
    case "click_call":
      return toast.success(`📞 Satıcı arandı${tail}`, { description: e.title || e.path || "" });
    case "favorite_add":
      return toast(`❤️ Favoriye eklendi${tail}`, { description: e.title || "" });
    case "part_view":
      return toast.message(`👁️ Ürün görüntülendi${tail}`, { description: e.title || "" });
    default:
      return null;
  }
}

export function LiveTrafficPanel() {
  const fetchLive = useServerFn(getLiveTraffic);
  const fetchTimeline = useServerFn(getSessionTimeline);
  const fetchPartsMeta = useServerFn(getPartsMeta);
  const fetchPresence = useServerFn(getPresenceSnapshot);
  const [data, setData] = useState<LiveTraffic | null>(null);
  const [presence, setPresence] = useState<PresenceSnapshot | null>(null);
  const [openChatSession, setOpenChatSession] = useState<string | null>(null);

  const [now, setNow] = useState<number>(() => Date.now());
  const [error, setError] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);
  const [notifEnabled, setNotifEnabled] = useState(true);
  const [excludeAdmins, setExcludeAdmins] = useState(true);
  const [intentFilter, setIntentFilter] = useState<"all" | "hot" | "warm">("all");
  const [logFilter, setLogFilter] = useState<"all" | "human" | "bot" | "admin">("all");
  const [partMeta, setPartMeta] = useState<Map<string, PartMetaLite>>(() => new Map());
  const [drillSession, setDrillSession] = useState<LiveSession | null>(null);
  const [chatCtx, setChatCtx] = useState<VisitorChatContext | null>(null);
  const lastSeenRef = useRef<string | null>(null);
  const firstLoadRef = useRef(true);
  const aliveRef = useRef(true);

  useEffect(() => {
    aliveRef.current = true;
    firstLoadRef.current = true;
    lastSeenRef.current = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const tick = async () => {
      try {
        const d = await fetchLive({ data: { excludeAdmins } });
        if (!aliveRef.current) return;
        if (!firstLoadRef.current && notifEnabled && d.stream?.length) {
          const last = lastSeenRef.current;
          const fresh = last
            ? d.stream.filter(
                (e) =>
                  e.created_at > last && e.kind === "human" && STREAM_TOAST_TYPES.has(e.event_type),
              )
            : [];
          fresh
            .slice(0, 5)
            .reverse()
            .forEach((e) => toastFor(e));
        }
        if (d.stream?.length) lastSeenRef.current = d.stream[0].created_at;
        firstLoadRef.current = false;
        setData(d);
        setError(null);

        // Enrich part titles for anything referenced in stream / sessions / pages
        const ids = new Set<string>();
        d.stream?.forEach((e) => {
          if (e.part_id) ids.add(e.part_id);
        });
        d.sessions?.forEach((s) => {
          const m = s.last_path?.match(/^\/parts\/([^/?#]+)/);
          if (m) ids.add(m[1]);
          const m2 = s.landing_path?.match(/^\/parts\/([^/?#]+)/);
          if (m2) ids.add(m2[1]);
        });
        d.pages?.forEach((p) => {
          const m = p.path?.match(/^\/parts\/([^/?#]+)/);
          if (m) ids.add(m[1]);
        });
        d.hot_parts?.forEach((p) => {
          if (p.part_id) ids.add(p.part_id);
        });
        const missing = [...ids].filter((id) => !partMeta.has(id));
        if (missing.length) {
          try {
            const rows = await fetchPartsMeta({ data: { ids: missing } });
            if (!aliveRef.current) return;
            setPartMeta((prev) => {
              const next = new Map(prev);
              rows.forEach((r) => {
                next.set(r.id, r);
              });
              return next;
            });
          } catch {
            /* non-fatal */
          }
        }
      } catch (e) {
        if (aliveRef.current) setError((e as Error).message);
      } finally {
        if (aliveRef.current && !paused) timer = setTimeout(tick, REFRESH_MS);
      }
    };
    void tick();
    const clockId = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      aliveRef.current = false;
      if (timer) clearTimeout(timer);
      clearInterval(clockId);
    };
  }, [fetchLive, paused, notifEnabled, excludeAdmins]);

  // Presence (heartbeat) — kimin şu an sitede olduğunu 5 sn'de bir tazeler.
  useEffect(() => {
    let alive = true;
    let t: ReturnType<typeof setTimeout> | null = null;
    const run = async () => {
      try {
        const p = await fetchPresence({ data: { timeoutSeconds: 45 } });
        if (alive) setPresence(p);
      } catch {
        /* presence hatası canlı trafiği etkilemez */
      } finally {
        if (alive && !paused) t = setTimeout(run, REFRESH_MS);
      }
    };
    void run();
    return () => {
      alive = false;
      if (t) clearTimeout(t);
    };
  }, [fetchPresence, paused]);


  const filteredSessions = useMemo<LiveSession[]>(() => {
    if (!data) return [];
    if (intentFilter === "hot") return data.sessions.filter((s) => s.intent_score >= 71);
    if (intentFilter === "warm") return data.sessions.filter((s) => s.intent_score >= 31);
    return data.sessions;
  }, [data, intentFilter]);

  const filteredStream = useMemo<LiveStreamEvent[]>(() => {
    if (!data) return [];
    if (logFilter === "all") return data.stream;
    return data.stream.filter((e) => e.kind === logFilter);
  }, [data, logFilter]);

  const partTitles = useMemo(() => {
    const titles = new Map<string, string>();
    partMeta.forEach((meta, id) => {
      if (meta.title) titles.set(id, meta.title);
    });
    return titles;
  }, [partMeta]);

  if (error && !data) return <p className="text-sm text-destructive py-8 text-center">{error}</p>;
  if (!data)
    return (
      <p className="text-sm text-muted-foreground py-8 text-center">Canlı veriler yükleniyor…</p>
    );

  // Son işlem özeti + sohbet bağlamı — canlı trafik satırından mesaj başlatmak için.
  function buildChatCtx(s: LiveSession): VisitorChatContext {
    const evs = data!.stream.filter((e) => e.session === s.session);
    const lastSearch = evs.find((e) => e.query || e.oem);
    const lastView = evs.find((e) => e.part_id || e.title);
    const noResult = evs.find((e) => (e.results ?? null) === 0);
    const lastId = s.last_path.match(/^\/parts\/([^/?#]+)/)?.[1];
    const last = describePath(s.last_path, {
      title: lastId ? partTitles.get(lastId) : null,
      partId: lastId,
    });
    return {
      session: s.session,
      path: last.name,
      city: s.city,
      device: s.device,
      lastQuery: lastSearch?.query ?? lastSearch?.oem ?? null,
      lastOem: lastSearch?.oem ?? null,
      lastPart: lastView?.title ?? (lastId ? partTitles.get(lastId) ?? null : null),
      lastStatus: noResult ? "Sonuç bulunamadı" : null,
      lastAt: s.last_at,
    };
  }

  function sessionForQuery(q: string): string | null {
    const ev = data!.stream.find(
      (e) => e.kind === "human" && ((e.oem ?? "") === q || (e.query ?? "") === q),
    );
    return ev?.session ?? null;
  }


  const maxCity = data.cities[0]?.count ?? 1;
  const maxPage = data.pages[0]?.count ?? 1;
  const maxSource = data.sources[0]?.count ?? 1;
  const hotCount = data.sessions.filter((s) => s.intent_score >= 71).length;
  const warmCount = data.sessions.filter((s) => s.intent_score >= 31 && s.intent_score < 71).length;
  const f = data.funnel;
  const maxFunnel = Math.max(1, f.visited);
  const c = data.counts;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-card border border-border rounded-xl p-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3 min-w-0">
            <span className="relative flex size-3 shrink-0">
              <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60 animate-ping" />
              <span className="relative inline-flex rounded-full size-3 bg-emerald-500" />
            </span>
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground">
                Şu An Sitede (canlı heartbeat) · benzersiz ziyaretçi
              </p>
              <p className="font-display text-3xl text-emerald-400">
                {presence ? presence.online_visitors : c.real_users}
              </p>
              <p className="text-[10px] text-muted-foreground">
                Bugün benzersiz: {presence?.unique_today ?? "—"} · aktif oturum (30 dk):{" "}
                {c.real_users}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="px-2 py-1 rounded-full text-[10px] border border-rose-500/40 bg-rose-500/15 text-rose-300">
              🔴 {hotCount} sıcak
            </span>
            <span className="px-2 py-1 rounded-full text-[10px] border border-amber-500/30 bg-amber-500/10 text-amber-300">
              🟡 {warmCount} orta
            </span>
            <label className="text-[11px] px-3 py-1.5 rounded-full border border-border text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                className="accent-gold"
                checked={excludeAdmins}
                onChange={(e) => setExcludeAdmins(e.target.checked)}
              />
              Adminleri hariç tut
            </label>
            <button
              onClick={() => setNotifEnabled((v) => !v)}
              className="text-[11px] px-3 py-1.5 rounded-full border border-border text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5"
              title={notifEnabled ? "Bildirimleri kapat" : "Bildirimleri aç"}
            >
              {notifEnabled ? <Bell className="size-3.5" /> : <BellOff className="size-3.5" />}
              {notifEnabled ? "Bildirim" : "Sessiz"}
            </button>
            <button
              onClick={() => setPaused((p) => !p)}
              className="text-[11px] px-3 py-1.5 rounded-full border border-border text-muted-foreground hover:text-foreground"
            >
              {paused ? "▶︎ Devam" : "⏸ Duraklat"}
            </button>
          </div>
        </div>

        {/* Counters: gerçek kullanıcı (yeşil) · bot (gri) · filtrelenen bot · admin */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-4">
          <CounterCard
            icon={<Users className="size-4" />}
            label="Şu An Aktif Kullanıcı (30 dk)"
            value={c.real_users}
            color="text-emerald-400"
            bg="bg-emerald-500/10 border-emerald-500/30"
            note="Anlık pencere — gün toplamı değildir, düşebilir"
          />

          <CounterCard
            icon={<Bot className="size-4" />}
            label="Bot Trafiği"
            value={c.bots}
            color="text-muted-foreground"
            bg="bg-muted/30 border-border"
            note="İstatistiklere dahil değil"
          />
          <CounterCard
            icon={<Filter className="size-4" />}
            label="Filtrelenmiş Bot Sayısı"
            value={c.filtered_bot_hits}
            color="text-muted-foreground"
            bg="bg-muted/20 border-border"
            note="Son 30 dk · sunucu tarafında elendi"
          />
          <CounterCard
            icon={<ShieldCheck className="size-4" />}
            label="Admin / Geliştirici"
            value={c.admins}
            color="text-sky-300"
            bg="bg-sky-500/15 border-sky-500/40"
            note="Lovable önizleme + admin · istatistiklere dahil değil"
          />

        </div>

        {/* Device / geo / engagement row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3">
          <MiniStat icon={<Smartphone className="size-3.5" />} label="Mobil" value={c.mobile} />
          <MiniStat icon={<Monitor className="size-3.5" />} label="Masaüstü" value={c.desktop} />
          <MiniStat icon={<Globe className="size-3.5" />} label="Ülke" value={c.countries} />
          <MiniStat
            icon={<Activity className="size-3.5" />}
            label="Ort. Süre"
            value={`${c.avg_session_sec}s`}
          />
        </div>

        {/* Anlık presence listesi: sitede mi, ayrıldı mı */}
        {presence && presence.visitors.length > 0 && (
          <div className="mt-3 border border-border rounded-lg overflow-hidden">
            <div className="px-3 py-2 text-[10px] uppercase tracking-widest text-muted-foreground bg-muted/30">
              Canlı Durum · {presence.online_visitors} kişi şu an sitede
            </div>
            <div className="max-h-64 overflow-y-auto divide-y divide-border">
              {presence.visitors
                .filter((v) => !v.is_bot)
                .slice(0, 40)
                .map((v) => (
                  <div
                    key={v.visitor + v.first_seen}
                    className="px-3 py-2 flex items-center gap-2 text-xs"
                  >
                    <span
                      className={`size-2 rounded-full shrink-0 ${v.online ? "bg-emerald-500" : "bg-muted-foreground/40"}`}
                    />
                    <span className={v.online ? "text-emerald-300" : "text-muted-foreground"}>
                      {v.online ? "Şu an sitede" : "Ayrıldı"}
                    </span>
                    <span className="text-muted-foreground truncate">
                      #{v.visitor} · {v.city || "—"} · {v.device || "—"}
                      {v.open_tabs > 1 ? ` · ${v.open_tabs} sekme` : ""}
                      {v.is_internal ? " · admin" : ""}
                    </span>
                    <span className="ml-auto text-muted-foreground shrink-0">
                      {v.online ? `${v.seconds_since} sn` : relTime(v.last_seen, now)}
                    </span>
                  </div>
                ))}
            </div>
          </div>
        )}

        <p className="mt-2 text-[10px] text-muted-foreground">
          Canlı durum heartbeat ile ölçülür (45 sn zaman aşımı) · Aynı kişinin birden fazla sekmesi
          tek ziyaretçi sayılır · Botlar UA imzasından tespit edilir · Her {REFRESH_MS / 1000} sn'de
          bir güncellenir
        </p>
      </div>

      {/* Funnel */}
      <SectionCard
        icon={<TrendingUp className="size-4" />}
        title="Canlı Dönüşüm Hunisi (Son 30 dk)"
      >
        <div className="space-y-2">
          {[
            { label: "Siteye Giriş", val: f.visited, color: "bg-emerald-500" },
            { label: "Arama Yaptı", val: f.searched, color: "bg-blue-500" },
            { label: "Ürün Görüntüledi", val: f.viewed_part, color: "bg-gold" },
            { label: "WhatsApp / Telefon", val: f.contacted, color: "bg-emerald-600" },
            { label: "Favoriye Ekledi", val: f.favorited, color: "bg-rose-500" },
          ].map((row, i, arr) => {
            const pct = (row.val / maxFunnel) * 100;
            const prev = i > 0 ? arr[i - 1].val : null;
            const conv = prev && prev > 0 ? Math.round((row.val / prev) * 100) : null;
            return (
              <div key={row.label}>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="font-medium">{row.label}</span>
                  <span className="font-mono tabular-nums">
                    <span className="text-gold font-bold">{row.val}</span>
                    {conv !== null && <span className="text-muted-foreground ml-2">({conv}%)</span>}
                  </span>
                </div>
                <div className="h-2 rounded-full bg-secondary overflow-hidden">
                  <div
                    className={`h-full ${row.color}`}
                    style={{ width: `${Math.max(2, pct)}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </SectionCard>

      <div className="grid lg:grid-cols-2 gap-3">
        {/* Sources */}
        <SectionCard icon={<Globe className="size-4" />} title="Trafik Kaynakları (Online)">
          {data.sources.length === 0 ? (
            <Empty>Aktif kaynak yok.</Empty>
          ) : (
            <ul className="space-y-1.5 max-h-64 overflow-y-auto">
              {data.sources.map((s) => {
                const label = prettySource(s.source);
                return (
                  <li key={s.source} className="text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className={`px-2 py-0.5 rounded-full border text-[10px] ${sourceColor(label)}`}
                      >
                        {label}
                      </span>
                      <span className="text-gold font-mono tabular-nums">{s.count}</span>
                    </div>
                    <div className="h-1 mt-1 rounded-full bg-secondary overflow-hidden">
                      <div
                        className="h-full bg-gold-gradient"
                        style={{ width: `${Math.max(6, (s.count / maxSource) * 100)}%` }}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </SectionCard>

        {/* Bots */}
        <SectionCard
          icon={<Bot className="size-4" />}
          title={`Botlar (${data.counts.bots} oturum)`}
        >
          {data.bots.length === 0 ? (
            <Empty>Bu pencerede bot trafiği yok.</Empty>
          ) : (
            <ul className="space-y-1 max-h-64 overflow-y-auto">
              {data.bots.map((b) => (
                <li
                  key={b.bot_name}
                  className="text-xs flex items-center justify-between gap-2 py-1 border-b border-border/30 last:border-0"
                >
                  <span className="font-medium truncate flex-1">{b.bot_name}</span>
                  <span className="text-[10px] text-muted-foreground tabular-nums font-mono truncate max-w-[150px]">
                    {b.last_path || "—"}
                  </span>
                  <span className="text-[10px] text-muted-foreground tabular-nums">
                    {relTime(b.last_at, now)}
                  </span>
                  <span className="text-amber-400 font-bold tabular-nums w-10 text-right">
                    {b.sessions}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>

      <div className="grid lg:grid-cols-2 gap-3">
        {/* Top OEMs */}
        <SectionCard icon={<Search className="size-4" />} title="En Çok Aranan OEM'ler (30 dk)">
          {data.top_oems.length === 0 ? (
            <Empty>Bu pencerede OEM araması yok.</Empty>
          ) : (
            <ul className="space-y-1 max-h-64 overflow-y-auto">
              {data.top_oems.map((o) => (
                <li
                  key={o.oem}
                  className="text-xs flex items-center justify-between gap-2 py-1 border-b border-border/30 last:border-0"
                >
                  <span className="font-mono truncate flex-1">{o.oem}</span>
                  <span className="text-[10px] text-muted-foreground tabular-nums">
                    {relTime(o.last_at, now)}
                  </span>
                  <span className="text-gold font-bold tabular-nums w-8 text-right">
                    {o.count}×
                  </span>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        <SectionCard
          icon={<AlertTriangle className="size-4" />}
          title="Sonuçsuz Aramalar — Stok Fırsatları"
        >
          {data.failed_oems.length === 0 ? (
            <Empty>Sonuçsuz arama yok.</Empty>
          ) : (
            <ul className="space-y-1 max-h-64 overflow-y-auto">
              {data.failed_oems.map((o) => (
                <li
                  key={o.oem}
                  className="text-xs flex items-center justify-between gap-2 py-1 border-b border-border/30 last:border-0"
                >
                  <span className="font-mono truncate flex-1 text-amber-300">{o.oem}</span>
                  <span className="text-[10px] text-muted-foreground tabular-nums">
                    {relTime(o.last_at, now)}
                  </span>
                  <span className="text-amber-400 font-bold tabular-nums w-8 text-right">
                    {o.count}×
                  </span>
                  {sessionForQuery(o.oem) && (
                    <button
                      onClick={() => {
                        const sid = sessionForQuery(o.oem)!;
                        const s = data.sessions.find((x) => x.session === sid);
                        setChatCtx({
                          ...(s ? buildChatCtx(s) : { session: sid }),
                          lastQuery: o.oem,
                          lastStatus: "Sonuç bulunamadı",
                          draft: OUTREACH_DRAFT,
                        });
                      }}
                      className="inline-flex items-center gap-1 rounded-full border border-gold/50 text-gold px-2 py-0.5 text-[10px] hover:bg-gold/10 whitespace-nowrap"
                    >
                      <MessageCircle className="size-3" /> Müşteriye Ulaş
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>

      <SectionCard
        icon={<Flame className="size-4 text-rose-400" />}
        title="En Sıcak Ürünler (Son 30 dk)"
      >
        {data.hot_parts.length === 0 ? (
          <Empty>Henüz sıcak ürün yok.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-[10px] uppercase tracking-wider text-muted-foreground border-b border-border">
                  <th className="text-left py-2 pr-2 font-semibold">Ürün</th>
                  <th className="text-right py-2 px-2 font-semibold">Görüntüleme</th>
                  <th className="text-right py-2 px-2 font-semibold">WhatsApp</th>
                  <th className="text-right py-2 px-2 font-semibold">Telefon</th>
                  <th className="text-right py-2 pl-2 font-semibold">Favori</th>
                </tr>
              </thead>
              <tbody>
                {data.hot_parts.map((p) => (
                  <tr key={p.part_id} className="border-b border-border/40 last:border-0">
                    <td className="py-2 pr-2 max-w-[280px] truncate">
                      <a
                        href={`/parts/${buildPartParam(partMeta.get(p.part_id) ?? { id: p.part_id, seo_slug: p.seo_slug ?? null, title: p.title, oem_code: p.oem_code ?? null, oem_codes: p.oem_codes ?? null })}`}
                        className="hover:text-gold"
                        target="_blank"
                        rel="noreferrer"
                      >
                        {p.title}
                      </a>
                    </td>
                    <td className="py-2 px-2 text-right tabular-nums">{p.views}</td>
                    <td className="py-2 px-2 text-right tabular-nums text-emerald-400">
                      {p.whatsapp}
                    </td>
                    <td className="py-2 px-2 text-right tabular-nums text-gold">{p.calls}</td>
                    <td className="py-2 pl-2 text-right tabular-nums text-rose-400">
                      {p.favorites}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      <div className="grid lg:grid-cols-2 gap-3">
        <SectionCard icon={<MapPin className="size-4" />} title="Şehir Dağılımı">
          {data.cities.length === 0 ? (
            <Empty>Bu anda aktif şehir yok.</Empty>
          ) : (
            <ul className="space-y-1.5 max-h-64 overflow-y-auto">
              {data.cities.map((c2) => (
                <li key={c2.city} className="text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate flex-1 font-medium">
                      {c2.city}
                      {c2.country && c2.country !== "Bilinmiyor" && (
                        <span className="text-muted-foreground ml-1 text-[10px]">
                          · {c2.country}
                        </span>
                      )}
                    </span>
                    <span className="text-gold font-mono tabular-nums">{c2.count}</span>
                  </div>
                  <div className="h-1 mt-1 rounded-full bg-secondary overflow-hidden">
                    <div
                      className="h-full bg-gold-gradient"
                      style={{ width: `${Math.max(6, (c2.count / maxCity) * 100)}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        <SectionCard icon={<FileText className="size-4" />} title="Aktif Sayfalar">
          {data.pages.length === 0 ? (
            <Empty>Aktif sayfa yok.</Empty>
          ) : (
            <ul className="space-y-1.5 max-h-64 overflow-y-auto">
              {data.pages.map((p) => {
                const partId = p.path.match(/^\/parts\/([^/?#]+)/)?.[1];
                const meta = describePath(p.path, {
                  title: partId ? partTitles.get(partId) : null,
                  partId,
                });
                return (
                  <li key={p.path} className="text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate flex-1" title={meta.cleanPath}>
                        <span className="mr-1">{meta.icon}</span>
                        {meta.name}
                      </span>
                      <span className="text-gold font-bold tabular-nums">{p.count}</span>
                    </div>
                    <div className="h-1 mt-1 rounded-full bg-secondary overflow-hidden">
                      <div
                        className="h-full bg-emerald-500"
                        style={{ width: `${Math.max(6, (p.count / maxPage) * 100)}%` }}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </SectionCard>
      </div>

      {/* Visitor sessions with source + landing + last */}
      <SectionCard
        icon={<Users className="size-4" />}
        title={`Canlı Ziyaretçiler (${filteredSessions.length}/${data.sessions.length})`}
        right={
          <div className="flex items-center gap-1 text-[10px]">
            <Filter className="size-3 text-muted-foreground" />
            {(["all", "warm", "hot"] as const).map((k) => (
              <button
                key={k}
                onClick={() => setIntentFilter(k)}
                className={`px-2 py-0.5 rounded-full border ${intentFilter === k ? "border-gold text-gold" : "border-border text-muted-foreground"}`}
              >
                {k === "all" ? "Tümü" : k === "warm" ? "≥ Orta" : "Sıcak"}
              </button>
            ))}
          </div>
        }
      >
        {filteredSessions.length === 0 ? (
          <Empty>Filtreye uyan ziyaretçi yok.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-[10px] uppercase tracking-wider text-muted-foreground border-b border-border">
                  <th className="text-left py-2 pr-2 font-semibold">Niyet</th>
                  <th className="text-left py-2 pr-2 font-semibold">Kaynak</th>
                  <th className="text-left py-2 pr-2 font-semibold">Giriş → Son Sayfa</th>
                  <th className="text-left py-2 pr-2 font-semibold">Şehir</th>
                  <th className="text-left py-2 pr-2 font-semibold">Cihaz</th>
                  <th className="text-left py-2 pr-2 font-semibold">Tarayıcı</th>
                  <th className="text-left py-2 pr-2 font-semibold">Giriş</th>
                  <th className="text-left py-2 pr-2 font-semibold">Son Hareket</th>
                  <th className="text-right py-2 font-semibold">Sohbet</th>
                </tr>
              </thead>
              <tbody>
                {filteredSessions.map((s) => {
                  const b = intentBand(s.intent_score);
                  const landingId = s.landing_path.match(/^\/parts\/([^/?#]+)/)?.[1];
                  const lastId = s.last_path.match(/^\/parts\/([^/?#]+)/)?.[1];
                  const landing = describePath(s.landing_path, {
                    title: landingId ? partTitles.get(landingId) : null,
                    partId: landingId,
                  });
                  const last = describePath(s.last_path, {
                    title: lastId ? partTitles.get(lastId) : null,
                    partId: lastId,
                  });
                  const src = prettySource(s.source, s.referrer, s.landing_path);
                  return (
                    <tr
                      key={s.session}
                      className="border-b border-border/40 last:border-0 hover:bg-secondary/40 cursor-pointer"
                      onClick={() => setDrillSession(s)}
                      title="Ayrıntı için tıklayın"
                    >
                      <td className="py-2 pr-2">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[10px] ${b.bg} ${b.color}`}
                        >
                          <span className={`size-1.5 rounded-full ${b.dot}`} />
                          {s.intent_score}
                        </span>
                      </td>
                      <td className="py-2 pr-2">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[10px] ${sourceColor(src)}`}
                          title={s.referrer ?? "Doğrudan ziyaret"}
                        >
                          {src}
                        </span>
                      </td>
                      <td className="py-2 pr-2 max-w-[340px]">
                        <div className="flex items-center gap-1 text-[11px]">
                          <span
                            className="truncate text-muted-foreground"
                            title={landing.cleanPath}
                          >
                            {landing.icon} {landing.name}
                          </span>
                          <ArrowRight className="size-3 shrink-0 text-muted-foreground/60" />
                          <span
                            className="truncate text-foreground font-medium"
                            title={last.cleanPath}
                          >
                            {last.icon} {last.name}
                          </span>
                        </div>
                      </td>
                      <td className="py-2 pr-2">
                        <span title={s.country || undefined}>{s.city}</span>
                        {s.country && s.country !== "Bilinmiyor" && (
                          <span className="text-[10px] text-muted-foreground ml-1">
                            · {s.country}
                          </span>
                        )}
                      </td>

                      <td className="py-2 pr-2">
                        <span className="inline-flex items-center gap-1 text-muted-foreground">
                          <DeviceIcon d={s.device} /> {s.device}
                        </span>
                      </td>
                      <td className="py-2 pr-2">
                        <span>{s.browser}</span>
                        <span className="text-[10px] text-muted-foreground ml-1">· {s.os}</span>
                      </td>

                      <td className="py-2 pr-2 tabular-nums text-muted-foreground">
                        {timeOf(s.joined_at)}
                      </td>
                      <td className="py-2 pr-2 tabular-nums text-emerald-400">
                        {relTime(s.last_at, now)}
                      </td>
                      <td className="py-2 text-right">
                        <button
                          onClick={(ev) => {
                            ev.stopPropagation();
                            setChatCtx(buildChatCtx(s));
                          }}
                          className="inline-flex items-center gap-1 rounded-full border border-gold/50 text-gold px-2 py-0.5 text-[10px] hover:bg-gold/10 whitespace-nowrap"
                        >
                          <MessageCircle className="size-3" /> Mesaj Gönder
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      {/* Live log */}
      <SectionCard
        icon={<Activity className="size-4" />}
        title={`Gerçek Zamanlı Log (${filteredStream.length})`}
        right={
          <div className="flex items-center gap-1 text-[10px]">
            <Filter className="size-3 text-muted-foreground" />
            {(["all", "human", "bot", "admin"] as const).map((k) => (
              <button
                key={k}
                onClick={() => setLogFilter(k)}
                className={`px-2 py-0.5 rounded-full border ${logFilter === k ? "border-gold text-gold" : "border-border text-muted-foreground"}`}
              >
                {k === "all" ? "Tümü" : k === "human" ? "Kullanıcı" : k === "bot" ? "Bot" : "Admin"}
              </button>
            ))}
          </div>
        }
      >
        {filteredStream.length === 0 ? (
          <Empty>Bu filtrede hareket yok.</Empty>
        ) : (
          <ul className="space-y-2 max-h-[28rem] overflow-y-auto font-mono text-[11px]">
            {filteredStream.map((e, i) => {
              const m = eventMeta(e, partTitles);
              const kb = kindBadge(e.kind);
              const src = prettySource(null, null, e.path);
              const isChat = e.event_type === "chat_open" || e.event_type === "chat_message" || e.event_type === "chat_ai_answer";
              return (
                <li
                  key={`${e.created_at}-${i}`}
                  onClick={isChat ? () => setOpenChatSession(e.session) : undefined}
                  className={`flex items-start gap-2 border-b border-border/30 last:border-0 pb-2 last:pb-0 ${isChat ? "cursor-pointer hover:bg-gold/5 rounded" : ""}`}
                >
                  <span className="text-muted-foreground tabular-nums shrink-0 w-16">
                    {timeOf(e.created_at)}
                  </span>
                  <span
                    className={`shrink-0 inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[9px] ${kb.cls}`}
                  >
                    {kb.icon}
                    {e.kind === "bot" && e.bot_name ? e.bot_name : kb.label}
                  </span>
                  <span className="mt-0.5 shrink-0">{m.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold font-sans">
                        {m.label}
                        {isChat && <span className="ml-1 text-[9px] text-gold">· sohbeti aç</span>}
                      </span>
                      <span className="text-[10px] text-muted-foreground tabular-nums shrink-0">
                        {relTime(e.created_at, now)}
                      </span>
                    </div>
                    <p className="truncate text-foreground/90">{m.detail}</p>
                    <p className="truncate text-[10px] text-muted-foreground font-sans">
                      <span
                        className={`inline-block px-1.5 rounded border ${sourceColor(src)} mr-1`}
                      >
                        {src}
                      </span>
                      {[e.city, e.country].filter(Boolean).join(", ") || "—"}
                      {" · "}#{e.session.slice(0, 6)}
                    </p>
                  </div>
                </li>
              );
            })}

          </ul>
        )}
      </SectionCard>

      <ChatHistoryPanel />

      <ChatDetailDialog
        open={!!openChatSession}
        onOpenChange={(v) => { if (!v) setOpenChatSession(null); }}
        sessionId={openChatSession}
      />



      {data.debug && (
        <details className="text-[10px] text-muted-foreground">
          <summary className="cursor-pointer">
            debug · snapshot {timeOf(data.debug.snapshotAt)}
          </summary>
          <pre className="mt-1 whitespace-pre-wrap break-all bg-card border border-border rounded p-2">
            {JSON.stringify(data.debug, null, 2)}
          </pre>
        </details>
      )}

      {chatCtx && (
        <VisitorChatDialog ctx={chatCtx} onClose={() => setChatCtx(null)} />
      )}

      {drillSession && (
        <SessionTimelineDialog
          session={drillSession}
          partTitles={partTitles}
          onClose={() => setDrillSession(null)}
          fetchTimeline={fetchTimeline}
        />
      )}
    </div>
  );
}

function SessionTimelineDialog({
  session,
  partTitles,
  onClose,
  fetchTimeline,
}: {
  session: LiveSession;
  partTitles: Map<string, string>;
  onClose: () => void;
  fetchTimeline: (opts: { data: { sessionId: string } }) => Promise<SessionTimelineEvent[]>;
}) {
  const [events, setEvents] = useState<SessionTimelineEvent[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const rows = await fetchTimeline({ data: { sessionId: session.session } });
        if (alive) setEvents(rows);
      } catch (e) {
        if (alive) setLoadError((e as Error).message);
      }
    })();
    return () => {
      alive = false;
    };
  }, [session.session, fetchTimeline]);

  const src = prettySource(session.source, session.referrer, session.landing_path);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-card border border-border rounded-xl w-full max-w-2xl max-h-[85vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">
              Ziyaretçi #{session.session.slice(0, 8)}
            </p>
            <h3 className="font-display text-lg text-gold truncate">
              {session.city}
              {session.country && session.country !== "Bilinmiyor" ? ` · ${session.country}` : ""}
            </h3>
            <p className="text-[11px] text-muted-foreground">
              {session.device} · {session.browser} · {session.os} ·
              <span className={`ml-1 px-1.5 py-0.5 rounded border ${sourceColor(src)}`}>{src}</span>
            </p>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-secondary" aria-label="Kapat">
            <X className="size-4" />
          </button>
        </div>
        <div className="p-4 overflow-y-auto">
          {loadError && <p className="text-xs text-destructive">{loadError}</p>}
          {!events && !loadError && (
            <p className="text-xs text-muted-foreground">Zaman çizelgesi yükleniyor…</p>
          )}
          {events && events.length === 0 && (
            <p className="text-xs text-muted-foreground">Bu oturum için kayıt bulunamadı.</p>
          )}
          {events && events.length > 0 && (
            <ol className="relative border-l border-border pl-4 space-y-3">
              {events.map((ev, i) => {
                const partId = ev.path?.match(/^\/parts\/([^/?#]+)/)?.[1];
                const meta = describePath(ev.path, {
                  title: partId ? partTitles.get(partId) : null,
                  partId,
                });
                const evLabel =
                  (
                    {
                      page_view: "Sayfa görüntüledi",
                      part_view: "Ürün görüntüledi",
                      search: "Arama yaptı",
                      oem_search: "OEM arama",
                      click_whatsapp: "WhatsApp tıkladı",
                      click_call: "Telefon tıkladı",
                      favorite_add: "Favorilere ekledi",
                      signup: "Kayıt oldu",
                    } as Record<string, string>
                  )[ev.event_type] || ev.event_type;
                return (
                  <li key={i} className="text-xs">
                    <span className="absolute -left-1.5 mt-1 size-3 rounded-full bg-gold border border-card" />
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold">{evLabel}</span>
                      <span className="text-[10px] text-muted-foreground tabular-nums">
                        {timeOf(ev.created_at)}
                      </span>
                    </div>
                    <p className="text-muted-foreground">
                      {meta.icon} {meta.name}
                    </p>
                    <p className="text-[10px] text-muted-foreground/70 font-mono truncate">
                      {stripTracking(meta.cleanPath)}
                    </p>
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      </div>
    </div>
  );
}

function CounterCard({
  icon,
  label,
  value,
  color,
  bg,
  note,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  color: string;
  bg: string;
  note?: string;
}) {
  return (
    <div className={`rounded-xl border p-3 ${bg}`}>
      <div className={`flex items-center gap-1.5 text-[10px] uppercase tracking-widest ${color}`}>
        {icon}
        <span>{label}</span>
      </div>
      <div className={`font-display text-2xl sm:text-3xl mt-1 ${color}`}>{value}</div>
      {note && <p className="text-[9px] text-muted-foreground mt-1">{note}</p>}
    </div>
  );
}

function SectionCard({
  icon,
  title,
  children,
  right,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
  right?: React.ReactNode;
}) {
  return (
    <div className="bg-card border border-border rounded-xl p-3">
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-2">
          <span className="text-gold">{icon}</span>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-gold">{title}</h3>
        </div>
        {right}
      </div>
      {children}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-xs text-muted-foreground py-6 text-center">{children}</p>;
}

function MiniStat({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
}) {
  return (
    <div className="rounded-lg border border-border bg-secondary/40 px-2.5 py-1.5 flex items-center gap-2">
      <span className="text-gold">{icon}</span>
      <div className="min-w-0">
        <p className="text-[9px] uppercase tracking-widest text-muted-foreground leading-none">
          {label}
        </p>
        <p className="font-mono tabular-nums text-sm text-foreground leading-tight">{value}</p>
      </div>
    </div>
  );
}
