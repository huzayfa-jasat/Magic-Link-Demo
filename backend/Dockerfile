FROM node:18-alpine as base

WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .

FROM base as dev
ENV NODE_ENV=development
CMD ["npm", "run", "dev"]

FROM base as prod
ENV NODE_ENV=production
CMD ["npm", "start"]
