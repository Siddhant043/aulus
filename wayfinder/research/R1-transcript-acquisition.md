# R1 — YouTube Transcript + Metadata Acquisition & Channel/Playlist Enumeration

_Research ticket R1 · verified against 2026 sources · stack: TypeScript/Bun in Docker_

## Summary

There is **no single tool** that does everything well. The problem splits cleanly into two sub-problems with very different answers:

1. **Metadata + channel/playlist enumeration** — solved cleanly and legally by the **official YouTube Data API v3**. It is cheap (1 quota unit per 50-item page), stable, low-legal-risk, and Bun-native (plain HTTPS/REST). Its only real weakness is that it **cannot give you transcripts** for videos you don't own.

2. **Transcript acquisition** — this is the hard, fragile part. The official API's `captions.download` is effectively useless (OAuth + you must own/edit the video). Everything else that works on arbitrary public videos is an **unofficial Innertube/timedtext scrape** (`yt-dlp`, `youtubei.js`, `youtube-transcript-api`, `youtube-transcript`). All of these hit YouTube's internal endpoints and are therefore in an ongoing arms race with YouTube's bot detection (PO tokens since 2024, aggressive **datacenter-IP blocking**). They break periodically and need to be kept updated; on cloud/datacenter IPs they increasingly need cookies, a PO-token provider, or residential proxies.

**Bottom line:** Use the **official Data API v3 for enumeration + metadata**, and a **kept-updated unofficial extractor for transcripts** — primary `yt-dlp` (json3 subs), in-process fallback `youtubei.js`, and an optional hosted-API escape hatch (Supadata/Apify) for when a self-hoster's IP gets blocked. Timestamps are reliably available (per-segment start + duration in ms) from both `yt-dlp` json3 and `youtubei.js`.

## Comparison table

| Option | Runtime fit (Bun/Docker) | Transcripts (auto + manual) | Per-segment timestamps | Channel/playlist enumeration | Metadata | Auth | Rate limit / cost | Reliability / longevity | ToS / legal risk |
|---|---|---|---|---|---|---|---|---|---|
| **YouTube Data API v3** | Native (REST over HTTPS) | ❌ `captions.download` requires OAuth + **video-owner/edit permission**; cannot fetch 3rd-party transcripts. `captions.list` only lists tracks | n/a for transcript text | ✅ `channels.list`(uploads playlist) → `playlistItems.list`; `playlists.list` | ✅ full, authoritative (`videos.list`, `channels.list`) | **API key** for public reads; OAuth only for owner ops | 10,000 units/day free (default), no $ cost. list=1u, videos/playlistItems=1u/page(50), search=100u, captions.download=200u | ★★★★★ stable, versioned, announced deprecations | ★★★★★ lowest — sanctioned path |
| **yt-dlp** (subprocess) | Good — subprocess in Docker (bundle the binary/pip). Not in-process | ✅ both, via `--write-subs --write-auto-subs --sub-format json3` | ✅ json3 events carry `tStartMs` + `dDurationMs` (auto-caps also expose word timing) | ✅ channel/playlist URLs, `--flat-playlist` | ✅ `--dump-json` (title, uploader, duration, chapters, etc.) | None (cookies/PO-token only when challenged) | Free; self-imposed throttling advised | ★★★☆☆ breaks periodically but **fastest-patched** in ecosystem; huge community | ★★☆☆☆ violates YT "automated access" ToS clause; widely used by OSS |
| **youtubei.js** (`Innertube`, LuanRT/YouTube.js) | ★ Best fit — **pure TS, runs in-process in Bun/Node**, no Python/binary | ✅ `getInfo(id).getTranscript()`; `.selectLanguage()` | ✅ transcript `initial_segments` carry start/duration (ms) | ✅ `getChannel(id).videos`; `getPlaylist(id).items` (with continuations) | ✅ `getInfo`/`getBasicInfo` | None (`generate_session_locally`); supports `po_token` param | Free; self-throttle | ★★★☆☆ actively maintained; same Innertube arms race as yt-dlp | ★★☆☆☆ same unofficial-API risk as yt-dlp |
| **youtube-transcript-api** (Python, jdepoix) | Subprocess/microservice only (not JS) | ✅ both; `find_generated_transcript` / `find_manually_created_transcript` | ✅ each snippet has `start` + `duration` | ❌ none — video-ID in only | ❌ none | None; built-in Webshare/residential-proxy support | Free (proxy costs if used) | ★★★☆☆ well maintained but **explicitly warns cloud IPs are blocked**, needs residential proxies | ★★☆☆☆ unofficial |
| **youtube-transcript** (JS npm) | In-process JS | ✅ scrapes timedtext | ✅ offset/duration per cue | ❌ | ❌ | None | Free | ★★☆☆☆ lightweight, **breaks more often**, thinner maintenance than youtubei.js | ★★☆☆☆ unofficial |
| **Hosted transcript API** (Supadata, Apify, etc.) | Native REST | ✅ + **AI fallback** (Supadata) when no captions | ✅ | ✅ (channel/playlist endpoints) | ✅ | Vendor API key | Paid: Supadata ~$1.6–5.7 / 1k transcripts; Apify ~$0.025 each | ★★★★☆ vendor absorbs blocking/proxies | ★★★☆☆ vendor assumes scraping risk; adds external dependency & $ |

## Recommendation

### Enumeration + metadata → **YouTube Data API v3 (PRIMARY)**
Use the official API for everything it's good at:
- Resolve a channel → its **uploads playlist** (`channels.list` `contentDetails.relatedPlaylists.uploads`), then page `playlistItems.list` (1 unit / 50 videos).
- Playlists directly via `playlistItems.list`; playlist/channel/video metadata via `playlists.list` / `channels.list` / `videos.list` (all 1 unit/page).
- **Avoid `search.list`** for enumeration — it costs 100 units/call and is quota-murder. Uploads-playlist paging is the correct pattern.
- One API key, 10,000 units/day free (raisable by request), no monetary cost, minimal legal risk. This is Bun-native (just `fetch`).

**Fallback if no API key / quota exhausted:** enumerate with `youtubei.js` (`getChannel().videos`, `getPlaylist().items`) or `yt-dlp --flat-playlist`.

### Transcripts → **`yt-dlp` json3 (PRIMARY)** + **`youtubei.js` (FALLBACK)**
- **PRIMARY: `yt-dlp` as a subprocess**, requesting **json3** subtitles: `yt-dlp --skip-download --write-subs --write-auto-subs --sub-langs <lang> --sub-format json3 -o - <URL>`. Rationale: broadest transcript availability (auto + uploader-provided), reliable per-segment timestamps (`tStartMs`/`dDurationMs`), and — critically — it is the **fastest-patched** project when YouTube changes its internals, with mature knobs for the bot-detection arms race (cookies, PO-token providers, client selection). In Docker, bundle a pinned `yt-dlp` and set up an update path.
- **FALLBACK: `youtubei.js` in-process.** Because the stack is TS/Bun, `youtubei.js` needs no subprocess, no Python, no external binary — `getInfo(id).getTranscript()` returns segments with timestamps and language selection. Use it as the first fallback when `yt-dlp` is unavailable or a given video fails, and as the enumeration fallback. It rides the same Innertube endpoints, so keep it updated too.
- **ESCAPE HATCH (optional, config-gated): a hosted API (Supadata or Apify).** For self-hosters whose datacenter IP gets blocked and who don't want to run residential proxies, expose an optional `TRANSCRIPT_PROVIDER=supadata` mode. The vendor absorbs the blocking/proxy problem and (Supadata) can even AI-transcribe videos with no captions. Keep this off by default to preserve the zero-dependency, self-hosted ethos.

### Why not the "obvious" choices
- **Not `captions.download`:** requires OAuth *and* edit permission on the video — it only works for your own uploads, so it's a non-starter for a RAG tool over arbitrary channels.
- **Not `youtube-transcript-api` (Python) as primary:** great library, but it's Python (subprocess/microservice overhead in a Bun app), does no enumeration, and its own docs warn that cloud IPs are blocked and residential proxies are needed. `yt-dlp` covers the same ground with a bigger maintenance safety net; `youtubei.js` covers it natively in TS.

## What the ingestion pipeline can rely on

**Guarantees (safe to build on):**
- **Per-segment timestamps exist.** Both `yt-dlp` json3 (`events[].tStartMs`, `events[].dDurationMs`, text in `segs[].utf8`) and `youtubei.js` transcript segments provide **start + duration in milliseconds** per caption cue. Model the transcript as `{ text, startMs, durationMs }[]` — do **not** assume word-level timing (auto-captions sometimes include it, uploaded captions usually don't; treat word timing as best-effort only).
- **Cue granularity ≈ a phrase / a few seconds**, not sentences. Chunking for RAG should re-segment by token/sentence windows while carrying the min/max cue timestamps of the window (so citations can deep-link with `&t=`).
- **Transcript type is knowable.** You can distinguish auto-generated vs. uploaded/manual (`youtubei.js` language list; `yt-dlp` requested vs. automatic subs). Prefer manual/uploaded when present (higher quality), fall back to auto-generated.
- **Metadata is authoritative from the Data API** (title, description, publish date, duration, channel, thumbnails). Trust the API for these over scraped values.
- **Enumeration is complete and paginated** via the uploads playlist / playlist items; handle continuation tokens / `nextPageToken`.

**Do NOT rely on (design for failure):**
- **Transcript availability is not guaranteed per video** — captions may be disabled, or absent for a target language. Pipeline must tolerate "no transcript" (skip, or route to the hosted-API AI-fallback if enabled).
- **Unofficial extractors will intermittently break.** Pin versions, add an auto-update step, wrap calls with retries + a fallback chain (`yt-dlp` → `youtubei.js` → hosted API), and surface a clear "extractor needs update" error.
- **Datacenter/cloud IPs get challenged** ("Sign in to confirm you're not a bot", PO-token-required, IP blocks). On such hosts, expect to configure cookies, a PO-token provider, or residential proxies. Document this as a known self-hosting caveat.
- **No hard SLA on rate.** Self-throttle transcript scraping (sequential or low-concurrency with backoff) to avoid tripping blocks; the Data API quota is the only formal limit and applies only to metadata/enumeration.

## Sources

- YouTube Data API — Captions: download (200 units, OAuth, edit-permission required): https://developers.google.com/youtube/v3/docs/captions/download
- YouTube Data API — Captions: list: https://developers.google.com/youtube/v3/docs/captions/list
- YouTube Data API — PlaylistItems: list (1 unit/call): https://developers.google.com/youtube/v3/docs/playlistItems/list
- YouTube Data API — Determine quota cost: https://developers.google.com/youtube/v3/determine_quota_cost
- YouTube API quota/pricing overview (2026): https://www.getphyllo.com/post/youtube-api-limits-how-to-calculate-api-usage-cost-and-fix-exceeded-api-quota
- youtube-transcript-api (jdepoix) — README, cloud-IP blocking warning + residential proxy guidance: https://github.com/jdepoix/youtube-transcript-api
- youtube-transcript-api — cloud IP blocking discussion (2026): https://github.com/jdepoix/youtube-transcript-api/issues/593
- youtubei.js (LuanRT/YouTube.js) — npm: https://www.npmjs.com/package/youtubei.js
- youtubei.js — transcript example (`getInfo().getTranscript()`, `selectLanguage()`): https://github.com/LuanRT/YouTube.js/blob/main/examples/transcript/index.ts
- youtubei.js — Playlist / Channel enumeration API docs: https://github.com/LuanRT/YouTube.js/tree/main/docs/api
- yt-dlp — json3 auto-subs with timestamps (HN thread + usage): https://news.ycombinator.com/item?id=36445823
- yt-dlp — "Sign in to confirm you're not a bot" tracking issue: https://github.com/yt-dlp/yt-dlp/issues/15865
- yt-dlp — PO token required (fix guide): https://yt-dlp.net/errors/po-token-required
- yt-dlp — subtitles cheat sheet (2026): https://techearl.com/yt-dlp-cheat-sheet
- Innertube transcript extraction (JS, Android-client context) writeup: https://medium.com/@aqib-2/extract-youtube-transcripts-using-innertube-api-2025-javascript-guide-dc417b762f49
- Hosted transcript APIs comparison + pricing (Supadata/Apify, 2026): https://supadata.ai/blog/best-youtube-transcript-api
- YouTube scraping ToS / legality discussion (2026): https://scrapfly.io/blog/posts/how-to-scrape-youtube
- Bun current release status: https://en.wikipedia.org/wiki/Bun_(software)
