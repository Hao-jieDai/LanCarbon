# PaperQA 全文问答安装与验收

安装版在资料聊天中启用 PaperQA 全文方案，复用现有 SiliconFlow DeepSeek Flash 配置。运行环境随包提供，不需要另装 Python、Docker 或 WSL。历史聊天、模型配置、Library、用户 Notes 和 Books 保留；ReadMe 和系统教程按原有规则同步。

## 验收

1. 正常打开 LanCarbon，进入 **Workshop → Chat → New chat**，选择现有的 **SiliconFlow · DeepSeek Flash**。
2. 在输入框上方 **Choose sources** 选择原有文献，无需重新导入，也无需准备 embedding/rerank。
3. 先问“这几篇文章对搁浅资产的定义和衡量有什么不同？”，再自然追问单位、研究范围、方法或主体归属。也可以沿用自己之前的问题，不必把格式固定成测试题。
4. **Evidence** 应显示 **PaperQA · full text**。点击引用，核对是否打开实际支持回答的原页或段落。检查金额、单位、研究条件以及作者区分。
5. 关闭重开，确认聊天、Thinking 和引用保留；可继续使用复制、导出 PDF/Note。Usage 中这条问答应只有一次 Chat 调用，没有它产生的规划、嵌入或重排请求。

建议新开聊天评价新流程，避免混入旧答案；旧聊天仍可正常查看和导出。旧记录中的 keyword/hybrid/reranked 标识不被改写。

## 范围和限制

PaperQA 组织全部选定的成功解析原文，Electron 发出一次 Flash 请求。没有中间定位表、摘要、规划、模型核对和二次改写；不走旧 RAG 的数值自动修复。引用、文件变更检查及通用 Markdown/LaTeX 显示继续使用。Python 无密钥且禁止联网，模型调用仍走原有 Electron 客户端与电脑网络。

正文上限 8,192 token，受支持的 Flash 使用 8,192 Thinking 额度；不自动重试。每轮原文最多 500,000 字符/999 段，资料与历史 messages 最多 750,000 UTF-8 字节，同范围历史最近六条完成消息/20,000 字符。超限或部分解析在发送前停止，不静默删减或回退旧检索；请缩小资料范围。全文指解析结果，不保证扫描件、表格和公式都被准确读出。模型仍可能解释错误，真实回答质量需要用户验收。

本轮安装验证只使用本地通用样例和模拟 API，不花费用户模型额度。安装完成与学术验收通过是两件事。本轮按用户明确要求，在安装功能检查通过后安装，再由用户实际问答验收。

## 构建与维护

- 应用版本 2.4.13；不创建 Tag/Release，不推送。
- `npm run prepare:paperqa` 生成 `build/paperqa-runtime`，`npm run dist` 自动执行此步骤并把运行环境放入 `resources/paperqa-runtime`。
- 固定 PaperQA 2026.8.12 及 `scripts/paperqa-runtime-lock.txt` 中的全部依赖。构建前在 `.dev-workspace/paperqa-runtime` 使用 Python 3.13.14 安装该锁定文件；构建拒绝不匹配版本和 editable 包。
- 内嵌 Python 使用[官方 Windows embeddable package](https://www.python.org/downloads/release/python-31314/)，构建校验官方 SHA-256。没有复制系统 Python 安装目录。随包保留 Python LICENSE 及依赖包的许可证/元数据。
- 运行时通过相对目录加载库，禁止使用开发 Python 环境或环境变量覆盖安装版运行时。`runtime-manifest.json` 记录包版本及文件摘要，可对最终安装内容核验。
- 打包后设置 `E2E_EXECUTABLE` 为解包/实际安装的 LanCarbon.exe，运行 `tests/e2e/paperqa-dev.spec.ts`。测试使用临时资料、模拟接口、故意无效的开发 Python 路径，验证安装版仍能全文问答、追问、引用、Usage、停止和重启。
- 每次更新前备份 Data、Library、Config 和 Cache/Local State；启动后仅允许官方教程/ReadMe同步，用户内容和配置必须与备份核对。按项目规则保留最新三个安装版本。
- 如需回滚到不识别 full-text 聊天记录的旧版，应同时恢复安装前的数据与配置备份，不能直接让旧版读取新增的全文聊天；恢复前另存升级后新增的个人内容。

独立开发入口仍可使用，见[开发说明](rag-paperqa-development.md)。历史实验预算与账本保持关闭，本次安装不重开真实 API 测试。
