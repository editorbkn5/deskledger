"""Start an application archive and verify a clean, offline local launch."""
import argparse
import json
from pathlib import Path
import subprocess
import sys
import tempfile
from urllib.parse import urldefrag
from urllib.request import ProxyHandler, Request, build_opener


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("app", type=Path)
    parser.add_argument("--python", type=Path, default=Path(sys.executable))
    args = parser.parse_args()
    with tempfile.TemporaryDirectory() as folder:
        command = [str(args.python.resolve()), str(args.app.resolve()),
                   "--data", str(Path(folder) / "profile" / "test.db"), "--no-browser"]
        with subprocess.Popen(command, stdout=subprocess.PIPE, text=True, cwd=folder) as app:
            try:
                prefix, url = app.stdout.readline().strip().split(": ", 1)
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
                app.wait(timeout=10)
    print("Launcher, packaged assets and first-run database verified.")


if __name__ == "__main__":
    main()
