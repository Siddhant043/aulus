FROM oven/bun:1.3
WORKDIR /app
COPY package.json bun.lock turbo.json ./
COPY apps ./apps
COPY packages ./packages
RUN bun install --frozen-lockfile
WORKDIR /app/packages/db
CMD ["bun", "run", "db:migrate"]
