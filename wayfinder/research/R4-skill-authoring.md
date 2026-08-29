# R4 — Authoritative Best Practices for Writing Agent Skills (SKILL.md)

**Ticket:** R4 (research) → feeds ticket **D3** (bundle static best-practices section into `skill-content.md`)
**Date:** 2026-08-30
**Status:** Complete
**Scope:** Half (b) of Aulus Feature 2's `skill-content.md` — the curated, static, versioned "skill-authoring best-practices" block appended after the LLM-synthesized transcript content.

---

## 1. Executive summary (findings)

- Anthropic ships an **official, canonical "Skill authoring best practices" doc** plus an **Agent Skills overview** and a **Claude Code skills** doc. These are the primary sources and they agree on the core model. The community/tooling sources (skill-creator plugin, superpowers `writing-skills`) are consistent with them and add sharper guidance on *triggering* and *testing*.
- A Skill is a directory containing a required **`SKILL.md`** (YAML frontmatter + Markdown body) plus optional bundled files (`scripts/`, `references/`, `assets/`). Only two frontmatter fields are required across all surfaces: **`name`** and **`description`**.
- **Progressive disclosure is the central design principle.** Three loading levels: (1) metadata `name`+`description` — always in context (~100 tokens/skill); (2) `SKILL.md` body — loaded only when triggered (<5k tokens / <500 lines ideal); (3) bundled resources — loaded/executed only when referenced (no context cost until read).
- **The `description` is the single most important field** — it is the only thing (besides `name`) that Claude sees at startup, and it is what Claude matches a user request against to decide whether to load the skill. It must state **what the skill does AND when to use it**, in the **third person**, with concrete trigger terms. Max 1024 chars.
- Two authoritative sources have a **subtle disagreement** on descriptions, which Aulus should reconcile explicitly (see §4): Anthropic's official doc says include *what it does + when to use*; superpowers `writing-skills` says include *only when-to-use* and warns that summarizing the **step-by-step workflow** in the description makes agents skip the body. Reconciliation: state what it does + trigger conditions, but do **not** compress the multi-step process/workflow into the description.
- Claude currently tends to **under-trigger** skills. Anthropic's skill-creator tooling recommends making descriptions slightly **"pushy"** (explicit "Use this whenever the user mentions X, Y, or Z, even if they don't say 'skill'").
- Local install (Claude Code): personal skills at **`~/.claude/skills/<skill-name>/SKILL.md`**; project skills at **`.claude/skills/<skill-name>/SKILL.md`**; the directory name becomes the `/slash-command`. Claude Code follows the **agentskills.io open standard** and adds extensions (`allowed-tools`, `disable-model-invocation`, `context: fork`, etc.).

---

## 2. Source map (which source says what)

| Source | Type | What it authoritatively covers |
|---|---|---|
| **Skill authoring best practices** (platform.claude.com) | Official Anthropic | Conciseness, degrees of freedom, description writing, progressive disclosure patterns, workflows/feedback loops, anti-patterns, checklist |
| **Agent Skills overview** (platform.claude.com) | Official Anthropic | 3-level loading model, directory structure, frontmatter field limits, name rules, security, where skills work |
| **Use Skills in Claude Code** (code.claude.com) | Official Anthropic | Local install paths, slash-command invocation, full frontmatter reference, agentskills.io standard + CC extensions |
| **skill-creator** plugin SKILL.md | Anthropic tooling | Triggering mechanism, "pushy" descriptions to fight under-triggering, eval/iterate loop, output/example patterns |
| **superpowers `writing-skills`** SKILL.md + `anthropic-best-practices.md` | Reputable community (Obra/superpowers) | Skill Discovery Optimization (SDO), description = when-to-use, keyword coverage, naming, token efficiency, TDD-for-skills, bulletproofing against rationalization |
| **agentskills.io/specification** | Open standard | Cross-runtime frontmatter field set (`name`, `description`, `license`, `compatibility`, `metadata`, `allowed-tools`) |

All URLs in §8.

---

## 3. Structure, length, and progressive disclosure

### Directory anatomy
```
skill-name/
├── SKILL.md            # REQUIRED: YAML frontmatter + Markdown body
├── reference/          # Docs loaded into context only when needed
│   ├── domain-a.md
│   └── domain-b.md
├── scripts/            # Executable code; run via bash, code never enters context
└── assets/             # Templates, icons, fonts used in output
```

### Three-level loading (progressive disclosure)
| Level | When loaded | Token cost | Content |
|---|---|---|---|
| **1 — Metadata** | Always (startup) | ~100 tokens/skill | `name` + `description` |
| **2 — Instructions** | When skill triggers | <5k tokens (<500 lines ideal) | `SKILL.md` body |
| **3 — Resources** | As referenced | None until read | Bundled files; scripts run via bash (only output costs tokens) |

### Length / structure rules (from official doc + tooling)
- Keep the `SKILL.md` **body under ~500 lines**. Approaching the limit → split into reference files.
- **Reference one level deep only.** SKILL.md → `reference/x.md` is fine; SKILL.md → a.md → b.md is bad (agents may only `head -100` nested files and miss content).
- For reference files **>100 lines, add a table of contents** at the top so partial reads still reveal scope.
- **Organize multi-domain skills by variant** (`reference/aws.md`, `reference/gcp.md`) so only the relevant file loads.
- Make **execution intent explicit**: "Run `analyze.py` ..." (execute) vs "See `analyze.py` for the algorithm" (read as reference).
- Prefer **one excellent, runnable example** over many mediocre ones; avoid multi-language duplication and fill-in-the-blank templates.

---

## 4. Frontmatter — `name`, `description`, and how the description drives triggering

### Required fields and limits (authoritative)
- **`name`**: max **64 chars**; **lowercase letters, numbers, hyphens only**; no XML tags; cannot contain reserved words "anthropic"/"claude". In Claude Code the **directory name is the invocation name** (`/skill-name`).
- **`description`**: non-empty, max **1024 chars**; no XML tags. **This is the primary triggering mechanism.**

> Note: some tooling shows `name:` omitted in Claude Code SKILL.md (the directory name is used). For portability across surfaces (claude.ai upload, Skills API), include an explicit `name`.

### How triggering actually works
At startup only each skill's `name`+`description` is injected into the system prompt (the `available_skills` list). When a request arrives, Claude matches it against those descriptions to decide whether to read the body. Therefore the description alone determines discovery. Two consequences:
1. Claude **only bothers consulting a skill for tasks it can't trivially do itself** — trivial one-step requests ("read this file") may not trigger any skill regardless of description quality.
2. Claude currently tends to **under-trigger**. Anthropic's skill-creator explicitly recommends slightly **"pushy"** descriptions.

### How to write a good description (synthesis of all sources)
- **Third person**, always. ("Extracts text from PDFs..." not "I can help you..." / "You can use this to...".) POV inconsistency causes discovery problems because the text is injected into the system prompt.
- **State BOTH what it does AND when to use it.** Official pattern: `<what it does>. Use when <concrete triggers/contexts>.`
- **Load it with concrete trigger terms**: file types (`.xlsx`, PDF), user phrasings, symptoms, error strings, tool/library names, synonyms. Agents keyword-match against these.
- **Describe the problem, not language-specific symptoms** unless the skill is technology-specific (then name the technology explicitly).
- **Be "pushy" to fight under-triggering**: e.g. add "Use this whenever the user mentions dashboards, metrics, or wants to display company data, even if they don't explicitly ask for a 'dashboard.'"
- **Do NOT compress the skill's step-by-step workflow into the description.** (superpowers finding: a description that summarized a 2-step review process caused agents to do 1 step and skip the body. Describing *what* + *when* is fine; summarizing the *process* is the trap.)

**Reconciliation for Aulus:** Include *what the skill does* + *explicit trigger conditions/keywords* in the description. Exclude the numbered procedure/workflow — that belongs in the body. This satisfies both the official doc and the superpowers finding.

### Good vs bad descriptions (official examples)
```yaml
# GOOD
description: Extract text and tables from PDF files, fill forms, merge documents. Use when working with PDF files or when the user mentions PDFs, forms, or document extraction.
description: Analyze Excel spreadsheets, create pivot tables, generate charts. Use when analyzing Excel files, spreadsheets, tabular data, or .xlsx files.

# BAD (vague, no triggers)
description: Helps with documents
description: Processes data
# BAD (first person)
description: I can help you process Excel files
```

### Naming conventions
- Anthropic official recommends **gerund form** ("Processing PDFs", "Analyzing spreadsheets"). Acceptable: noun phrases ("PDF Processing") or action-oriented ("Process PDFs").
- superpowers prefers **verb-first / active** slugs (`creating-skills` > `skill-creation`, `condition-based-waiting` > `async-test-helpers`).
- Avoid vague names: "Helper", "Utils", "Tools", "Data", "Files".

### Claude Code frontmatter extensions (optional, beyond the standard)
These are Claude Code-specific and **not** part of the portable agentskills.io standard; use only when authoring specifically for Claude Code:
- `allowed-tools` — pre-approve tools for the invoking turn (space/comma-separated or YAML list).
- `disable-model-invocation: true` — only the user can invoke via `/name`; Claude won't auto-trigger (use for side-effecting workflows: deploy, commit, send-message).
- `disallowed-tools`, `model`, `context: fork` (+ `agent`, `background`), `argument-hint` — advanced routing/execution controls.
- Portable standard fields recognized on upload/API/packaging: `name`, `description`, `license`, `compatibility`, `metadata`, `allowed-tools`.

---

## 5. Degrees of freedom, workflows, and content guidelines

### Set appropriate degrees of freedom (official)
Match specificity to the task's fragility:
- **High freedom** (prose steps) — many valid approaches, context-dependent decisions (e.g. code review).
- **Medium freedom** (parameterized pseudocode/scripts) — a preferred pattern with some variation.
- **Low freedom** (exact scripts, "run exactly this, don't add flags") — fragile, error-prone, consistency-critical ops (e.g. DB migrations).
- Analogy: narrow bridge over cliffs → exact guardrails; open field → general direction, trust the agent.

### Conciseness (official)
- "The context window is a public good." Assume the agent is **already smart**; add only what it doesn't already know. Challenge every paragraph: "Does this justify its token cost?" Don't explain what a PDF is.

### Workflows & feedback loops (official)
- Break complex tasks into clear numbered steps; for long ones, give a **copyable checklist** the agent ticks off.
- Build **validation loops**: run validator → fix → repeat ("only proceed when validation passes"). Works with scripts *or* with a reference doc as the "validator".
- For high-stakes/batch ops use **plan → validate → execute**: emit a structured plan file, validate it with a script, then apply.

### Content guidelines (official)
- **No time-sensitive info** ("before August 2025..."); put deprecated material in a collapsed "Old patterns" section.
- **Consistent terminology** — pick one term ("field", "extract", "API endpoint") and stick to it.
- **Forward slashes** in all paths, even on Windows.
- **Don't offer many options** — give one default with an escape hatch ("Use pdfplumber; for scanned PDFs use pdf2image + pytesseract").
- **Don't assume packages are installed** — state install commands / list dependencies.
- Scripts should **solve, not punt** (handle errors explicitly); no "voodoo constants" (justify every magic number). Use **fully-qualified MCP tool names** (`ServerName:tool_name`).

### Do's and Don'ts (condensed)
**Do:** concise body; rich third-person description with triggers; progressive disclosure; one great example; consistent terms; checklists + validation loops; test with the models you'll use; build evals first.
**Don't:** narrate a one-off story ("in session 2025-10-03 we..."); dump multi-language examples; nest references deep; put time-sensitive facts inline; over-explain to a smart model; bury workflow detail in the description; use vague names/descriptions.

---

## 6. Testing, evaluation, and installation

### Evaluation-driven development (official)
Build evals **before** writing extensive docs: (1) run agent on real tasks **without** the skill, document failures; (2) create ~3 scenarios targeting those gaps; (3) baseline; (4) write minimal instructions to pass; (5) iterate. Test with **Haiku, Sonnet, and Opus** — Haiku needs more guidance, Opus needs less over-explaining.

### TDD-for-skills (superpowers) — optional but rigorous
"No skill without a failing test first." Run a pressure scenario **without** the skill (RED / baseline), write the skill to fix the observed rationalizations (GREEN), then close loopholes (REFACTOR). For discipline-enforcing skills, add a rationalization table + red-flags list; for output-shaping problems, prefer a positive recipe over prohibitions.

### Local installation (Claude Code)
| Location | Path | Applies to |
|---|---|---|
| Personal | `~/.claude/skills/<skill-name>/SKILL.md` | All your projects |
| Project | `.claude/skills/<skill-name>/SKILL.md` | This project only |
| Plugin | `<plugin>/skills/<skill-name>/SKILL.md` | Where plugin enabled |
| Enterprise | via managed settings | Whole org |

- Steps: `mkdir -p ~/.claude/skills/<name>` → create `SKILL.md` → invoke automatically (matching request) or directly via `/<name>`.
- Conflict resolution: enterprise > personal > project; a same-named skill overrides a bundled skill (not its aliases); plugin skills are namespaced `plugin-name:skill-name`.
- **Live change detection**: edits under watched `.claude/skills/` are picked up mid-session; creating a brand-new top-level skills dir needs a restart.
- Other surfaces: claude.ai uploads skills as zip via Settings (per-user); Claude API uploads via `/v1/skills` (workspace-wide); these **don't sync** across surfaces.

### Security (official)
Use skills only from trusted sources; audit all bundled files (scripts, external URL fetches) before running. A malicious skill can drive tools/code beyond its stated purpose.

---

## 7. DRAFT — reusable best-practices template text for `skill-content.md` (D3 will consume this)

> The block below is the concrete deliverable. It is **static, versioned, and appended verbatim** by Aulus into every `skill-content.md`, after the LLM-synthesized transcript half. It is written to be read by the coding agent that the user tells "create a skill based on this." Keep the version stamp; bump it when guidance changes. Sourced from Anthropic's official Skill authoring best practices, the Agent Skills overview, the Claude Code skills docs, Anthropic's skill-creator tooling, and the superpowers `writing-skills` guidance (see Aulus R4 for citations).

```markdown
<!-- AULUS SKILL-AUTHORING BEST PRACTICES — v0.1 (static, curated) -->
---
## How to turn the material above into a well-formed Agent Skill

You (the coding agent) are being asked to create a Claude **Agent Skill** from the
content above. Follow the conventions below — they are Anthropic's official guidance
plus established community practice, distilled. When in doubt, favor concise and
concrete over exhaustive.

### 1. What a skill is
A skill is a directory containing a required `SKILL.md` (YAML frontmatter + Markdown
body) and optional bundled files. It extends the agent with a reusable capability that
loads only when relevant.

```
skill-name/
├── SKILL.md            # required: frontmatter + body
├── reference/          # optional: docs read only when needed
├── scripts/            # optional: executable helpers (run, not read into context)
└── assets/             # optional: templates/fonts/icons used in output
```

### 2. Frontmatter (this is what makes the skill discoverable)
Two fields are required:

- `name`: lowercase letters, numbers, hyphens only; ≤ 64 chars; no "claude"/"anthropic".
  In Claude Code the directory name is also the `/slash-command`. Prefer gerund or
  verb-first names (`processing-pdfs`, `analyzing-transcripts`) over vague ones
  (`helper`, `utils`).
- `description`: ≤ 1024 chars, written in the **third person**. This single line is the
  primary trigger: at startup the agent sees only `name` + `description` and uses it to
  decide whether to load the skill. Therefore:
  - State **what the skill does AND when to use it**: `<capability>. Use when <triggers>.`
  - Pack in **concrete trigger terms**: file types, user phrasings, tools, synonyms,
    symptoms — the words a user would actually say.
  - Be slightly **pushy** to avoid under-triggering: e.g. "...Use whenever the user
    mentions X, Y, or Z, even if they don't explicitly ask for it."
  - Do **not** summarize the step-by-step workflow in the description — that makes the
    agent follow the one-liner and skip the body. Keep the procedure in the body.

```yaml
---
name: your-skill-name
description: <One line: what it does>. Use when <concrete triggers, file types, phrasings, and synonyms>.
---
```

Avoid: `description: Helps with documents` (vague); `description: I can help you...` (first person).

### 3. Body structure and length
Keep the `SKILL.md` body **under ~500 lines**. Suggested skeleton:

```markdown
# Skill Name

## Overview
One or two sentences: the core capability and its guiding principle.

## When to use
Bullet list of concrete symptoms/situations. Note when NOT to use it.

## Instructions
Numbered, imperative steps. Match specificity to risk:
- many valid approaches → give general direction (high freedom)
- fragile/consistency-critical → give exact commands ("run exactly this")

## Examples
One excellent, runnable input→output example beats several mediocre ones.

## Common mistakes
What goes wrong and how to avoid it.
```

### 4. Progressive disclosure (keep context lean)
Move heavy material out of `SKILL.md` into sibling files and reference them **one level
deep** (link them directly from `SKILL.md`, never file→file→file). Give reference files
> 100 lines a table of contents. Organize multi-topic skills by variant
(`reference/topic-a.md`, `reference/topic-b.md`) so only the relevant file loads. Make
intent explicit: "Run `x.py` ..." (execute) vs "See `x.py` for the algorithm" (read).

### 5. Writing style — do's and don'ts
- Assume the agent is already smart; add only what it doesn't know. Cut any sentence
  that doesn't earn its tokens.
- Use consistent terminology; pick one term and stick to it.
- Use forward slashes in all paths.
- Give one default approach with an escape hatch, not a menu of options.
- No time-sensitive statements ("after August 2025..."); put deprecated notes in a
  collapsed "Old patterns" section.
- Don't narrate a one-off story; write reusable, general guidance.
- Provide checklists for multi-step tasks and validation loops (validate → fix → repeat)
  where output quality matters.

### 6. Verify before shipping
- Description clearly states what + when, in third person, with real trigger terms.
- Body is < 500 lines; extra detail is in one-level-deep reference files.
- At least one concrete example; consistent terminology; no time-sensitive info.
- Test the skill on 2–3 realistic requests (ideally with the models you'll run it on)
  and confirm it both triggers and produces the intended result.

### 7. Install it locally (Claude Code)
- Personal (all projects):  `~/.claude/skills/<skill-name>/SKILL.md`
- Project (this repo only):  `.claude/skills/<skill-name>/SKILL.md`

```bash
mkdir -p ~/.claude/skills/<skill-name>
# save SKILL.md into that directory
```

Then invoke it by describing a matching task, or directly with `/<skill-name>`.
Edits to an existing skills directory are picked up live; a brand-new top-level skills
directory needs a Claude Code restart.
<!-- END AULUS SKILL-AUTHORING BEST PRACTICES — v0.1 -->
```

### Notes for D3 (implementer)
- The block is intentionally **self-contained and imperative**, addressed to the coding agent, since the user pastes `skill-content.md` and says "create a skill based on this."
- **Version stamp** (`v0.1`) is embedded top and bottom so a generated skill can be traced to a template revision. Bump on any guidance change.
- Keep it static (do not LLM-generate it per run) so every Aulus output carries identical, vetted guidance.
- ~110 lines — comfortably within the sub-500-line budget even after the synthesized half is prepended.
- If D3 wants to trim for token budget, the safe cut order is: §5 examples first, then §6, never §2 (frontmatter/description) which is the highest-leverage content.

---

## 8. Sources (with URLs)

Official Anthropic (primary):
- Skill authoring best practices — https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices
- Agent Skills overview (loading model, frontmatter limits, structure, security) — https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview
- Use Skills in Claude Code (install paths, slash commands, frontmatter reference) — https://code.claude.com/docs/en/skills
- Agent Skills quickstart — https://platform.claude.com/docs/en/agents-and-tools/agent-skills/quickstart
- Using Agent Skills with the API — https://platform.claude.com/docs/en/build-with-claude/skills-guide
- Engineering blog: Equipping agents for the real world with Agent Skills — https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills
- Anthropic open-source skills repository — https://github.com/anthropics/skills

Anthropic tooling (installed locally, inspected directly):
- skill-creator plugin — `~/.claude/plugins/marketplaces/claude-plugins-official/plugins/skill-creator/skills/skill-creator/SKILL.md` (triggering, "pushy" descriptions, eval loop)

Reputable community / open standard:
- superpowers `writing-skills` skill — `~/.claude/plugins/cache/claude-plugins-official/superpowers/6.3.0/skills/writing-skills/SKILL.md` and its bundled `anthropic-best-practices.md` (SDO, description=when-to-use, keyword coverage, TDD-for-skills, bulletproofing)
- Agent Skills open standard / frontmatter spec — https://agentskills.io/specification

---

## 9. Open questions / flags for the team
- **Description doctrine conflict** (§4): resolved here as "what + when, not the workflow." If Aulus later observes generated skills over-triggering or under-triggering, this line is the knob to tune, and it should be A/B tested per skill-creator's description-optimization loop.
- The template assumes **Claude Code** as the primary install target (matches the "hand to a coding agent" use case). If Aulus wants surface-portability (claude.ai upload / Skills API), the generated skill should include an explicit `name:` field and avoid Claude Code-only frontmatter extensions (`context: fork`, `disable-model-invocation`, etc.). The template already avoids those.
```
