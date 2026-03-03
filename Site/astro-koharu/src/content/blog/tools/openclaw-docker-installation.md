---
title: OpenClaw Docker 安装与配置指南
link: openclaw-docker-installation
catalog: true
date: 2026-03-03 12:00:00
description: 详解 OpenClaw 在 TrueNAS SCALE 上的 Docker 部署、配置和 Traefik 集成，包含完整的工作流程和故障排查
tags:
  - Docker
  - OpenClaw
  - TrueNAS
  - Traefik
  - AI Gateway
categories:
  - 工具
---

OpenClaw 是一个强大的 AI Agent 网关工具，支持多渠道消息接入（WhatsApp、Telegram、Discord 等）。本文将详细介绍如何在 TrueNAS SCALE 上通过 Docker Compose 部署 OpenClaw，并集成 Traefik 反向代理。

## OpenClaw 简介

OpenClaw 是一个现代化的 AI Agent Gateway，主要特性：

- **多渠道支持**：WhatsApp、Telegram、Discord 等
- **容器化部署**：支持 Docker/Docker Compose
- **Web UI 管理**：提供直观的 Web 界面
- **RESTful API**：完整的 API 接口
- **Agent Sandboxing**：支持沙箱隔离
- **Token 认证**：安全的身份验证机制

## 前置要求

### 系统要求

- Docker Engine 20.10+
- Docker Compose v2
- 至少 2GB RAM
- 足够的磁盘空间（用于镜像、日志和工作空间）

### TrueNAS SCALE 要求

- TrueNAS SCALE 24.04+
- 已安装 DockHand 应用（可选，用于 UI 管理）
- 已创建 ZFS 数据集用于存储

## 快速部署

### 1. 创建项目目录

在 TrueNAS Shell 中执行：

```bash
mkdir -p /mnt/App/Dockers/openclaw/config
mkdir -p /mnt/App/Dockers/openclaw/workspace
```

### 2. 创建 docker-compose.yaml

```yaml
version: "3.8"

services:
  # OpenClaw Gateway - 主服务
  openclaw-gateway:
    image: ghcr.io/openclaw/openclaw:2026.2.26
    container_name: openclaw-gateway
    restart: unless-stopped

    environment:
      # 基础环境变量
      HOME: /home/node
      TERM: xterm-256color

      # Gateway 认证 Token
      OPENCLAW_GATEWAY_TOKEN: "your-token-here"

      # Gateway 绑定模式（lan=局域网访问，loopback=仅本机）
      OPENCLAW_GATEWAY_BIND: lan

      # Control UI 允许的访问源（lan 模式下必须设置）
      OPENCLAW_CONTROL_UI_ALLOWED_ORIGINS: "http://localhost:18789,http://127.0.0.1:18789"

    # 端口映射
    ports:
      - "18789:18789"  # Gateway HTTP 端口
      - "18790:18790"  # Bridge 端口

    # 数据卷挂载
    volumes:
      - ./config:/home/node/.openclaw
      - ./workspace:/home/node/.openclaw/workspace

    # 健康检查
    healthcheck:
      test: ["CMD", "node", "-e", "require('node:http').fetch('http://127.0.0.1:18789/healthz').then(r=>{if(!r.ok)throw new Error('healthz failed')}).catch(e=>{console.error(e);process.exit(1)})"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 20s

    networks:
      - openclaw-network

  # OpenClaw CLI - 管理工具
  openclaw-cli:
    image: ghcr.io/openclaw/openclaw:2026.2.26
    container_name: openclaw-cli
    restart: "no"

    environment:
      HOME: /home/node
      TERM: xterm-256color
      OPENCLAW_GATEWAY_TOKEN: ""
      BROWSER: echo  # 禁用浏览器自动打开

    volumes:
      - ./config:/home/node/.openclaw
      - ./workspace:/home/node/.openclaw/workspace

    # 共享 Gateway 的网络命名空间
    network_mode: "service:openclaw-gateway"

    depends_on:
      - openclaw-gateway

    entrypoint: ["node", "dist/index.js"]

networks:
  openclaw-network:
    driver: bridge
```

### 3. 启动服务

```bash
# 进入项目目录
cd /mnt/App/Dockers/openclaw

# 启动服务
docker compose up -d

# 查看日志，确认服务正常启动
docker compose logs -f openclaw-gateway
```

### 4. 初次配置（Onboarding 向导）

**首次部署时，必须运行交互式 onboarding 向导来初始化配置：**

```bash
# 确保在项目目录下
cd /mnt/App/Dockers/openclaw

# 运行 onboarding 向导
docker compose run --rm openclaw-cli onboard --mode local --no-install-daemon
```

**向导会询问以下配置项（建议选择）：**

```
? Gateway bind mode:
  ● lan (推荐 - 允许局域网访问)
  ○ loopback (仅本机访问)

? Gateway auth mode:
  ● token (推荐 - 使用 token 认证)
  ○ password (使用密码认证)

? Gateway token:
  [留空自动生成，或输入自定义 token]
  注：docker-compose.yaml 中已预设为 "your-token-here"

? Install daemon:
  ○ No (推荐 - Docker Compose 管理)
  ● Yes

? Tailscale exposure:
  ○ Off (推荐)
```

**重要提示：**
- 如果在 `docker-compose.yaml` 中已预设环境变量（`OPENCLAW_GATEWAY_TOKEN`、`OPENCLAW_GATEWAY_BIND`），向导会使用这些值作为默认选项
- Onboarding 完成后，配置会保存到 `./config/config.json`
- 非 Rootless Docker 部署时，选择 `no-install-daemon`

### 5. 验证配置并访问 Web UI

```bash
# 检查服务状态
docker compose ps

# 查看配置（可选）
docker compose run --rm openclaw-cli config list

# 测试健康状态
docker compose run --rm openclaw-cli health --token "your-token"
```

**打开浏览器访问：**
- 本地访问：`http://your-server-ip:18789`
- 使用配置的 Token 登录（如果 onboarding 中自动生成了新 token，查看日志或配置文件获取）

## 配置详解

### 核心配置项

#### 1. 环境变量

| 变量名 | 说明 | 必填 | 默认值 |
|--------|------|------|--------|
| `OPENCLAW_GATEWAY_TOKEN` | 认证 Token | 是 | 自动生成 |
| `OPENCLAW_GATEWAY_BIND` | 绑定模式 | 否 | `lan` |
| `OPENCLAW_CONTROL_UI_ALLOWED_ORIGINS` | 允许的访问源 | lan 模式必填 | - |

**绑定模式说明：**
- `lan` - 允许局域网访问（需要设置 `ALLOWED_ORIGINS`）
- `loopback` - 仅允许本机访问
- `tailnet` - Tailscale 网络访问

#### 3. 数据卷

```yaml
volumes:
  - ./config:/home/node/.openclaw                # 配置文件
  - ./workspace:/home/node/.openclaw/workspace   # 工作空间
```

**重要**：OpenClaw 容器以 `node` 用户（UID 1000）运行，确保挂载目录的权限正确。

#### 4. 网络配置

```yaml
networks:
  openclaw-network:
    driver: bridge

services:
  openclaw-gateway:
    networks:
      - openclaw-network

  openclaw-cli:
    network_mode: "service:openclaw-gateway"  # 共享 Gateway 网络
```

**CLI 网络模式说明：**
- CLI 容器使用 `network_mode: "service:openclaw-gateway"`
- 这样 CLI 可以通过 `127.0.0.1` 访问 Gateway
- 无需暴露额外的端口

## TrueNAS SCALE 部署

### 目录结构

```
/mnt/App/Dockers/
└── openclaw/
    ├── docker-compose.yaml    # Compose 配置文件
    ├── config/                # OpenClaw 配置目录
    │   └── config.json       # 配置文件（自动生成）
    └── workspace/             # 工作空间（Agent 会话等）
```

### 权限配置

OpenClaw 容器以 `node` 用户（UID 1000）运行，需要设置正确的权限：

```bash
# 设置目录所有者
sudo chown -R 1000:1000 /mnt/App/Dockers/openclaw/config
sudo chown -R 1000:1000 /mnt/App/Dockers/openclaw/workspace

# 如果需要让其他用户访问，使用 ACL
sudo setfacl -R -m u:568:rwx /mnt/App/Dockers/openclaw/config
sudo setfacl -R -m u:568:rwx /mnt/App/Dockers/openclaw/workspace
```

### 通过 DockHand 部署（推荐）

1. **打开 DockHand**
   - Apps → DockHand → Stacks

2. **创建新 Stack**
   - 名称：`openclaw`
   - 粘贴 docker-compose.yaml 内容
   - 点击 "Deploy"

3. **管理服务**
   - 通过 DockHand UI 启动/停止/重启服务
   - 查看日志和状态

## Traefik 集成

### 配置 Traefik Labels

在 `openclaw-gateway` 服务中添加 Traefik 标签：

```yaml
services:
  openclaw-gateway:
    # ... 其他配置

    labels:
      # 启用 Traefik
      - "traefik.enable=true"

      # 路由配置
      - "traefik.http.routers.openclaw.rule=Host(`claw.yourdomain.com`)"
      - "traefik.http.routers.openclaw.entrypoints=websecure"
      - "traefik.http.routers.openclaw.tls=true"
      - "traefik.http.routers.openclaw.tls.certresolver=letsencrypt"

      # 服务配置
      - "traefik.http.services.openclaw.loadbalancer.server.port=18789"
```

### 多入口点配置

如果使用多个 Traefik 入口点：

```yaml
labels:
  # 主入口点
  - "traefik.http.routers.openclaw.rule=Host(`claw.yourdomain.com`)"
  - "traefik.http.routers.openclaw.entrypoints=websecure,websecure-alt"

  # 备用入口点
  - "traefik.http.routers.openclaw-alt.rule=Host(`claw-alt.yourdomain.com`)"
  - "traefik.http.routers.openclaw-alt.entrypoints=websecure"
```

### 更新 ALLOWED_ORIGINS

使用 Traefik 时，确保将域名添加到允许的访问源：

```yaml
environment:
  OPENCLAW_CONTROL_UI_ALLOWED_ORIGINS: "https://claw.yourdomain.com,http://localhost:18789"
```

## 常用命令

### 服务管理

```bash
# 查看服务状态
docker compose ps

# 查看日志
docker compose logs -f openclaw-gateway

# 重启服务
docker compose restart

# 停止服务
docker compose down

# 启动服务
docker compose up -d
```

### CLI 工具命令

```bash
# 查看配置
docker compose run --rm openclaw-cli config list

# 设置配置
docker compose run --rm openclaw-cli config set gateway.mode local
docker compose run --rm openclaw-cli config set gateway.bind lan

# 获取 Token
docker compose run --rm openclaw-cli config get gateway.auth.token

# 设备管理
docker compose run --rm openclaw-cli devices list
docker compose run --rm openclaw-cli devices approve <device-id>

# 获取 Dashboard 链接
docker compose run --rm openclaw-cli dashboard --no-open

# 健康检查
docker compose run --rm openclaw-cli health --token "your-token"
```

### 频道配置

```bash
# WhatsApp（QR 码登录）
docker compose run --rm openclaw-cli channels login

# Telegram（Bot Token）
docker compose run --rm openclaw-cli channels add --channel telegram --token "your-bot-token"

# Discord（Bot Token）
docker compose run --rm openclaw-cli channels add --channel discord --token "your-bot-token"
```

## 故障排查

### 常见问题

#### 1. 错误：`manifest unknown`

**原因**：使用了不存在的镜像标签（如 `:latest`）

**解决**：使用具体的版本标签
```yaml
image: ghcr.io/openclaw/openclaw:2026.2.26  # 正确
image: ghcr.io/openclaw/openclaw:latest      # 错误
```

#### 2. 错误：`no configuration file provided`

**原因**：不在包含 `docker-compose.yaml` 的目录下运行命令

**解决**：
```bash
# 先进入项目目录
cd /mnt/App/Dockers/openclaw
# 再运行命令
docker compose ps
```

#### 3. 错误：`Gateway failed to start: non-loopback Control UI requires gateway.controlUi.allowedOrigins`

**原因**：使用 `lan` 绑定模式但未设置允许的访问源

**解决**：
```yaml
environment:
  OPENCLAW_GATEWAY_BIND: lan
  OPENCLAW_CONTROL_UI_ALLOWED_ORIGINS: "http://localhost:18789,http://127.0.0.1:18789"
```

#### 4. 权限错误：`EACCES`

**原因**：挂载目录权限不正确

**解决**：
```bash
sudo chown -R 1000:1000 /mnt/App/Dockers/openclaw/config
sudo chown -R 1000:1000 /mnt/App/Dockers/openclaw/workspace
```

### 健康检查

```bash
# 容器探针（无需认证）
curl -fsS http://localhost:18789/healthz
curl -fsS http://localhost:18789/readyz

# 深度健康检查（需要 Token）
docker compose exec openclaw-gateway node dist/index.js health --token "your-token"
```

### 查看详细日志

```bash
# 查看完整日志
docker compose logs openclaw-gateway

# 实时跟踪日志
docker compose logs -f openclaw-gateway

# 查看最近 100 行
docker compose logs --tail=100 openclaw-gateway
```

## 进阶配置

### 环境变量完整列表

```yaml
environment:
  # 基础配置
  OPENCLAW_GATEWAY_TOKEN: "your-token"
  OPENCLAW_GATEWAY_BIND: "lan"
  OPENCLAW_CONTROL_UI_ALLOWED_ORIGINS: "http://localhost:18789"

  # 性能优化
  NODE_ENV: "production"
  UV_THREADPOOL_SIZE: "4"

  # 日志级别
  LOG_LEVEL: "info"

  # 浏览器配置（如需使用 browser tool）
  OPENCLAW_BROWSER_DISABLE_GRAPHICS_FLAGS: "0"
  OPENCLAW_BROWSER_DISABLE_EXTENSIONS: "0"
```

### 资源限制

```yaml
services:
  openclaw-gateway:
    # ... 其他配置
    deploy:
      resources:
        limits:
          cpus: '2.0'
          memory: 2G
        reservations:
          cpus: '0.5'
          memory: 512M
```

### 自动重启策略

```yaml
restart: unless-stopped  # 推荐用于生产
# restart: always         # 总是重启
# restart: no             # 不自动重启
```

## 总结

OpenClaw 的 Docker 部署非常灵活，本文涵盖了从基础安装到高级配置的完整流程。关键要点：

1. ✅ 使用具体的镜像版本标签（如 `2026.2.26`）
2. ✅ 首次部署必须运行 onboarding 向导初始化配置
3. ✅ 在 `lan` 模式下必须设置 `ALLOWED_ORIGINS`
4. ✅ 确保数据卷权限正确（UID 1000）
5. ✅ CLI 容器使用 `network_mode: service:openclaw-gateway`
6. ✅ 通过 Traefik 可以安全地暴露服务

### 部署流程速查

```bash
# 1. 创建目录
mkdir -p /mnt/App/Dockers/openclaw/{config,workspace}

# 2. 创建 docker-compose.yaml 并配置环境变量

# 3. 启动服务
cd /mnt/App/Dockers/openclaw
docker compose up -d

# 4. 运行 onboarding 向导（首次必须）
docker compose run --rm openclaw-cli onboard --mode local --no-install-daemon

# 5. 验证并访问
docker compose ps
# 访问 http://your-server-ip:18789
```

## 参考资源

- [OpenClaw 官方文档](https://docs.openclaw.ai/)
- [OpenClaw GitHub](https://github.com/openclaw/openclaw)
- [Docker Compose 文档](https://docs.docker.com/compose/)

---

**发布日期**：2026-03-03
**版本**：OpenClaw 2026.2.26
**适用平台**：TrueNAS SCALE, Linux, macOS, Windows (with Docker Desktop)
