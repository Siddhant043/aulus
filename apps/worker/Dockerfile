FROM oven/bun:1.3 AS deps
WORKDIR /app
COPY package.json bun.lock turbo.json ./
COPY apps ./apps
COPY packages ./packages
RUN bun install --frozen-lockfile

FROM oven/bun:1.3 AS runner
WORKDIR /app
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl ffmpeg python3 \
  && curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp \
    -o /usr/local/bin/yt-dlp \
  && chmod a+rx /usr/local/bin/yt-dlp \
  && rm -rf /var/lib/apt/lists/*
COPY --from=deps /app /app
ENV NODE_ENV=production
CMD ["bun", "run", "apps/worker/src/index.ts"]
