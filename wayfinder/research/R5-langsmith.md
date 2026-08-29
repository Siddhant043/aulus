# R5 — LangSmith (JS/TS) Integration for Aulus: Tracing + Prompt Management (Optional / OSS)

_Researched 2026-08-30. Verified against current LangChain/LangSmith docs and the `langsmith-sdk` JS package. Targets TypeScript/Bun + LangChain.js + LangGraph.js._

## Summary

LangSmith integrates with LangGraph.js in two layers that are cleanly separable:

1. **Tracing** — When you use LangChain/LangGraph modules, tracing is **automatic**: set a few env vars (`LANGSMITH_TRACING=true`, `LANGSMITH_API_KEY`, optionally `LANGSMITH_PROJECT`/`LANGSMITH_ENDPOINT`) and every graph/chain/LLM call is captured with no code changes. Non-LangChain code (raw provider SDKs, custom tools) is captured by explicitly wrapping with `traceable()` / `wrapOpenAI()`. **When the env vars are absent, the tracer is a no-op** — LangChain checks the flag once and skips all callback/export work, so there is no error and negligible overhead. This is exactly what an OSS app needs: tracing is opt-in via environment, off by default.

2. **Prompt management** — LangSmith's Prompt Hub stores prompts as **named, immutable, versioned artifacts** (every push creates a commit hash; commits are never overwritten). You **pull** a versioned prompt at runtime by identifier + `:commit-hash` or `:tag`, and **push/commit** new versions from code or the UI. This requires a network call and a LangSmith account, so for OSS it must be **optional with a local-file fallback**.

**Recommended pattern for Aulus:** a single `observability`/`langsmith` init module that reads env once and exposes `isTracingEnabled()`; tracing stays fully declarative (env-gated, zero wrapping for LangChain code); prompts are loaded through a small `PromptProvider` abstraction whose default implementation reads **local prompt files bundled in the repo**, with an optional LangSmith-backed provider selected only when `LANGSMITH_API_KEY` is present. Self-hosters get a working app with zero LangSmith dependency at runtime.

---

## 1. Environment variables & enablement (2026)

LangSmith went through a rename: the **`LANGSMITH_*`** prefix is the current, recommended family; the older **`LANGCHAIN_*`** names remain supported as **aliases** for backwards compatibility. Prefer `LANGSMITH_*` and treat `LANGCHAIN_*` as legacy.

| Current (preferred) | Legacy alias (still works) | Purpose |
|---|---|---|
| `LANGSMITH_TRACING=true` | `LANGCHAIN_TRACING_V2=true` | Master on/off switch for tracing. Absent/`false` = fully disabled (no-op). |
| `LANGSMITH_API_KEY` | `LANGCHAIN_API_KEY` | Auth. Its presence is the natural signal for "LangSmith available". |
| `LANGSMITH_PROJECT` | `LANGCHAIN_PROJECT` | Target project/tracer group. Defaults to `"default"`. |
| `LANGSMITH_ENDPOINT` | `LANGCHAIN_ENDPOINT` | API base URL. Set for non-US cloud regions or self-hosted. |
| `LANGSMITH_WORKSPACE_ID` | — | Required when using an **org-scoped** API key tied to multiple workspaces. |

Notes / gotchas confirmed in the docs:

- **Regional cloud endpoints** (set `LANGSMITH_ENDPOINT`, **no trailing slash** — a trailing slash causes auth errors):
  - US (default): `https://api.smith.langchain.com`
  - EU: `https://eu.api.smith.langchain.com`
  - APAC: `https://apac.api.smith.langchain.com`
- **JS-specific latency flag:** `LANGCHAIN_CALLBACKS_BACKGROUND`.
  - Non-serverless (long-lived Bun server): set `true` so trace export happens off the hot path (lower request latency).
  - Serverless (Lambda/Vercel/edge): set `false` so traces flush **before** the function is frozen/terminated, otherwise traces are lost.
- Both prefixes are honored; if in doubt use `LANGSMITH_*`. Don't set conflicting values for the same logical setting under both prefixes.

**Enablement logic Aulus should use:** treat tracing as enabled only when `LANGSMITH_TRACING` is truthy **and** `LANGSMITH_API_KEY` (or a self-hosted no-auth endpoint) is set. Treat prompt-hub usage as available only when `LANGSMITH_API_KEY`/endpoint is set. Never assume either.

---

## 2. Tracing setup for LangGraph.js

### 2a. Automatic instrumentation (LangChain/LangGraph code) — the common case

If your nodes use LangChain modules (`@langchain/core`, `@langchain/openai`, `@langchain/anthropic`, LangGraph's `StateGraph`, prebuilt agents, etc.), **you write no tracing code**. Setting the env vars is sufficient; the LangChain callback system infers the trace tree (graph → node → LLM → tool) automatically.

```bash
# .env (only when the operator opts in)
LANGSMITH_TRACING=true
LANGSMITH_API_KEY=lsv2_...
LANGSMITH_PROJECT=aulus-prod          # optional
# LANGSMITH_ENDPOINT=https://eu.api.smith.langchain.com   # optional (region / self-host)
```

```ts
// No LangSmith imports needed. Standard LangGraph code is auto-traced.
import { ChatOpenAI } from "@langchain/openai";
import { StateGraph } from "@langchain/langgraph";

const model = new ChatOpenAI({ model: "gpt-5.5", temperature: 0 }).bindTools(tools);
const graph = new StateGraph(/* ... */).compile();
const result = await graph.invoke(input); // fully traced iff LANGSMITH_TRACING=true
```

Install: `npm i @langchain/openai @langchain/langgraph` (already Aulus deps). The `langsmith` package is pulled in transitively by LangChain.

### 2b. Manual wrapping (non-LangChain code / raw provider SDKs / custom tools)

For provider-agnostic paths where Aulus calls a raw SDK (e.g. `openai`, or a custom fetch-based provider) or arbitrary business logic you want as a span, wrap it:

```ts
import { traceable, wrapOpenAI } from "langsmith/traceable"; // + "langsmith/wrappers"
import OpenAI from "openai";

// Wrap any function as a traced span
const search = traceable(
  async ({ query }: { query: string }) => { /* ... */ },
  { run_type: "tool", name: "Search Tool" }
);

// Wrap a raw provider client so its calls appear in the trace tree
const client = wrapOpenAI(new OpenAI());
```

Key property: **`traceable` and `wrapOpenAI` are themselves env-gated** — when `LANGSMITH_TRACING` is off they pass through to the underlying function/client with no export work, so wrapping is safe to leave in place permanently. This means Aulus can wrap its provider-agnostic call sites once and never branch on whether LangSmith is enabled.

### 2c. Config-only enablement without env vars (advanced)

LangSmith also supports enabling tracing per-invocation (passing a tracer/`LangChainTracer` or client in the runnable config) instead of via env — useful if Aulus ever needs per-request or multi-tenant control. For most OSS deployments, env-gating is simpler and is the recommended default.

---

## 3. Prompt registry (Prompt Hub) + versioning workflow

### Model
- A prompt is a **named, structured artifact** (a `ChatPromptTemplate` / `PromptTemplate` with input variables and message roles), optionally bound to a model config — **not** a bare string.
- **Every push creates an immutable commit** identified by a hash. Old commits are never mutated; you can pull any historical commit by hash forever. Tags (e.g. `production`, `v1`) are movable pointers to a commit.

### Packages (TS/TS)
Two entry points, per current docs (`langsmith >= 0.1.99`, `langchain >= 0.2.14`):
- **`langchain/hub`** — high-level `push` / `pull` that return ready-to-use Runnables (`ChatPromptTemplate`, or a full chain when a model is attached). Use `langchain/hub/node` in Node/Bun for automatic **model deserialization** (`includeModel: true`).
- **`langsmith` `Client`** — lower-level programmatic management (`pushPrompt`, `pullPromptCommit`, listing/CRUD). Use when you need raw manifests or metadata rather than an instantiated Runnable.

### Pull a versioned prompt at runtime

```ts
import * as hub from "langchain/hub/node";
import type { Runnable } from "@langchain/core/runnables";

// latest
const prompt = await hub.pull("aulus-summarizer");

// pinned to an immutable commit (reproducible) — RECOMMENDED for prod
const pinned = await hub.pull("aulus-summarizer:12344e88");

// pinned to a moving tag
const tagged = await hub.pull("aulus-summarizer:production");

// pull prompt + bound model as a runnable chain (Node/Bun only)
const chain = await hub.pull<Runnable>("aulus-summarizer-with-model", { includeModel: true });
const out = await chain.invoke({ topic: "cats" });

// public prompt requires an owner handle
const shared = await hub.pull("efriis/my-first-prompt");
```

### Push / commit a new version

```ts
import * as hub from "langchain/hub";
import { ChatPromptTemplate } from "@langchain/core/prompts";

const prompt = ChatPromptTemplate.fromTemplate("Summarize: {text}");
const url = await hub.push("aulus-summarizer", { object: prompt }); // -> commit URL

// or via the low-level Client for tags/visibility/metadata
import { Client } from "langsmith";
const client = new Client({ apiKey: process.env.LANGSMITH_API_KEY, apiUrl: process.env.LANGSMITH_ENDPOINT });
await client.pushPrompt("aulus/summarizer", {
  object: prompt,
  tags: ["v2", "production"],
  isPublic: false,
  // parentCommitHash, description, readme also supported
});
```

### Recommended prod discipline
- **Pin by commit hash** (or a controlled tag) in production for reproducibility; a bare name pulls "latest" and can change under you.
- Treat prompt edits like code: edit in the Playground/UI or push from code → new commit → move the `production` tag when validated. This lets you fix a bad prompt **without redeploying** the app.
- **Cache pulled prompts** in-process (they're network calls). Pulling on every request adds latency and a hard dependency on LangSmith availability — pull once at startup (or with a TTL cache) and reuse.

### Security note (relevant to OSS)
`langsmith` **< 0.6.0** has a HIGH-severity advisory (CVE-2026-45134, CVSS 7.1): pulling **public** prompts by `owner/name` deserializes untrusted manifests that can set custom model base URLs, headers, or env-var references at deserialization time. Mitigations: **require `langsmith >= 0.6.0`**, avoid pulling untrusted public prompts, validate manifests, and keep `LANGSMITH_API_KEY` restricted. Aulus should pin `langsmith >= 0.6.0` and prefer its **own** private/local prompts over arbitrary public ones.

---

## 4. Cloud vs self-hosted LangSmith

Aulus does not need to care which backend the operator uses — it's just `LANGSMITH_ENDPOINT`:

- **Managed cloud:** default US endpoint, or set EU/APAC/AWS regional endpoints (section 1).
- **Self-hosted (Enterprise add-on):** ships as Docker images (docker-compose for trials; Terraform/Helm + Kubernetes for production), needs PostgreSQL 14+, and requires a license key from LangChain sales. Point the app at it via `LANGSMITH_ENDPOINT`.
  - Example no-auth local dev config: `LANGSMITH_ENDPOINT=http://localhost:1980/api/v1` (frontend on `:1980`, ingest API on `:1984`).
- **The important OSS takeaway:** self-hosting LangSmith is a paid Enterprise feature that most Aulus self-hosters will **not** have. Therefore LangSmith (cloud *or* self-hosted) must be genuinely optional — Aulus must fully function with **no** LangSmith backend at all. Endpoint is a config detail; presence-of-LangSmith is the real branch.

---

## 5. The optional / no-op pattern for OSS

Three facts make "optional" clean to implement:

1. **Tracing is env-gated at the framework level.** With `LANGSMITH_TRACING` unset/false, LangChain's tracer short-circuits: no callbacks registered, no HTTP export, negligible overhead, no errors. You do **not** need try/catch or feature flags around traced code — LangChain already no-ops.
2. **`traceable()` / `wrapOpenAI()` also no-op** when tracing is off. Safe to leave wrappers in permanently; no runtime branch needed at call sites.
3. **Prompt Hub is the only piece that hard-requires a network + account.** This is the part that needs an explicit fallback, because a `hub.pull()` with no API key/endpoint will fail.

So the only real "optional" work is **prompts**: introduce an abstraction with a local default and a LangSmith-backed optional impl. Tracing needs nothing beyond honoring the env var (which the framework does for you) plus ensuring `langsmith` is an installed dependency (it is, transitively via LangChain) so imports don't break when disabled.

Anti-patterns to avoid:
- Don't `import` LangSmith-only symbols at module top-level in a way that throws when the key is missing — imports are fine (the SDK loads without a key), but **don't call** `hub.pull`/`pushPrompt` unless enabled.
- Don't pull prompts from the network on the request hot path with no cache/fallback — a LangSmith outage would take down a self-hoster who "just wanted local prompts."
- Don't scatter `if (langsmithEnabled)` across the codebase — centralize the decision.

---

## 6. Recommendation — concrete integration for Aulus

**Where init lives.** Create one module, e.g. `src/observability/langsmith.ts`, imported once at app bootstrap. It reads env **once** and exposes pure predicates:

```ts
// src/observability/langsmith.ts
const truthy = (v?: string) => v === "true" || v === "1";

export const isTracingEnabled = () =>
  truthy(process.env.LANGSMITH_TRACING ?? process.env.LANGCHAIN_TRACING_V2);

export const isLangSmithConfigured = () =>
  Boolean(process.env.LANGSMITH_API_KEY ?? process.env.LANGCHAIN_API_KEY) ||
  Boolean(process.env.LANGSMITH_ENDPOINT); // self-hosted no-auth

// Nothing else to do for tracing: LangChain/LangGraph auto-instrument from env.
// This module exists mainly to (a) document the contract and (b) drive prompt loading.
```

Because tracing is automatic, this module does **not** wire up tracers for LangGraph — it only documents the contract and gates prompt loading. Optionally log once at startup: `"LangSmith tracing: enabled/disabled"`.

**How prompts are loaded — `PromptProvider` seam.** Define a tiny interface and select the implementation at startup:

```ts
// src/prompts/provider.ts
import type { BasePromptTemplate } from "@langchain/core/prompts";

export interface PromptProvider {
  get(name: string): Promise<BasePromptTemplate>;
}
```

- **Default (always works, zero deps at runtime): `LocalPromptProvider`.** Prompts live as files in the repo (e.g. `src/prompts/*.ts` exporting `ChatPromptTemplate`s, or `.yaml`/`.txt` templates loaded and parsed). This is the source of truth for OSS/self-hosters and the fallback when LangSmith is off or unreachable.
- **Optional: `LangSmithPromptProvider`.** Selected only when `isLangSmithConfigured()`. Wraps `hub.pull("<name>:<pinned-commit-or-tag>")`, **caches** results in-process (startup preload or TTL), and **falls back to `LocalPromptProvider`** on any pull error so a LangSmith outage never breaks the app.

```ts
// src/prompts/index.ts
export const prompts: PromptProvider = isLangSmithConfigured()
  ? new CachingProvider(new LangSmithPromptProvider(new LocalPromptProvider()))
  : new LocalPromptProvider();
```

Call sites just do `await prompts.get("summarizer")` — they never know or care whether LangSmith is on.

**Dependencies.** Keep `@langchain/*` + `@langchain/langgraph` (already present). Pin **`langsmith >= 0.6.0`** (security). `langchain` (for `langchain/hub`) is needed only if you use the Hub provider — it can be a normal dep since it's inert without a key, or a lazy `import()` inside `LangSmithPromptProvider` if you want to keep it out of the default path.

**Prompt versioning workflow for maintainers.** Author/edit prompts locally (files are canonical), and optionally mirror them to the Hub via `hub.push` / `client.pushPrompt` with tags. In production, the Hub provider pulls a **pinned commit or a `production` tag**, giving redeploy-free prompt updates for teams that use LangSmith, while file-based prompts keep OSS users fully functional.

**Net effect:** tracing is invisible until an operator sets `LANGSMITH_TRACING=true` + key; prompts always resolve (local by default, Hub when configured, local fallback on failure); no LangSmith runtime dependency is forced on self-hosters; and there is no perf hit or error path when it's all off.

---

## Sources

- Trace LangGraph applications (JS/TS, env vars, auto vs manual, serverless flag) — https://docs.langchain.com/langsmith/trace-with-langgraph
- Trace LangChain applications (Python & JS/TS) — https://docs.langchain.com/langsmith/trace-with-langchain
- Trace without setting environment variables (config-based tracer) — https://docs.langchain.com/langsmith/trace-without-env-vars
- Tracing quickstart — https://docs.langchain.com/langsmith/observability-quickstart
- Manage prompts programmatically (push/pull, `includeModel`, versioning, `langchain/hub` vs `langsmith`) — https://docs.langchain.com/langsmith/manage-prompts-programmatically
- LangSmith JS SDK README (`traceable`, `wrapOpenAI`, env enablement) — https://github.com/langchain-ai/langsmith-sdk/blob/main/js/README.md
- LangSmith JS SDK `Client` reference (`pushPrompt`, `pullPromptCommit`, etc.) — https://docs.smith.langchain.com/reference/js/classes/client.Client
- Set up LangSmith API key environment variables (legacy `LANGCHAIN_*` names) — https://support.langchain.com/articles/3567245886-how-do-i-set-up-langsmith-api-key-environment-variables
- Self-hosted LangSmith (Docker/K8s, endpoint, Enterprise) — https://docs.langchain.com/langsmith/self-hosted
- Security advisory CVE-2026-45134 — LangSmith SDK public-prompt manifest deserialization (fixed in 0.6.0) — https://advisories.gitlab.com/npm/langsmith/CVE-2026-45134/
- Known TS issue: `hub.pull` with `includeModel: true` — https://github.com/langchain-ai/langsmith-sdk/issues/2169
