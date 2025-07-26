FROM node:21-alpine AS base

WORKDIR /src
COPY package*.json ./
ARG API_V1_PORT
ENV PORT=${API_V1_PORT}
EXPOSE ${API_V1_PORT}

FROM base AS production
ENV NODE_ENV=production
RUN npm ci
COPY ./ ./
CMD node app

FROM base AS dev
ENV NODE_ENV=development
RUN npm install -g nodemon && npm install
COPY ./ ./
CMD nodemon app

FROM base AS demo
ENV NODE_ENV=development
ENV DEMO_STATUS=demo
RUN npm install -g nodemon && npm install
COPY ./ ./
CMD nodemon app
