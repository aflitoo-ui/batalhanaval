process.chdir(new URL("..", import.meta.url).pathname.replace(/^\/([a-zA-Z]):/, "$1:"));
import sharp from "sharp";

const svg = (size) => `
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="96" fill="#0a0a0a"/>
  <rect width="512" height="512" rx="96" fill="#3a2268" fill-opacity="0.35"/>
  <text x="256" y="340" font-family="Arial, Helvetica, sans-serif" font-weight="700" font-size="300" fill="#3a2268" text-anchor="middle">S</text>
</svg>
`;

const sizes = [
  ["public/icon-192.png", 192],
  ["public/icon-512.png", 512],
  ["public/apple-touch-icon.png", 180],
];

for (const [path, size] of sizes) {
  const buf = Buffer.from(svg(size));
  await sharp(buf, { density: 384 })
    .resize(size, size)
    .png()
    .toFile(path);
  console.log("wrote", path);
}
