"""Production entrypoint: serve the built frontend and API from one origin."""
import os
from pathlib import Path

from fastapi.staticfiles import StaticFiles

from .main import app

frontend_dir = Path(os.getenv(
    "PACKFLOW_FRONTEND_DIR",
    str(Path(__file__).resolve().parents[2] / "frontend" / "dist"),
))
if not (frontend_dir / "index.html").is_file():
    raise RuntimeError("Frontend build not found. Run `npm ci && npm run build` in frontend first.")

# Keep API routes registered before the root mount. The current UI navigates
# through React state, so unknown URLs correctly return 404 instead of HTML.
app.mount("/", StaticFiles(directory=frontend_dir, html=True), name="frontend")
