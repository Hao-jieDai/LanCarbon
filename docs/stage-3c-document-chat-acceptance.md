# 文献问答整体验收

本轮安装版本为 2.4.3。3A、3B、3C 在这里一起验收，不需要单独操作索引页面。

1. 打开 **Workshop → AI Settings → Retrieval**。Embedding 可复用现有 SiliconFlow 或 OpenRouter 连接；点击 **Refresh Embedding models**，选择模型，勾选 **Enable semantic retrieval**，保存并 **Test Embedding**。也可以直接填写准确的模型 ID。
2. 如需重排，勾选 **Use reranking**，选择其连接，点击 **Refresh Rerank models** 后选模型，保存并 **Test Rerank**。Embedding、Rerank、Chat 可以来自不同服务。模型目录不保证账户权限，成功测试后再比较文献效果。
3. 打开 **Chat**，点击消息输入框正上方的 **Choose sources**，先只选一篇你熟悉的文字型 PDF。发送“请概括研究问题、方法、主要结论，并引用原文依据”。第一次会自动准备，后续复用未变化的资料；不需要打开 Knowledge base。
4. 点击回答中的 **[S1]** 等引用，或展开 **Evidence → Open source**。核对片段与原文是否一致、PDF 是否到对应页。再测试 EPUB 的章节／段落和 Note／Book 的对应行。
5. 选择两三篇文献，问“分别比较这些文献的方法、结论和分歧，说明每个结论的来源”。检查各篇文献都有对应证据；资料未说明的内容应明确说明不足。
6. 加入一个 Note 或 Book 页面，确认其内容也参与回答。**Include linked attachments** 可纳入其引用的文献；共享原件不会复制到 assets。
7. 在同一组资料和同一个 Chat 模型下，更换 Embedding，重复同一个问题。下一次提问自动准备新模型的向量。单独更换 Rerank 时不重新生成文献向量。比较引用准确性、是否遗漏关键内容、速度和 Usage 中的消耗。
8. **Clear sources** 回到普通聊天。还可以检查 Stop generating、Retry reply、重启后保留资料范围，以及正文修改后旧引用提示需要重新提问。

建议先用 SiliconFlow 的 `BAAI/bge-m3` 和可选的 `BAAI/bge-reranker-v2-m3` 建立一个比较基准，再测试 OpenRouter 当前目录里的候选。价格与可用性以各自账户和当时目录为准；免费模型在 Usage → Model prices 将相应输入／输出价格设为 0。

截至本轮核对，OpenRouter 的公开 Embedding 目录包括 `nvidia/nemotron-3-embed-1b:free`、`nvidia/llama-nemotron-embed-vl-1b-v2:free` 和 `liquid/lfm-2.5-embedding-350m:free`。Liquid 条目的上下文仅 512 tokens，长片段或长问题更容易触及输入限制；优先比较 NVIDIA 两项。目录中的免费价格不代表速度、配额或账户权限已经验证，具体效果留待你的真实文献验收。

官方接口依据：[Embedding 目录](https://openrouter.ai/api/v1/embeddings/models)、[Embedding 列表接口](https://openrouter.ai/docs/api/api-reference/embeddings/list-all-embeddings-models)、[Rerank 接口](https://openrouter.ai/docs/api/api-reference/rerank/submit-a-rerank-request)。Rerank 候选通过当前目录刷新获取，不硬编码免费数量。

本轮自动化测试使用模拟服务，未使用你的 API Key 发出真实问答或扣费。原始资料、个人 Notes／Books、配置密钥、历史聊天、用量、价格和余额需在升级核对中保留。完整升级前快照位于 `backups/pre-install-2.4.3-2026-10-16`，其中包含匹配的 2.4.2 安装包和整套数据。

支持文字型 PDF、流式 EPUB 与 Markdown；扫描件 OCR、DRM／固定版式 EPUB 及 Word 解析不在本轮范围。回答基于受控上下文预算内的资料片段，并非逐页审计；关键事实仍需对照原文。缓存保存在本机，不下载本地模型。

## 合并问题回归验收

- 新建一个 Chat，选择之前测试的同一篇论文，使用相同的合并问题和 Chat 模型，先复用现有的免费 Embedding／Rerank 配置。新回复不会重写之前保存的回答。
- 检查研究范围、折现率、三条路径总额、搁浅资产定义、MIX 技术选择机制、区域差异和补充数据范围是否逐项回答，金额单位和引用是否正确。
- 展开 Evidence，确认第 9 页的区域数值和第 12 页的静态技术选择说明进入资料。较短资料在容量允许时完整保留；长资料按小问题优先分配相关片段并补充邻段。
- 点击引用检查原文位置；重启后确认新旧聊天和超过 24 条的证据均能读取。
- 在输入框填写草稿后打开选择器或清除资料，确认不会误发送消息或丢失草稿；选择栏固定在输入框上方，聊天滚动时仍可操作。
- 合并问题最多产生 8 个主检索请求，未命中时最多增加 2 次聚焦补查；不额外调用 Chat 来拆题。文献向量仍复用缓存，多次检索和较完整的 Chat 上下文可能增加用量，按 Usage 实际记录核对。

自动化测试与本地原文回放不调用用户模型。真实模型的回答准确性仍需按上述步骤重新验收。

本轮验证：387 项单元／组件测试、41 项桌面测试通过；安装后的程序再次通过 3 项文献问答与教程升级测试。使用原测试的六组已保存候选回放，新选材在预算内保留全部 61 个片段，包含此前遗漏的关键原文。升级后核对 4,537 个既有资料与配置文件，SHA-256 均与备份一致。release 保留 2.4.3、2.4.2、2.4.1 三个安装包及其配套文件。
