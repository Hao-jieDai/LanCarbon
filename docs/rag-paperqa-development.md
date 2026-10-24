# PaperQA 全文开发版

安装版现已采用相同全文链路并内置运行环境，参见[安装与验收](rag-paperqa-installation.md)。下文保留独立开发入口的用法与初次接入记录。

本开发入口把 PaperQA 的完整原文回答接入 LanCarbon Chat。保留现有资料选择、流式正文、Thinking、引用、Usage、导出及聊天保存；不安装、不替换日常软件、不创建 Release。

## 打开和验收

1. 在项目根目录双击 `Start-PaperQA-Dev.cmd`。窗口标题应为 **LanCarbon · PaperQA Development**。它使用独立的 `.dev-workspace/PaperQA` 数据目录，不读取日常 Notes、Books、API Key 或聊天记录。
2. 在 **Workshop → AI Settings** 配置自己的 SiliconFlow 连接和 DeepSeek Flash 模型。模型 ID 使用账号实际提供的值，不依赖快捷预设。全文问答不需要配置 embedding/rerank。
3. 在开发版 Library 导入要问的 PDF/EPUB，或创建测试 Note/Book。进入 **Workshop → Chat**，选择 Flash，在输入框上方 **Choose sources** 选择资料，发送问题。回答的 Evidence 应显示 **PaperQA · full text**。
4. 建议只做一段真实阅读对话：先问“这几篇文章如何定义和衡量搁浅资产，有什么不同？”，再追问“这些金额为什么不能直接相加？请保留原文单位和情景条件”，最后问一个你熟悉的方法或主体归属细节。检查回答是否回应问题、限定条件正确，点击引用是否能打开实际支持该句的页段。无需重跑全部旧测试题。
5. 关闭并重新打开开发版，核对聊天和引用仍在；Usage 中每次成功提问应只有一次 Chat 调用，没有该流程产生的 planning、embedding 或 rerank 调用。可额外验证 Stop generating、复制、导出为 Note/PDF。

以上是用户真实验收，不等同于已经通过学术验收。本轮开发验证使用本地样例与模拟 API，没有真实模型费用。用户主动提问时，所选资料和相关历史会发送到自己配置的 SiliconFlow API，并正常计费。

## 实际链路

`选定资料 → LanCarbon 本地解析/既有 OCR → PaperQA 原生完整上下文与回答模板 → 一次 Flash 生成 → 保存正文、Thinking、引用和 Usage`

- PaperQA 固定版本 `2026.8.12`。其原生 `Docs.aquery` 在模型调用边界导出最终 messages，Electron 使用现有客户端发出唯一一次请求；不是只贴一个 PaperQA 名称，也不是启动完整 PaperQA agent 搜索流程。
- 所有选定资料的完整**已解析文本**按原有阅读顺序进入上下文。不调用定位表、摘要、规划、重排、额外评判或二次改写。关闭 PaperQA 的摘要、预生成和迭代回答。
- 不移植原 LanCarbon 的答案规则合同、数值辅助或数值自动修复。只复用来源权限、指纹检查、引用跳转，以及通用 Markdown/LaTeX 显示规范和用户保存的回答风格。
- Python 子进程没有 API Key，禁止网络连接，只在临时目录中组装请求。Electron 继续使用现有电脑网络、密钥保护、取消、用量统计和费用估算。
- PDF 页码、EPUB 章节、Note/Book 行号随原文保留。每条聊天保存完整证据快照，重启可读；源文件已变更时不把旧引用跳到不对应的新内容。
- 多轮携带同一资料选择下最近六条已完成消息，最多 20,000 字符，不携带旧 Thinking，也不把切换资料前的内容带入新选择。每轮重新核对当前原文；历史回答只是对话上下文。
- 当前只允许 SiliconFlow 的 DeepSeek Flash 执行全文问答；普通无资料聊天的模型选择不变。不会自动改写原有模型配置或使用其他模型。

## 边界

- 当前上限为 500,000 原文字符、999 个解析段、750,000 UTF-8 字节的资料与历史 messages。超过上限或资料缺失、解析不完整时，发送前明确报错，请减少选取资料；不会静默截断或回退到旧 RAG。
- “全文”指现有解析器成功读出的全部文本，不表示已经核验 PDF 的视觉内容、表格或 OCR 数字完全正确。扫描件仍应核对关键页。
- 每轮重新提供所选全文，比只发送少量片段可能消耗更多输入 token。正文上限 8,192 token，支持的 SiliconFlow DeepSeek 使用 8,192 Thinking 额度，600 秒请求上限，不自动重试。
- 模型仍可能漏答或推断错误；没有通过代码检查就宣称模型答案全部正确。旧真实试验中的主体归属、范围和综合推断问题未被本次接入证明已经解决。
- 不清理开发数据即可保留本轮聊天。不要将 Data Location 指向日常数据目录。开发运行依赖本机 Python 环境，面向普通用户的安装包交付尚未制作。

## 开发和复现

- `npm run setup:paperqa`：创建 `.dev-workspace/paperqa-runtime` 并安装锁定的直接依赖，运行原生离线模板自检。不调用模型。也可显式设置 `LANCARBON_PAPERQA_PYTHON` 验证已有兼容环境。
- `npm run dev:paperqa`：构建后启动开发版。根目录快捷脚本直接使用已构建文件。
- `npm run test:rag`、`npm run typecheck`。
- `.dev-workspace/paperqa-runtime/Scripts/python.exe -m unittest discover -s tests -p "test_paperqa*.py"`。
- `npx playwright test tests/e2e/paperqa-dev.spec.ts --reporter=line`：临时数据、原生 PaperQA、模拟 API 的桌面测试；不接触日常数据和真实密钥。

隔离桌面检查覆盖 PDF/EPUB/Note/Book 四类来源、超过旧 96 段上限的完整输入、未选资料隔离、追问的一次请求、Usage、PDF 引用跳转、停止及重启恢复。原生 Python 检查覆盖多领域原文、引用标签与无网络适配。通过这些检查只说明接入行为正确。

本次完成：219 项 RAG 回归、29 项 Python 检查、20 项 AI/系统教程检查、类型检查、开发构建及上述桌面测试。桌面样例四个来源共 402 段，两轮问答恰好两次 Chat 请求和两条 Usage；使用独立安装的 PaperQA 运行环境复核通过。本次真实 API 费用为 0。
