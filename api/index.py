import os
import sys

# Ensure root directory is on sys.path
root_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if root_dir not in sys.path:
    sys.path.insert(0, root_dir)

from fastapi import Request
from fastapi.responses import JSONResponse
from app import app as fastapi_app

@fastapi_app.api_route("/api/debug", methods=["GET"])
@fastapi_app.api_route("/debug", methods=["GET"])
async def debug_endpoint(request: Request):
    headers_dict = {k.decode("latin1"): v.decode("latin1") for k, v in request.scope.get("headers", [])}
    return {
        "path": request.scope.get("path"),
        "raw_path": request.scope.get("raw_path", b"").decode("latin1", errors="replace"),
        "headers": headers_dict,
        "query": request.scope.get("query_string", b"").decode("latin1", errors="replace"),
    }

class ASGIPathFix:
    def __init__(self, asgi_app):
        self.asgi_app = asgi_app

    async def __call__(self, scope, receive, send):
        if scope["type"] in ("http", "websocket"):
            headers = dict(scope.get("headers", []))
            # Check for x-matched-path header from Vercel
            matched_path = headers.get(b"x-matched-path", b"").decode("latin1")
            
            orig_path = scope.get("path", "/")
            path = orig_path
            
            # If x-matched-path is provided and different, prioritize it
            if matched_path and not matched_path.startswith("/api/index"):
                path = matched_path
            else:
                for prefix in ("/api/index.py", "/api/index"):
                    if path.startswith(prefix):
                        rest = path[len(prefix):]
                        if not rest.startswith("/"):
                            rest = "/" + rest
                        path = rest or "/"
                        break
            
            scope["path"] = path
            scope["raw_path"] = path.encode("latin1")
            scope["root_path"] = ""
        await self.asgi_app(scope, receive, send)

app = ASGIPathFix(fastapi_app)
