# Playwright公式イメージをベースに使うと Chromium / 依存ライブラリが揃っている
FROM mcr.microsoft.com/playwright:v1.49.0-jammy

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# config.yaml と .env はコンテナ実行時に bind mount で渡す前提
# (リポジトリに含めない)
CMD ["npm", "run", "check"]
