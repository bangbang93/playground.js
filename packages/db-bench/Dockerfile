FROM node:22-slim

WORKDIR /app

COPY package.json package-lock.json ./
COPY tsconfig.base.json tsconfig.json tsconfig.build.json ./
COPY eslint.config.mjs .prettierrc.json .prettierignore ./

COPY packages/core/package.json packages/core/
COPY packages/core/src packages/core/src
COPY packages/core/tsconfig.json packages/core/
COPY packages/db-bench/package.json packages/db-bench/
COPY packages/db-bench/src packages/db-bench/src
COPY packages/db-bench/tsconfig.json packages/db-bench/

RUN npm ci && npm run build

WORKDIR /app/packages/db-bench

ENTRYPOINT ["node", "--enable-source-maps", "dist/cli.js"]
