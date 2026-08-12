# Intelligensi.ai - Local Agent Prototype

This is the local development environment for the Intelligensi.ai coding agent. It uses a lightweight, decoupled stack designed to run locally via Ollama before deployment to a cloud GPU environment.

## Prerequisites

- Docker for Redis
- Ollama for local DeepSeek inference
- Node.js v18+ or Python 3.10+

## 1. Start the Inference Engine

Pull and run the lightweight model for testing the agentic pipeline:

```bash
ollama run deepseek-coder:1.3b
```

## 2. Start the State Database

Spin up the Redis container in the background:

```bash
docker-compose up -d
```

## 3. Run the Backend Orchestrator

Copy the environment file:

```bash
cp backend/.env.example backend/.env
```

### Option A: Node.js

```bash
cd backend
npm install
node agent.js
```

### Option B: Python

```bash
cd backend
pip install -r requirements.txt
uvicorn agent:app --port 3001
```

## 4. Run the Frontend

Serve the `frontend` directory using any basic HTTP server. For example:

```bash
cd frontend
npx serve .
# or
python3 -m http.server 8000
```

