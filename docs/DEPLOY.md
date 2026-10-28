# Share the MVP on Render Free

The root `Dockerfile` builds React and runs FastAPI with the compiled frontend.
There is one service, one HTTPS URL and no separate CORS or API URL to configure.
Use the **Free** instance type. No paid database or disk is configured.

## Deploy

1. Push the latest application and deployment files to GitHub.
2. Sign in at https://dashboard.render.com/ using your own account.
3. Choose **New → Blueprint** and select the repository and branch containing
   `render.yaml`. Allow Render access to this repository if needed.
4. Review the single `packflow-demo` service and confirm **Free** before deploying.
5. Wait for the service to become **Live**, then open its `https://…onrender.com`
   URL. Verify `/api/health` returns `{"status":"ok","database":"sqlite"}`.
6. Share the service's actual URL with the tester.

If using **New → Web Service** instead of a Blueprint, select the same repository,
choose **Docker**, leave the root directory empty, use `./Dockerfile`, select
**Free**, and set the health check path to `/api/health`. No custom build or start
command is needed; the Dockerfile supplies both.

## What the tester should know

- A free service sleeps after 15 minutes without traffic. The first visit after
  that can take about one minute to open.
- SQLite and saved PDF reports live on the service's ephemeral filesystem. New
  data is lost after redeploys, restarts and spin-down. Fresh demo data is seeded
  on the next startup. Export test results before leaving the session.
- The demo has no login: anyone who has the URL can view and modify its data.
  Use sample documents and non-confidential test data.
- The container excludes local databases, uploads, screenshots and `.env` files.
  Your existing local data is not published.
- Avoid adding paid resources. Render's free usage is subject to monthly limits.
  If the account has a payment method, check its billing and spend limits.

Official limits: https://render.com/docs/free

## Local production check

With Docker Desktop running, from the repository root:

```bash
docker build -t packflow-mvp .
docker run --rm -p 10000:10000 packflow-mvp
```

Open http://localhost:10000. With `--rm` and no volume this is a disposable demo,
matching the free deployment. Stop it with Ctrl+C.

For a local check without Docker:

```bash
cd frontend
npm ci
npm run build
cd ../backend
PACKFLOW_DB_PATH=/tmp/packflow-demo-check.db .venv/bin/uvicorn app.web:app --host 127.0.0.1 --port 10000
```

The normal two-server development workflow remains unchanged.
