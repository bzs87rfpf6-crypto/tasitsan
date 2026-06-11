// Brand logo lookup for placeholder cards.
// Uses car-logos-dataset on jsdelivr CDN.

const SLUGS = new Set([
  "toyota","ford","renault","volkswagen","fiat","mercedes-benz","bmw","audi",
  "peugeot","opel","hyundai","kia","honda","nissan","mazda","citroen","dacia",
  "skoda","seat","chevrolet","mitsubishi","suzuki","isuzu","iveco","man",
  "scania","daf","volvo","porsche","jaguar","land-rover","mini","alfa-romeo",
  "lancia","lexus","infiniti","subaru","jeep","chrysler","dodge","cadillac",
  "buick","gmc","tesla","ferrari","lamborghini","maserati","bentley",
  "rolls-royce","aston-martin","mclaren","bugatti","smart","saab","ssangyong",
  "daewoo","daihatsu","acura","lincoln","ram","genesis","cupra","byd","chery",
  "geely","great-wall","haval","mg",
]);

const ALIASES: Record<string, string> = {
  "mercedes": "mercedes-benz",
  "mercedesbenz": "mercedes-benz",
  "vw": "volkswagen",
  "land rover": "land-rover",
  "landrover": "land-rover",
  "alfa romeo": "alfa-romeo",
  "alfaromeo": "alfa-romeo",
  "rolls royce": "rolls-royce",
  "rollsroyce": "rolls-royce",
  "aston martin": "aston-martin",
  "astonmartin": "aston-martin",
  "great wall": "great-wall",
  "tofaş": "fiat",
  "tofas": "fiat",
};

export function getBrandLogoUrl(brand: string | null | undefined): string | null {
  if (!brand) return null;
  const raw = brand.trim().toLowerCase();
  if (!raw) return null;
  const aliased = ALIASES[raw] ?? raw.replace(/\s+/g, "-");
  if (!SLUGS.has(aliased)) return null;
  return `https://cdn.jsdelivr.net/gh/filippofilip95/car-logos-dataset@master/logos/optimized/${aliased}.png`;
}
