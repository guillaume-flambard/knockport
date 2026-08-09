# knockport. Une seule image: Next.js pour le HTTP, ws pour la session
# terminal, et plus tard ssh2 sur le port 22 dans le meme processus.
FROM node:26-slim AS base
ENV PNPM_HOME=/pnpm PATH=$PNPM_HOME:$PATH
RUN npm i -g pnpm@10.14.0
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/
COPY packages/core/package.json packages/core/
COPY packages/terminal/package.json packages/terminal/
RUN pnpm install --frozen-lockfile

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/web/node_modules ./apps/web/node_modules
COPY --from=deps /app/packages ./packages
COPY . .
RUN pnpm build:terminal && pnpm --filter @knockport/web build

FROM base AS runtime
ENV NODE_ENV=production
# Le volume Fly est monte ici. La base ne doit jamais vivre dans l'image:
# un deploiement la remplacerait, et les preuves des candidats avec.
ENV KNOCKPORT_DB=/data/knockport.db
ENV PORT=8080
ENV HOSTNAME=0.0.0.0

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps ./apps
COPY --from=build /app/packages ./packages
COPY --from=build /app/package.json ./package.json

EXPOSE 8080
WORKDIR /app/apps/web
CMD ["node", "server.ts"]
