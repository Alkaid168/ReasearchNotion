#!/usr/bin/env node
// ResearchNotion environment preparation. Usage: DEEPSEEK_API_KEY=sk-... node scripts/prepare-environment.mjs [--with-tei]
import cp from "node:child_process"; import fs from "node:fs"; import path from "node:path";
const DD = process.env.DIFY_DIR || "D:/CODES/dify";
const PD = process.env.DIFY_PLUGINS_DIR || "D:/CODES/dify-official-plugins";
const DU = (process.env.DIFY_BASE_URL || "http://localhost:8080").replace(/\/+$/,"");
const AE = process.env.DIFY_ADMIN_EMAIL || "admin@researchnotion.local";
const AP = process.env.ADMIN_PASSWORD || "ResearchNotion2026!";
const DK = process.env.DEEPSEEK_API_KEY || "";
const PR = process.argv.includes("--with-tei");
const DK0 = process.platform === "win32" ? "C:/Program Files/Docker/Docker/resources/bin/docker.exe" : "docker";
const sleep = ms => new Promise(r => setTimeout(r, ms));
const exec = (c,a,o={}) => cp.execFileSync(c,a,{encoding:"utf8",maxBuffer:50e6,...o}).trim();
function S(n,m){console.log("\n--- Step "+n+": "+m+" ---");}
function OK(m){console.log("  OK "+m);}
function SKIP(m){console.log("  SKIP "+m);}
function DIE(m){console.error("FAIL "+m);process.exit(1);}
async function wait(url, label, ms=180000) { const e=Date.now()+ms; while(Date.now()<e) { try { const r=await fetch(url,{signal:AbortSignal.timeout(3e3)}); if(r.status<500){OK(label);return} } catch{} process.stdout.write("."); await sleep(3e3) } DIE(label+" not ready") }
async function main(){
  console.log("=== ResearchNotion Environment Preparation ===");
  if(!DK) DIE("DEEPSEEK_API_KEY required");
  S(1,"Prerequisites"); try{exec(DK0,["version"]);OK("Docker")}catch{DIE("Docker not running")}
  S(2,"Deploy Dify");
  const dd = DD+"/docker";
  if(!fs.existsSync(dd+"/docker-compose.yaml")){
    console.log("  Cloning..."); exec("git",["clone","--depth","1","https://github.com/langgenius/dify.git",DD]);
    fs.copyFileSync(dd+"/.env.example",dd+"/.env");
    let e=fs.readFileSync(dd+"/.env","utf8").replace(/^EXPOSE_NGINX_PORT=80$/m,"EXPOSE_NGINX_PORT=8080");
    fs.writeFileSync(dd+"/.env",e); OK("Cloned + port 8080")
  } else SKIP("Dify exists")
  let up=false; try{up=exec(DK0,["ps","--filter","name=docker-api-1","--format","{{.Status}}"]).includes("Up")}catch{}
  if(!up){console.log("  Starting containers..."); exec(DK0,["compose","up","-d"],{cwd:dd}); OK("Started")} else SKIP("Containers up")
  await wait(DU,"Dify ready");
  S(3,"Init admin");
  try{const r=await fetch(DU+"/console/api/setup",{method:"POST",signal:AbortSignal.timeout(5e3)}); if(r.status===403) SKIP("Admin exists")}catch{}
  try{await fetch(DU+"/console/api/setup",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email:AE,name:"Admin",password:AP}),signal:AbortSignal.timeout(1e4)}); OK("Admin created")}catch{SKIP("Admin exists")}
  S(4,"Install plugins");
  if(!fs.existsSync(PD)) exec("git",["clone","--depth","1","https://github.com/langgenius/dify-official-plugins.git",PD]);
  let env=fs.readFileSync(dd+"/.env","utf8"); let rc=false;
  if(!env.includes("FORCE_VERIFYING_SIGNATURE=false")){env=env.replace(/^FORCE_VERIFYING_SIGNATURE=true$/m,"FORCE_VERIFYING_SIGNATURE=false"); if(!env.includes("FORCE_VERIFYING_SIGNATURE"))env+="\nFORCE_VERIFYING_SIGNATURE=false\n"; fs.writeFileSync(dd+"/.env",env); rc=true; OK("Sig off")}
  if(!env.includes("SSRF_PROXY_ALLOW_PRIVATE_DOMAINS")){env+="\nSSRF_PROXY_ALLOW_PRIVATE_DOMAINS=host.docker.internal\n"; fs.writeFileSync(dd+"/.env",env); rc=true; OK("SSRF")}
  if(rc){exec(DK0,["compose","up","-d","--force-recreate","plugin_daemon"],{cwd:dd}); exec(DK0,["compose","up","-d","ssrf_proxy"],{cwd:dd}); console.log("  Waiting..."); await sleep(2e4); OK("Recreated")}
  S(5,"DeepSeek key + endpoint");
  console.log("  Use existing scripts...");
  exec("node",[process.cwd()+"/scripts/use-deepseek-endpoint.mjs","official"]);
  OK("DeepSeek configured via use-deepseek-endpoint.mjs");
  if(PR){
    S(6,"TEI bge-m3");
    console.log("  See docs/dify-local-deploy.md section 9.1 for TEI deployment");
    SKIP("TEI requires manual steps (see deploy docs)")
  }
  console.log("\n=== Environment Ready ===");
  console.log("Dify:",DU,"| Admin:",AE);
  console.log("DeepSeek:",DK.slice(0,6)+"... | Endpoint: official");
  console.log("\nNext:");
  console.log("  unset ELECTRON_RUN_AS_NODE");
  console.log("  pnpm install");
  console.log("  node node_modules/@electron/rebuild/lib/cli.js -f -w better-sqlite3");
  console.log("  node node_modules/electron-vite/bin/electron-vite.js dev");
  console.log("  node scripts/provision-dify-research-agent.mjs");
  console.log("  node scripts/import-dify-agent-tools.mjs");
  console.log("  node scripts/provision-dify-tool-agent.mjs");
  console.log("  node scripts/rebuild-node.cjs && node scripts/seed-dify-demo-papers.mjs");
}
main().catch(e=>DIE(e.message));
