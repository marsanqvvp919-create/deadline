FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --legacy-peer-deps

COPY . .

RUN npm run build

EXPOSE 8080
ENV PORT=8080
ENV NODE_ENV=production
ENV TZ=Asia/Tokyo

CMD ["node", "server.js"]
