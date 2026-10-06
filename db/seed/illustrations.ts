import type { SeedProduct } from "./catalog";

const escapeXml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll('"', "&quot;");
function lines(value: string, width: number) {
  const result: string[] = [];
  for (const word of value.split(" ")) {
    const last = result.at(-1);
    if (last && last.length + word.length < width)
      result[result.length - 1] = `${last} ${word}`;
    else result.push(word);
  }
  return result.slice(0, 4);
}

// Code-native package illustrations, deliberately labeled as demo artwork.
// They are rasterized once and enter the normal validated upload pipeline.
export function packageIllustration(product: SeedProduct, index: number) {
  const colors = [
    "#9caf78",
    "#dcae79",
    "#95aaa0",
    "#c1a18c",
    "#9eafbc",
    "#bcaf72",
  ];
  const color = colors[index % colors.length];
  const milk = product.categories.includes("milk");
  const label = lines(product.name, 20);
  const body = milk
    ? '<path d="M260 205 320 135h190l65 70v500H260Z" fill="#fffaf0"/><path d="m260 205 60-70h190l65 70Z" fill="#dddcc6"/><path d="M510 135v70h65" fill="#e8e9d8"/><rect x="260" y="205" width="315" height="500" rx="4" fill="#fffaf0"/>'
    : '<rect x="185" y="200" width="470" height="485" rx="30" fill="#fffaf0"/><path d="M215 200h410a30 30 0 0 1 30 30v32H185v-32a30 30 0 0 1 30-30Z" fill="#e3e1cc"/>';
  const left = milk ? 260 : 185;
  const width = milk ? 315 : 470;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="840" height="840" viewBox="0 0 840 840"><rect width="840" height="840" fill="#edf0e4"/><ellipse cx="420" cy="727" rx="218" ry="24" fill="#203b2c" opacity=".10"/>${body}<rect x="${left}" y="270" width="${width}" height="220" fill="${color}"/><text x="420" y="312" text-anchor="middle" font-family="Arial,sans-serif" font-weight="700" font-size="${milk ? 20 : 24}" fill="#203b2c">${escapeXml(product.brand.toUpperCase())}</text>${label.map((line, i) => `<text x="420" y="${362 + i * 31}" text-anchor="middle" font-family="Arial,sans-serif" font-weight="700" font-size="${milk ? 24 : 28}" fill="#203b2c">${escapeXml(line)}</text>`).join("")}<path d="M420 615v-58m0 34c-44-4-44-43-44-43s43-1 44 43Zm0-26c0-41 42-43 42-43s1 39-42 43Z" stroke="#587445" stroke-width="3" fill="#dce6c2"/><text x="420" y="651" text-anchor="middle" font-family="Arial,sans-serif" font-size="12" letter-spacing="2" fill="#405235">PLANT-BASED • DEMO ARTWORK</text><text x="420" y="786" text-anchor="middle" font-family="Arial,sans-serif" font-size="15" fill="#627253">Illustrative packaging · Development catalog</text></svg>`;
}
