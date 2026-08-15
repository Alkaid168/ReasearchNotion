# ResearchNotion 本地 Dify 部署

> 本文只描述 ResearchNotion Tool Agent 的本地 Dify 部署。桌面端问答不依赖 Dify 知识库检索；已有 Dify 知识库仅作为可选论文归档保留。

> 平台限制：本项目（含全部 `.ps1`/`.bat` 脚本）仅在 Windows 10/11 上开发与验证；macOS / Linux 未支持。

## 前置：从零获取 Dify（首次部署必读）

启动脚本不包含 Dify 本体。`scripts/start-dify.ps1` 需要一个**已存在的 Dify 源码目录**（内含 `docker/docker-compose.yaml`），默认查找 `D:\Dify\dify-main`；若你的 Dify 放在别处，必须设置环境变量 `DIFY_ROOT` 指向它。

首次部署步骤：

```powershell
# 1. 克隆 Dify 源码（任选一个位置）
git clone https://github.com/langgenius/dify.git D:\Dify\dify-main

# 2. 初始化 Dify 的 docker 环境变量（在 Dify 的 docker 目录内）
cd D:\Dify\dify-main\docker
Copy-Item .env.example .env
docker compose up -d

# 3. 首次初始化完成后，浏览器打开 http://localhost:8080
#    按引导设置管理员账号（该账号属于 Dify 控制台，与桌面端无关）
```

如果 Dify 不在默认位置，在**系统环境变量**或当前会话中设置后再运行启动脚本：

```powershell
$env:DIFY_ROOT = "你的\dify\目录"   # 目录内应能看到 docker\docker-compose.yaml
```

> 项目中另有一个可选的环境准备脚本 `scripts/prepare-environment.mjs`（默认读取 `DIFY_DIR`），它面向自动化环境，本手册不依赖它。日常使用以 `DIFY_ROOT` + `start-dify.ps1` 为准。

## 运行前提

- Docker Desktop 已启动。
- Node.js 与 pnpm 可用。
- 已配置可供 Dify 使用的模型 Provider，例如 DeepSeek。
- 项目可以访问本地 Dify 地址 `http://127.0.0.1:8080`。

## 配置 DeepSeek 模型（首次必读）

Tool Agent 的回答依赖 Dify 中的 DeepSeek 模型 Provider。**两种方式任选其一**：

**方式 A（推荐）：在桌面端设置页填 Key，自动同步**

1. 启动桌面端（`start-research-notion.bat`）。
2. 设置页填写 **DeepSeek API Key**（`sk-` 开头）并保存——保存时会自动同步到本地 Dify 的模型 Provider。

**方式 B：在 Dify 控制台手动配置**

1. 打开 `http://localhost:8080`，用 Dify 管理员账号登录。
2. 进入 设置 → 模型供应商，安装并配置 DeepSeek（填入 API Key）。
3. 后续桌面端设置页可留空 DeepSeek Key。

> 桌面端提供 `pnpm use:deepseek-bridge` / `pnpm use:deepseek-official` 切换 Dify 内 DeepSeek 的端点（本地桥接 `:17778` 或官方 `https://api.deepseek.com`）。该脚本直接操作 Dify 的 Postgres（默认容器名 `docker-db_postgres-1`）；若你的容器名不同，用环境变量 `DIFY_DB_CONTAINER` / `DIFY_REDIS_CONTAINER` 覆盖，可用 `docker ps` 确认实际容器名。

## 启动 Dify

项目自带启动包装脚本：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/start-dify.ps1 -NoOpen
```

启动后检查：

```powershell
docker ps
Invoke-WebRequest http://127.0.0.1:8080 -UseBasicParsing
```

不要执行 `docker compose down -v`，除非明确要重置 Dify。该命令会删除卷中的数据库、应用配置和知识库数据。

## 允许 Dify 访问本机工具服务

Tool Agent 运行在 Docker 中，但论文工具服务运行在 Windows 主机的 `127.0.0.1:17777`。容器中的 `localhost` 不是 Windows 主机，因此 Dify 应通过：

```text
http://host.docker.internal:17777/openapi.json
```

在 Dify 的 `.env` 中允许该主机名：

```text
SSRF_PROXY_ALLOW_PRIVATE_DOMAINS=host.docker.internal
```

修改后重启 `ssrf_proxy` 服务。若 Dify 报“网络策略”或工具连接失败，先检查这一项和本地 `http://127.0.0.1:17777/openapi.json`。

## 配置模型

ResearchNotion 可使用 DeepSeek 官方端点，也可使用本机桥接服务：

```powershell
pnpm use:deepseek-official
# 或
pnpm use:deepseek-bridge
```

桥接服务监听 Windows 主机 `127.0.0.1:17778`，Dify 容器使用 `http://host.docker.internal:17778` 访问它。桥接只用于网络兼容性，不存储模型 API Key。

## 导入工具并创建 Agent

在一个终端启动桌面端开发服务，使 OpenAPI 服务可访问：

```powershell
pnpm dev
```

另开终端执行：

```powershell
pnpm import:dify-tools
pnpm provision:dify-agent
pnpm use:dify-agent
pnpm check:dify
```

这些命令会创建或更新 `ResearchNotion_Local_Tools`，创建或更新 `ResearchNotion Tool Agent`，将 Tool Agent 的 App API Key 写到本地设置，并检查 Dify 是否为 `agent-chat`、工具是否完整挂载。

## Dify 知识库归档

如果希望把公开演示论文同步到已有 Dify 知识库，先在 Dify 中创建 `ResearchNotion Demo Library`，再配置 Knowledge API Key：

```powershell
pnpm seed:dify
```

该操作只影响 Dify 中的归档副本和本地演示数据；它不是 Tool Agent 回答问题的必要步骤。

## 常见排查

| 现象 | 优先检查 |
| --- | --- |
| `Tool Agent not found` | `pnpm import:dify-tools` 后运行 `pnpm provision:dify-agent` |
| 工具调用连接失败 | 桌面端是否运行；`host.docker.internal` 是否在 SSRF 白名单 |
| Agent 不回复或模型报错 | Dify 模型 Provider、DeepSeek Key、桥接服务 `17778` |
| Node/Electron SQLite ABI 不匹配 | Node 脚本前 `pnpm rebuild:node`；Electron 启动前 `pnpm rebuild:native` |
| 归档同步失败 | Knowledge API Key 和目标 dataset；这不影响 Tool Agent 本地问答 |
