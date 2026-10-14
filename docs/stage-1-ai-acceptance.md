# AI 配置与 Chat 验收

当前安装包：**LanCarbon 2.2.2**。使用原有 LanCarbon 快捷方式。

SiliconFlow、OpenRouter 和 Others（BigModel）的真实账号接入均已由用户验收，OpenRouter 的 Llama 4 Maverick 使用稳定。当前只增加用量统计、移除两个预设添加按钮，翻译留待后续验收。自动化检查使用隔离目录和本地 AI 测试服务，不调用真实账号或消耗用户额度。

## 用量统计验收

1. AI Settings 中不再有 Add GPT-6 Luna / Add DeepSeek V4 Pro；Refresh models、Model ID、Add model 和已保存模型继续可用。
2. 打开 Research → Usage。初始没有历史补算；Chat 和 Test model 后应出现来源、模型、Token、用途与状态记录。Today、Last 30 days、All time、日期、来源、模型与用途可筛选。
3. OpenRouter 返回金额时显示 Reported / USD。SiliconFlow 和 Others 未返回金额时，先在 Model prices 选择模型，填写每百万 Token 的输入／输出单价和币种，Save price 后发起新请求，费用显示 Estimated。缓存价格可单独填；留空按输入价估算。BigModel 免费型号可将输入、输出均填零。不能把 Unknown 当作零。
4. 修改单价不改写旧记录；取消、失败和自动重试分别留有状态，未知费用明确标示。删除聊天后统计仍保留。
5. 断网或重启后查看、筛选、Refresh 历史数据不增加模型调用。不同币种分别汇总，实际费用以平台账单为准。
6. 原有密钥、回答规范、模型列表、聊天、Notes、Books、Library 文件与发布设置仍正常。用量在 Data/Research/Usage；单价在 Config/ai-pricing.json。

## 已验收功能回归检查

1. **模型切换**：在同一会话用 DeepSeek 问身份，再换 Llama 问身份，检查回复记录的服务与模型。切换后重复同一问题，新模型不接收其他模型对此题的旧答案，旧记录仍保留；不同模型独立生成仍可能得到相似答案，不能据此断言调用错误。
2. **回答规范**：进入 Research → AI Settings，展开 **Response guidelines · all chat models**。默认要求专业准确、冷静中立、简洁高效，不用 emoji、不编造资料。修改 **System prompt → Save guidelines** 后检查各模型后续回复；**Restore default guidelines** 填入默认内容，保存后生效。旧回复不会改写。
3. **聊天顶部**：直接显示会话名称，保留重命名、删除、模型选择与 AI Settings 入口。
4. **密钥管理**：已有密钥显示 Configured 与前四位／后四位掩码，无须重填。替换密钥后保存，或使用 **Remove saved key** 经确认清除本地密钥；模型及会话保留。平台密钥需到平台单独撤销。
5. **限流处理**：Test 与 Chat 在输出开始前遇到临时 429 或可恢复服务错误时最多自动重试两次；遵循服务器等待时间，等待超过 120 秒则交给用户稍后重试。界面显示等待与重试状态，分别使用 **Stop test** 或 **Stop generating** 取消。已出现正文或推理文字的回复不自动重发。持续共享池限流不能靠客户端保证成功。
6. **保留与重启**：重启后检查原有配置、回答规范、模型列表、聊天记录，以及个人 Notes、Books、资源和 Book 发布连接。

## Others 接入参考

选择 **Others**，填写配置名称、服务提供的 API base address 和该服务的 API Key。服务需兼容 OpenAI Chat Completions；基础地址不包含 /chat/completions。点击 **Refresh models**，或手动填准确 Model ID 与 Display name，点击 **Add model → Save models → Test model**。在 Chat 中选择该配置并实际聊天。服务地址、模型权限和支付方式以服务官方资料为准，LanCarbon 继续跟随电脑网络。

## 备份与回滚

备份需包含完整 LanCarbon 目录，包括保存密钥解密状态的 Cache；另选的数据目录也要备份。安装前完整目录及匹配的 2.2.1 安装包已保存在 **backups/pre-install-2.2.2-2026-10-14**。安装包验证后 release 已保留 **2.2.2、2.2.1、2.2.0**，只清理更早的安装包和配套 blockmap。

已完成 252 项单元测试、18 项桌面场景检查、最终安装包的相关场景验证和实际安装后的 4 项隔离检查。日常数据核对确认：56 个既有写作条目、2 个个人 Book、30 个 Library 文件、2 个聊天与 16 条消息保持一致；3 套服务配置可解密，配置密文及聊天文件字节保持一致，Book 发布绑定保留。官方教程同步新增的用量说明，未调用真实 API 或消耗用户额度。

回滚前关闭软件，并另行保留升级后的新增编辑；恢复快照会回到备份日期。用户自己的 Notes 和 Books 与系统教程同步分开处理。系统教程由软件自动更新，用户不应编辑。

## English

Use the existing shortcut. SiliconFlow, OpenRouter and Others (BigModel) account connectivity has been accepted. This update removes the two preset Add buttons and adds Research → Usage; translation will be handled separately. Verify token counts and costs grouped by source, model and purpose; reported USD charges from OpenRouter; and future estimates after saving per-million-token input/output/cache prices. Zero prices are valid for a confirmed free model. Missing data stays Unknown. Price changes do not recalculate past requests, retry attempts are distinct, and deleting chats does not erase usage. Filters, Refresh and offline restart read local records without model calls. Preserve all existing writing, connections and chats.

Tests and Chat retry transient pre-output rate limits/server errors at most twice, honor server backoff and allow cancellation. Partial output is never automatically replayed. Persistent upstream shared-pool limits remain a service issue. Confirm settings, chats, personal writing, resources and publishing connections after restart. Others requires the actual service's base URL, key and model ID, followed by Test model and real Chat acceptance.

The matching backup and previous installer are in backups/pre-install-2.2.2-2026-10-14. Release retains 2.2.2, 2.2.1 and 2.2.0 after installer verification. Preserve later edits before restoring an older snapshot. Validation covered 252 unit tests, 18 desktop scenarios, the extracted final installer, and four isolated scenarios on the installed executable. The daily data audit preserved 56 existing writing records, two personal Books, 30 Library files, two chats with 16 messages, all three encrypted service configurations and publishing bindings. No live API calls or user credits were used.
