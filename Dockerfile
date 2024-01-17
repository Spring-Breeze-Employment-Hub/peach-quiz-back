FROM node:20-alpine AS builder
# Docker 컨테이너 내에서 작업 디렉토리를 /usr/src/app으로 설정
WORKDIR /usr/src/app  
# 호스트 시스템의 package.json 파일을 컨테이너의 현재 작업 디렉토리(/usr/src/app)로 복사합니다.
COPY package.json .
# 종속성들을 설치
RUN npm install
# 호스트의 현재 디렉토리에 있는 모든 파일과 폴더를 컨테이너의 작업 디렉토리로 복사
COPY . .
# 이전 빌드에서 생성된 dist 디렉토리(빌드된 파일들이 저장되는 곳)를 삭제
RUN rm -rf dist
#  빌드
RUN npm run build

# 두 번째 단계를 시작, 최종 이미지를 생성하는 데 사용
FROM node:20-alpine
# 두 번째 단계의 작업 디렉토리를 설정
WORKDIR /usr/src/app
# "builder" 단계에서 생성된 dist 디렉토리를 최종 이미지의 작업 디렉토리로 복사
COPY --from=builder /usr/src/app/dist ./
# 컨테이너가 시작될 때 실행될 기본 명령
CMD ["npm", "run", "start:prod"]

# docker run -p 3000:3000 myapp