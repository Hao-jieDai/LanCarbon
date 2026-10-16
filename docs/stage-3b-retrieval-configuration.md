# 3B 检索模型配置

本轮完成 Embedding、可选 Rerank、向量缓存和混合检索。文献问答、引用与跳转会在 3C 接入 Chat；用户在第三阶段整体完成后统一验收问答效果，本轮只需按需配置并测试 API。

打开 **Workshop → AI Settings → Retrieval**：

1. Embedding 选择 **Use an existing connection → SiliconFlow**，Model ID 填 **BAAI/bge-m3**，勾选 **Enable semantic retrieval**。
2. 按需勾选 **Use reranking**，同样复用 SiliconFlow，Model ID 填 **BAAI/bge-reranker-v2-m3**。
3. 点击 **Save retrieval settings**，再分别点击 **Test Embedding** 和 **Test Rerank**。测试只发送软件内置的短文本，不发送个人资料。
4. 在 **Workshop → Usage → Model prices** 为这两个模型填写平台当前价格；当前免费时输入和输出均填 **0**。复用 SiliconFlow 连接后，检索、Chat 沿用同一余额账户；独立密钥也可手动归入同一计费账户。

需要独立 API Key 时，将对应 Connection 改为 **Separate retrieval connection**。Others 可填写自定义基础地址；Embedding 需要 `/embeddings` 接口，Rerank 需要 `/rerank` 接口。已有聊天模型列表不会改变。密钥加密保存在 Config，界面仅显示前四位和后四位，可单独删除。

截至 2026-10-16，[SiliconFlow 官方价格页](https://www.siliconflow.cn/pricing)列出 BAAI/bge-m3 和 BAAI/bge-reranker-v2-m3 为免费，Pro 对应型号为每百万 tokens ¥0.07。免费额度、限流及账号权限以平台实际情况为准。先用免费组合；免费服务持续限流时可选择对应 Pro 型号，平台返回的模型 ID 与当时价格为准。更换 Embedding 模型需要重新准备向量，更换 Rerank 不需要重建向量。

可选的 **Index tools** 供内部检查：使用 Knowledge base 当前选择的资料，Prepare 后进行 Retrieval check。系统采用关键词与语义混合排名，再按需重排；正文、页码和章节位置仍保留。该工具不是用户统一验收前必须操作的步骤。3C 会把资料准备与检索接入实际聊天流程。

向量缓存上限 128 MB，清除只删除派生向量；停止保留已完成批次。普通写作不会调用模型。需要联网的只有显式模型测试、向量准备和语义／重排请求。本轮完整回滚快照为 `backups/pre-install-2.4.1-2026-10-16`。

---

# Retrieval configuration

Open **Workshop → AI Settings → Retrieval**. Reuse SiliconFlow or save a separate retrieval connection, configure **BAAI/bge-m3** for Embedding and optional **BAAI/bge-reranker-v2-m3** for Rerank, save and run the built-in sample tests. Set current model prices in Usage; free models use zero input/output prices. Existing connection reuse preserves Chat model lists and billing-account membership. Independent keys can share an account explicitly. Source vectors are local and bounded; only explicitly requested preparation/search sends document text to the selected services. Grounded Chat and final user acceptance follow in 3C.
