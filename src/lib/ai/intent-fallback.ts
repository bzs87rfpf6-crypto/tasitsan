// Heuristic intent extraction — çalışır AI olmasa bile.
// Küçük sözlüklerle marka/model/parça adını serbest metinden yakalar.
import { normalize } from "@/lib/search";
import type { Intent } from "./intent.server";

const BRANDS = [
  "toyota","ford","hyundai","kia","renault","opel","peugeot","citroen","fiat",
  "volkswagen","vw","audi","bmw","mercedes","skoda","seat","dacia","nissan",
  "mazda","honda","suzuki","mitsubishi","chevrolet","isuzu","iveco","man",
  "scania","daf","volvo","cooper",
];

const MODELS = [
  "hilux","corolla","auris","yaris","camry","rav4","land cruiser","land",
  "focus","fiesta","transit","connect","kuga","mondeo","ranger","ecosport",
  "astra","corsa","insignia","vectra","zafira","mokka","combo",
  "megane","clio","kadjar","captur","fluence","symbol","trafic","master","kangoo",
  "308","3008","2008","5008","208","508","partner",
  "punto","linea","doblo","ducato","500","tipo","egea",
  "golf","polo","passat","tiguan","touran","caddy","transporter",
  "i20","i30","i10","tucson","accent","getz","elantra","santa fe",
  "sportage","ceed","picanto","rio","sorento",
  "juke","qashqai","navara","primera","micra",
  "swift","vitara","jimny","sx4",
  "civic","cr-v","jazz",
  "captiva","aveo","cruze","spark",
  "d-max","n-series","f-series",
];

const PART_WORDS = [
  "far","farı","farlar","stop","stopu","tampon","kaput","çamurluk","camurluk",
  "ayna","kapı","kapi","cam","fren","balata","disk","kampana","amortisör","amortisor",
  "aks","rot","rotil","salıncak","salincak","direksiyon","şanzıman","sanziman","sanzıman",
  "vites","debriyaj","kavrama","volant","turbo","enjektör","enjektor","enjeksiyon",
  "rampa","common rail","rail","filtre","yağ","yag","hava","yakıt","yakit","polen",
  "buji","kablo","alternatör","alternator","marş","mars","aku","akü","müşür","musur",
  "sensör","sensor","valf","supap","piston","segman","gomlek","gömlek","conta",
  "radyatör","radyator","fan","hortum","pompa","termostat","kayış","kayis","gergi",
  "silecek","zıvana","zivana","lamba","sinyal","plaka","emniyet","kemer","koltuk",
  "torpido","panel","gösterge","gosterge","direksiyon","kelepçe","kelepce","kilit",
];

const POS_MAP: Record<string, string> = { on: "on", "ön": "on", arka: "arka", ust: "ust", "üst": "ust", alt: "alt" };
const SIDE_MAP: Record<string, string> = { sag: "sag", "sağ": "sag", sol: "sol" };

const OEM_RX = /\b([A-Z0-9]{6,}(?:[-][A-Z0-9]+)?)\b/i;

export function heuristicIntent(raw: string): Intent {
  const norm = normalize(raw);
  const tokens = norm.split(/\s+/).filter((t) => t.length >= 2);

  let brand = "";
  let model = "";
  let position = "";
  let side = "";
  const partParts: string[] = [];
  const keywords: string[] = [];
  const candidate_oems: string[] = [];

  for (const t of tokens) {
    if (!brand && BRANDS.includes(t)) { brand = t; continue; }
    if (!model && MODELS.includes(t)) { model = t; continue; }
    if (POS_MAP[t]) { position = POS_MAP[t]; continue; }
    if (SIDE_MAP[t]) { side = SIDE_MAP[t]; continue; }
    if (PART_WORDS.includes(t)) { partParts.push(t); keywords.push(t); continue; }
    // yıl
    if (/^(19|20)\d{2}$/.test(t)) continue;
    keywords.push(t);
  }

  // OEM adayı — orijinal metinden ham al
  const oemMatch = raw.match(OEM_RX);
  if (oemMatch) {
    const o = oemMatch[1].toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (o.length >= 6) candidate_oems.push(o);
  }

  const part_name = partParts.join(" ");

  return {
    brand, model, year: 0,
    part_name,
    category: "Diğer",
    position, side,
    candidate_oems,
    keywords: Array.from(new Set(keywords)).slice(0, 6),
    ai_notes: "heuristic-fallback",
  };
}
