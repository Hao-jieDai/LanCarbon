# AI 配置与 Chat 验收

当前安装包：**LanCarbon 2.2.0**。打开原有 LanCarbon 快捷方式即可使用。

已完成生产构建、234 项单元测试、17 个桌面场景和 4 项实际安装程序检查。已从原来的安装位置升级，并核对 56 条个人 Notes／Book 页面、2 本个人 Books 和 22 个个人资源文件保持一致。真实账号的两个模型调用由下面的步骤验收。

## 配置两个验收模型

| 服务 | API base address（软件预填） | Model ID | Display name |
| --- | --- | --- | --- |
| SiliconFlow | `https://api.siliconflow.cn/v1` | `deepseek-ai/DeepSeek-V4-Pro` | DeepSeek V4 Pro |
| OpenRouter | `https://openrouter.ai/api/v1` | `openai/gpt-6-luna` | GPT-6 Luna |

1. 在对应平台创建 API Key。SiliconFlow：[控制台](https://cloud.siliconflow.cn/)；OpenRouter：[API Keys](https://openrouter.ai/settings/keys)。密钥只在 LanCarbon 中填写。
2. 打开 **Research → AI Settings → SiliconFlow**，粘贴 SiliconFlow 的密钥，点击 **Add DeepSeek V4 Pro**。
3. 点击 **Save models**，然后 **Test model**；看到成功提示后完成连接测试。
4. 切到 **OpenRouter**，粘贴 OpenRouter 的密钥，点击 **Add GPT-6 Luna → Save models → Test model**。
5. 也可以点击 **Refresh models** 获取实时目录，再填写或选择 Model ID、修改 Display name、点击 **Add model**。如果平台更新名称，以其目录中的准确 ID 为准。
6. 网络跟随电脑与系统代理。按日常方式连接网络后重试即可，LanCarbon 没有单独的代理配置。

## 实际聊天验收

- 在 **Chat** 的模型选择框分别选择 **SiliconFlow · DeepSeek V4 Pro** 和 **OpenRouter · GPT-6 Luna**。
- 分别发送一条消息并得到回复，然后追问，确认上下文可延续。每条回复显示实际使用的服务和配置模型。
- 生成期间可以切到 Notes 或 Books 继续写作；返回 Chat 查看回复。
- 检查 **Stop generating**、停止后 **Retry reply**、**Copy**、**New chat**、**Rename chat** 和 **Delete chat**。
- 关闭再打开软件，确认两个服务配置和聊天记录恢复，密钥栏显示已安全保存且不会显示密钥原文。
- 可以要求模型输出 Markdown 表格、代码块和数学公式，检查回复完成后的排版。

同一会话切换服务后，下次发送会携带相关历史。只有发送的会话文字会提交到所选服务；Notes、Books 和 Library 文件不会自动附加。本阶段没有文档问答、PDF/EPUB 阅读、Embedding、Rerank 或文献自动化。

**Test model** 会发送一次小型请求，可能使用平台额度；实际成功还取决于账号余额、模型访问权限和电脑网络。研发验证使用本地测试服务，真实账号调用由这次验收确认。

## 保存与回滚

密钥加密保存在 **Config/ai-settings.json**，会话位于实际数据位置下的 **Research/Chats/chats.json**。切换电脑或 Windows 账户后，密钥可能需要重新输入。数据位置变化会一并复制聊天记录。

安装前的完整快照和匹配的旧版安装包保存在 `backups/pre-install-2.2.0-2026-10-14`。release 保留 2.2.0、2.1.1、2.1.0 三个版本。原有 Notes、Books、附件管理记录及全部 Book 发布连接已核对保留。回滚前关闭软件并保留升级后的新增编辑；恢复快照只接受新的空目录，不能覆盖日常使用中的目录。

## English

Open **Research → AI Settings**, paste each service's own API key, add its suggested model, select **Save models**, then **Test model**. SiliconFlow uses `deepseek-ai/DeepSeek-V4-Pro`; OpenRouter uses `openai/gpt-6-luna`. The official base addresses are prefilled. Refresh the platform catalogue or enter a model ID manually if needed.

In Chat, select each service/model, send a message and follow up. Check streaming, stopping, retrying, copying, renaming, deleting, writing-workspace switching and restart recovery. Connections follow the computer's network. Keys are encrypted in Config; conversations are local in the active Data/Research/Chats folder. Real account availability, balance and network access are confirmed by user acceptance; automated verification uses a local test service.
