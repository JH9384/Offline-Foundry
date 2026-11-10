#!/usr/bin/env python3
"""freeinference relay: one file, no dependencies, the smallest bridge from a native
harness to the model running in your browser tab.

A browser tab cannot listen on a port, and Hermes, OpenClaw and every OpenAI client
expect http://host:port/v1. This script listens on 127.0.0.1:11435 and forwards each
request to the freeinference page open in your browser, which executes it on your
GPU, seals it, and streams the answer back. Nothing is computed here, nothing is
stored here, and nothing leaves your machine.

    python3 freeinference-relay.py           # then open https://humuhumu33.github.io/hologram-forge/
    OPENAI_BASE_URL=http://127.0.0.1:11435/v1  OPENAI_API_KEY=local

What keeps it yours:
  loopback only     it binds 127.0.0.1 and refuses any other host;
  a bearer on /v1   every client request needs an Authorization header (any value), so a web
                    page on another origin cannot make your GPU answer for it: the header forces
                    a CORS preflight, and only the freeinference page's origin is allowed;
  a token on /tab   the tab that serves must present the token this run minted, read through
                    /tab/hello from an allowed origin, and it must send a custom header, so a
                    hostile page cannot inject frames or drain jobs with a simple request;
  one tab at a time a second tab is told which tab is serving and waits;
  limits            request bodies up to 1 MB, one timeout per job, nothing of a message in the log.

Wire shapes are the page's, which are the Lean verified model's; this file only moves bytes.
"""
import json, os, queue, secrets, subprocess, sys, threading, time, uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

VERSION = "2"
HOST = os.environ.get("FREEINFERENCE_RELAY_HOST", "127.0.0.1")
PORT = int(os.environ.get("FREEINFERENCE_RELAY_PORT", "11435"))
DEFAULT_PORT = 11435
PAGE_URL = "https://humuhumu33.github.io/hologram-forge/"
PAGE_ORIGINS = {"https://humuhumu33.github.io", "http://localhost:8090", "http://127.0.0.1:8090"}
POLL_SECONDS = 25
TIMEOUT_SECONDS = int(os.environ.get("FREEINFERENCE_RELAY_TIMEOUT", "180"))
MAX_BODY = 1_000_000
TAB_HEADER, TAB_ID_HEADER = "X-Freeinference-Tab", "X-Freeinference-Tab-Id"
TOKEN = secrets.token_urlsafe(24)   # minted per run; the tab learns it through /tab/hello

jobs = queue.Queue()            # jobs waiting for the tab
running = {}                    # id -> {"frames": queue.Queue}
lock = threading.Lock()
serving = {"id": "", "at": 0.0}  # the one tab that serves, and when it last polled


def tab_attached():
    return time.time() - serving["at"] < 2 * POLL_SECONDS


def note(text):
    sys.stderr.write("relay  %s\n" % text)
    sys.stderr.flush()


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    # The log names method, path, status and time; never a body, never a header.
    def log_request(self, code="-", size="-"):
        if self.path == "/tab/next" and code in (204, "204"):
            return
        note("%s %s %s %d ms" % (self.command, self.path.split("?")[0], code, int((time.time() - self._t0) * 1000)))

    def log_message(self, fmt, *args):
        pass

    # ---- helpers
    def origin_allowed(self):
        # The page's origin, or a copy of the page served from this machine's own loopback.
        origin = self.headers.get("Origin", "")
        return origin in PAGE_ORIGINS or origin.startswith("http://localhost:") or origin.startswith("http://127.0.0.1:")

    def cors(self):
        origin = self.headers.get("Origin", "")
        if self.origin_allowed():
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Access-Control-Allow-Headers", "authorization, content-type, x-freeinference-tab, x-freeinference-tab-id")
            self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
            self.send_header("Access-Control-Expose-Headers", "x-hologram-receipt, x-hologram-reuse, x-hologram-stream, x-hologram-provider, x-hologram-warm, x-hologram-cost")
            self.send_header("Access-Control-Max-Age", "600")
            self.send_header("Vary", "Origin")

    def body(self):
        length = int(self.headers.get("Content-Length") or 0)
        if length > MAX_BODY:
            # Drain what the client is sending so it can read the refusal, then close.
            remaining = min(length, 16 * MAX_BODY)
            while remaining > 0:
                chunk = self.rfile.read(min(65536, remaining))
                if not chunk:
                    break
                remaining -= len(chunk)
            self.close_connection = True
            return None
        return self.rfile.read(length) if length else b""

    def reply(self, status, payload, content_type="application/json", extra=()):
        data = payload if isinstance(payload, bytes) else json.dumps(payload).encode()
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(data)))
        for k, v in extra:
            self.send_header(k, v)
        self.cors()
        self.end_headers()
        self.wfile.write(data)

    def error(self, status, message, kind="server_error"):
        self.reply(status, {"error": {"message": message, "type": kind, "param": None, "code": None}})

    def empty(self, status):
        self.send_response(status); self.cors(); self.send_header("Content-Length", "0"); self.end_headers()

    # The tab side: an allowed origin, the custom header, and (after hello) this run's token.
    def tab_ok(self, need_token=True):
        if not self.origin_allowed():
            self.error(403, "not the freeinference page"); return False
        presented = self.headers.get(TAB_HEADER, "")
        if not presented or (need_token and not secrets.compare_digest(presented, TOKEN)):
            self.error(403, "no relay token; read /tab/hello first"); return False
        return True

    def tab_id(self):
        return self.headers.get(TAB_ID_HEADER, "")[:16]

    # The client side: a bearer of any value, so a cross origin page needs a preflight it cannot pass.
    def client_ok(self):
        if not self.headers.get("Authorization", "").strip():
            self.error(401, "send an Authorization header with any key, for example: Bearer local", "authentication_error"); return False
        return True

    def do_OPTIONS(self):
        self._t0 = time.time()
        # Chrome's Private Network Access: a public HTTPS page (the live site) reaching this loopback
        # must have its preflight answered with this header, or the browser blocks the request before
        # it is sent. Granted only to an allowed origin, the same gate as the rest of CORS.
        extra = ()
        if self.origin_allowed() and self.headers.get("Access-Control-Request-Private-Network") == "true":
            extra = (("Access-Control-Allow-Private-Network", "true"),)
        self.send_response(204)
        for k, v in extra:
            self.send_header(k, v)
        self.cors(); self.send_header("Content-Length", "0"); self.end_headers()

    def do_GET(self):
        self._t0 = time.time()
        path = self.path.split("?")[0]
        if path == "/v1/models":
            if not self.client_ok():
                return
            # The tab answers this too: ask it, so the list is the page's, from the model.
            if not tab_attached():
                return self.reply(200, {"object": "list", "data": []})
            return self.forward({"op": "models"}, stream=False)
        if path == "/tab/hello":
            if not self.tab_ok(need_token=False):
                return
            return self.reply(200, {"relay": "freeinference", "version": VERSION, "port": PORT, "token": TOKEN,
                                    "base_url": "http://%s:%d/v1" % (HOST, PORT), "serving": serving["id"][:6] if tab_attached() else ""})
        if path == "/tab/next":
            if not self.tab_ok():
                return
            me = self.tab_id()
            with lock:
                if tab_attached() and serving["id"] and serving["id"] != me:
                    other = serving["id"]
                else:
                    other = ""
                    if serving["id"] != me:
                        note("tab %s attached" % me[:6])
                    serving["id"], serving["at"] = me, time.time()
            if other:
                return self.reply(409, {"error": {"message": "another tab is serving", "type": "server_error"}, "serving": other[:6]})
            deadline = time.time() + POLL_SECONDS
            while time.time() < deadline:
                try:
                    job = jobs.get(timeout=0.5)
                except queue.Empty:
                    continue
                with lock:
                    serving["at"] = time.time()
                return self.reply(200, job)
            with lock:
                serving["at"] = time.time()
            return self.empty(204)
        if path in ("/", "/healthz"):
            return self.reply(200, {"relay": "freeinference", "version": VERSION, "tab": tab_attached(), "base_url": "http://%s:%d/v1" % (HOST, PORT)})
        self.error(404, "not found")

    def do_POST(self):
        self._t0 = time.time()
        path = self.path.split("?")[0]
        if path == "/v1/chat/completions":
            if not self.client_ok():
                return
            raw = self.body()
            if raw is None:
                return self.error(413, "request body above %d bytes" % MAX_BODY, "invalid_request_error")
            try:
                request = json.loads(raw or b"{}")
            except ValueError:
                return self.error(400, "request is not JSON", "invalid_request_error")
            if not tab_attached():
                return self.error(503, "no browser tab is serving: open %s and leave it open" % PAGE_URL)
            return self.forward({"op": "chat", "request": request}, stream=bool(isinstance(request, dict) and request.get("stream")))
        if path.startswith("/tab/"):
            if not self.tab_ok():
                return
            parts = path.split("/")
            if len(parts) != 4:
                return self.error(404, "not found")
            job_id, action = parts[2], parts[3]
            with lock:
                job = running.get(job_id)
            if not job:
                return self.error(404, "no running job")
            raw = self.body()
            if raw is None:
                return self.error(413, "frame above %d bytes" % MAX_BODY)
            try:
                payload = json.loads(raw or b"{}")
            except ValueError:
                return self.error(400, "not JSON")
            if action == "head":           # the stream's headers, before its first frame
                job["frames"].put(("head", payload.get("headers", {})))
                return self.reply(202, {})
            if action == "frame":          # one wire frame, bytes already encoded by the page
                job["frames"].put(("frame", payload.get("bytes", "")))
                return self.reply(202, {})
            if action == "result":         # the whole response, bytes already encoded
                job["frames"].put(("result", payload.get("bytes", ""), payload.get("headers", {})))
                return self.reply(202, {})
            if action == "fail":
                job["frames"].put(("fail", payload.get("message", "the tab failed")))
                return self.reply(202, {})
        self.error(404, "not found")

    # ---- forward one job to the tab and relay what comes back
    def forward(self, job, stream):
        job_id = str(uuid.uuid4())
        frames = queue.Queue()
        with lock:
            running[job_id] = {"frames": frames}
        jobs.put({"id": job_id, **job})
        try:
            deadline = time.time() + TIMEOUT_SECONDS
            if stream:
                headed = False
                self.close_connection = True   # a stream has no length; the close is its end
                while time.time() < deadline:
                    try:
                        item = frames.get(timeout=1)
                    except queue.Empty:
                        continue
                    if not headed:
                        headed = True
                        self.send_response(200)
                        self.send_header("Content-Type", "text/event-stream")
                        self.send_header("Cache-Control", "no-cache")
                        for k, v in (item[1] if item[0] == "head" else {}).items():
                            self.send_header(k, str(v))
                        self.cors()
                        self.end_headers()
                    if item[0] == "head":
                        continue
                    if item[0] == "frame":
                        self.wfile.write(("data: " + item[1] + "\n\n").encode()); self.wfile.flush()
                        if item[1] == "[DONE]":
                            return
                    elif item[0] == "result":
                        self.wfile.write(("data: " + item[1] + "\n\n").encode()); self.wfile.flush()
                        return
                    else:
                        self.wfile.write(("data: " + json.dumps({"error": {"message": item[1], "type": "server_error"}}) + "\n\n").encode())
                        self.wfile.flush(); return
                if not headed:
                    return self.error(504, "no answer from the tab within %d s" % TIMEOUT_SECONDS)
                self.wfile.write(b"data: [DONE]\n\n"); self.wfile.flush()
            else:
                while time.time() < deadline:
                    try:
                        item = frames.get(timeout=1)
                    except queue.Empty:
                        continue
                    if item[0] == "result":
                        return self.reply(200, item[1].encode(), extra=tuple((k, str(v)) for k, v in item[2].items()))
                    if item[0] == "fail":
                        return self.error(502, item[1])
                self.error(504, "no answer from the tab within %d s" % TIMEOUT_SECONDS)
        finally:
            with lock:
                running.pop(job_id, None)


def port_holder(port):
    """Best effort: which process listens on the port, for the message when it is taken."""
    try:
        if sys.platform == "win32":
            out = subprocess.run(["netstat", "-ano"], capture_output=True, text=True, timeout=5).stdout
            pids = {line.split()[-1] for line in out.splitlines() if (":%d " % port) in line and "LISTENING" in line}
            return "pid " + ", ".join(sorted(pids)) if pids else ""
        out = subprocess.run(["lsof", "-nP", "-iTCP:%d" % port, "-sTCP:LISTEN"], capture_output=True, text=True, timeout=5).stdout
        rows = out.strip().splitlines()[1:]
        return ", ".join("%s (pid %s)" % (r.split()[0], r.split()[1]) for r in rows) if rows else ""
    except Exception:
        return ""


def watch_detach():
    """Says when the serving tab stops polling, so the terminal tells the whole story."""
    was = False
    while True:
        time.sleep(5)
        now = tab_attached()
        if was and not now:
            note("tab %s left; waiting for a tab" % serving["id"][:6])
        was = now


def main():
    if HOST not in ("127.0.0.1", "localhost", "::1"):
        print("freeinference relay binds loopback only; FREEINFERENCE_RELAY_HOST=%s refused" % HOST, file=sys.stderr)
        return 2
    # On Windows SO_REUSEADDR lets a second process bind the same port and steal connections; a
    # second relay must fail loudly instead, so the reuse flag is off there.
    ThreadingHTTPServer.allow_reuse_address = sys.platform != "win32"
    try:
        server = ThreadingHTTPServer((HOST, PORT), Handler)
    except OSError as error:
        holder = port_holder(PORT)
        print("port %d is taken%s: %s" % (PORT, " by " + holder if holder else "", error), file=sys.stderr)
        print("stop that process, or run with another port: FREEINFERENCE_RELAY_PORT=%d python3 freeinference-relay.py" % (PORT + 1), file=sys.stderr)
        return 1
    server.daemon_threads = True
    page = PAGE_URL if PORT == DEFAULT_PORT else PAGE_URL + "?relay=%d" % PORT
    print("freeinference relay on http://%s:%d/v1" % (HOST, PORT))
    print("open %s in your browser and leave it open" % page)
    print("then point any OpenAI client at OPENAI_BASE_URL=http://%s:%d/v1 with any key, for example OPENAI_API_KEY=local" % (HOST, PORT))
    print("waiting for a tab")
    sys.stdout.flush()
    threading.Thread(target=watch_detach, daemon=True).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    return 0


if __name__ == "__main__":
    sys.exit(main())
