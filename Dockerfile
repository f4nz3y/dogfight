FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
COPY client/package.json client/package.json
COPY server/package.json server/package.json
COPY shared/package.json shared/package.json
RUN npm ci
COPY . .
ARG VERSION=dev
ENV VITE_APP_VERSION=$VERSION
RUN npm run build

FROM node:22-alpine
ARG VERSION=dev
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3001 VERSION=$VERSION
WORKDIR /app
COPY --from=build /app/package*.json ./
COPY --from=build /app/client/package.json client/package.json
COPY --from=build /app/server/package.json server/package.json
COPY --from=build /app/shared/package.json shared/package.json
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/client/dist client/dist
COPY --from=build /app/server/src server/src
COPY --from=build /app/shared/src shared/src
RUN mkdir -p /app/server/logs && chown -R node:node /app/server/logs
USER node
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s CMD node -e "fetch('http://127.0.0.1:3001/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "--experimental-strip-types", "server/src/index.ts"]
