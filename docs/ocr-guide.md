# Reading scanned PDFs

Open a PDF from Library, a Note attachment or a Book attachment. Pages with usable embedded text keep that text. When the current page has no usable text layer, LanCarbon automatically recognizes its English and Simplified Chinese text on this computer.

Use the **OCR** menu in the PDF toolbar:

- **Recognize page** retries the current page, including pages whose embedded text is incorrect. This explicitly selected OCR result takes priority for that page.
- **Recognize PDF** prepares scanned pages throughout the document, up to the indexing limit of 500 pages. It reuses saved recognition results and preserves readable embedded text.
- **Stop OCR** cancels the current reading task. Completed pages stay cached and can be reused when you continue.

After recognition, the normal PDF text layer supports selection, copying, **Find in PDF**, and the existing **Translate** switch. For a whole-document search, first use **Recognize PDF** or prepare that document for Chat; pages not yet recognized are not searchable as image text. If Chat recognized more pages while the reader was already open, reopen the PDF or use **Recognize PDF** to refresh its text layer.

Document questions automatically prepare the selected scans. Library and Note/Book references to the same PDF reuse recognition by file content and original page number. **Evidence** labels recognized excerpts with **OCR**, and the citation opens the original PDF page. Recognized text does not replace or rewrite the original PDF.

English/Chinese recognition resources are included with the application. No OCR account, API Key, download or online OCR service is required. Local recognition does not call a model or consume tokens. When recognized text is sent to the selected Chat model for a document question, normal Chat usage is recorded.

Recognition progress appears in the reader or source preparation. Confidence is a diagnostic, not a guarantee: inspect the original for important numbers, currency units, multi-column text, tables and formulas. A blurred scan, unusual layout or damaged text layer may still need manual checking. Local OCR extracts text and coordinates; it does not promise complete spreadsheet/table structure or mathematical markup.

Recognition text and coordinates are saved in **Data/Research/OCR**, limited to 64 MB; older derived results are removed when necessary. Full-page recognition images are released after processing rather than saved. **Workshop → AI Settings → Retrieval → Local OCR → Clear OCR cache** removes only derived recognition results. Original files, personal writing, saved chats and usage are retained. Needed scans will be recognized again; document questions use the updated recognized text.

Password-protected PDFs can be read after entering the password locally; automatic indexing/OCR does not retain or reuse that password. EPUB DRM and standalone image/Word recognition are outside this PDF workflow.

---

# 扫描 PDF 阅读与识别

从 Library、Note 附件或 Book 附件打开 PDF。已有可用文字层的页面继续使用原文字；当前页面没有可用文字层时，LanCarbon 会在本机自动识别英文和简体中文。

使用 PDF 工具栏的 **OCR** 菜单：

- **Recognize page** 重新识别当前页，也适用于文件自带文字层错误的页面。用户明确重新识别的结果优先用于该页。
- **Recognize PDF** 准备全文中的扫描页，最多处理索引范围内的 500 页；复用已保存的识别结果，保留可用的原文字层。
- **Stop OCR** 停止当前阅读识别任务。已经完成的页面继续保留，后续可以复用。

识别后，原有 PDF 文字层支持选取、复制、**Find in PDF** 搜索和现有的 **Translate** 选词翻译。搜索整份扫描文档前，先使用 **Recognize PDF** 或让 Chat 准备该文档；尚未识别的图片文字不能直接搜索。如果 Chat 在阅读器打开期间识别了更多页面，重新打开 PDF 或执行 **Recognize PDF** 刷新文字层。

资料问答会自动准备选中的扫描 PDF。Library 文件和 Note／Book 对同一 PDF 的引用，按文件内容与原始页码复用识别结果。**Evidence** 用 **OCR** 标识识别片段，点击引用仍跳到原始 PDF 对应页。识别文字不会替换或改写原文件。

应用内置中英文识别资源，无须 OCR 账号、API Key、额外下载或在线识别服务。本地识别不调用模型、不消耗 tokens。后续围绕资料提问时，识别文字会交给选定的 Chat 模型，并按正常聊天记录用量和费用。

阅读器或资料准备过程会显示进度。置信度用于提示识别质量，不代表准确保证；重要数字、币种单位、分栏顺序、表格和公式应核对原页。模糊扫描、特殊版式和损坏文字层仍可能需要人工检查。本地 OCR 提取文字及坐标，不保证完整还原表格结构或数学公式标记。

识别文字和坐标保存在 **Data/Research/OCR**，最多 64 MB，达到限制后清理较早的派生结果。整页识别图片处理完即释放，不长期保存。通过 **Workshop → AI Settings → Retrieval → Local OCR → Clear OCR cache** 只清除识别缓存，原文件、个人写作、聊天和用量保留。再次需要时会重新识别，后续资料问答使用更新后的识别文字。

加密 PDF 可在本地输入密码后阅读；自动索引和 OCR 不保存或复用该密码。EPUB DRM、独立图片和 Word 识别不属于这套 PDF 流程。
