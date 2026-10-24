# PaperQA 全文问答安装与验收

安装版在资料聊天中启用 PaperQA 全文方案，使用当前选择的已配置聊天模型（SiliconFlow、OpenRouter 或 Others）。运行环境随包提供，不需要另装 Python、Docker 或 WSL。历史聊天、模型配置、Library、用户 Notes 和 Books 保留；ReadMe 和系统教程按原有规则同步。

## 验收

1. 正常打开 LanCarbon，进入 **Workshop → Chat → New chat**，选择已配置的聊天模型，例如 **OpenRouter · Grok** 或 **SiliconFlow · DeepSeek Flash**。
2. 在输入框上方 **Choose sources** 选择原有文献，无需重新导入，也无需准备 embedding/rerank。
3. 先问“这几篇文章对搁浅资产的定义和衡量有什么不同？”，再自然追问单位、研究范围、方法或主体归属。也可以沿用自己之前的问题，不必把格式固定成测试题。
4. **Evidence** 应显示 **PaperQA · full text**。点击引用，核对是否打开实际支持回答的原页或段落。检查金额、单位、研究条件以及作者区分。
5. 关闭重开，确认聊天、Thinking 和引用保留；可继续使用复制、导出 PDF/Note。Usage 中这条问答应只有一次 Chat 调用，没有它产生的规划、嵌入或重排请求。

建议新开聊天评价新流程，避免混入旧答案；旧聊天仍可正常查看和导出。旧记录中的 keyword/hybrid/reranked 标识不被改写。

## 范围和限制

PaperQA 组织全部选定的成功解析原文，Electron 向当前选择的聊天模型发出一次请求。没有中间定位表、摘要、规划、模型核对和二次改写；不走旧 RAG 的数值自动修复。引用、文件变更检查及通用 Markdown/LaTeX 显示继续使用。Python 无密钥且禁止联网，模型调用仍走原有 Electron 客户端与电脑网络。

支持现有 Chat Completions 连接，服务端仍可因模型权限或上下文容量拒绝请求，软件显示原有错误，不静默删减资料或自动换模型。除保留原 SiliconFlow Flash 的温度设置外，不强制给其他模型发送温度；thinking_budget 仅由既有适配器发给受支持的 SiliconFlow DeepSeek。

正文上限 8,192 token，受支持的 Flash 使用 8,192 Thinking 额度；不自动重试。每轮原文最多 500,000 字符/999 段，资料与历史 messages 最多 750,000 UTF-8 字节，同范围历史最近六条完成消息/20,000 字符。超限或部分解析在发送前停止，不静默删减或回退旧检索；请缩小资料范围。全文指解析结果，不保证扫描件、表格和公式都被准确读出。模型仍可能解释错误，真实回答质量需要用户验收。

本轮安装验证只使用本地通用样例和模拟 API，不花费用户模型额度。安装完成与学术验收通过是两件事。本轮按用户明确要求，在安装功能检查通过后安装，再由用户实际问答验收。

## 构建与维护

- 应用版本 2.4.14；不创建 Tag/Release，不推送。
- `npm run prepare:paperqa` 生成 `build/paperqa-runtime`，`npm run dist` 自动执行此步骤并把运行环境放入 `resources/paperqa-runtime`。
- 固定 PaperQA 2026.8.12 及 `scripts/paperqa-runtime-lock.txt` 中的全部依赖。构建前在 `.dev-workspace/paperqa-runtime` 使用 Python 3.13.14 安装该锁定文件；构建拒绝不匹配版本和 editable 包。
- 内嵌 Python 使用[官方 Windows embeddable package](https://www.python.org/downloads/release/python-31314/)，构建校验官方 SHA-256。没有复制系统 Python 安装目录。随包保留 Python LICENSE 及依赖包的许可证/元数据。
- 运行时通过相对目录加载库，禁止使用开发 Python 环境或环境变量覆盖安装版运行时。`runtime-manifest.json` 记录包版本及文件摘要，可对最终安装内容核验。
- 打包后设置 `E2E_EXECUTABLE` 为解包/实际安装的 LanCarbon.exe，运行 `tests/e2e/paperqa-dev.spec.ts`。测试使用临时资料、模拟接口、故意无效的开发 Python 路径，验证安装版仍能全文问答、追问、引用、Usage、停止和重启。
- 运行环境排除第三方 benchmark results 和 ARM setuptools 启动器，避免 NSIS 长路径及架构过滤导致内容清单不一致；运行代码与许可证保留。
- `build/installer.nsh` 的卸载宏只接受名为 Application 的目录，先将其整体移到同盘唯一的临时目录，再移除旧程序，避免默认逐文件跨盘搬移及临时路径膨胀。`node scripts/test-installer-removal.cjs` 编译并执行通用样例，验证正常移除及数据目录拒绝保护；不操作真实安装或注册表。
- 每次更新前备份 Data、Library、Config 和 Cache/Local State；启动后仅允许官方教程/ReadMe同步，用户内容和配置必须与备份核对。按项目规则保留最新三个安装版本。
- 如需回滚到不识别 full-text 聊天记录的旧版，应同时恢复安装前的数据与配置备份，不能直接让旧版读取新增的全文聊天；恢复前另存升级后新增的个人内容。

独立开发入口仍可使用，见[开发说明](rag-paperqa-development.md)。历史实验预算与账本保持关闭，本次安装不重开真实 API 测试。

## 本次安装核对

最终已安装到D:/LanCarbon。219项RAG、26项AI/教程/目录/导出单元检查、类型检查和构建通过；打包版4项桌面检查通过，去除无关第三方长路径测试样例与ARM启动器后再次验证全文问答。最终日常安装可执行程序使用临时数据通过全文问答/追问/引用/Usage/停止/重启检查；这些均为模拟接口，不是学术验收。安装程序及内置运行环境9536个文件与最终构建逐项匹配。备份202文件197050613字节；核对57篇个人Note、2本个人Book、15个聊天、3个已配置连接及10条用量，用户写作/Library/聊天/用量/配置均保留，ReadMe及官方教程同步。真实API费用0元。release仅保留2.4.13、2.4.12、2.4.11。安装包233711498字节，SHA-256 2CAAA080F6AE0D07EC3A74306A5BA076B93271550367FEAF798E694490EE36EF。用户下一步正常打开软件，选Flash和现有资料，新开Chat自然多轮验收。私有备份和验证清单在acceptance/paperqa-2.4.13；回滚旧版本需同步恢复备份以免旧版无法读取新增full-text聊天。
