"""Start an application archive and verify a clean, offline local launch."""
import argparse
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


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("app", type=Path)
    parser.add_argument("--python", type=Path, default=Path(sys.executable))
    native = parser.add_mutually_exclusive_group()
    native.add_argument("--native-launcher", action="store_true", help="Start the installed macOS app launcher.")
    native.add_argument("--native-core", action="store_true", help="Start the packaged native server directly.")
    args = parser.parse_args()
    with tempfile.TemporaryDirectory() as folder:
        path = str(args.app.resolve())
        if args.native_launcher:
            command = [path, "--no-open-browser"]
        elif args.native_core:
            command = [path, "--no-browser"]
        else:
            command = [str(args.python.resolve()), path, "--no-browser"]
        command += ["--data", str(Path(folder) / "profile" / "test.db")]
        with subprocess.Popen(command, stdout=subprocess.PIPE, cwd=folder) as app:
            try:
                lines = Queue(maxsize=1)
                read_fd = app.stdout.fileno()

                def read_address():
                    data = bytearray()
                    while b"\n" not in data and len(data) < 4096:
                        chunk = os.read(read_fd, 4096)
                        if not chunk:
                            break
                        data.extend(chunk)
                    lines.put(bytes(data).split(b"\n", 1)[0])

                Thread(target=read_address, daemon=True).start()
                try:
                    line = lines.get(timeout=55 if args.native_launcher else 20)
                except Empty as error:
                    raise RuntimeError("The local launcher did not report a ready address.") from error
                prefix, url = line.decode("utf-8").strip().split(": ", 1)
                if prefix != "DeskLedger" or not url.startswith("http://127.0.0.1:"):
                    raise RuntimeError("Unexpected local launcher output.")
                opener = build_opener(ProxyHandler({}))
                address, token = urldefrag(url)
                assert len(token) == 64
                with opener.open(address, timeout=10) as response:
                    assert response.status == 200 and b"<title>DeskLedger</title>" in response.read()
                request = Request(address + "api/state", headers={"X-DeskLedger-Token": token})
                with opener.open(request, timeout=10) as response:
                    assert json.load(response) == {"state": None}
            finally:
                app.terminate()
                try:
                    app.wait(timeout=10)
                except subprocess.TimeoutExpired:
                    app.kill()
                    raise
            if args.native_launcher and app.returncode != 0:
                raise RuntimeError(f"The Mac launcher exited with {app.returncode}.")
    print("Launcher, packaged assets and first-run database verified.")


if __name__ == "__main__":
    main()
