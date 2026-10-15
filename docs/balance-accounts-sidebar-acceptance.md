# Shared billing accounts and collapsible sidebar

This is a second-stage update, LanCarbon 2.3.3. It does not start the third stage.

## Balance acceptance

- Existing individual balance amounts and calibration checkpoints remain unchanged on upgrade. Reading legacy balance files does not rewrite them; the next explicit save stores the account format.
- In Research → Usage, Set balance / Update balance edits the account name, Track balance / Unlimited mode and Connections sharing this balance.
- Select connections billed to the same account, even if their API keys differ. Separate connections remain independent until explicitly selected; neither matching platform names nor endpoints imply a shared account.
- Save the full current account balance, not a top-up amount or the sum of old cards. Subsequent chat, test and translation fees across all selected models are deducted once. A request finishing after calibration is included even if it started earlier. Unknown fees remain unknown.
- A connection belongs to only one account. Removing a connection makes it a separate uncalibrated entry. Taking connections from another account clears that affected account's checkpoint and asks for recalibration. Historical usage and costs are never reassigned or deleted.
- Unlimited requires no numeric amount, shows no estimate or low-balance reminder, and preserves token and cost statistics. Returning to Track balance requires a new full balance.
- Reminders use the balance currency: strictly below CNY 5 or USD 2; equality does not trigger a reminder. The interface language and exchange rate do not change these thresholds.
- Stop tracking clears the checkpoint but retains shared membership and historical usage. Restart, Usage filters and Data Location changes retain account settings.
- Account membership and checkpoints live in Data/Research/Usage/balances.json. API key encryption and storage remain unchanged. No platform balance API or live exchange-rate service is called.

## Sidebar acceptance

- Collapse sidebar beside the Logo hides the main sidebar and expands the content. The content header menu restores it.
- Notes, Books, Research and Library keep the selected page, drafts, filters and writing while collapsing. Ctrl+K from a collapsed Notes sidebar reveals and focuses search.
- PDF reading uses the same main-sidebar control. Fit width / Fit page adapt to the new reading width. PDF's Pages / Contents sidebar remains an independent control.
- The desktop collapse preference survives restart. Narrow-window drawer navigation and its close button continue to work. Verify both themes and keyboard focus after collapsing.

## Validation and installation

- Use isolated workspaces and simulated API responses for automated tests; do not use real keys or charged calls.
- Snapshot the closed current installation, Data, Config, Cache, Library and matching previous installer. Verify the extracted final installer and actual installed program, preserving personal Notes/Books, publishing bindings, original files, AI settings, translation cache and the complete historical fee ledger.
- Update README and the evergreen interface/Usage tutorial pages. The tutorial contains no application version or change history.
- Commit the finished changes and run npm run clean:installers after installer validation. Retain 2.3.3, 2.3.2 and 2.3.1 with matching blockmaps. No GitHub Release or Tag is created by this update.

## 中文验收

本次为第二阶段内的 2.3.3 更新。已有余额及校准起点在升级时保留，不自动合并。通过 Usage 的 Set balance / Update balance 命名账户，选择 Track balance 或 Unlimited，并勾选实际共用平台余额的连接；同平台或同网址不代表同一账户。

合并或充值时输入平台完整当前余额，不能把卡片余额相加。新起点之后，所选连接的聊天、测试、翻译及各模型费用只扣一次，校准前开始、校准后结束的请求在结算后计入。一个连接只能属于一个余额账户；取消关联的连接独立显示，被移走连接的其他账户提示重新校准。历史用量和费用不转移、不清空。Unlimited 无需填写额度，不做余额提醒，但照常统计 Token 和费用；重新追踪时输入当前余额。人民币严格低于 5 元、美元严格低于 2 元时提醒，等于阈值不提醒。Stop tracking 保留共享关系和历史记录，只清除余额起点。筛选、重启和 Data Location 迁移不改变规则。

Logo 旁的 Collapse sidebar 收起主侧栏，内容区左上角菜单恢复。Notes、Books、Research、Library 和 PDF 阅读保持当前状态；PDF 适应宽度随可用空间更新。桌面收起状态在重启后保留；窄窗口抽屉及关闭按钮继续可用，Ctrl+K 可恢复 Notes 搜索。两种主题都需验证。

隔离测试使用模拟响应，不调用真实付费 API。安装前完整备份，最终安装后核对个人内容、文件、AI 配置、翻译缓存及历史账本。同步 ReadMe 和长期教程，完成 Git 提交，保留 2.3.3、2.3.2、2.3.1 三个安装包及对应 blockmap；本次不创建 GitHub Release 或 Tag。
