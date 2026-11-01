FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
COPY Chgk ./Chgk
RUN npm run build && npm prune --omit=dev

FROM node:22-bookworm-slim AS runtime
ARG SOURCE_COMMIT=unknown
LABEL org.opencontainers.image.source="https://github.com/thebarbakov/chgk" \
      org.opencontainers.image.revision=$SOURCE_COMMIT
ENV NODE_ENV=production PORT=4000
WORKDIR /app
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node package.json ./
# Both compiled upload paths resolve to the same persistent directory.
RUN mkdir -p uploads && ln -s ../uploads dist/uploads && chown node:node uploads
USER node
EXPOSE 4000
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:4000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/src/server.js"]
