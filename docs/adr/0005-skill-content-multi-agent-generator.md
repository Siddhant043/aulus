# Skill-content multi-agent generator

skill-content.md is produced by a LangGraph roster — plan (≤5 topics) → retrieve
(D2 subgraph per topic) → synthesize → assemble (resolve Chunk-id Citations +
append static R4 v0.1 Best-practices template) → critic (structured checklist,
one revise max). Input is Scope plus optional focus prompt; default is Scope-only
zero-config. Generation runs as an async `generate_skill_content` worker Job;
Scopes with zero ready Videos are rejected. Output is Skill content for a future
SKILL.md, not a finished SKILL.md.
