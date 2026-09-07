export const FORMATTING_TOOLBAR_GUIDE = `## English

### Toolbar layout

The formatting toolbar appears below the note title in Edit mode. It writes Markdown into your note; Preview shows the rendered result. The interface uses English and follows Light/Dark mode.

Controls stay on the toolbar whenever their measured widths fit. Resizing the window or changing display scaling moves only the controls that no longer fit into **⋯ (More tools)**. Widening the window restores them. Underline, strikethrough, superscript and subscript keep their U, S, x² and x₂ symbols, with English tooltips.

**Directives** always has its own menu for block content. **⋯** contains other tools only. Abbreviation and Keyboard appear after superscript/subscript when space permits.

### Everyday writing

| Control | How to use it | Saved Markdown |
| --- | --- | --- |
| Paragraph / Heading 1–6 | Place the cursor in a line or select several lines; choose the level | Heading 1 adds # and a space; changing levels replaces the old prefix |
| Bold / Italic | Select text, then click; click again to remove the formatting | **text** or *text*, with the corresponding markers visible in Edit |
| Underline / Strikethrough | Select text and click U or S | MyST underline/delete roles |
| Superscript / Subscript | Select the characters to raise or lower, then click x² or x₂ | MyST sup/sub roles |
| Lists | Choose Bulleted list or Numbered list; indent/outdent from this menu | List markers and indentation are inserted into the source |
| Quote | Apply to the current or selected lines; click again to remove | Lines begin with > |
| Link | Select text or place the cursor in an existing simple link | A panel asks for Link text and URL |
| Code | Choose Inline code or Code block | Backticks or fenced code; a block panel accepts a language and content |
| Divider | Click at the desired line | A horizontal-rule block is inserted after the line |

With no selection, inline formatting inserts markers and places the cursor between them. To edit links, code blocks, regular tables and simple dollar-delimited formulas, place the cursor inside the existing structure before opening its panel.

### Apply, cancel and keyboard

- Panel drafts are saved only after **Apply**. **Cancel** or Escape discards the draft and returns to the editor. If a dropdown is open, the first Escape closes that dropdown.
- One toolbar action can be undone in one step with **Ctrl+Z**; **Ctrl+Shift+Z** redoes it.
- **Ctrl+B**, **Ctrl+I** and **Ctrl+K** apply bold, italic and links while editing the body. **Ctrl+F** searches the body. On macOS, use Cmd for the corresponding modifier.
- Spelling underlines are disabled in the editor, search and every input panel. Formula and required-field validation still provide useful errors.
- Special syntax inside code, tables or complex labelled structures may require source editing. A notice explains when an action is unavailable.

### Quick acceptance

Select Chinese and English text and try the controls. Narrow and widen the window: ordinary controls should reappear as space becomes available, while Directives stays separate. Verify x²/x₂ icons, Apply/Cancel, undo/redo and persistence after restart. Continue with Tables and Math Panels and Inline Roles and Directive Panels.

## 中文

### 工具栏布局

在 Edit 模式下，格式工具栏显示在笔记标题下方。按钮把 Markdown 写入正文，Preview 显示排版结果。界面使用英文，并跟随 Light/Dark 主题。

按钮实际宽度能够放下时就直接显示。缩小窗口或改变显示缩放时，只有放不下的工具才进入 **⋯（More tools）**；扩大窗口后自动恢复。下划线、删除线、上下标保持 U、S、x²、x₂ 图标，悬停显示英文说明。

**Directives** 始终使用独立的块级内容菜单，**⋯** 只收纳其他工具。空间允许时，Abbreviation 和 Keyboard 位于上下标后面。

### 日常写作

| 控件 | 使用方法 | 写入内容 |
| --- | --- | --- |
| Paragraph / Heading 1–6 | 光标放在当前行或选中多行，再选择级别 | 一级标题生成 # 加空格；切换级别会替换原前缀 |
| Bold / Italic | 选中文字后点击，再次点击可取消 | 加粗或斜体标记，Edit 中保留源码 |
| Underline / Strikethrough | 选中文字，点击 U 或 S | MyST underline/delete 角色 |
| Superscript / Subscript | 选中需要上移或下移的字符，点击 x² 或 x₂ | MyST sup/sub 角色 |
| Lists | 选择无序或有序列表；在菜单中增加或减少缩进 | 列表标记及缩进 |
| Quote | 作用于当前行或选中行，再次点击可取消 | 行首添加 > |
| Link | 选中文字，或把光标放入已有简单链接 | 在面板中填写显示文字和 URL |
| Code | 选择行内代码或代码块 | 行内反引号或代码围栏；代码块可填写语言和正文 |
| Divider | 光标放在目标行再点击 | 在该行后插入水平分隔线 |

未选中文字时，行内格式会插入标记并把光标放在中间。已有链接、代码块、规则表格和普通美元语法公式，可把光标放进去后再次打开对应面板编辑。

### 应用、取消与快捷键

- 面板草稿只有点击 **Apply** 才保存。**Cancel** 或 Escape 放弃草稿并返回编辑器；若下拉菜单正在展开，第一次 Escape 只关闭菜单。
- 一次工具栏操作可用 **Ctrl+Z** 一次撤销，**Ctrl+Shift+Z** 重做。
- 正文中 **Ctrl+B** 加粗、**Ctrl+I** 斜体、**Ctrl+K** 编辑链接、**Ctrl+F** 搜索；macOS 对应使用 Cmd。
- 正文、搜索和所有输入面板均关闭拼写波浪线；公式语法和必填字段仍进行有效性校验。
- 代码、表格内部或带标签等复杂结构可能需要源码编辑；操作不可用时会给出提示。

### 快速验收

选中中英文文字试用按钮。缩小再扩大窗口，确认普通工具按可用空间恢复、Directives 独立显示、上下标保持图标。检查 Apply/Cancel、撤销/重做与重启保存。继续阅读 Tables and Math Panels、Inline Roles and Directive Panels。`;

export const TABLES_MATH_PANELS_GUIDE = `## English

### Tables

1. Put the cursor at the insertion point and click **Table**. To edit an existing regular Markdown table, put the cursor inside it first.
2. Set **Columns** and **Data rows (excluding header)**. The panel supports 1–20 columns and 1–100 data rows.
3. Fill the header and data cells. Tab/Shift+Tab moves between cells; each column has Default, Left, Center and Right alignment choices.
4. Click a cell before using Insert row below, Delete row, Insert column right or Delete column. The selected cell determines where the operation takes place. The header and last remaining data row/column cannot be deleted through these controls.
5. Click **Apply**, then Preview to inspect the table. Cancel leaves the original note unchanged. Merged cells, nested/irregular tables and list-table directives require source editing.

### Math

Click **Math** and choose **Inline** or **Display**. Enter the formula itself, without surrounding dollar signs. Inline wraps the formula in single dollar signs; Display uses double dollar signs on separate lines. Multiline formulas need Display mode.

Templates include Fraction, Root, Superscript, Subscript, Scripts, Sum, Integral, Brackets, Aligned equations, Greek letters and operators. The editable placeholder is selected after insertion. For matrices, set Matrix rows and Matrix columns (1–10) and click Insert matrix.

The preview renders offline as you type. Correct invalid formulas before applying. A regular existing formula can be reopened; labelled equations, macros and advanced MyST math directives should be edited in source so their extra information is retained.

### Try it

Create a two-column table, right-align the numeric column, apply it and reopen it to change a cell. Undo and redo that edit. Insert a Fraction template, replace its selected placeholder, and inspect the preview. Cancel a second draft and confirm the saved note is unchanged.

## 中文

### 表格

1. 把光标放在插入位置，点击 **Table**。编辑已有规则 Markdown 表格时，先把光标放进表格内部。
2. 设置 **Columns** 和 **Data rows (excluding header)**，支持 1–20 列、1–100 行数据，表头单独计算。
3. 填写表头和单元格，用 Tab/Shift+Tab 切换；每列可选默认、左、中、右对齐。
4. 先点击目标单元格，再使用下方插入行、删除行、右侧插入列、删除列。操作位置由选中单元格决定；表头及最后一行数据、最后一列不能通过这些按钮删除。
5. 点击 **Apply**，切换 Preview 检查结果；Cancel 不改变原文。合并单元格、嵌套或不规则表格、list-table 指令需要源码编辑。

### 公式

点击 **Math**，选择 **Inline**（行内）或 **Display**（独立）。只填写公式，不填写外层美元符号；应用后自动生成行内或独立公式语法。多行公式需要使用 Display。

模板包含分数、根号、上下标、组合上下标、求和、积分、括号、多行对齐、希腊字母和运算符；插入后会选中待替换位置。矩阵可设置 1–10 行和列，再点击 Insert matrix。

预览随输入离线更新。公式无效时先修正再应用。普通已有公式可以再次打开；带标签、宏及复杂 MyST 指令的公式继续通过源码编辑，保留原有信息。

### 练习

创建两列表格，将数字列右对齐，应用后重新打开并修改单元格，再撤销和重做。插入 Fraction 模板并替换选中部分，观察公式预览。取消第二份草稿，确认已保存正文不变。`;

export const INLINE_DIRECTIVES_PANELS_GUIDE = `## English

### Abbreviation and Keyboard

**Abbreviation:** select an acronym such as IPCC and click Abbreviation. Fill **Full meaning** and Apply. With no selection, enter both fields. Preview shows the abbreviation, with its explanation on hover. A simple existing abbreviation can be reopened from the source.

~~~markdown
{abbr}\`IPCC (Intergovernmental Panel on Climate Change)\`
~~~

**Keyboard:** select Ctrl+F and click Keyboard to format it immediately; with no selection, a panel asks for the key combination. This only styles text and does not assign or execute a shortcut. The source uses a kbd role:

~~~markdown
{kbd}\`Ctrl+F\`
~~~

Both roles use a single line. The panels reject backticks that would break the role syntax. Use the U, S, x² and x₂ controls for underline, strikethrough, superscript and subscript respectively.

### Directives menu

| Entry | What the panel creates |
| --- | --- |
| Note | Information block, optional custom title |
| Tip | Helpful suggestion, optional custom title |
| Important | Important information, optional custom title |
| Warning | Warning block, optional custom title |
| Caution | Caution block, optional custom title |
| Admonition | General callout with a required custom title |
| Nested blocks | Outer and inner blocks, each with type, title and content |
| Dropdown | Required title; content starts collapsed |
| Initially open | Required title; content starts expanded and can be collapsed |

Select ordinary prose to bring it into the panel, or place the cursor at an insertion point. Write Markdown in **Content**, then Apply. Titles must stay on one line. In Nested blocks, choose each layer's type; custom Admonition layers require titles. The application generates longer outer fences so nested blocks remain contained.

Initially open is a preset using an admonition with dropdown and open options:

~~~markdown
:::{admonition} Details
:class: dropdown
:open: true

This content starts expanded.
:::
~~~

Custom warning and Initially open are display choices/titles, not additional directive names. After inserting a block, continue editing its source. The dedicated Directives menu stays available even when other tools move into ⋯.

### Acceptance

Create an abbreviation and hover over it in Preview. Format Ctrl+F as Keyboard. Try every Directives entry, including an outer Note with an inner Tip. Check the custom title appears once, Dropdown starts closed and Initially open starts open. Cancel an unused draft, undo an insertion and restart to verify persistence. Export the Book and verify these examples with Jupyter Book as well.

## 中文

### 缩写与按键

**Abbreviation：**选中 IPCC 等缩写并点击按钮，在 **Full meaning** 中填写完整解释后 Apply；没有选区时填写两个字段。Preview 中显示缩写，悬停可查看解释。普通已有缩写可从源码中重新打开面板。

~~~markdown
{abbr}\`IPCC (Intergovernmental Panel on Climate Change)\`
~~~

**Keyboard：**选中 Ctrl+F 并点击按钮即可直接添加按键样式；没有选区时弹出填写面板。该功能只改变文字显示，不注册或执行快捷键，生成 kbd 行内角色：

~~~markdown
{kbd}\`Ctrl+F\`
~~~

两种角色都使用单行内容；面板会拒绝破坏语法的反引号。下划线、删除线、上下标分别使用 U、S、x²、x₂ 控件。

### Directives 菜单

| 入口 | 面板生成的内容 |
| --- | --- |
| Note | 说明框，可选自定义标题 |
| Tip | 提示框，可选自定义标题 |
| Important | 重要信息框，可选自定义标题 |
| Warning | 警告框，可选自定义标题 |
| Caution | 注意事项框，可选自定义标题 |
| Admonition | 通用提示框，必须填写自定义标题 |
| Nested blocks | 嵌套块，可分别设置内外层类型、标题和正文 |
| Dropdown | 必填标题，正文默认收起 |
| Initially open | 必填标题，正文默认展开且可以收起 |

可以先选中普通正文带入面板，或把光标放在插入位置。在 **Content** 中填写 Markdown，再点击 Apply；标题保持单行。Nested blocks 分别选择内外层类型，选择 Admonition 的层级需要标题。软件自动生成更长的外层围栏，使嵌套关系正确。

Initially open 是通过 admonition、dropdown 和 open 选项实现的预设：

~~~markdown
:::{admonition} 详情
:class: dropdown
:open: true

这段内容默认展开。
:::
~~~

Custom warning、Initially open 是显示方式或示例标题，不是额外的底层指令名称。块插入后继续通过源码编辑；即使其他工具进入 ⋯，Directives 也保持独立可用。

### 验收

创建缩写并在 Preview 悬停查看解释，为 Ctrl+F 添加按键样式。逐一尝试 Directives 各项，包含外层 Note、内层 Tip。确认自定义标题只显示一次、Dropdown 默认收起、Initially open 默认展开。取消未应用草稿、撤销一次插入，并重启验证保存；导出 Book 后再使用 Jupyter Book 检查这些示例。`;
