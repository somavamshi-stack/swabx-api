FROM node:10.24-alpine

RUN mkdir -p /app/api
RUN npm i npm@latest -g

EXPOSE 80

WORKDIR /app/api

COPY package.json .
RUN npm install --production --quiet --no-progress && npm cache clean --force
COPY . .
CMD npm start;
