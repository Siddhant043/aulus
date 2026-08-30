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
