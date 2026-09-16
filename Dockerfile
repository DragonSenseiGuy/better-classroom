FROM oven/bun:1.4 AS build
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY . .
RUN bun run build

FROM oven/bun:1.4-slim
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV DATABASE_PATH=/app/data/classroom.sqlite
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/build ./build
COPY --from=build /app/src ./src
COPY --from=build /app/scripts/auth-migrate.ts ./scripts/auth-migrate.ts
RUN mkdir -p /app/data
EXPOSE 3000
CMD ["sh", "-c", "bun scripts/auth-migrate.ts && bun build/index.js"]
