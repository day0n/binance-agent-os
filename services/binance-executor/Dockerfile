FROM node:24-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
COPY packages/executor-contracts /app/packages/executor-contracts
COPY services/binance-executor /app/services/binance-executor
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json /app/
RUN corepack enable && pnpm install --frozen-lockfile --filter binance-executor...
WORKDIR /app/services/binance-executor
EXPOSE 8080
CMD ["pnpm", "start"]
