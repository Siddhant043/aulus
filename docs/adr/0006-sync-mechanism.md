# Sync mechanism for collection-type Sources

Sync is one `sync_source` Job per channel/playlist Source: re-enumerate via
YouTube Data API, diff `source_videos` (add + tombstone removals), fan out
`ingest_video`, succeed with partial failures summarized. Auto runs daily at
03:00 UTC in-worker; manual `POST /sources/:id/sync` is rate-limited per
Source (24h rolling, independent of auto). One active Sync per Source. Chain
`generate_skill_content` only when new ready Videos appear. Initial add uses
ingest only — Sync is for deltas.
