# AI 配置与 Chat 验收

第一阶段已验收完成：SiliconFlow、OpenRouter、Others（BigModel）、Chat、用量统计，以及复用和独立翻译配置；Notes／Books 选词翻译已经用户确认。翻译浮窗滚动微调并入第二阶段，阶段验收不再等待独立翻译测试。以下保留功能回归检查方法与已完成的安装验证记录。

## 翻译配置与验收

1. 打开 **Research → Translation Settings**。用 **Use an existing AI connection** 选择已有服务及已保存模型，例如 BigModel 的 GLM-4 Flash；该模式没有 Refresh、Model ID 或 Display name 编辑。新增独立配置时使用 **Separate translation connection**，再填写地址／密钥并刷新目录或手填模型。
2. **Save translation settings → Test translation**，按钮附近明确显示测试成功、所选模型、英文原句 Climate change affects investment. 与中文译文。Translation prompt 只提供翻译要求，格式自动适配；展开后可选取其中英文验证翻译，输入框内容应保持不变。提示词与按钮行之间保留间距。
3. 测试成功后点击侧栏 **Translate** 或按 **Ctrl+Alt+T**。在 Notes 和 Books 的 Edit、Preview 分别选择英文单词／短句；浮窗应显示原文与中文。也在 Research、Library 的可选取界面文字中验证。浮窗标题栏可拖动，位置会记住；关闭后普通选取不调用模型，每次启动默认关闭。
4. 切换选取时仅保留最新结果；重复选取相同文字显示 **Saved result**，不会再次产生 API 请求。翻译及手动测试在 Usage 的 **Purpose: Translation** 中统计；缓存复用不增加 Token／请求，取消不能撤销服务已收取的费用。
5. 单次最多 1,600 字符／250 词，只发送选取内容与翻译要求。密码、API Key 与接口地址排除。默认提示词要求准确、专业、只输出简体中文，不用 emoji；可在 **Translation prompt** 修改或恢复。
6. 翻译缓存上限 1,000 条／5 MB，位于 **Data/Research/Translation/cache.json**；Translation Settings 中 **Clear translation cache** 仅清理该缓存。独立配置密钥保存于 **Config/translation-connections.json**，可见掩码并用 **Remove translation key** 清除本地保存。复用的密钥继续在 AI Settings 中管理。
7. 在 **Usage → Model prices** 可选择仅用于翻译的模型。免费模型经平台确认后可把 CNY 输入／输出价格填零，否则费用可能显示 Unknown。已发生的历史费用不会被改价或模型删除重新计算。

## 用量界面验收

1. Research → Usage 默认 Today；Today、Last 7 days、Last 30 days 和自选日期可用，来源／模型／用途筛选仍保留。
2. 只保留 Requests、Tokens、Costs 三张卡片，标题和数字在同一行。Requests 每页十条，Tokens 列只显示总量，没有重复的分组表格。
3. Hourly 默认当天，24 个正方形按三行八列居中排列，分别为 00–07、08–15、16–23；Daily 默认当前完整年份，365／366 格按周排列并标记月份。两个热力图的日期／年份独立，上方时间只筛选汇总与请求记录，不切换热力图。From、To、Hourly 日期采用统一风格日历，可选年月和日期，也可键入 YYYY-MM-DD。悬浮格子显示时间／日期、总 Token、人民币费用；统计不受分页影响。
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

安装前备份完整 LanCarbon 文件夹及另选 Data 目录，包含 Config、Cache、Library、聊天、用量日志和价格。对应快照位于 **backups/pre-install-2.2.5-2026-10-15**，包含匹配的 2.2.4 安装包。验证后 release 保留 **2.2.5、2.2.4、2.2.3**；只清理更早安装包及其 blockmap。回滚前保留升级后的新编辑。

自动化验证结果及日常数据核对保存在 acceptance/2.2.5-verification.json。系统教程自动同步 Selection Translation 与 Usage 的长期操作说明；个人写作内容不参与教程覆盖。

275 项单元测试、最终安装包的全部 19 个桌面场景通过。真实数据升级演练及安装后核对保留了 56 个写作条目、2 个个人 Book、30 个 Library 文件、2 个聊天的 16 条消息、11 条历史用量记录、3 个模型价格，以及已有翻译配置和 5 条翻译缓存；原币费用、日志及配置字节保持一致。实际安装程序的验证结果见 acceptance/2.2.5-verification.json。

## English

Open **Research → Translation Settings** and reuse a saved service/model (without refreshing/editing model fields), or configure a separate service/model. Save and test: the result next to the buttons explicitly shows success, the selected model, the fixed English sentence and Chinese translation. Translation instructions remain editable; model format adaptation is automatic. Selecting English in the prompt field also translates it without changing the contents.

Enable **Translate** in the sidebar or press **Ctrl+Alt+T**. Select a short English passage in Notes/Books Edit or Preview and selectable Research/Library/interface text. The floating panel shows source and Chinese, can be dragged, and remembers its position. Disable it to restore selection without model requests; it starts off at each launch. Keys/passwords/API addresses are excluded. Selections are limited to 1,600 characters / 250 words; only selected text and translation instructions are sent. Superseded requests are canceled, without reversing upstream charges.

Repeated selections use a bounded local cache (1,000 results / 5 MB), with an independent clear action. Translation and manual tests appear under **Usage → Purpose: Translation**; cache reuse adds no requests or tokens. Translation-only models can have prices in Model prices. Separate keys stay encrypted with masked previews and a local removal action, without changing Chat configuration. The user has accepted both reused and dedicated translation connections, including selection translation in Notes and Books.

Use the existing shortcut. Usage defaults to Today, offers seven/thirty-day presets and custom dates, and retains source/model/purpose filters. Three compact cards place titles and values on one line. The single request table shows total tokens and CNY costs, ten requests per page.

Hourly defaults to today and centers 24 square cells in three rows of eight. Daily displays a complete selected year (365/366 cells). Both have independent dates/year; summary date filters affect summaries and request records without switching activity mode. From, To and the hourly date use a themed calendar. Hover cells for time/date, tokens and CNY costs.

Model prices are editable. Removing and saving a model, deleting a service or changing its address automatically cleans obsolete prices, including earlier leftovers at startup. Historical price snapshots, original charges and request history stay intact. The editable USD-to-CNY display reference defaults to 7, without a live lookup; changing it updates historical CNY display values without repricing original charges. Missing data stays unknown. Viewing records works offline without model calls.

The full pre-install snapshot and matching previous installer are in backups/pre-install-2.2.5-2026-10-15. After verification, release retains 2.2.5, 2.2.4 and 2.2.3. Preserve later edits before restoring an older snapshot. Verify personal writing, resources, encrypted settings, chats, usage and publishing bindings. Validation evidence is in acceptance/2.2.5-verification.json. The managed tutorial includes a Selection Translation page.

All 275 unit tests and all 19 final-installer desktop scenarios passed. Rehearsal and daily-data audits preserved 56 writing records, two personal Books, 30 Library files, two chats with 16 messages, 11 usage records, three model prices, saved translation settings and five cached translations. Original charges, ledger and configuration bytes were preserved. Installed-program checks are recorded in acceptance/2.2.5-verification.json.
