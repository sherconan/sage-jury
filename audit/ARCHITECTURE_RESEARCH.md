# Agent 架构调研 · 推翻当前 ReAct 缝缝补补

> 用户判定："AI 架构好垃圾，回答僵硬"。Prompt 工程到上限了，必须换底层框架。

## 当前架构（v60.7）的根本缺陷

| 痛点 | 表现 | 病灶 |
|---|---|---|
| 每次从零扮演段永平 | 多轮对话 sage 没记忆 | 无 persistent memory |
| 一遍写完就发 | 没自我校验"像不像段永平" | 无 reflection loop |
| 通用 ReAct 流程 | 所有 query 走"想→工具→写" | 没按 query 类型路由 |
| 中文金融 corpus 自己拼 | 缺数据 + 缺角色 fine-tune | 没用专用框架 |

---

## 路径 A · Letta（前 MemGPT）⭐ 最有架构升级价值

**[letta-ai/letta](https://github.com/letta-ai/letta)** — 开源、可本地部署的 stateful agent 框架，2026 出 V1 agent loop（融合 ReAct + MemGPT + Claude Code）。

**对我们的价值**：
- **Persona Memory Block**：段永平的人格在 block 里，agent 跨对话持久记忆"我是段永平"
- **Self-editing memory**：段永平 agent 看到用户讲到泡泡玛特时，能把"用户对 IP 类资产感兴趣"写进 memory
- **多轮对话不再失忆**：用户问"上次你说...我们这次接着聊"，sage 真的记得
- 可接 DeepSeek / Qwen / 任何 LLM

**落地方式**：把 sage SKILL 注入 Letta persona block，chat/stream 改成 Letta agent 调用。

参考：[Letta V1 Agent Loop 博客](https://www.letta.com/blog/letta-v1-agent)

---

## 路径 B · 抄 AI Hedge Fund / TradingAgents ⭐ 最快落地

**[ai-hedge-fund (虚构 url)](https://github.com/virattt/ai-hedge-fund)** — 15-37 个投资大师 agent（巴菲特/芒格/格雷厄姆/Bill Ackman/Cathie Wood/Burry/Lynch）已经做了 2 年。

**[TradingAgents](https://github.com/TauricResearch/TradingAgents)** — multi-agent 投资决策流程（基本面/技术/情绪/风控 agent 互相辩论）。

**[Fincept Terminal](https://github.com/Fincept-Corporation/fincept)** — 内置 37 个投资 agent，可接 DeepSeek / Claude / Gemini / OpenAI。

**对我们的价值**：
- 他们的 **Buffett agent prompt** 比我们写得好的概率很高（社区迭代 2 年+）
- 直接 fork → 把他们的 Buffett prompt 中文化 → 改成段永平
- 看他们怎么处理"投资 persona"这个垂直 prompt 工程
- 看 multi-agent debate 模式能不能用于 sage-jury 的多 sage 对辩

**落地方式**：clone 这 3 个 repo 比较 prompt 质量，抄最好那个。

---

## 路径 C · Reflexion / Self-Refine 循环 ⭐ 直接对治"僵硬"

**[Reflexion (Noah Shinn)](https://github.com/noahshinn/reflexion)** — 第一稿 → 自我反思 → 第二稿
**[Self-Refine](https://selfrefine.info/)** — generator + improver + feedback 三个角色同一 LLM 跑
**[MAR: Multi-Agent Reflexion](https://arxiv.org/pdf/2512.20845)** — 多 persona critic 互相辩论，2025-12 论文
**[LangChain Reflection Agents](https://blog.langchain.com/reflection-agents/)** — 现成模板

**对我们的价值（最直接对治"僵硬"症状）**：
- 段永平 agent 写完第一稿 → 另一个 critic agent 用"段永平 12 真实雪球短回复"打分（长度/反问/不分段/金句）
- 不达标 → 让段永平 agent 重写
- 达标 → 输出

**落地方式**：chat/stream/route.ts 加 reflection loop：write → judge → rewrite → ship。

---

## Owner 推荐组合（不是缝缝补补）

**Phase 1（1-2 天，最快见效）**：
1. Clone AI Hedge Fund / TradingAgents 看他们 Buffett agent prompt
2. 抄+中文化 → 直接替换我们段永平/管我财 SKILL
3. 加 Self-Refine 单 LLM 反思循环：第一稿 → "像段永平短帖吗" → 重写

**Phase 2（1 周）**：
4. Migrate 段永平/管我财 到 Letta，用 persona block + memory，多轮对话有连贯性
5. 把 Fincept Terminal 的 multi-agent debate 用进 jury 模式

**Phase 3（2+ 周）**：
6. 用 corpus 33877 条管我财 + 10497 条段永平做 LoRA fine-tune Qwen3-7B → 本地部署
7. 上下文里给真实 corpus 当 few-shot，模型自己学风格

---

## 推荐起点

如果只能选一条：**先 clone AI Hedge Fund + 在我们之上加 Self-Refine reflection loop**。

- AI Hedge Fund 提供"投资 persona prompt"的成熟样板，省 1 周自己迭代
- Self-Refine 直接对治"僵硬" — 不达标自动重写，无需我们手动调 prompt
- 两个 1-2 天能跑通

后面要更深的连贯性 → 上 Letta。要更像段永平本人 → LoRA fine-tune。

---

## 决策

等用户拍：
- (A) 我立刻 clone AI Hedge Fund + 加 Self-Refine loop → 1-2 天
- (B) 直接上 Letta 重写整个 agent 后端 → 3-5 天
- (C) 直接 LoRA fine-tune 段永平 corpus → 5-7 天（要 GPU 资源）
