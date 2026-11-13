---
title: "从 Vibe Coding 到 Agentic Engineering：2025—2026 Agent 发展路线图"
link: agent-evolution-atlas-2025-2026
date: "2026-11-13 16:37:00"
description: "从 2025 年初到 2026 年 11 月，回放 Vibe Coding、Coding Agent、Context Engineering、Skills、Harness 与持续自治的关键选择，保留当时的约束、未选择路线和事后验证。附带 38 个节点、18 组分叉、47 份资料的交互式历史地图。"
cover: /img/posts/agent-evolution-atlas-2025-2026/cover.svg
tags:
  - AI Agent
  - Vibe Coding
  - Codex
  - Claude Code
  - Harness Engineering
  - 软件工程
categories:
  - [笔记, AI]
catalog: true
draft: false
interactive: true
collection: [agent-engineering]
difficulty: 深入
---

**Vibe Coding 的历史，不是一条“模型变强 → 人退出开发”的直线。** 从 2025 年 1 月到 2026 年 11 月，开发者反复面对的是另一组问题：应该把多少权限交给 Agent？哪些信息需要跨会话保存？测试应由谁定义？当代码量超过人工逐行审查能力时，怎样让系统依然可维护？

下面这张互动地图记录了 **38 个历史节点、18 组技术路线分叉和 47 份来源**，并支持将视角退回到任一时点：区分**当时已知的事实**与**后来才验证的结果**。

![Agent Evolution Atlas：从自然语言 Vibe Coding 分叉演进为工具调用、上下文工程、Harness 和持续自治](/img/posts/agent-evolution-atlas-2025-2026/cover.svg)

**[打开完整交互式路线图（推荐桌面大屏）](/agent-atlas/)**

> 重要：这是一份**历史研究地图**，并非各模型统一基准排行榜。地图中五维 0–5 的能力曲线是依据公开工程进展构建的**解释性定性评分**，并非跨模型、跨时间标准化测量；不能据此声称某个模型在某一天精确提高了多少百分比。

## 一、按时间回到当时，而不是用今天的知识重写过去

| 阶段 | 代表节点 | 当时最重要的问题 |
| --- | --- | --- |
| 2025 Q1：自然语言驱动 | Operator、Karpathy 提出 Vibe Coding、Claude Code | 能否不写具体代码，直接表达意图和试错？ |
| 2025 Q2：工具循环与异步任务 | Codex CLI、Codex Cloud、Claude 4 | Agent 能否实际读仓库、改文件、执行命令、交付 PR？ |
| 2025 Q3：能力与 Context Engineering | GPT-5、GPT-5-Codex、有效上下文工程 | 上下文到底应该包含什么？长期任务的成本如何控制？ |
| 2025 Q4：可移植技能与跨会话 | Agent Skills、MCP 代码执行、Checkpoint | 新会话能否继续正确工作，而不依赖模型记住整个聊天？ |
| 2026 Q1：Harness 与独立验收 | Codex App、Harness Engineering、Planner / Generator / Evaluator | 不审查每一行代码，怎么审查系统的结果与边界？ |
| 2026 Q2：自治的成本和权限 | Managed Agents、Traces → Evals、权限风险 | 更强的 Agent 还需要多重脚手架吗？错误会扩散多远？ |
| 2026 Q3–Q4：项目级与持续自治 | 项目级 Agent、持续 Memory、Saltline、Persistent Agent | 一次任务完成之后，工程知识和控制权如何持续保留？ |

这七个阶段不是严格互斥的版本号。后一个范式出现后，前一个也不必消失：快速原型仍然适合 Vibe Coding；高风险系统仍然需要明确的边界与人工裁决。

## 二、从路线分叉观察“当时为什么这样选”

**分叉一：直接接受 AI 代码，还是认真审核？** 2025 年初，立即看到运行效果是最大的吸引力。对一次性 Demo，接受模型输出能快速获取反馈；但一旦涉及生产数据、多人维护和性能回归，“效果看起来正确”不再是足够的交付证据。后来的路线不是简单回归逐行人工审核，而是用可执行契约、测试和风险分级改变审核对象。

**分叉二：一个长会话，还是多个任务会话？** 长会话容易保持当前问题的上下文，却也容易持续携带大量过时日志与失败实验。另一条路线是把决策、测试、代码提交和任务状态外置，让短会话按需读取项目知识。今天两条路都成立：一个尚在排障中的根因适合连续会话；独立任务与长期项目状态则不应依赖聊天历史。

**分叉三：单 Agent 还是多 Agent？** 多 Agent 在可并行搜索、独立评估和明确交接的任务上有收益；而简单代码修改可能因角色通信、重复上下文、环境冲突让总成本反而增加。重要的不是“Agent 数量”，而是分工是否带来可验证的信息增量。

**分叉四：人为制定架构，还是放手让 Agent 自己演化？** 随着生成速度提升，架构偏差可能以更快速度累积。OpenAI 的 Harness Engineering 把知识入口、依赖约束、结构检查与自动清理纳入 Agent 的工作环境。这并不证明传统设计模式全部必需，而是让真正重要的边界从“口头建议”转向“可执行约束”。

**分叉五：全自动持续运行，还是在关键点停下来？** Saltline 展示了很少人工输入就能产生显著视觉结果的可能性，却不能单独证明正式系统可以无人验收。长期 Agent 仍然需要权限边界、可回滚提交、长期记忆与受控发布。

地图中的每条分叉都保存四种信息：**当时的约束、当时可选的方案、后来发现的结果、现在的适用条件**。其中“未采用”不等于永远失败，“已采用”也不等于问题已经解决。

## 三、交互式历史路线图

可在下方直接浏览。点击节点查看当时的判断、限制与开放问题；拖动时间轴回到历史时点；启用“事后验证”再查看后来的证据。复杂分支可以跳转到对应日期。

<div style="max-width:100%;width:100%;margin:1.5rem auto;border:1px solid #354453;border-radius:12px;overflow:hidden;background:#090d12">
  <iframe src="/agent-atlas/" title="Agent Evolution Atlas：2025—2026 发展路线与决策分叉（可交互）" loading="lazy" style="display:block;width:100%;height:860px;border:0;background:#090d12" allowfullscreen></iframe>
</div>

[在独立页面全屏浏览路线图](/agent-atlas/) · [查看结构化历史数据](/agent-atlas/atlas-data.json)

> 如果浏览器禁用脚本或嵌入视图过窄，可以使用上方独立页面；正文的阶段表和分叉说明是静态阅读的后备版本。路线图页提供来源链接和节点定位，不需要博客后端或账号。

## 四、如何阅读能力曲线

路线图的五个观察维度分别是 **代码推理、长任务连续性、工具自治、独立验证、工程治理**。分数用于观察叙事重点发生怎样的变化，而不是衡量厂商模型的绝对智力。

特别需要将三类信号分开：

1. **模型能力**：理解复杂代码、定位错误、处理更长任务的可能性。
2. **Harness 能力**：工具、权限、提示、沙箱、状态外置、并行和恢复机制。
3. **工程可靠性**：测试是否有效、架构是否保持稳定、真实产品目标是否达成。

一个模型在公开 Demo 中完成了长时间任务，不等于同样的任务在另一套工具环境下拥有相同成功率。同样，一条上升的定性曲线不能代替 SWE-bench、METR 等具体基准的测量口径和误差范围。

## 五、回到个人开发：我从这段演化中得到的工程原则

过去一年多最大的变化，也许不是某个模型更会写代码，而是**可持续工程的知识不再依赖单个开发者记住每次修改**。

对于“一次发起消息、一个会话完成一个任务”的工作方式，更自然的改造是：保留任务级独立会话；让 Agent 进入仓库时先读取简短的项目入口与架构决策；对需要较长执行的任务保留计划、Git 检查点和外部证据；复杂任务增加独立验收；完成时只把真正长期有效的约束写回项目。

当代码生产已经不是瓶颈，设计模式仍然存在价值，但价值正在移动：从节省手写劳动，转向**界定可安全修改的范围、减少隐式状态，并让正确性可以被重复验证**。

这与站内其他讨论是一条连续的线索：

- [Agent 时代的代码整洁与可持续能力](/post/clean-sustainable-code-in-agent-era)：架构边界、验证和质量反馈。
- [上下文还没满，Agent 为什么已经变贵了？](/post/agent-context-compaction-2026)：压缩、缓存与上下文生命周期。
- [个人开发者如何落地可靠的 Agent 工作流](/post/reliable-agent-workflow-for-personal-developers)：轻量工程协议与可交付证据。

## 六、史料原则与研究边界

这份地图以公开发布的研究、官方产品记录与工程复盘为主要依据；时间取**可核对的公开节点**，不是所有思想首次产生的精确日期。对于后验分析，统一放在对应的“事后验证”层，不反向修改当时的知识边界。

代表性原始资料包括 [Andrej Karpathy 提出 Vibe Coding 的帖子](https://x.com/karpathy/status/1886192184808149383)、[Anthropic 发布 Claude 3.7 Sonnet 与 Claude Code](https://www.anthropic.com/news/claude-3-7-sonnet)、[OpenAI 发布 Codex](https://openai.com/index/introducing-codex/)、[OpenAI 的 Harness Engineering](https://openai.com/index/harness-engineering/) 等。具体到每一个节点的来源、日期和后续证据，可在交互地图内展开查看。

**资料截止：2026 年 11 月 13 日。** 随着新的实践出现，某些路线可能重新被采用、被限制或者被推翻。地图记录的是当时可用的选择与证据，不把今天的主流路径伪装成从一开始就注定正确。

---

**结论：** Vibe Coding 让“表达意图”进入开发循环；Coding Agent 让“采取行动”进入循环；Context Engineering 让“给模型什么信息”成为一项工程决策；Harness Engineering 则把“如何防止错误、如何证明结果”变成运行环境的一部分。长期来看，最值得保存的不是一段无限延长的会话，而是**可以不断修订和验证的工程决策历史**。
