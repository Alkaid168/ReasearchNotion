# ResearchNotion MVP Design

日期：2026-07-08

## 1. 产品定位

ResearchNotion 是一个本地桌面端科研知识库智能体。用户打开软件后默认进入类似 Notion AI 的对话主页，可以直接围绕自己的论文库提问；切换到知识库页后，可以管理论文文件夹、阅读 PDF/Markdown，并在需要时呼出 AI 问答栏。

MVP 面向个人本地使用场景，不做云端多人协作。Dify 在后台承担知识库、文档索引、RAG 检索和智能体回答能力；普通用户日常只看到 ResearchNotion 的桌面界面，不需要直接进入 Dify 控制台。

## 2. 已确认边界

- 形态：本地桌面软件。
- UI 风格：参考 Notion AI 主页面和 Codex 工作台，保持浅色、克制、文档感和工作台感。
- 默认首页：对话页。
- 配置方式：不做首次启动引导，用户在设置页手动配置。
- Dify 路线：MVP 依赖用户本地已安装并运行的 Dify。
- API Key：用户在 ResearchNotion 设置页填写 Dify 地址、Dify App API Key、Dify Knowledge API Key；大模型 Provider API Key 先在 Dify 中配置。
- 文件格式：MVP 支持 PDF 和 Markdown。
- LaTeX：暂不做，列入扩展功能。
- 知识库组织：ResearchNotion 中的每个论文文件夹对应 Dify 中的一个 dataset。
- 上传行为：上传论文后自动生成论文卡片。
- AI 面板：知识库页右侧 AI 问答栏默认隐藏，通过快捷键或按钮呼出。

## 3. MVP 功能

### 3.1 对话页

对话页是默认启动页，整体模仿 Notion AI 的主入口。

功能包括：

- 左侧显示历史对话。
- 历史对话支持文件夹分类。
- 底部提供“新建对话”入口。
- 中间显示大输入框和快捷任务。
- 用户可以选择上下文范围：某个论文文件夹或某篇论文。
- 快捷任务包括摘要、术语解释、创新点提取、方法梳理、实验分析、局限性分析、综述提纲。
- 回答展示引用来源，至少显示来源论文和相关片段。

### 3.2 知识库页

知识库页采用阅读器优先布局。

功能包括：

- 左侧窄栏显示论文文件夹和当前文件夹下的论文列表。
- 支持创建、重命名和删除论文文件夹。
- 支持导入 PDF 和 Markdown。
- 中间区域显示论文阅读器。
- PDF 使用内置 PDF 阅读器预览。
- Markdown 渲染成清爽文档视图。
- 顶部显示当前论文标题、格式、索引状态和常用动作。
- 右侧 AI 问答栏默认隐藏。
- 用户按快捷键，例如 Ctrl+J，或点击 AI 按钮后打开问答栏。
- 问答栏默认绑定当前正在阅读的论文。

### 3.3 论文卡片

用户上传论文并完成索引后，系统自动生成论文卡片。

论文卡片字段包括：

- 标题。
- 作者和年份，能自动提取则自动提取，失败时允许用户手动编辑。
- 一句话摘要。
- 研究问题。
- 方法概述。
- 创新点。
- 关键词。
- 阅读状态。
- 索引状态。
- 文件格式。

### 3.4 设置页

设置页用于手动配置本地 Dify。

功能包括：

- Dify 服务地址。
- Dify App API Key。
- Dify Knowledge API Key。
- 连接测试。
- 默认知识库状态检查。
- 索引参数展示或轻量配置。

MVP 不在 ResearchNotion 中直接配置 OpenAI、Claude、Qwen、DeepSeek 等模型 Provider 的 API Key；这些 Key 先在 Dify 控制台中配置。

## 4. 非目标

MVP 不包含以下内容：

- 首次启动引导。
- LaTeX 导入、解析或编译。
- 云端多用户系统。
- 小组协作权限。
- 自动联网检索论文。
- Zotero/BibTeX/EndNote 导入。
- 完整全局跨 dataset 检索。
- 本地大模型推理。
- 完全脱离 Dify 的自研 RAG 后端。
- 论文自动写作或长文生成系统。

## 5. 技术架构

推荐使用 Electron + React 实现桌面端。Electron 适合快速实现接近 Notion 的桌面界面，也方便访问本地文件、运行本地服务层和调用 Dify HTTP API。

组件划分：

- Desktop Shell：窗口、菜单、快捷键和本地能力桥接。
- React UI：对话页、知识库页、阅读器、设置页。
- Local Service Layer：文件导入、Dify API 调用、状态轮询、论文卡片生成。
- SQLite：保存文件夹、论文、论文卡片、对话历史和 Dify 映射关系。
- Local File Storage：保存用户导入的 PDF/Markdown 原始文件。
- Dify：负责 dataset、document、chunk、向量检索和智能体回答。

## 6. Dify 集成方式

ResearchNotion 不直接暴露 Dify 网页给普通用户。用户看到的是 ResearchNotion 桌面软件；Dify 在本地 Docker 或其他本地部署环境中运行。

核心映射：

- ResearchNotion Folder -> Dify dataset。
- ResearchNotion Paper -> Dify document。
- ResearchNotion Conversation -> 本地 SQLite conversation。
- ResearchNotion Message -> 本地 SQLite message，并保存 Dify 返回的引用来源。

基本流程：

1. 用户在 ResearchNotion 中创建论文文件夹。
2. 软件通过 Dify Knowledge API 创建对应 dataset。
3. 用户上传 PDF 或 Markdown。
4. 软件保存原始文件，并上传到对应 Dify dataset。
5. 软件轮询或刷新文档索引状态。
6. 索引完成后，软件调用 Dify App API 生成论文卡片。
7. 用户在对话页或知识库页发问。
8. 软件根据上下文范围调用对应 Dify 应用能力。
9. 回答和引用来源保存到本地对话历史。

## 7. 数据模型

### Folder

- id
- name
- parent_id
- dify_dataset_id
- created_at
- updated_at

### Paper

- id
- folder_id
- title
- file_type
- file_path
- dify_document_id
- index_status
- created_at
- updated_at

### PaperCard

- id
- paper_id
- authors
- year
- one_sentence_summary
- research_problem
- method_summary
- contributions
- keywords
- reading_status
- updated_at

### Conversation

- id
- title
- folder_id
- context_type
- context_id
- created_at
- updated_at

context_type 可取值：

- folder
- paper
- free

### Message

- id
- conversation_id
- role
- content
- citations_json
- created_at

### Settings

- dify_base_url
- dify_app_api_key
- dify_knowledge_api_key
- default_folder_id
- updated_at

## 8. UI 风格

整体设计采用浅色、低对比、文档型工作台风格。

视觉原则：

- 不做厚重后台管理界面。
- 不做大面积彩色渐变。
- 左侧导航使用 Notion 式浅灰背景。
- 主区域保留大面积留白。
- 对话输入框居中，强调“随时问”的入口感。
- 知识库页优先服务阅读，不让 AI 面板长期占据空间。
- 操作按钮尽量小而清晰，用图标和短文本。
- 重要状态用文本提示和轻量标签表达。

## 9. 异常处理

- Dify 未连接：上传和问答入口置灰，设置页显示连接失败。
- API Key 错误：连接测试显示明确错误。
- 文档索引中：论文显示“索引中”，暂时不可问答。
- 文档索引失败：显示失败状态和重试按钮。
- PDF 无法抽取文本：仍保存原文件，但提示无法入库。
- Markdown 编码异常：提示导入失败，并保留错误信息。
- Dify 服务中断：对话页显示后端不可用，不清空历史记录。

## 10. MVP 验收标准

- 设置页可以保存 Dify 地址和 API Key。
- 设置页可以测试本地 Dify 连接。
- 创建论文文件夹后，Dify 中出现对应 dataset。
- 上传 PDF 后，文件能保存、入库并完成索引。
- 上传 Markdown 后，文件能渲染阅读并入库。
- 入库完成后能生成论文卡片。
- 对话页可以选择某个论文文件夹作为上下文发问。
- 对话页可以选择某篇论文作为上下文发问。
- 知识库页可以打开论文并阅读。
- 知识库页按快捷键可以呼出 AI 问答栏。
- 回答中可以显示引用来源。
- 历史对话可以保存、重命名并归入文件夹。

## 11. 扩展功能

- LaTeX 支持。
- Zotero/BibTeX/EndNote 导入。
- 自动提取论文标题、作者、年份和 DOI。
- 多论文横向对比。
- 研究主题地图。
- 文献脉络图。
- 阅读报告一键生成。
- 综述提纲生成。
- 答辩模拟追问。
- 全局跨 dataset 检索。
- 小组共享版或局域网同步。
- 完全本地 RAG 后端，减少对 Dify 的依赖。
- 用户在 ResearchNotion 中直接配置模型 Provider API Key。

## 12. 推荐实现顺序

1. 初始化 Electron + React 桌面项目。
2. 实现 Notion 风格应用框架、顶部页签和左侧栏。
3. 实现设置页和 Dify 连接测试。
4. 实现 Folder/Paper/Conversation 的本地 SQLite 模型。
5. 实现论文文件夹与 Dify dataset 映射。
6. 实现 PDF/Markdown 导入和本地保存。
7. 实现 Dify 文档上传和索引状态显示。
8. 实现 PDF/Markdown 阅读器。
9. 实现论文卡片生成。
10. 实现对话页和上下文选择。
11. 实现知识库页 AI 抽屉和快捷键。
12. 实现引用来源展示和历史对话管理。
