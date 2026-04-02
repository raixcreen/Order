# 部署資訊

## 主機

| 項目 | 值 |
|------|-----|
| 雲端 | AWS EC2 (ap-east-2) |
| IP | `54.54.0.33` |
| 主機名稱 | `ip-172-31-6-205` |
| OS | Ubuntu |
| SSH User | `ubuntu` |
| SSH Key | `~/.ssh/rai-connect-key.pem` |

### SSH 連線

```bash
ssh -i ~/.ssh/rai-connect-key.pem ubuntu@54.54.0.33
```

## DNS (Cloudflare)

| 項目 | 值 |
|------|-----|
| 域名 | `order.intemotech.com` |
| 類型 | A Record |
| 指向 | `54.54.0.33` |
| Proxy | 開啟 (橘色雲) |
| Zone | `intemotech.com` |
| Zone ID | `c8a31d002c85a5a528c4169973929490` |
| Account ID | `ed55dc446113891dee896596886735dd` |
| DNS Record ID | `95432e06745e791a3145dde257aa137e` |

Cloudflare API Token 來自 cloudflared cert：`~/.cloudflared/cert.pem`

## EC2 上的檔案位置

| 項目 | 路徑 |
|------|------|
| 專案程式碼 | `/home/ubuntu/order-app/` |
| Nginx 設定 | `/home/ubuntu/RAIConnectServer/deploy/nginx/nginx.conf` |
| Nginx Docker Compose | `/home/ubuntu/RAIConnectServer/deploy/docker-compose.yml` |
| SSL 憑證 | `/home/ubuntu/RAIConnectServer/deploy/ssl-order/` |

## 架構

```
使用者 → Cloudflare (SSL/Proxy) → EC2 rai-nginx (:80/:443) → order-app (:3000)
```

- `rai-nginx` 容器監聽 80/443，反向代理 `order.intemotech.com` 到 `172.17.0.1:3000`
- `order-app` 容器監聽 3000，掛載 Docker volume `order-app_order-data` 存放 SQLite 資料庫
- SSL：Cloudflare 前端使用 wildcard `*.intemotech.com`，origin 使用自簽憑證

## 部署更新步驟

### 1. 本地推送程式碼

```bash
git add . && git commit -m "描述" && git push origin master
```

### 2. SSH 到 EC2 拉取並重建

```bash
ssh -i ~/.ssh/rai-connect-key.pem ubuntu@54.54.0.33

cd ~/order-app
git pull
docker compose up -d --build
```

### 一行快速部署（從本地執行）

```bash
ssh -i ~/.ssh/rai-connect-key.pem ubuntu@54.54.0.33 "cd ~/order-app && git pull && docker compose up -d --build"
```

### 如需重建資料庫（清除所有資料）

```bash
ssh -i ~/.ssh/rai-connect-key.pem ubuntu@54.54.0.33 "cd ~/order-app && docker compose down && docker volume rm order-app_order-data && docker compose up -d --build"
```

## Nginx 設定摘要

`order.intemotech.com` 在 nginx.conf 中的 server block：

```nginx
# HTTP
server {
    listen 80;
    server_name order.intemotech.com;
    client_max_body_size 10M;

    location / {
        proxy_pass http://172.17.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

# HTTPS
server {
    listen 443 ssl;
    server_name order.intemotech.com;
    ssl_certificate /etc/letsencrypt/live/order.intemotech.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/order.intemotech.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    client_max_body_size 10M;

    location / {
        proxy_pass http://172.17.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

如需修改 nginx 設定後重新載入：

```bash
ssh -i ~/.ssh/rai-connect-key.pem ubuntu@54.54.0.33 "docker exec rai-nginx nginx -s reload"
```

## 查看日誌

```bash
# 應用程式日誌
ssh -i ~/.ssh/rai-connect-key.pem ubuntu@54.54.0.33 "docker logs order-app --tail 50"

# Nginx 日誌
ssh -i ~/.ssh/rai-connect-key.pem ubuntu@54.54.0.33 "docker logs rai-nginx --tail 50"
```
