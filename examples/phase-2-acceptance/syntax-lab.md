---
title: Syntax Lab
short_title: Syntax
label: acceptance-syntax-page
authors:
  - name: Example Author
description: A bilingual Markdown and MyST syntax acceptance sample.
keywords:
  - climate
  - acceptance
math:
  '\R': '\mathbb{R}'
---

# Syntax Lab / 语法实验室

English: compare each section in Edit, Preview and the exported website.

中文：依次检查各节在源码、应用预览和导出网站中的内容是否一致。

(acceptance-typography)=
## 1. Typography / 文本样式

Normal 普通文字；**bold 加粗**；*italic 斜体*；***bold and italic 加粗斜体***。

**Bold with *nested italic* / 粗体中的斜体**。

_Another italic form_ and __another bold form__。

Role formats / 行内扩展：{underline}`underlined 下划线`、{delete}`deleted 删除线`、{smallcaps}`Small Capitals`。

Inline code / 行内代码：`const carbon = 42;`，以及包含反引号的代码：``use `code` here``。

Escaped markers / 转义：\*not italic\*、\# not a heading、\[not a link\]、\$19.99。

Entities / 字符实体：&lt;carbon&gt; &amp; climate &copy; 2026。

This line ends with an explicit hard break. / 这一行以显式换行结束。\
This must appear on the next line. / 这句话应另起一行。

This is a separate paragraph. / 这是新的段落。

### Heading level 3 / 三级标题

Level-three content / 三级内容。

#### Heading level 4 / 四级标题

Level-four content / 四级内容。

##### Heading level 5 / 五级标题

Level-five content / 五级内容。

## 2. Lists / 列表

- **Sources / 排放源**
  - Industry / 工业
  - Transport / 交通
- **Sinks / 碳汇**
  - Forest / 森林
  - Ocean / 海洋

1. Create a Book / 创建 Book。
2. Add pages / 添加页面。
   1. Write the source / 编写源码。
   2. Check Preview / 检查预览。
3. Export and build / 导出并构建。

Carbon budget
: The balance between emissions and removals.

碳预算
: 排放与移除之间的平衡。

## 3. Quotes and separators / 引用与分隔线

> **Observation / 观察：** Carbon moves among the atmosphere, land and ocean.
>
> 碳在大气、陆地和海洋之间循环。
>
> > Nested quote / 嵌套引用。

---

Text below the horizontal separator / 分隔线下方的文字。

## 4. Tables / 表格

| Component / 组成 | Symbol / 符号 | Example / 示例 |
| --- | --- | --- |
| **Emissions / 排放** | $E$ | `100` |
| *Removals / 移除* | $R$ | `40` |
| Net change / 净变化 | $\Delta C$ | `60` |

:::{table} Carbon measurements / 碳测量示例
:label: acceptance-carbon-table

| Year / 年份 | Carbon / 碳量 |
| --- | --- |
| 2025 | 100 |
| 2026 | 95 |
:::

:::{list-table} Carbon actions / 碳行动
:header-rows: 1

* - Action / 行动
  - Direction / 方向
* - Efficiency / 提高效率
  - Reduce emissions / 减少排放
* - Restoration / 生态恢复
  - Increase removals / 增加移除
:::

## 5. Code blocks / 代码块

```python
def carbon_balance(emissions, removals):
    """Return the net change; do not execute during preview."""
    return emissions - removals

print(carbon_balance(100, 40))
```

```typescript
const climate = { emissions: 100, removals: 40 };
const balance = climate.emissions - climate.removals;
console.log(balance);
```

```json
{
  "project": "LanCarbon",
  "phase": 2,
  "accepted": false
}
```

```yaml
site:
  template: book-theme
```

```{code-block} python
:label: acceptance-code

# This directive displays code; it must not run it.
# 这个指令仅显示代码，不应执行。
temperature_change = 1.2
```

English: code must preserve spacing and line breaks. Website syntax colors may differ from local Preview.

中文：代码应保留空格和换行；网站代码高亮颜色不要求与应用预览完全一致。

## 6. Roles / 行内角色

Abbreviation / 缩写：{abbr}`IPCC (Intergovernmental Panel on Climate Change)`。

Subscript / 下标：CO{sub}`2`、H{sub}`2`O。

Superscript / 上标：x{sup}`2`、m{sup}`3`。

Keyboard / 按键：{kbd}`Ctrl+F`、{kbd}`Ctrl+Z`。

Math role / 公式角色：{math}`a^2+b^2=c^2`。

## 7. Mathematics / 数学公式

Inline / 行内：$E=mc^2$，$x_i \in \R$，$\alpha+\beta=\gamma$。

```{math}
:label: acceptance-balance

\Delta C = E - R, \qquad f = \frac{R}{E}
```

Reference / 引用：{eq}`acceptance-balance`；[碳收支公式 / Carbon balance](#acceptance-balance)。

Square root, powers, sum and integral / 根号、幂、求和与积分：

$$
z = \sqrt{x^2+y^2}, \qquad
S = \sum_{i=1}^{n} C_i, \qquad
I = \int_0^1 x^2\,dx = \frac{1}{3}
$$

Matrix / 矩阵：

$$
A = \begin{bmatrix}1 & 2 \\ 3 & 4\end{bmatrix}
$$

Aligned equations / 多行对齐：

$$
\begin{aligned}
E &= 100 \\
R &= 40 \\
\Delta C &= E - R = 60
\end{aligned}
$$

Piecewise function / 分段函数：

$$
g(x)=\begin{cases}
x^2, & x \geq 0, \\
-x, & x < 0.
\end{cases}
$$

English: symbols, fractions, matrices and line alignment must be legible. Equation numbers may differ from a website with custom numbering.

中文：符号、分式、矩阵及多行对齐应清晰可读。网站若采用自定义编号，编号不一定与本地相同。

## 8. Directives / 块级指令

:::{note}
**Note / 说明：** This text is a note, not raw fence syntax. / 应显示说明框，而不是围栏源码。
:::

:::{tip}
**Tip / 提示：** Check the saved source after switching modes. / 切换模式后检查原文。
:::

:::{important}
**Important / 重要：** Keep the export path stable. / 保持导出路径稳定。
:::

:::{warning} Custom warning / 自定义警告
The custom title should appear once. / 自定义标题应只出现一次。
:::

:::{caution}
**Caution / 注意：** This is an example warning, not an application error. / 这是示例提示，不是软件报错。
:::

:::{admonition} Custom panel / 自定义提示框
This panel contains *italic text* and **bold text**. / 框内应支持斜体和粗体。
:::

::::{note}
Outer note / 外层说明。

:::{tip}
Inner tip / 内层提示。
:::
::::

:::{dropdown} Expand the answer / 展开答案
The answer is **60**. / 答案是 **60**。

$$100-40=60$$
:::

:::{admonition} Initially open / 默认展开
:class: dropdown
:open: true

This block starts expanded and can be collapsed. / 应默认展开，也可以收起。
:::

## 9. Links / 链接

[Back to typography / 返回文本样式](#acceptance-typography)。

[Open Reference Lab / 打开引用实验室](reference-lab.md)。

[MyST documentation / 官方文档](https://mystmd.org/guide)。

English: internal links should navigate inside this Book. LanCarbon intentionally blocks external navigation; the exported website can open external links.

中文：内部链接应在当前 Book 内定位。LanCarbon 有意阻止外链导航；导出的网站可以打开外链。
