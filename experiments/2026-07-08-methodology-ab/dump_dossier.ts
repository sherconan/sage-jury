// 用项目自己的 buildDossier 取 3 只股票的研究档案，保证与线上同源
import { resolveTicker } from "/Users/USER/sage-jury/lib/sage/stock_tools";
import { buildDossier } from "/Users/USER/sage-jury/lib/sage/v62/research";

const OUT = "/private/tmp/claude-501/-Users-sherconan/288d4fc0-396c-400e-8e91-ac157501ee30/scratchpad/exp";
const targets = ["苹果", "招商银行", "中远海控"];

for (const name of targets) {
  const t = resolveTicker(name) ?? resolveTicker({ 招商银行: "600036", 中远海控: "601919" }[name] ?? "");
  if (!t) { console.error(`NO TICKER: ${name}`); continue; }
  const d = await buildDossier(t);
  await Bun.write(`${OUT}/dossier_${t.code}.json`, JSON.stringify(d, null, 1));
  console.log(`${name} → ${t.code}(${t.market}) depth=${d.depth} years=${d.yearly.length} PE=${d.peTTM} div=${d.dividendYieldPct} errors=${d.errors.join(",") || "无"}`);
}
