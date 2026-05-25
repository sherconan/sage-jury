# 外部参考梳理 · 别人怎么蒸馏巴菲特/段永平

## 一、Github 已有的高质量项目（核心参考）

### 1. [will2025btc/buffett-perspective](https://github.com/will2025btc/buffett-perspective) ⭐ 最贴合
**核心思想**："Distill thinking patterns into a usable AI perspective. Rather than simple role-playing, it captures **the underlying cognitive frameworks, mental models, and decision-making heuristics from 60+ years**."

**关键差别**：
- **不是 role-play**（"我是巴菲特"），而是 cognitive framework 注入
- 强调 mental models + decision heuristics（启发式）
- 用思维操作系统（cognitive OS）的隐喻，不是 persona

**对我们的启示**：当前段永平 SKILL 偏 voice/style 角色扮演（"朴实口语化爱打比方"），缺 cognitive framework 注入。

### 2. [agi-now/buffett-skills](https://github.com/agi-now/buffett-skills) ⭐ 结构最规范
**核心结构**：8 个 reference files 覆盖 thinking framework / investment philosophy / business moats / management governance / financial metrics / valuation / risk behavior / industry playbooks。

**关键差别**：
- **Progressive disclosure**：SKILL.md 总是加载，**reference files 按分析类型 on-demand 读**
- 我们：9 文件**一股脑全注入**，没按问题类型分流

**对我们的启示**：chat/stream/route.ts loadSageSkill 现在是 9 文件全 concat 进 system prompt，浪费 context + LLM 抓不住重点。应改成 **on-demand**：用户问估值 → 加载 valuation；问管理层 → 加载 governance。

### 3. [KeepRule Buffett Prompt](https://keeprule.com/en/prompts/warren-buffett)
**8 个 dimension 强制分析框架**：
1. economic moat（护城河）
2. management evaluation（管理层）
3. financial health（财务）
4. DCF valuation（估值）
5. margin of safety（安全边际）
6. risk assessment（风险）
7. (其余 2 个略)

**对我们的启示**：当前段永平回答"是否买 X 公司"时，**没有强制走完 N 维度**。LLM 可能只回答 1-2 维就收尾。需要**强制 checklist** 在 system prompt 里。

### 4. [aimightbewrong: AI Investment Committee](https://aimightbewrong.substack.com/p/ai-investment-committee-claude)
**核心思想**：每个 sage 应有**独特 stand**，避免同质化。
- Buffett = business quality + durability + valuation discipline
- Lynch = growth + simplicity + observable business
- Howard Marks = cycle + risk + 2nd-order thinking

**对我们的启示**：段永平的"独特 stand"是什么？现在 SKILL.md "本分/不懂不投/看十年/商业模式>价格" — 这其实就是 stand，但**没有放大到与冯柳/管我财/巴菲特**的差异化对比让 LLM 明白边界。

### 5. [ancs21/ai-sub-invest](https://github.com/ancs21/ai-sub-invest)
21 个 analyst persona 聚合 signals。我们的 sage-jury 概念已实现，参考价值在**他们怎么定义 21 个 persona 的差异化**。

---

## 二、段永平本人的真实框架（来自中文资料）

### 三大哲学基石
1. **价值本质论**：关注未来现金流（不是 PE / 不是图形）
2. **护城河优先论**：商业模式第一
3. **企业文化基石论**：好文化维护护城河

### 三维选股框架
1. 商业模式（护城河强度 + 现金流结构）
2. 企业文化（管理层诚信 + 价值观落地）
3. 财务健康度（六维核查体系）

### 实战五步法
1. **能力圈筛选** — 不懂不投
2. **深度研究** — 一句话说清楚怎么赚钱
3. **验证确认** — 10 年后还在不在
4. **估值定价** — 跟 10 年期国债比 + 跟其他好公司比
5. **决策执行** — stop doing list，错过就错过

**对我们的启示**：当前 methodology.md 已有 5 大方法论（本分/不懂不投/看十年/商业模式优先/stop doing），但**没有把它们组织成"五步法"这样的可执行 sequence**。LLM 看到散点 mantra 抓不到顺序。

---

## 三、我们当前 vs 参考的核心 gap

| 维度 | buffett-perspective / buffett-skills | 我们段永平 v60 |
|---|---|---|
| 加载策略 | progressive disclosure，on-demand | 9 文件全 concat |
| SKILL.md 核心 | cognitive framework + mental models | 5 行 mantra + 风格描述 |
| 分析强制度 | 8 dimension checklist | 无强制结构 |
| 差异化 stand | 明确"vs Lynch/Marks 边界" | 隐式（misuseWarnings 提了一句） |
| 推理顺序 | 框架步骤化 | 5 大方法论散点 |

---

## 四、改造段永平 SKILL 的优先级

**P0**（最大杠杆）：
1. SKILL.md 加 "**段永平分析任意公司的 5 步推理路径**"（替代/补充 5 行 mantra）
2. 每步明确：用什么数据 / 调什么工具 / 判什么标准

**P1**：
3. system prompt 在 chat/stream/route.ts 强制 LLM **先走完 5 步推理再写答案**（不是"召回原文 → 引用"）
4. 给段永平加 differentiation 段：vs 冯柳/管我财/巴菲特 各自 stand 边界

**P2**：
5. 实现 progressive disclosure（按问题类型加载 reference files）
6. 改 voice_samples.md / decision_framework.md 重叠合并
