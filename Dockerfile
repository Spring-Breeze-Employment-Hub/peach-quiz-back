# Base image
FROM node:20.11-alpine

# Docker 컨테이너 내에서 작업 디렉토리를 /usr/src/app으로 설정
WORKDIR /usr/src/app

# 호스트 시스템의 package.json 파일을 컨테이너의 현재 작업 디렉토리(/usr/src/app)로 복사합니다.
COPY package*.json .

# Install app dependencies
RUN npm install

# Bundle app source
COPY . .

# Creates a "dist" folder with the production build
RUN npm run build

# Start the server using the production build
CMD [ "node", "dist/main.js" ]