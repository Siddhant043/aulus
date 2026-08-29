# Append-only versioned skill-content per Scope

Each skill-content.md generation inserts a new `skill_content_artifacts` row
keyed by Scope + monotonic `version`, never overwriting prior markdown. Sync
appends a version only when it ingested new Videos; manual regenerate always
can. Users browse/download any historical version; retention is forever in v1
(markdown is cheap for single-user self-host).
