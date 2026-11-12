import os
import sys

# Ensure root directory is in sys.path
root_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if root_dir not in sys.path:
    sys.path.insert(0, root_dir)

from app import app as fastapi_app

class ASGIPathFix:
    """Normalizes ASGI path when Vercel serverless functions rewrite requests."""
    def __init__(self, asgi_app):
        self.asgi_app = asgi_app

    async def __call__(self, scope, receive, send):
        if scope["type"] in ("http", "websocket"):
            path = scope.get("path", "/")
            raw_path = scope.get("raw_path", b"/")
            for prefix in ("/api/index.py", "/api/index"):
                if path.startswith(prefix):
                    rest = path[len(prefix):]
                    if not rest.startswith("/"):
                        rest = "/" + rest
                    scope["path"] = rest or "/"
                    raw_prefix = prefix.encode()
                    raw_rest = raw_path[len(raw_prefix):]
                    if not raw_rest.startswith(b"/"):
                        raw_rest = b"/" + raw_rest
                    scope["raw_path"] = raw_rest or b"/"
                    break
            scope["root_path"] = ""
        await self.asgi_app(scope, receive, send)

app = ASGIPathFix(fastapi_app)
