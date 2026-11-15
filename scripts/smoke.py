"""Verify that a packaged application launches and serves its local profile."""
import argparse
from contextlib import contextmanager
import json
import os
from pathlib import Path
from queue import Empty, Queue
import subprocess
import sys
import tempfile
from threading import Thread
from urllib.parse import urldefrag
from urllib.request import ProxyHandler, Request, build_opener


@contextmanager
def launch(command, profile, native_launcher):
    with subprocess.Popen(command + ["--data", str(profile)], stdout=subprocess.PIPE, cwd=profile.parent) as app:
        try:
            lines = Queue(maxsize=1)
            fd = app.stdout.fileno()

            def read_address():
                data = bytearray()
                while b"\n" not in data and len(data) < 4096:
                    chunk = os.read(fd, 4096)
                    if not chunk:
                        break
                    data.extend(chunk)
                lines.put(bytes(data).split(b"\n", 1)[0])

            Thread(target=read_address, daemon=True).start()
            try:
                line = lines.get(timeout=55 if native_launcher else 20)
            except Empty as error:
                raise RuntimeError("The local launcher did not report a ready address.") from error
            prefix, url = line.decode("utf-8").strip().split(": ", 1)
            if prefix != "DeskLedger" or not url.startswith("http://127.0.0.1:"):
                raise RuntimeError("Unexpected local launcher output.")
            address, token = urldefrag(url)
            assert len(token) == 64
            opener = build_opener(ProxyHandler({}))
            with opener.open(address, timeout=10) as response:
                assert response.status == 200 and b"<title>DeskLedger</title>" in response.read()

            def call(route, payload=None):
                headers = {"X-DeskLedger-Token": token}
                body = None
                if payload is not None:
                    headers.update({"Content-Type": "application/json", "Origin": address.rstrip("/")})
                    body = json.dumps(payload).encode("utf-8")
                request = Request(address + "api/" + route, data=body, headers=headers)
                with opener.open(request, timeout=10) as response:
                    return json.load(response)

            yield call
        finally:
            app.terminate()
            try:
                app.wait(timeout=10)
            except subprocess.TimeoutExpired:
                app.kill()
                raise
        if native_launcher and app.returncode != 0:
            raise RuntimeError(f"The Mac launcher exited with {app.returncode}.")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("app", type=Path)
    parser.add_argument("--python", type=Path, default=Path(sys.executable))
    parser.add_argument("--storage", action="store_true", help="Verify sale retries, persisted data and restore.")
    native = parser.add_mutually_exclusive_group()
    native.add_argument("--native-launcher", action="store_true", help="Start the installed macOS app launcher.")
    native.add_argument("--native-core", action="store_true", help="Start the packaged native server directly.")
    args = parser.parse_args()

    executable = str(args.app.resolve())
    if args.native_launcher:
        command = [executable, "--no-open-browser"]
    elif args.native_core:
        command = [executable, "--no-browser"]
    else:
        command = [str(args.python.resolve()), executable, "--no-browser"]
    with tempfile.TemporaryDirectory() as folder:
        profile = Path(folder) / "test.db"
        with launch(command, profile, args.native_launcher) as api:
            assert api("state") == {"state": None}
            if args.storage:
                fixture = Path(__file__).resolve().parents[1] / "examples" / "sample-backup.json"
                sample = json.loads(fixture.read_text(encoding="utf-8"))
                assert api("restore", {"ack": True, "backup": sample}) == sample
                original = next(iter(sample["sales"].values()))
                sale = {**original, "id": "20000000-0000-4000-8000-000000000099"}
                recorded = api("sale", sale)
                assert recorded["invoice"] == len(sample["sales"]) + 1
                assert api("sale", sale) == recorded
                exported = api("state")["state"]
                assert len(exported["sales"]) == len(sample["sales"]) + 1
        if args.storage:
            with launch(command, profile, args.native_launcher) as api:
                assert api("state")["state"] == exported
            with launch(command, Path(folder) / "restored.db", args.native_launcher) as api:
                assert api("state") == {"state": None}
                assert api("restore", {"ack": True, "backup": exported}) == exported
            print("Packaged runtime preserved the sale after restart and restored the backup.")
    print("Launcher, packaged assets and first-run database verified.")


if __name__ == "__main__":
    main()
