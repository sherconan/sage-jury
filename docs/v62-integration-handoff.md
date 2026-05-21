# v62「段永平投资分析引擎」— 开发集成交付文档

> 给开发的一份文档：拿这一份就能把 v62 的能力集成到你们已有 web chatbot 上。

---

## 1. 你拿到的是什么

一个 **AI 投资分析 agent**：用户问「茅台能买吗」，按段永平的投资逻辑做一次完整分析（不是查 PE，是"用 10 年真实财务数据 + 4 维度推理"）。

**输入**：`sage_id` + 用户问题（中文／股票名／代码）
**输出**：SSE 流式 — 段永平视角的 600-1000 字结构化分析（〔结论〕〔生意本质〕〔现在的价〕〔能力圈与周期〕〔仓位与边界〕5 个分层）

**当前能力边界**：
- ✅ A 股段永平：**深度档案**（10 年财务 + 4 维度真分析）
- 🟡 美股／港股段永平：thin 档案（仅实时行情，无多年财务）
- 🟡 管哥：走旧 pipeline（v61 简版，待 v62 化）

---

## 2. 两种集成方式

### 方式 A：直接调 API（最快，不动代码）

```
POST https://sage-jury.vercel.app/api/chat/v2/stream
Content-Type: application/json

{ "sage_id": "duan-yongping" | "guan-wo-cai", "message": "茅台能买吗" }
```

**响应：SSE 流**，事件类型：

| event | 用途 |
|---|---|
| `phase` | 阶段提示（"研究公司 10 年财务..."） |
| `facts` | 研究档案元信息（depth/年数） |
| `verdict` | 分析层结论（signal/headline/keyMetrics） |
| `quotes` | 引用的段永平历史发言（侧边栏溯源） |
| `tool_call` / `tool_result` | 工具调用展示 |
| `chunk` | LLM 流式 chunk（累积成回答） |
| `done` | 最终 `fullReply`（完整回答） |
| `error` | 错误 |

前端只要：
- 监听 `chunk`，累积出回答
- 〔小标题〕渲染成分层标题（看下面 §4 前端关键点）
- `quotes` 渲染溯源 drawer（默认收起，点 chip 抽屉展示）

### 方式 B：把模块搬过去（你们自己 host）

拿走这 5 个文件 + 配 LLM key：

```
lib/sage/v62/research.ts     # buildDossier(ticker) → ResearchDossier
lib/sage/v62/analysis.ts     # analyzeDuan(dossier) → DuanAnalysis + formatAnalysis()
lib/sage/stock_tools.ts      # resolveTicker(中文/代码) → Ticker
lib/sage/corpus_search.ts    # 段永平历史发言检索（可选）
public/sages/duan-yongping/SKILL.md   # 段永平身份+框架（system prompt 主体）
public/sages-quotes/duan-yongping.json # 段永平雪球语料（corpus 检索用）
app/api/chat/v2/stream/route.ts  # 参考实现，照抄/改造你的 endpoint
```

**最小集成代码**（你们的后端）：

```ts
import { resolveTicker } from "./stock_tools";
import { buildDossier } from "./v62/research";
import { analyzeDuan, formatAnalysis } from "./v62/analysis";

const ticker = resolveTicker(userMessage);
if (ticker && ticker.market === 'A') {
  const dossier = await buildDossier(ticker);       // 抓 10 年财务
  const analysis = analyzeDuan(dossier);            // 4 维度分析
  const analysisText = formatAnalysis(analysis);    // 格式化分析底稿

  // 调你们自己的 LLM，把分析底稿+SKILL.md 注入 prompt
  const skill = await fs.readFile('SKILL.md', 'utf-8');
  const llmResponse = await yourLLM({
    system: skill + "\n\n## 输出形态\n先〔结论〕一句判断，再〔先看这是什么〕〔生意本质〕〔现在的价〕〔能力圈与周期〕〔仓位与边界〕分层，600-1000 字。",
    user: `用户问：${userMessage}\n\n# 分析底稿（基于 10 年真实数据）\n${analysisText}`,
  });
}
```

---

## 3. 数据源（全部免费，已实测活接口，2026-05）

| 用途 | 接口 | 备注 |
|---|---|---|
| A 股实时价 + 市值 | `push2.eastmoney.com/api/qt/stock/get?secid=1.{6位码}` | f43=价 f116=市值 |
| A 股估值 | `datacenter.eastmoney.com .../RPT_VALUEANALYSIS_DET` | PE/PB/PS/PCF |
| A 股 10 年财务 | `datacenter.eastmoney.com .../RPT_F10_FINANCE_MAINFINADATA` | 165 字段 × 10 年 |
| 港股 | `qt.gtimg.cn/q=hk{5位码}` | 字段[3]价 [44]市值 [57]PE [58]PB [59]股息 |
| 美股实时 | `push2.eastmoney.com .../?secid=105.{ticker}` | 价/市值/PB/股息 |
| 美股 PE | `hq.sinajs.cn/list=gb_{ticker小写}` | 字段[14]=PE TTM |
| 美股 10 年财务 | **未找到免费源** | 待定（akshare? 或人工 source） |

**⚠️ 已废（勿用）**：`emweb.securities.eastmoney.com/PC_HSF10/...`、`/PC_HKF10/...` 全部 302。

---

## 4. 前端关键点（如果你们前端要自己写）

参考实现：`app/page.tsx`（这个 repo 里）

关键 helper：
- `formatSageStructure(text)` — 把 `〔小标题〕` 转成 `#### 标题` 让 markdown 渲染分层
- ReactMarkdown components 自定义 `h4` — 渲染成「蓝竖条 + 加粗标题」
- 溯源 drawer：state `sourcePanel`，点 chip 右侧抽屉展示

---

## 5. 环境配置

`.env.local`：
```
SAGE_LLM_BASE=https://api.deepseek.com
SAGE_LLM_KEY=你们的 DeepSeek key（或换成 OpenAI / Claude / 其他）
SAGE_LLM_FAST_MODEL=deepseek-chat
```

DeepSeek 价格便宜，token 限额够（一次完整分析 ~2400 token 输出）。

---

## 6. 测试用例（开发自验）

| 输入 | 预期 |
|---|---|
| `茅台能买吗` | 600-1000 字真分析（PE/EY/ROE/毛利/负债率全用上）|
| `招行` / `五粮液` | 同上 |
| `苹果` / `腾讯` | thin 档案（无 10 年），段永平用知识泛分析 |
| `海力士` | 识别不出，"我看不懂的不下注" |

---

## 7. 已知问题／后续路线

- 美股 10 年财务源还在找（苹果是段永平第一票，必须补）
- 管哥还在 v61 简版，待 v62 化
- 反思 loop（LLM 自检"像段永平吗"）未做
- 定性维度（管理层/文化/口碑）未接入

---

## 8. 联系

- Repo: `github.com/sherconan/sage-jury`
- v62 架构审视: `docs/v62-architecture-review.md`
- 端到端实证: 茅台 926 字真分析（commit `da586ff` 提交说明含完整输出）
