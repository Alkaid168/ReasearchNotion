> **版本快照**：本文档是 v0.1.0（2026-08-02）的全功能验收清单，其中 TEI 向量检索、知识库归档等属当时验证的历史路线，不代表当前默认链路。当前实现以 [README](../README.md) 与 [技术说明](research-notion-technical-guide.md) 为准。

# ResearchNotion 全功能运行与验收清单

> 日期：2026-08-02 | 版本：0.1.0 | 安装包：ResearchNotion Setup 0.1.0.exe (116MB)

---

## 一、环境前提确认

- [ ] Docker Desktop 运行中（托盘图标绿色）
- [ ] Dify 16 容器全 Up（终端跑 `docker ps` 确认 api/nginx/redis/postgres/plugin_daemon）
- [ ] Dify 可访问 `http://localhost:8080`（浏览器能打开登录页）
- [ ] TEI 向量检索容器运行（`docker ps | grep tei-embedding`）
- [ ] DeepSeek endpoint 是 official（终端跑 `node scripts/use-deepseek-endpoint.mjs status` 显示 `https://api.deepseek.com`）
- [ ] 你的 DeepSeek API Key 备好（`sk-` 开头）

---

## 二、安装

- [ ] 双击 `release\ResearchNotion Setup 0.1.0.exe`
- [ ] 选择安装目录（默认即可）
- [ ] 勾选"创建桌面快捷方式" + "创建开始菜单快捷方式"
- [ ] 等待安装完成
- [ ] 开始菜单 / 桌面快捷方式打开 ResearchNotion
- [ ] **预期**：桌面应用窗口打开，顶部显示 ResearchNotion + 三个 tab（对话 / 知识库 / 设置）

> 如果闪退：检查系统环境变量是否设了 `ELECTRON_RUN_AS_NODE`（Trae CN 会设），先关 Trae CN。

---

## 三、首次配置

进入 **设置** 页：

- [ ] Dify 服务地址填 `http://localhost:8080`
- [ ] Dify App API Key 填你的 App Key（`app-` 开头，从 Dify 控制台或运行 `node scripts/check-dify-research-agent.mjs` 获取）
- [ ] Dify Knowledge API Key 填你的 Knowledge Key（`dataset-` 开头）
- [ ] DeepSeek API Key 填你的 `sk-` key
- [ ] 点 **保存设置**
- [ ] **预期**：绿色提示"设置已保存"

- [ ] 检查"本地状态"面板
- [ ] **预期**：Dify = 已配置 | 论文库 ≥ 1 | 论文 ≥ 3 | PDF ≥ 3 | 已索引 ≥ 3 | 论文卡片 ≥ 3 | 对话 ≥ 0

- [ ] 点 **测试连接**
- [ ] **预期**：绿色"连接成功"或类似成功消息

---

## 四、论文阅读器（本地功能）

- [ ] 进 **知识库** 页
- [ ] 左侧选择论文文件夹
- [ ] **预期**：右侧列出 3 篇论文（RAG / Transformer / BERT），每篇有卡片摘要

- [ ] 点击 **Attention Is All You Need**
- [ ] **预期**：PDF 阅读器加载，显示第一页

PDF 阅读器交互：
- [ ] 点下一页 / 上一页 → 正常翻页
- [ ] 点"适宽" → 页面适配窗口宽度
- [ ] 滚轮缩放 / 点缩放按钮 → 正常缩放
- [ ] 鼠拖选中一段文字 → 文字高亮
- [ ] **Ctrl+I** → 右侧弹出 AI 问答抽屉
- [ ] **Ctrl+I** 再按 → AI 抽屉关闭

---

## 五、AI 论文问答（Tool Agent 路径）

在论文阅读器的 AI 抽屉中：

### 5.1 单篇事实问答
- [ ] 问："这篇论文有多少个主要章节？"
- [ ] **预期**：Agent 回答列出 Introduction / Model Architecture / Training / Results / Conclusion 等，附引用

- [ ] 问："第 3.2 节讲的是什么？"
- [ ] **预期**：Agent 调用 `get_paper_section`，回答关于 Scaled Dot-Product Attention

- [ ] 问："这篇论文的实验结果如何？BLEU 分数是多少？"
- [ ] **预期**：Agent 调用 `investigate_paper` 或 `get_paper_text_chunk`，引用 WMT 2014 英德 28.4 / 英法 41.8 BLEU

### 5.2 当前页问答
- [ ] 翻到第 1 页
- [ ] 问："当前页的主要内容是什么？"
- [ ] **预期**：Agent 调用 `get_current_context` + `get_current_page_text`，回答摘要内容

### 5.3 选中文字问答
- [ ] 选中论文中一段文字
- [ ] 在 AI 抽屉中问："这段文字是什么意思？"
- [ ] **预期**：Agent 引用你选中的文字进行解释

---

## 六、AI 跨论文问答（对话页）

进 **对话** 页：

- [ ] 选择上下文为"论文库"（不是单篇）
- [ ] 问："当前论文库里有哪些论文？按标题和年份列出"
- [ ] **预期**：Agent 调用 `list_library_papers`，列出 3 篇

- [ ] 问："比较 BERT、Transformer 和 RAG：它们各自解决什么问题？"
- [ ] **预期**：Agent 调用 `investigate_library` 逐篇取证 → 分论文给出独立证据 → 对比回答

- [ ] 问（中文搜英文论文）："用中文比较这三篇论文的注意力机制"
- [ ] **预期**：Agent 改写英文 query 检索 → 中文回答

---

## 七、外网论文搜索（T12a）

- [ ] 在对话页问："帮我搜一下 arXiv 上关于 retrieval-augmented generation 的最新论文"
- [ ] **预期**：Agent 调用 `search_arxiv` → 返回 3-5 篇外部论文（标题 / 作者 / 摘要 / arXiv 链接）

- [ ] 问："Semantic Scholar 上 citation 最高的 RAG 论文是哪些？"
- [ ] **预期**：Agent 调用 `search_semantic_scholar` → 返回论文列表 + citation count

> 如果 S2 返回 429（限速），Agent 应告知"搜索暂时不可用"而非编造结果。

---

## 八、研究偏好记忆（T12b）

### 8.1 添加记忆
- [ ] 进 **设置** → 滚到底部 **研究偏好** 区
- [ ] 点 **添加记忆**
- [ ] 填写：
  - 类型：身份
  - 名称：`research-field`
  - 描述：`用户研究方向`
  - 内容：`NLP 方向硕士生，偏好中文回答`
- [ ] 保存
- [ ] **预期**：记忆卡片出现在列表中，badge 显示"身份"

- [ ] 再添加一条：
  - 类型：纠正
  - 名称：`no-preamble`
  - 描述：（空）
  - 内容：`不要自我介绍，直接回答`
- [ ] 保存

### 8.2 验证注入
- [ ] 回对话页问任意问题
- [ ] **预期**：Agent 用中文回答 + 不自我介绍（因为记忆注入了 prompt）

### 8.3 编辑 / 删除
- [ ] 在研究偏好区点某条记忆的"编辑"
- [ ] 修改内容 → 保存
- [ ] **预期**：卡片更新

- [ ] 点某条记忆的"删除"
- [ ] **预期**：卡片消失

---

## 九、论文卡片（T7）

- [ ] 知识库页检查每篇论文的卡片
- [ ] **预期**（每张卡片）：
  - 作者（英文人名保留英文）
  - 年份（4 位数字）
  - 一句话摘要（中文）
  - 研究问题（中文）
  - 方法摘要（中文）
  - 贡献（中文数组，每条独立）
  - 关键词（数组）

- [ ] 卡片字段无乱码 / 无 JSON 残留 / 无 `<think>` 标签
- [ ] contributions 和 keywords 是列表（不是逗号分隔的字符串）

---

## 十、对话管理

- [ ] 新建对话 → 问一个问题 → 有回答
- [ ] 对话列表右键 → 重命名
- [ ] 对话列表右键 → 删除
- [ ] 创建对话文件夹 → 拖对话进文件夹
- [ ] 导出对话为 Markdown（如果 UI 支持）

---

## 十一、双栏 PDF 验证（T8）

- [ ] 打开 RAG 论文（双栏布局）
- [ ] 用 `get_paper_section` 类问题（"Introduction 部分讲了什么"）验证
- [ ] **预期**：回答内容连贯，不是左右栏文字交错（如不会出现 "retrieval Transformer BERT attention" 这种混乱拼接）

---

## 十二、Benchmark 量化验证（命令行）

打开终端：

```bash
cd ReasearchNotion
unset ELECTRON_RUN_AS_NODE
node scripts/use-deepseek-endpoint.mjs status   # 确认 official
node scripts/benchmark-runner.mjs               # ~25 分钟
```

- [ ] Tool benchmark **11/11 pass^k**
- [ ] Trust benchmark **5/5 pass^k**
- [ ] dimensionAvg 全 1.0（toolRecall / evidenceCoverage / answerQuality）
- [ ] `bench/agent-eval-full-*.json` 报告文件生成

---

## 十三、DeepSeek Key 桌面端同步（T11）

- [ ] 在 Settings 页的 DeepSeek API Key 字段改一个不同的 key（或删除清空再填回）
- [ ] 保存
- [ ] 打开终端验证：
```bash
docker exec docker-db_postgres-1 psql -U postgres -d dify -t -A -c \
  "select left(encrypted_config::jsonb->>'api_key', 6) from provider_credentials \
   where provider_name='langgenius/deepseek/deepseek' limit 1;"
```
- [ ] **预期**：前缀与你刚填的 key 一致

---

## 十四、向量检索验证（T9）

- [ ] 在 Dify 控制台确认知识库 indexing = `high_quality` + embedding = `bge-m3`
- [ ] 问一个**语义相近但不含原词**的问题：
  ```
  这篇论文用了什么方法来让模型"看"整个句子？
  ```
- [ ] **预期**：Agent 找到相关段落（"attention / self-attention"），即使你没说"attention"

---

## 十五、关闭 + 重启

- [ ] 关闭 ResearchNotion 窗口
- [ ] 重新从开始菜单打开
- [ ] **预期**：恢复上次状态（论文库 / 对话 / 设置保留）
- [ ] 论文阅读状态保留（上次打开的论文 + 页码）

---

## 十六、常见问题速查

| 症状 | 检查 | 修法 |
|---|---|---|
| App 闪退 | Trae CN 是否运行 | 关 Trae CN 或删 ELECTRON_RUN_AS_NODE 环境变量 |
| AI 回答空 | DeepSeek endpoint | `node scripts/use-deepseek-endpoint.mjs official` |
| 工具调用失败 | 工具服务 17777 | 确保 ResearchNotion 运行中 |
| 论文导入失败 | Dify + Knowledge Key | Settings 页确认 Key 正确 |
| 向量检索弱 | TEI 容器 | `docker ps | grep tei` |
| 测试连接失败 | Dify 容器 | `docker compose up -d`（在 Dify docker 目录） |
| Agent 不调工具 | Tool Agent 未创建 | `node scripts/provision:dify-agent` |

---

## 验收结论

全部勾选 → **验收通过** ✅

签字：________________ 日期：________________
