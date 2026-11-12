/*
 * Builds dark_mode.svg + light_mode.svg (neofetch-style card, same layout as YASH-ai-bit's).
 *
 *   node generate.js             # uses avatar.jpeg + ROWS, tries live GitHub stats
 *   node generate.js --no-fetch  # skip the GitHub API, use FALLBACK stats
 *
 * Optional: set GITHUB_TOKEN=...  (higher API rate limits)
 * Requires: npm install   (installs jimp)
 */
const fs = require("fs");
const Jimp = require("jimp");

const USER = "lazyKid64";
const AVATAR = "avatar.jpeg";
const arg = (name, def) => { const a = process.argv.find((s) => s.startsWith(`--${name}=`)); return a ? a.split("=")[1] : def; };
// Art tuning (each can be overridden, e.g. --gamma=1.2 --crop=120,10,330,270)
const CROP = arg("crop", "115,8,335,280").split(",").map(Number); // head + shoulders region (l,t,r,b)
const GAMMA = +arg("gamma", 1.25);        // < 1 brightens dark areas, > 1 keeps detail in bright areas
const THRESHOLD = +arg("threshold", 45);  // pixels darker than this (0-255, after autocontrast) become blank
const EDGE = +arg("edge", 1.2);           // weight of edge detection (0 = plain brightness)
const WARM = +arg("warm", 5.5);           // boost for non-blue pixels (separates hair from the sky)

// ---- edit me: [label, value]; null = spacer; ["#", "Title"] = section header ----
const ROWS = [
  ["Name", "Ishant Rajput"],
  ["Focus", "AI + Web3"],
  ["Editor", "Visual Studio Code"],
  ["Motto", "Not over until I win"],
  null,
  ["Languages.Real", "English, Hindi"],
  ["Languages.Web", "JS, HTML, CSS"],
  ["Languages.Systems", "C++, Go"],
  ["Languages.Blockchain", "Solidity"],
  ["Languages.Other", "Python"],
  null,
  ["Frontend", "React"],
  ["Backend", "Node.js, Express"],
  ["Database", "MongoDB"],
  ["Tools", "Git, Postman"],
  null,
  ["#", "Contact"],
  ["Email", "ishant_r@me.iitr.ac.in"],
  ["LinkedIn", "ishant-rajput"],
  ["GitHub", "lazyKid64"],
  null,
  ["#", "GitHub Stats"],
  // stats rows are appended automatically
];

const FALLBACK = { repos: 0, stars: 0, followers: 0, following: 0, commits: 0 };

const COL = 54; // characters per info line
const LH = 18, FS_INFO = 14, FS_ART = 10, ART_LH = 12, ART_CW = 5.5, INFO_CW = 7.7;

const THEMES = {
  dark:  { bg: "#161b22", fg: "#c9d1d9", key: "#ffa657", value: "#a5d6ff", cc: "#616e7f", add: "#3fb950", dele: "#f85149" },
  light: { bg: "#f6f8fa", fg: "#24292f", key: "#cf6b20", value: "#0550ae", cc: "#8b949e", add: "#1a7f37", dele: "#cf222e" },
};

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const rep = (ch, n) => ch.repeat(Math.max(0, n));

async function api(path) {
  const headers = { "User-Agent": "readme-gen", Accept: "application/vnd.github+json" };
  if (process.env.GITHUB_TOKEN) headers.Authorization = "Bearer " + process.env.GITHUB_TOKEN;
  const r = await fetch("https://api.github.com/" + path, { headers });
  if (!r.ok) throw new Error(`${r.status} ${r.statusText} for ${path}`);
  return r.json();
}

async function getStats() {
  if (process.argv.includes("--no-fetch")) return [FALLBACK, false];
  try {
    const me = await api(`users/${USER}`);
    const repos = await api(`users/${USER}/repos?per_page=100&type=owner`);
    const commits = (await api(`search/commits?q=author:${USER}&per_page=1`)).total_count;
    return [{
      repos: me.public_repos,
      stars: repos.reduce((a, r) => a + r.stargazers_count, 0),
      followers: me.followers, following: me.following, commits,
    }, true];
  } catch (e) {
    console.log("! GitHub API unavailable, using FALLBACK stats:", e.message);
    return [FALLBACK, false];
  }
}

// Grayscale grid (0-255) of W x H cells, area-averaged from the cropped avatar.
async function artGrid(W, H) {
  const img = await Jimp.read(AVATAR);
  const [l, t, r, b] = CROP;
  img.crop(l, t, r - l, b - t);
  const { width: iw, height: ih, data } = img.bitmap;
  // per-pixel brightness + "warmth" boost: the starfield is bluish (b > r) while hair/beard/skin
  // are neutral or warm, so lifting non-blue pixels separates black hair from the black sky
  const lumA = new Float32Array(iw * ih);
  for (let i = 0; i < iw * ih; i++) {
    const R = data[i * 4], G = data[i * 4 + 1], B = data[i * 4 + 2];
    const warm = Math.min(14, Math.max(0, R - B + 12)); // small cap: lift hair, don't flatten beard/glasses
    lumA[i] = Math.min(255, 0.299 * R + 0.587 * G + 0.114 * B + WARM * warm);
  }
  const L = (x, y) => lumA[Math.min(ih - 1, Math.max(0, y)) * iw + Math.min(iw - 1, Math.max(0, x))];
  // Sobel edge magnitude: brings out dark-on-dark shapes (black hair on the black background)
  const edge = new Float32Array(iw * ih);
  for (let y = 0; y < ih; y++)
    for (let x = 0; x < iw; x++) {
      const gx = L(x + 1, y - 1) + 2 * L(x + 1, y) + L(x + 1, y + 1) - L(x - 1, y - 1) - 2 * L(x - 1, y) - L(x - 1, y + 1);
      const gy = L(x - 1, y + 1) + 2 * L(x, y + 1) + L(x + 1, y + 1) - L(x - 1, y - 1) - 2 * L(x, y - 1) - L(x + 1, y - 1);
      edge[y * iw + x] = Math.min(255, Math.hypot(gx, gy) / 4);
    }
  const g = [];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const x0 = Math.floor((x * iw) / W), x1 = Math.max(x0 + 1, Math.floor(((x + 1) * iw) / W));
      const y0 = Math.floor((y * ih) / H), y1 = Math.max(y0 + 1, Math.floor(((y + 1) * ih) / H));
      let s = 0, e = 0, n = 0;
      for (let yy = y0; yy < y1; yy++)
        for (let xx = x0; xx < x1; xx++) { s += lumA[yy * iw + xx]; e += edge[yy * iw + xx]; n++; }
      const lum = 255 * Math.pow(s / n / 255, GAMMA);
      g.push(Math.max(lum, Math.min(255, EDGE * (e / n))));
    }
  }
  // autocontrast with 1% cutoff on each end
  const sorted = [...g].sort((a, b) => a - b);
  const lo = sorted[Math.floor(sorted.length * 0.01)], hi = sorted[Math.floor(sorted.length * 0.99)];
  return g.map((v) => {
    const c = Math.min(255, Math.max(0, ((v - lo) / Math.max(1, hi - lo)) * 255));
    return c < THRESHOLD ? 0 : c;
  });
}

function makeArt(grid, theme, W, H) {
  // Same art for both themes (bright pixels = dense chars). Inverting it for the light theme
  // would turn the avatar's black background into a solid block of '@'.
  const ramp = " .:-=+*#%@";
  const lines = [];
  for (let y = 0; y < H; y++) {
    let s = "";
    for (let x = 0; x < W; x++) s += ramp[Math.min(9, Math.floor((grid[y * W + x] / 256) * 10))];
    lines.push(s.replace(/\s+$/, ""));
  }
  return lines;
}

function line(k, v) {
  const dots = Math.max(2, COL - k.length - 3 - v.length - 1);
  return `<tspan class="cc">. </tspan><tspan class="key">${esc(k)}:</tspan>` +
         `<tspan class="cc">${rep(".", dots)} </tspan><tspan class="value">${esc(v)}</tspan>`;
}

function pair(k1, v1, k2, v2) {
  const d1 = Math.max(2, 24 - `. ${k1}:`.length - v1.length - 1);
  const d2 = Math.max(2, 14 - k2.length - 1 - v2.length);
  return `<tspan class="cc">. </tspan><tspan class="key">${k1}:</tspan>` +
         `<tspan class="cc">${rep(".", d1)} </tspan><tspan class="value">${v1}</tspan>` +
         `<tspan class="cc"> | </tspan><tspan class="key">${k2}:</tspan>` +
         `<tspan class="cc">${rep(".", d2)} </tspan><tspan class="value">${v2}</tspan>`;
}

function infoLines(stats) {
  const head = "ishant@github ";
  const lines = [`<tspan class="key">ishant</tspan><tspan class="cc">@</tspan>` +
                 `<tspan class="key">github</tspan><tspan class="cc"> ${rep("―", COL - head.length)}</tspan>`];
  for (const r of ROWS) {
    if (r === null) lines.push('<tspan class="cc">. </tspan>');
    else if (r[0] === "#") { const t = `- ${r[1]} `; lines.push(`<tspan class="cc">${esc(t)}${rep("―", COL - t.length)}</tspan>`); }
    else lines.push(line(r[0], r[1]));
  }
  lines.push(pair("Repos", `${stats.repos}`, "Stars", `${stats.stars}`));
  lines.push(pair("Commits", `${stats.commits}`, "Followers", `${stats.followers}`));
  return lines;
}

function build(theme, lines, art, dims) {
  const c = THEMES[theme];
  const { width, height, xInfo } = dims;
  const artSvg = art.map((l, i) => `<tspan x="15" y="${28 + i * ART_LH}">${esc(l)}</tspan>`).join("\n");
  const infoSvg = lines.map((l, i) => `<tspan x="${xInfo}" y="${25 + i * LH}">${l}</tspan>`).join("\n");
  return `<?xml version='1.0' encoding='UTF-8'?>
<svg xmlns="http://www.w3.org/2000/svg" font-family="ConsolasFallback,Consolas,monospace" width="${width}px" height="${height}px" font-size="${FS_INFO}px">
<style>
@font-face {
  src: local('Consolas'), local('Consolas Bold');
  font-family: 'ConsolasFallback';
  font-display: swap;
  -webkit-size-adjust: 109%;
  size-adjust: 109%;
}
.key {fill: ${c.key};}
.value {fill: ${c.value};}
.addColor {fill: ${c.add};}
.delColor {fill: ${c.dele};}
.cc {fill: ${c.cc};}
text, tspan {white-space: pre;}
</style>
<rect width="${width}px" height="${height}px" fill="${c.bg}" rx="15"/>
<text x="15" y="28" fill="${c.fg}" font-size="${FS_ART}px">
${artSvg}
</text>
<text x="${xInfo}" y="25" fill="${c.fg}" font-size="${FS_INFO}px">
${infoSvg}
</text>
</svg>
`;
}

(async () => {
  const [stats, live] = await getStats();
  const lines = infoLines(stats);
  const height = 25 + LH * lines.length + 10;
  const H = Math.floor((height - 24) / ART_LH);
  const [l, t, r, b] = CROP;
  // keep the crop's aspect ratio: each art cell is ART_CW wide x ART_LH tall
  const W = Math.round((H * ART_LH * ((r - l) / (b - t))) / ART_CW);
  const xInfo = Math.round(15 + W * ART_CW + 28);
  const width = Math.round(xInfo + COL * INFO_CW + 24);
  const grid = await artGrid(W, H);
  for (const theme of Object.keys(THEMES)) {
    const art = makeArt(grid, theme, W, H);
    fs.writeFileSync(`${theme}_mode.svg`, build(theme, lines, art, { width, height, xInfo }), "utf8");
    if (process.argv.includes("--print")) console.log(art.join("\n"));
  }
  console.log(`Generated dark_mode.svg + light_mode.svg (${width}x${height}, art ${W}x${H}) |`,
              live ? "live stats" : "FALLBACK stats", stats);
})();
