# AI 配置与 Chat 验收

当前安装包：**LanCarbon 2.2.1**。使用原有 LanCarbon 快捷方式。

SiliconFlow 与 OpenRouter 的真实账号接入已经由用户验收，OpenRouter 的 Llama 4 Maverick 使用稳定。Others 的真实服务配置留待此次修正后验收。自动化检查使用隔离目录和本地 AI 测试服务，不调用真实账号或消耗用户额度。

## 本次修正验收

1. **模型切换**：在同一会话用 DeepSeek 问身份，再换 Llama 问身份，检查回复记录的服务与模型。切换后重复同一问题，新模型不接收其他模型对此题的旧答案，旧记录仍保留；不同模型独立生成仍可能得到相似答案，不能据此断言调用错误。
2. **回答规范**：进入 Research → AI Settings，展开 **Response guidelines · all chat models**。默认要求专业准确、冷静中立、简洁高效，不用 emoji、不编造资料。修改 **System prompt → Save guidelines** 后检查各模型后续回复；**Restore default guidelines** 填入默认内容，保存后生效。旧回复不会改写。
3. **聊天顶部**：直接显示会话名称，保留重命名、删除、模型选择与 AI Settings 入口。
4. **密钥管理**：已有密钥显示 Configured 与前四位／后四位掩码，无须重填。替换密钥后保存，或使用 **Remove saved key** 经确认清除本地密钥；模型及会话保留。平台密钥需到平台单独撤销。
5. **限流处理**：Test 与 Chat 在输出开始前遇到临时 429 或可恢复服务错误时最多自动重试两次；遵循服务器等待时间，等待超过 120 秒则交给用户稍后重试。界面显示等待与重试状态，分别使用 **Stop test** 或 **Stop generating** 取消。已出现正文或推理文字的回复不自动重发。持续共享池限流不能靠客户端保证成功。
6. **保留与重启**：重启后检查原有配置、回答规范、模型列表、聊天记录，以及个人 Notes、Books、资源和 Book 发布连接。

## Others 配置验收

选择 **Others**，填写配置名称、服务提供的 API base address 和该服务的 API Key。服务需兼容 OpenAI Chat Completions；基础地址不包含 /chat/completions。点击 **Refresh models**，或手动填准确 Model ID 与 Display name，点击 **Add model → Save models → Test model**。在 Chat 中选择该配置并实际聊天。服务地址、模型权限和支付方式以服务官方资料为准，LanCarbon 继续跟随电脑网络。

## 备份与回滚

升级前完整目录及匹配的 2.2.0 安装包位于 **backups/pre-install-2.2.1-2026-10-14**。本次安装包验证后 release 保留 **2.2.1、2.2.0、2.1.1**，只清理更早的安装包和配套 blockmap。

回滚前关闭软件，并另行保留升级后的新增编辑；恢复快照会回到备份日期。用户自己的 Notes 和 Books 与系统教程同步分开处理。系统教程由软件自动更新，用户不应编辑。

## English

Use the existing shortcut. SiliconFlow and OpenRouter account connectivity has already been accepted; Llama 4 Maverick is the accepted OpenRouter model. Validate model switching, editable shared response guidelines, the compact conversation heading, masked saved keys and confirmed local key removal. Repeated questions after switching omit other models' earlier answers to that question from the outgoing request while preserving the transcript. Similar independently generated answers are still possible.

Tests and Chat retry transient pre-output rate limits/server errors at most twice, honor server backoff and allow cancellation. Partial output is never automatically replayed. Persistent upstream shared-pool limits remain a service issue. Confirm settings, chats, personal writing, resources and publishing connections after restart. Others requires the actual service's base URL, key and model ID, followed by Test model and real Chat acceptance.

The matching backup and previous installer are in backups/pre-install-2.2.1-2026-10-14. Release retains 2.2.1, 2.2.0 and 2.1.1 after installer verification. Preserve later edits before restoring an older snapshot.
