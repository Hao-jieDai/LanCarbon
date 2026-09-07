---
title: Reference Lab
label: acceptance-reference-page
---

# Reference Lab / 引用实验室

(acceptance-local-target)=
## Local target / 本页目标

English: each internal link below must reach the intended page or target.

中文：逐个点击以下链接，应定位正确的页面或目标。

1. Local heading / 本页标题：[](#acceptance-local-target)。
2. Explicit text / 指定文字：[返回本页目标](#acceptance-local-target)。
3. Cross-page heading / 跨页标题：[](#acceptance-typography)。
4. Relative file / 相对文件：[语法实验室](syntax-lab.md)。
5. File and fragment / 文件加锚点：[公式位置](syntax-lab.md#acceptance-balance)。
6. Whole-page label / 整页标签：[](#acceptance-syntax-page)。
7. Equation role / 公式角色：{eq}`acceptance-balance`。
8. Reference role / 引用角色：{ref}`acceptance-typography`。
9. Custom ref role / 自定义引用文字：{ref}`Typography / 文本样式 <acceptance-typography>`。
10. Numbered equation reference / 编号引用：{numref}`Equation %s <acceptance-balance>`。
11. Styled link / 带格式链接：[**加粗链接**及*斜体链接*](#acceptance-typography)。
12. Return home / 返回首页：[验收首页](index.md)。

## Acceptance record / 验收记录

| Check / 检查项 | Expected / 预期 |
| --- | --- |
| Edit → Preview → Edit | Original source preserved / 原文不变 |
| Internal reference click | Correct page and target / 正确页面与位置 |
| Preview → another page | Preview remains selected / 保持预览模式 |
| Dark / Light | Readable text and formulas / 文字公式可读 |
| Save → restart | Source and Book restored / 内容目录恢复 |
| Strict HTML build | Exit code 0 / 退出码为 0 |
| Jupyter Book start | Local website accessible / 网站可访问 |
