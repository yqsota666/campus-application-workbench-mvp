# 校园招聘秋招投递助手 Backend

本目录是 MVP 后端服务，基于 FastAPI。

## 启动

```bash
cd /Users/apple/Documents/ChatGPT/秋招/backend
.venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

接口文档：

```text
http://127.0.0.1:8000/docs
```

## 安装依赖

```bash
cd /Users/apple/Documents/ChatGPT/秋招/backend
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt pytest
```

当前依赖已经安装在本地 `.venv/`。

## 核心接口

```text
GET  /api/health
GET  /api/profile
GET  /api/preferences
GET  /api/sources
POST /api/capture/run
GET  /api/capture/today
POST /api/capture/jobs/{job_id}/review
GET  /api/jobs
POST /api/auth-sessions
POST /api/auth-sessions/{session_id}/confirm
POST /api/prefill/{job_id}/draft
GET  /api/events
```

## 状态规则

抓取结果默认进入：

```text
capture_waiting_review
```

只有人工确认以下四项后，才进入：

```text
job_ready
```

确认项：

- 来源可信。
- 字段完整。
- 截止时间确认。
- 岗位适配确认。

## 测试

```bash
cd /Users/apple/Documents/ChatGPT/秋招/backend
.venv/bin/python -m pytest -q
```

## 本地状态

运行态数据保存在：

```text
backend/data/state.json
```

这个文件是本地开发状态，不建议提交。后续可以替换成 SQLite 或 Postgres。
