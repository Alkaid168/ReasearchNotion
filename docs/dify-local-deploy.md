# ResearchNotion 本机 Dify 部署笔记

> 让 ResearchNotion 完整运行（Workflow 卡片 + 自治 Tool Agent）所需的本机 Dify 部署。
> 基于 2026-07-31 在 Dify 1.16.1 上的部署经验。命令行导向，避开 GUI。

## 0. 前提
- Docker Desktop（daemon running；配国内镜像加速：`docker.1ms.run` / `xuanyuan.me`）
- Node.js + pnpm（ResearchNotion 自身）
- DeepSeek API Key（放 `research_notion/deepseekapikey.txt`，脚本读）

## 1. 部署 Dify（docker compose）
```bash
git clone --depth 1 https://github.com/langgenius/dify.git D:/CODES/dify
cd D:/CODES/dify/docker
cp .env.example .env
# 端口 80 → 8080（匹配 ResearchNotion 默认 + 避 Windows 80 保留）
sed -i 's/^EXPOSE_NGINX_PORT=80$/EXPOSE_NGINX_PORT=8080/' .env
docker compose up -d            # 16 容器，dify-api ~3GB，首次拉镜像较久
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8080   # 期望 200
```

## 2. 首次安装（创建 admin）
```bash
curl -X POST http://localhost:8080/console/api/setup \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@researchnotion.local","name":"Admin","password":"ResearchNotion2026!"}'
```

## 3. 配 DeepSeek provider（命令行，绕 GUI）
```bash
# login：Dify 的 password 只是 base64 编码（见 dify/api/libs/encryption.py FieldEncryption）
PASS_B64=$(printf 'ResearchNotion2026!' | base64)
curl -c /tmp/dify_cookies.txt -X POST http://localhost:8080/console/api/login \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"admin@researchnotion.local\",\"password\":\"$PASS_B64\"}"
CSRF=$(awk '/csrf_token/{print $7}' /tmp/dify_cookies.txt)

# 装 DeepSeek 插件：version 从 jsdelivr 拿 GitHub manifest
# （marketplace.dify.ai 是 Next.js SPA，version 在 RSC 难取；raw.githubusercontent 国内超时）
VER=$(curl -s https://cdn.jsdelivr.net/gh/langgenius/dify-official-plugins@main/models/deepseek/manifest.yaml \
  | grep -iE '^version:' | awk '{print $2}')   # 例 0.0.19
curl -b /tmp/dify_cookies.txt -X POST \
  "http://localhost:8080/console/api/workspaces/current/plugin/install/marketplace" \
  -H "Content-Type: application/json" -H "X-CSRF-Token: $CSRF" \
  -d "{\"plugin_unique_identifiers\":[\"langgenius/deepseek:$VER\"]}"
# 报 `difypkg: not a valid difypkg file` 可能误报，验 plugin/list 确认实际装上。

# 配 API key（Dify 自己写正确格式；勿 psql 写 provider_credentials.visibility，会触发 'all' is not a valid PermissionEnum）
node -e "const fs=require('fs');const key=fs.readFileSync('C:/Users/11428/Desktop/research_notion/deepseekapikey.txt','utf8').trim();fs.writeFileSync('/tmp/ds-body.json',JSON.stringify({credentials:{api_key:key},name:'DeepSeek'}))"
curl -b /tmp/dify_cookies.txt -X POST \
  "http://localhost:8080/console/api/workspaces/current/model-providers/langgenius/deepseek/deepseek/credentials" \
  -H "Content-Type: application/json" -H "X-CSRF-Token: $CSRF" \
  --data @/tmp/ds-body.json
rm /tmp/ds-body.json

# 切 official endpoint（bridge 17778 默认没跑，会 Connection refused）
cd C:/Users/11428/Desktop/research_notion/ReasearchNotion
node scripts/use-deepseek-endpoint.mjs official
```

## 4. SSRF 白名单（Tool Agent 调本地工具服务必需）
Dify agent 经 ssrf_proxy（squid）调 `host.docker.internal:17777`，默认 `deny to_private_networks`。
```bash
cd D:/CODES/dify/docker
grep -q "^SSRF_PROXY_ALLOW_PRIVATE_DOMAINS" .env \
  || echo "SSRF_PROXY_ALLOW_PRIVATE_DOMAINS=host.docker.internal" >> .env
docker compose up -d ssrf_proxy    # entrypoint 重新生成 dify_allow_private.conf
```

## 5. ResearchNotion provision（Workflow + Tool Agent + 论文）
```bash
cd C:/Users/11428/Desktop/research_notion/ReasearchNotion
unset ELECTRON_RUN_AS_NODE          # 关键：Trae CN 设了它，electron.exe 会退化成 node
# electron install 被默认 ignore，先下 binary
ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/ node node_modules/electron/install.js

# Workflow app（论文卡片 + 问答）
node scripts/provision-dify-research-agent.mjs

# 启工具服务（Electron dev，后台）+ 等 17777 HTTP 200
node node_modules/@electron/rebuild/lib/cli.js -f -w better-sqlite3   # electron ABI
node node_modules/electron-vite/bin/electron-vite.js dev              # 后台跑，含工具服务 17777

# 导入 12 工具 + 创建 Tool Agent
node scripts/import-dify-agent-tools.mjs
node scripts/provision-dify-tool-agent.mjs

# seed 3 篇论文（触发 T7 卡片生成）
node scripts/rebuild-node.cjs                # 切 node ABI（seed 走 node）
node scripts/seed-dify-demo-papers.mjs
```

## 6. 验证
```bash
unset ELECTRON_RUN_AS_NODE
node scripts/smoke-dify-tool-agent-paper.mjs   # Tool Agent 单篇取证
node scripts/benchmark-runner.mjs               # T6 完整评测（tool k=3 + trust k=2）
```

## 7. 常见坑（按踩中顺序）
| 现象 | 根因 | 修法 |
|---|---|---|
| `process.type undefined` + require('electron') 返回 path string | 环境变量 `ELECTRON_RUN_AS_NODE=1`（Trae CN 设） | `unset ELECTRON_RUN_AS_NODE` |
| `pnpm <script>` 进 cmd 交互横幅、命令不执行 | Claude Code Win Bash 非 TTY，pnpm spawn cmd 进交互 | 用 `node node_modules/.bin/<tool>` 或 `node scripts/x.mjs` 直接调 |
| `cjsPreparseModuleExports` / `ERR_REQUIRE_ESM pdfjs` | 上一条 ELECTRON_RUN_AS_NODE 的症状（不是真 interop bug） | 同上 unset，回退所有 format CJS / pdfjs dynamic 等错误 workaround |
| Dify 控制台右上角循环 `'all' is not a valid PermissionEnum` | 曾 psql 写 provider_credentials.visibility='all' | 删该行；用 console API 配 credentials |
| Tool Agent answer 空 + 无 agent_thought event | DeepSeek endpoint 指 bridge 17778 没跑 | `node scripts/use-deepseek-endpoint.mjs official` |
| `Connection refused host.docker.internal:17778` | 同上 | 同上，或 `pnpm deepseek:bridge` 跑 host 转发 |
| squid 拦工具调用（"网络策略"） | ssrf_proxy `deny to_private_networks` | 加 `SSRF_PROXY_ALLOW_PRIVATE_DOMAINS=host.docker.internal` |
| `AppService.create_app() missing 'session'` 等 | Dify 1.16.1 把 session 改 kw-only + 加 annotation_reply | 已在 provision-dify-tool-agent.mjs 修（commit 8274dbe） |
| better-sqlite3 ABI mismatch | test 用 node ABI，Electron 用 electron ABI | `node scripts/rebuild-node.cjs`（node）/ `@electron/rebuild`（electron），按需切 |

## 8. ABI 切换速查
| 场景 | 命令 |
|---|---|
| `node scripts/seed-dify-demo-papers.mjs` / `verify-mvp-demo.mjs` / vitest | `node scripts/rebuild-node.cjs` |
| Electron dev（工具服务 17777）/ smoke / benchmark | `node node_modules/@electron/rebuild/lib/cli.js -f -w better-sqlite3` |

> ResearchNotion 的 `scripts/start-dify.ps1` 硬编码 `F:\CODES\dify`；本机部署在 `D:\CODES\dify`，需改路径或用 env 覆盖（本笔记所有命令直接用 `D:/CODES/dify/docker`）。

## 9. 向量检索（T9: bge-m3 + high_quality）

> 启用向量 RAG（替代默认 economy 关键词）。需 TEI bge-m3 容器 + openai_api_compatible plugin。
> **Dify 1.16.1 marketplace 坏**（plugin_daemon fetch manifest 调旧 API 404），绕 marketplace：build .difypkg + 关签名 + upload install。

### 9.1 TEI bge-m3 容器（GPU）
```bash
# 预下载模型（绕 TEI download "relative URL without base" bug；排除 onnx/.DS_Store）
HF_ENDPOINT=https://hf-mirror.com NO_PROXY="*" python -c "
from huggingface_hub import snapshot_download
snapshot_download('BAAI/bge-m3', local_dir='D:/CODES/dify/tei-models/bge-m3',
  allow_patterns=['*.json','*.safetensors','*.bin','tokenizer*','vocab*','1_Pooling/*'])
"
# .wslconfig 改 memory=16GB（Dify 16 容器 + TEI，原 8GB OOM 137）→ wsl --shutdown

# docker-compose.tei.yaml（bind mount 本地模型 + GPU）
cat > D:/CODES/dify/docker/docker-compose.tei.yaml <<'EOF'
services:
  tei-embedding:
    image: ghcr.io/huggingface/text-embeddings-inference:1.5
    command: --model-id /models/bge-m3
    ports: ["7080:80"]
    volumes: ["D:/CODES/dify/tei-models:/models"]
    deploy: { resources: { reservations: { devices: [{ driver: nvidia, capabilities: [gpu] }] } } }
    restart: unless-stopped
EOF
cd D:/CODES/dify/docker && docker compose -f docker-compose.yaml -f docker-compose.tei.yaml up -d tei-embedding
# 验证（用 Dify 容器内部网络，主机 7080 Windows Docker 端口转发可能不通）
docker exec docker-api-1 curl -s http://tei-embedding:80/v1/embeddings -X POST \
  -H "Content-Type: application/json" -d '{"model":"bge-m3","input":"test"}'
```

### 9.2 装 openai_api_compatible plugin（绕 marketplace）
```bash
# 1) build .difypkg from source（dify plugin package CLI 不在 pip/uv，手动 zip 够）
git clone --depth 1 https://github.com/langgenius/dify-official-plugins.git D:/CODES/dify-official-plugins
cd D:/CODES/dify-official-plugins/models/openai_api_compatible
python -c "
import zipfile, os
out=r'D:\CODES\dify-official-plugins\openai_api_compatible.difypkg'
with zipfile.ZipFile(out,'w',zipfile.ZIP_DEFLATED) as z:
    for r,d,f in os.walk('.'):
        d[:]=[x for x in d if x not in ('__pycache__','.git','.venv')]
        for fn in f: z.write(os.path.join(r,fn), os.path.relpath(os.path.join(r,fn),'.'))
print('built', os.path.getsize(out))"

# 2) 关签名（自托管默认验签；env 在 plugin_daemon service，force-recreate 才生效）
cd D:/CODES/dify/docker && echo "FORCE_VERIFYING_SIGNATURE=false" >> .env
docker compose up -d --force-recreate plugin_daemon

# 3) upload（field "pkg" 非 file）+ install
PASS_B64=$(printf 'ResearchNotion2026!' | base64)
curl -c /tmp/dc.txt -X POST http://localhost:8080/console/api/login \
  -H "Content-Type: application/json" -d "{\"email\":\"admin@researchnotion.local\",\"password\":\"$PASS_B64\"}"
CSRF=$(awk '/csrf_token/{print $7}' /tmp/dc.txt)
RESP=$(curl -b /tmp/dc.txt -X POST http://localhost:8080/console/api/workspaces/current/plugin/upload/pkg \
  -H "X-CSRF-Token: $CSRF" -F "pkg=@D:/CODES/dify-official-plugins/openai_api_compatible.difypkg")
PLUGIN_UID=$(echo "$RESP" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.parse(d).unique_identifier))")
curl -b /tmp/dc.txt -X POST http://localhost:8080/console/api/workspaces/current/plugin/install/pkg \
  -H "Content-Type: application/json" -H "X-CSRF-Token: $CSRF" \
  -d "{\"plugin_unique_identifiers\":[\"$PLUGIN_UID\"]}"
# 轮询 plugin/list 确认装上（~60s）
```

### 9.3 配 embedding + 切 high_quality
```bash
# 配 bge-m3（max_chunks/context_size 必须 string！数字报 TypeError）
curl -b /tmp/dc.txt -X POST "http://localhost:8080/console/api/workspaces/current/model-providers/langgenius/openai_api_compatible/openai_api_compatible/models/credentials" \
  -H "Content-Type: application/json" -H "X-CSRF-Token: $CSRF" \
  -d '{"model_type":"text-embedding","model":"bge-m3","credentials":{"api_key":"dummy","endpoint_url":"http://tei-embedding:80/v1","max_chunks":"32","context_size":"8192","display_name":"bge-m3 (TEI)"}}'

# 切 dataset high_quality（Dify 自动后台重索引，~40s 后 embedding_available=true）
curl -b /tmp/dc.txt -X PATCH "http://localhost:8080/console/api/datasets/<dataset_id>" \
  -H "Content-Type: application/json" -H "X-CSRF-Token: $CSRF" \
  -d '{"indexing_technique":"high_quality","embedding_model":"bge-m3","embedding_model_provider":"langgenius/openai_api_compatible/openai_api_compatible"}'
```

> provision-dify-research-agent.mjs + seed-dify-demo-papers.mjs 默认 high_quality（commit 1ba5383），新部署自动向量索引。
>
> **reranker**：TEI 1.5 把 bge-reranker-v2-m3 当 FlashBert（embedding backend），不兼容 classifier → exit 0 restart loop。两阶段检索需换 Infinity 或 classifier 镜像。
