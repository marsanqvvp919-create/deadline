FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json ./
RUN npm install --legacy-peer-deps

COPY . .
RUN npm run build
RUN npx esbuild server.ts --bundle --platform=node --format=esm --outfile=server.js --external:vite

FROM node:20-alpine

WORKDIR /app

COPY package.json ./
RUN npm install --legacy-peer-deps

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/server.js ./server.js

ENV NODE_ENV=production

EXPOSE 8080

CMD ["node", "server.js"]
