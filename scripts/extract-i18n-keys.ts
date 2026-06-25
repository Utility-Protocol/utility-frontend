import fs from "fs";
import path from "path";

function walk(dir: string, cb: (file: string) => void) {
  for (const f of fs.readdirSync(dir)) {
    const full = path.join(dir, f);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) walk(full, cb);
    else if (/\.(ts|tsx|js|jsx)$/.test(f)) cb(full);
  }
}

const root = path.resolve(__dirname, "..", "src");
const keys = new Set<string>();
const re = /t\(\s*["'`]([\w.\-:\s]+)["'`]/g;
walk(root, (file) => {
  const content = fs.readFileSync(file, "utf8");
  let m;
  while ((m = re.exec(content))) keys.add(m[1]);
});

const out: Record<string, string> = {};
for (const k of Array.from(keys).sort()) out[k] = "";
fs.writeFileSync(path.join(root, "i18n-keys.json"), JSON.stringify(out, null, 2));
console.warn("Wrote src/i18n-keys.json with", Object.keys(out).length, "keys");
