# First-class shared Video with reachability GC

Sources are what the user adds; Videos are the RAG corpus. A YouTube video is
stored once (`videos.youtube_video_id` unique), shared across Sources via
`source_videos`, and owns Transcript + Chunks. Deleting a Source drops
membership rows and garbage-collects only Videos that no remaining Source
references — so Collection/Source scoping never duplicates embeddings and never
nukes corpus still in use elsewhere.
