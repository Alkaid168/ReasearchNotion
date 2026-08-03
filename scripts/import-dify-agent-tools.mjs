import childProcess from 'node:child_process'
import { readToolServiceToken, toolServiceTokenHeader } from './tool-service-auth.mjs'

const dbContainer = process.env.DIFY_DB_CONTAINER || 'docker-db_postgres-1'
const apiContainer = process.env.DIFY_API_CONTAINER || 'docker-api-1'
const providerName = process.env.RESEARCH_NOTION_TOOL_PROVIDER || 'ResearchNotion_Local_Tools'
const openApiUrl =
  process.env.RESEARCH_NOTION_TOOL_OPENAPI_URL ||
  'http://host.docker.internal:17777/openapi.json?server=http%3A%2F%2Fhost.docker.internal%3A17777'

const expectedOperations = [
  'get_current_context',
  'get_current_page_text',
  'get_paper_metadata',
  'get_paper_page_text',
  'get_paper_section',
  'get_paper_outline',
  'get_paper_text_chunk',
  'investigate_paper',
  'investigate_library',
  'list_library_papers',
  'search_current_paper',
  'search_library',
  'search_arxiv',
  'search_semantic_scholar',
  'search_openalex',
  'save_memory'
]
const toolServiceToken = readToolServiceToken()

function execFile(file, args, options = {}) {
  return childProcess.execFileSync(file, args, {
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
    ...options
  })
}

function psql(sql) {
  return execFile('docker', ['exec', dbContainer, 'psql', '-U', 'postgres', '-d', 'dify', '-t', '-A', '-c', sql]).trim()
}

function pythonImporter() {
  return String.raw`
import json
import urllib.request
from sqlalchemy import text

from app_factory import create_app
from core.tools.entities.tool_entities import ApiProviderSchemaType
from extensions.ext_database import db
from services.tools.api_tools_manage_service import ApiToolManageService

provider_name = ${JSON.stringify(providerName)}
openapi_url = ${JSON.stringify(openApiUrl)}
expected_operations = ${JSON.stringify(expectedOperations)}
tool_service_token = ${JSON.stringify(toolServiceToken)}
tool_service_token_header = ${JSON.stringify(toolServiceTokenHeader)}

with urllib.request.urlopen(openapi_url, timeout=10) as response:
    schema = response.read().decode("utf-8")

schema_json = json.loads(schema)
operations = [
    method.get("operationId")
    for path in schema_json.get("paths", {}).values()
    for method in path.values()
    if isinstance(method, dict)
]
missing = [operation for operation in expected_operations if operation not in operations]
if missing:
    raise RuntimeError(f"OpenAPI schema is missing expected operations: {', '.join(missing)}")

_, app = create_app()
with app.app_context():
    owner = db.session.execute(
        text(
            "select tenant_id, account_id from tenant_account_joins "
            "where role='owner' order by created_at asc limit 1"
        )
    ).mappings().first()
    if not owner:
        raise RuntimeError("Dify owner tenant/account not found. Is Dify initialized?")

    tenant_id = str(owner["tenant_id"])
    user_id = str(owner["account_id"])
    icon = {
        "type": "emoji",
        "content": "R",
        "background": "#EAF2FF"
    }
    credentials = {
        "auth_type": "api_key_header",
        "api_key_header": tool_service_token_header,
        "api_key_header_prefix": "custom",
        "api_key_value": tool_service_token,
    }
    existing = db.session.execute(
        text("select id from tool_api_providers where tenant_id=:tenant_id and name=:name limit 1"),
        {"tenant_id": tenant_id, "name": provider_name},
    ).first()

    if existing:
        result = ApiToolManageService.update_api_tool_provider(
            user_id,
            tenant_id,
            provider_name,
            provider_name,
            icon,
            credentials,
            ApiProviderSchemaType.OPENAPI,
            schema,
            "",
            "",
            [],
        )
        action = "updated"
    else:
        result = ApiToolManageService.create_api_tool_provider(
            user_id,
            tenant_id,
            provider_name,
            icon,
            credentials,
            ApiProviderSchemaType.OPENAPI,
            schema,
            "",
            "",
            [],
        )
        action = "created"

    provider = db.session.execute(
        text("select id, tools_str from tool_api_providers where tenant_id=:tenant_id and name=:name limit 1"),
        {"tenant_id": tenant_id, "name": provider_name},
    ).mappings().first()
    tools = json.loads(provider["tools_str"]) if provider else []
    print(json.dumps({
        "result": result,
        "action": action,
        "provider": provider_name,
        "provider_id": str(provider["id"]) if provider else "",
        "tool_count": len(tools),
        "operations": [tool.get("operation_id") for tool in tools],
    }, ensure_ascii=False))
`
}

function main() {
  psql('select 1;')
  const output = execFile('docker', ['exec', '-i', apiContainer, 'python', '-'], { input: pythonImporter() })
  const result = JSON.parse(output.trim().split(/\r?\n/).at(-1))
  console.log(`Dify API tool provider ${result.action}: ${result.provider} (${result.provider_id})`)
  console.log(`Imported Agent tool operations: ${result.operations.join(', ')}`)
  if (result.tool_count !== expectedOperations.length) {
    throw new Error(`Expected ${expectedOperations.length} tools, imported ${result.tool_count}.`)
  }
}

main()
