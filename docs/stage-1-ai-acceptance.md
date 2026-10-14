# AI 配置与 Chat 验收

当前安装包：**LanCarbon 2.2.4**。使用原有 LanCarbon 快捷方式。SiliconFlow、OpenRouter 和 Others（BigModel）接入已验收；本次新增选词翻译，并将 Hourly 热力图改为三行八列。第一阶段仍等待用户验收翻译。自动化验证使用隔离目录与本地模拟接口，不调用真实账号。

## 翻译配置与验收

1. 打开 **Research → Translation Settings**。选择 **Use an existing AI connection → SiliconFlow**，直接复用已有密钥；选择 **Separate translation connection** 则可独立配置 SiliconFlow、OpenRouter 或 Others 的密钥、地址。聊天模型及提示词保持独立。
2. **Refresh translation models** 后选择 **tencent/Hunyuan-MT-7B**，或手填这个 Model ID，Display name 可填 Hunyuan MT；**Save translation settings → Test translation**。官方目录当前列为免费输入／输出，额度、限流及后续价格以平台为准：[SiliconFlow 定价](https://siliconflow.cn/pricing)。使用官方模板：[Tencent Hunyuan-MT](https://github.com/Tencent-Hunyuan/Hunyuan-MT)。Automatic 自动适配其用户消息模板，通用模型使用独立的学术翻译系统提示词。
3. 测试成功后点击侧栏 **Translate** 或按 **Ctrl+Alt+T**。在 Notes 和 Books 的 Edit、Preview 分别选择英文单词／短句；浮窗应显示原文与中文。也在 Research、Library 的可选取界面文字中验证。浮窗标题栏可拖动，位置会记住；关闭后普通选取不调用模型，每次启动默认关闭。
4. 切换选取时仅保留最新结果；重复选取相同文字显示 **Saved result**，不会再次产生 API 请求。翻译及手动测试在 Usage 的 **Purpose: Translation** 中统计；缓存复用不增加 Token／请求，取消不能撤销服务已收取的费用。
5. 单次最多 1,600 字符／250 词，只发送选取内容与翻译要求。密码、API Key 与接口地址排除。默认提示词要求准确、专业、只输出简体中文，不用 emoji；可在 **Translation prompt** 修改或恢复。
6. 翻译缓存上限 1,000 条／5 MB，位于 **Data/Research/Translation/cache.json**；Translation Settings 中 **Clear translation cache** 仅清理该缓存。独立配置密钥保存于 **Config/translation-connections.json**，可见掩码并用 **Remove translation key** 清除本地保存。复用的密钥继续在 AI Settings 中管理。
7. 在 **Usage → Model prices** 可选择仅用于翻译的模型。免费模型经平台确认后可把 CNY 输入／输出价格填零，否则费用可能显示 Unknown。已发生的历史费用不会被改价或模型删除重新计算。

## 用量界面验收

1. Research → Usage 默认 Today；Today、Last 7 days、Last 30 days 和自选日期可用，来源／模型／用途筛选仍保留。
2. 只保留 Requests、Tokens、Costs 三张卡片，标题和数字在同一行。Requests 每页十条，Tokens 列只显示总量，没有重复的分组表格。
3. Hourly 指定一天有 24 格，按三行八列排列，分别为 00–07、08–15、16–23；Daily 每天一格并标记月份，跨年可切换年份。悬浮格子显示时间／日期、总 Token、人民币费用；统计不受分页影响。
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

安装前备份完整 LanCarbon 文件夹及另选 Data 目录，包含 Config、Cache、Library、聊天、用量日志和价格。对应快照位于 **backups/pre-install-2.2.4-2026-10-14**，包含匹配的 2.2.3 安装包。验证后 release 保留 **2.2.4、2.2.3、2.2.2**；只清理更早安装包及其 blockmap。回滚前保留升级后的新编辑。

自动化验证结果及日常数据核对保存在 acceptance/2.2.4-verification.json。系统教程自动同步并增加 Selection Translation 页面；个人写作内容不参与教程覆盖。

验证：269 项单元测试、全部 19 个桌面场景及最终安装包、实际安装程序各 5 项核心场景通过。真实数据升级演练及安装后核对保留了 56 个既有写作条目、2 个个人 Book、30 个 Library 文件、2 个聊天的 16 条消息、2 条历史用量记录、3 个模型价格及汇率 6.69；原币费用、日志字节、加密配置与发布绑定保持一致。实际安装检查与最终证据见 acceptance/2.2.4-verification.json。

## English

Open **Research → Translation Settings** and reuse an existing connection or configure a separate SiliconFlow, OpenRouter or Others key. Select/enter a model, save and test. SiliconFlow currently lists **tencent/Hunyuan-MT-7B** with free input/output on its [official pricing page](https://siliconflow.cn/pricing); quotas and availability remain service-controlled. Automatic uses its [official translation template](https://github.com/Tencent-Hunyuan/Hunyuan-MT). General models use a separate academic Chinese-only system prompt.

Enable **Translate** in the sidebar or press **Ctrl+Alt+T**. Select a short English passage in Notes/Books Edit or Preview and selectable Research/Library/interface text. The floating panel shows source and Chinese, can be dragged, and remembers its position. Disable it to restore selection without model requests; it starts off at each launch. Keys/passwords/API addresses are excluded. Selections are limited to 1,600 characters / 250 words; only selected text and translation instructions are sent. Superseded requests are canceled, without reversing upstream charges.

Repeated selections use a bounded local cache (1,000 results / 5 MB), with an independent clear action. Translation and manual tests appear under **Usage → Purpose: Translation**; cache reuse adds no requests or tokens. Translation-only models can have prices in Model prices. Separate keys stay encrypted with masked previews and a local removal action, without changing Chat configuration. User acceptance of translation is still pending.

Use the existing shortcut. Usage defaults to Today, offers seven/thirty-day presets and custom dates, and retains source/model/purpose filters. Three compact cards place titles and values on one line. The single request table shows total tokens and CNY costs, ten requests per page.

Hourly activity has 24 cells for a selected local day, in three rows of eight (00–07, 08–15, 16–23). Daily activity uses a weekly calendar with month labels and a year control when needed. Hover cells for time/date, tokens and CNY cost. Totals and activity include all matching records, independently of pagination.

Model prices are editable. Removing and saving a model, deleting a service or changing its address automatically cleans obsolete prices, including earlier leftovers at startup. Historical price snapshots, original charges and request history stay intact. The editable USD-to-CNY display reference defaults to 7, without a live lookup; changing it updates historical CNY display values without repricing original charges. Missing data stays unknown. Viewing records works offline without model calls.

The full pre-install snapshot and matching previous installer are in backups/pre-install-2.2.4-2026-10-14. After verification, release retains 2.2.4, 2.2.3 and 2.2.2. Preserve later edits before restoring an older snapshot. Verify personal writing, resources, encrypted settings, chats, usage and publishing bindings. Validation evidence is in acceptance/2.2.4-verification.json. The managed tutorial includes a Selection Translation page.

Validation: 269 unit tests and all 19 desktop scenarios passed, together with five core scenarios run against the final installer payload. The real-data upgrade rehearsal preserved 56 existing writing records, two personal Books, 30 Library files, two chats with 16 messages, two historical usage records, three saved model prices and the exchange rate of 6.69. All five core installed-program scenarios and the daily-data audit also passed. Final evidence is recorded in acceptance/2.2.4-verification.json.
