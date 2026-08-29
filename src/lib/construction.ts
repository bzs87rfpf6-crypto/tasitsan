// Construction (iş makinesi) brand list and category tree.

export const CONSTRUCTION_BRANDS: string[] = [
  "Caterpillar",
  "Komatsu",
  "JCB",
  "Volvo CE",
  "Hitachi",
  "Liebherr",
  "Case",
  "Hyundai CE",
  "Doosan",
  "Bobcat",
  "New Holland Construction",
  "MST",
  "Hidromek",
  "XCMG",
  "Sany",
  "LiuGong",
];

// Hiyerarşik kategori ağacı. Üst kategoriler ve alt kategorileri.
export interface ConstructionCategoryNode {
  label: string;
  children?: string[];
}

export const CONSTRUCTION_CATEGORIES: ConstructionCategoryNode[] = [
  { label: "Motor", children: ["Silindir Kapağı", "Turbo", "Enjektör"] },
  {
    label: "Hidrolik Sistem",
    children: ["Hidrolik Pompa", "Hidrolik Valf", "Hidrolik Hortum"],
  },
  {
    label: "Yürüyüş Takımı",
    children: ["Palet", "Palet Zinciri", "Rulolar", "İstikamet Dişlisi"],
  },
  { label: "Şanzıman" },
  { label: "Diferansiyel" },
  { label: "Aks" },
  {
    label: "Elektrik ve Elektronik",
    children: ["ECU", "Sensörler", "Marş Motoru", "Alternatör"],
  },
  {
    label: "Kabin",
    children: ["Kaporta", "Camlar", "Koltuklar", "Klima Sistemleri"],
  },
  { label: "Kova" },
  { label: "Tırnak" },
  { label: "Ataşmanlar" },
  { label: "Filtreler" },
  { label: "Soğutma Sistemi" },
  { label: "Fren Sistemi" },
  { label: "Direksiyon Sistemi" },
];

// Flat list of every category + subcategory for matchers / dropdowns.
export const CONSTRUCTION_CATEGORY_FLAT: string[] = CONSTRUCTION_CATEGORIES.flatMap(
  (n) => [n.label, ...(n.children ?? [])],
);

// Map subcategory -> parent category (or itself if top-level).
export const CONSTRUCTION_PARENT_OF: Record<string, string> = (() => {
  const m: Record<string, string> = {};
  for (const n of CONSTRUCTION_CATEGORIES) {
    m[n.label] = n.label;
    for (const c of n.children ?? []) m[c] = n.label;
  }
  return m;
})();
