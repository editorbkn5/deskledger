"""Produce deterministic runtime and Windows archives using the standard library."""
import argparse
from hashlib import sha256
from io import BytesIO
from pathlib import Path
from urllib.request import urlopen
from zipfile import ZIP_DEFLATED, ZipFile, ZipInfo

ROOT = Path(__file__).resolve().parent.parent
VERSION = "0.1.0"
PYTHON_VERSION = "3.14.9"
EMBED_NAME = f"python-{PYTHON_VERSION}-embed-amd64.zip"
EMBED_URL = f"https://www.python.org/ftp/python/{PYTHON_VERSION}/{EMBED_NAME}"
EMBED_SHA256 = "3c01d7cfc666f746a6f064f60fb2156ab0ec464d3d738ab796371a46a9bb24a2"
WINDOWS_LAUNCHER = (
    '@echo off\r\n'
    'setlocal\r\n'
    '"%~dp0python\\python.exe" "%~dp0DeskLedger.pyz" %*\r\n'
    'if errorlevel 1 pause\r\n'
)


def archive(destination, files):
    with ZipFile(destination, "w", compression=ZIP_DEFLATED, compresslevel=9) as bundle:
        for name, data in sorted(files.items()):
            info = ZipInfo(name, date_time=(2020, 1, 1, 0, 0, 0))
            info.external_attr = 0o100644 << 16
            bundle.writestr(info, data, compress_type=ZIP_DEFLATED, compresslevel=9)


def create_app(destination):
    files = {
        path.relative_to(ROOT).as_posix(): path.read_bytes()
        for path in (ROOT / "deskledger").rglob("*")
        if path.is_file() and path.suffix in {".py", ".html", ".css", ".js"}
    }
    files["__main__.py"] = b"from deskledger.server import main\n\nif __name__ == '__main__':\n    main()\n"
    archive(destination, files)


def windows_package(output, app, seed):
    if seed:
        binary = seed.read_bytes()
    else:
        with urlopen(EMBED_URL, timeout=60) as source:
            binary = source.read()
    if sha256(binary).hexdigest() != EMBED_SHA256:
        raise SystemExit("The Windows Python runtime failed its SHA-256 check.")
    with ZipFile(BytesIO(binary)) as upstream:
        files = {"python/" + name: upstream.read(name) for name in upstream.namelist()}
    files.update({"DeskLedger.pyz": app.read_bytes(), "Start-DeskLedger.cmd": WINDOWS_LAUNCHER.encode("ascii")})
    for name in ("README.md", "LICENSE", "examples/sample-backup.json"):
        files[name] = (ROOT / name).read_bytes()
    archive(output / f"DeskLedger-{VERSION}-Windows-x64.zip", files)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--windows", action="store_true", help="Also bundle the Windows x64 runtime.")
    parser.add_argument("--python-embed", type=Path, help="Use a previously downloaded, pinned Python ZIP.")
    parser.add_argument("--output", type=Path, default=ROOT / "dist")
    args = parser.parse_args()
    if args.python_embed and not args.windows:
        parser.error("--python-embed requires --windows")
    args.output.mkdir(parents=True, exist_ok=True)
    app = args.output / "DeskLedger.pyz"
    create_app(app)
    if args.windows:
        windows_package(args.output, app, args.python_embed)


if __name__ == "__main__":
    main()
