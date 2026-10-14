# AI 配置与 Chat 验收

当前安装包：**LanCarbon 2.2.3**。使用原有 LanCarbon 快捷方式。SiliconFlow、OpenRouter 和 Others（BigModel）接入已验收；本次调整 Usage，翻译另行更新。自动化验收只使用隔离目录与本地测试服务，不调用真实账号。

## 用量界面验收

1. Research → Usage 默认 Today；Today、Last 7 days、Last 30 days 和自选日期可用，来源／模型／用途筛选仍保留。
2. 只保留 Requests、Tokens、Costs 三张卡片，标题和数字在同一行。Requests 每页十条，Tokens 列只显示总量，没有重复的分组表格。
3. Hourly 指定一天有 24 格；Daily 每天一格并标记月份，跨年可切换年份。悬浮格子显示时间／日期、总 Token、人民币费用；统计不受分页影响。
4. Model prices 可编辑模型单价，并设置 1 USD = CNY；默认参考值 7，可自行调整，不实时联网。人民币费用合并显示，悬浮费用可查看原币金额及 Reported／Estimated 来源。
5. 修改汇率只改变历史美元费用的人民币显示值；修改单价不重新计算旧请求。免费型号可填零；未知数据不当作零。
6. 删除模型后保存配置，或删除服务，价格自动清理；此前已经删除的模型遗留价格也会清理。历史费用、请求记录及聊天保留。保留的模型价格不应被清理。
7. 重启或离线后查看、筛选和刷新不增加模型调用。核对 Notes、Books、Library、API 配置、聊天与发布连接。

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

安装前备份完整 LanCarbon 文件夹及另选 Data 目录，包含 Config、Cache、Library、聊天、用量日志和价格。对应快照位于 **backups/pre-install-2.2.3-2026-10-14**，包含匹配的旧安装包。验证后 release 保留 **2.2.3、2.2.2、2.2.1**；只清理更早安装包及其 blockmap。回滚前保留升级后的新编辑。

自动化验证结果及日常数据核对保存在 acceptance/2.2.3-verification.json。系统教程自动同步；个人写作内容不参与教程覆盖。

已通过 256 项单元测试、18 个桌面场景（其中 Book 构建与 Library 经单独复查通过）、最终安装包的 4 项核心场景，以及实际安装后的 4 项检查。真实数据升级演练及安装后核对保留了 56 个既有写作条目、2 个个人 Book、30 个 Library 文件、2 个聊天的 16 条消息、2 条历史用量记录和 4 个模型价格；原币费用、日志字节、加密配置及发布绑定保持一致。

## English

Use the existing shortcut. Usage defaults to Today, offers seven/thirty-day presets and custom dates, and retains source/model/purpose filters. Three compact cards place titles and values on one line. The single request table shows total tokens and CNY costs, ten requests per page.

Hourly activity has 24 cells for a selected local day. Daily activity uses a weekly calendar with month labels and a year control when needed. Hover cells for time/date, tokens and CNY cost. Totals and activity include all matching records, independently of pagination.

Model prices are editable. Removing and saving a model, deleting a service or changing its address automatically cleans obsolete prices, including earlier leftovers at startup. Historical price snapshots, original charges and request history stay intact. The editable USD-to-CNY display reference defaults to 7, without a live lookup; changing it updates historical CNY display values without repricing original charges. Missing data stays unknown. Viewing records works offline without model calls.

The full pre-install snapshot and matching previous installer are in backups/pre-install-2.2.3-2026-10-14. After verification, release retains 2.2.3, 2.2.2 and 2.2.1. Preserve later edits before restoring an older snapshot. Verify personal writing, resources, encrypted settings, chats, usage and publishing bindings. Validation evidence is in acceptance/2.2.3-verification.json. Translation is a separate update.

Validation passed 256 unit tests, all 18 desktop scenarios (Book build and Library passed isolated rechecks), four final-installer scenarios and four installed-program checks. Rehearsal and actual-data audits preserved 56 existing writing records, two personal Books, 30 Library files, two chats with 16 messages, two usage records and four saved model prices. Original charges, ledger bytes, encrypted settings and publishing bindings were preserved.
