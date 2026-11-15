#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

if [[ $(uname -s) != Darwin ]]; then
  echo "Build the Mac package on macOS with Xcode command-line tools." >&2
  exit 1
fi

python_bin=${PYTHON:-python3}
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
arch=$(uname -m)
if [[ $arch != arm64 && $arch != x86_64 ]]; then
  echo "Unsupported Mac architecture: $arch" >&2
  exit 1
fi

export MACOSX_DEPLOYMENT_TARGET=15.0
"$python_bin" -m PyInstaller --noconfirm --clean --onedir --console \
  --name deskledger-core --target-architecture "$arch" --paths "$PWD" \
  --add-data "$PWD/deskledger/static:deskledger/static" \
  --workpath "$work/work" --specpath "$work" --distpath "$work/dist" \
  "$PWD/packaging/macos/core.py"

stage="$work/stage"
bundle="$stage/DeskLedger.app"
mkdir -p "$bundle/Contents/"{MacOS,Frameworks,Resources}
mkdir -p dist
ditto "$work/dist/deskledger-core" "$bundle/Contents/Frameworks/DeskLedgerCore"
cp packaging/macos/Info.plist "$bundle/Contents/Info.plist"
cp LICENSE README.md "$bundle/Contents/Resources/"
mkdir -p "$bundle/Contents/Resources/examples"
cp examples/sample-backup.json "$bundle/Contents/Resources/examples/"

"$python_bin" - "$bundle/Contents/Resources" <<'PY'
from importlib.metadata import distribution
from pathlib import Path
import shutil
import sys
import sysconfig

output = Path(sys.argv[1])
shutil.copyfile(Path(sysconfig.get_path("stdlib")) / "LICENSE.txt", output / "Python-LICENSE.txt")
installer = distribution("PyInstaller")
license_file = next(path for path in installer.files if str(path).endswith("/licenses/COPYING.txt"))
shutil.copyfile(installer.locate_file(license_file), output / "PyInstaller-COPYING.txt")
PY

xcrun swiftc -swift-version 5 -O "packaging/macos/Launcher.swift" -o "$bundle/Contents/MacOS/DeskLedger"
plutil -lint "$bundle/Contents/Info.plist"

codesign --force --deep --sign - "$bundle"
codesign --verify --deep --strict "$bundle"
for executable in "$bundle/Contents/MacOS/DeskLedger" "$bundle/Contents/Frameworks/DeskLedgerCore/deskledger-core"; do
  [[ $(lipo -archs "$executable") == "$arch" ]]
done

ln -s /Applications "$stage/Applications"
version=$("$python_bin" -c 'import plistlib; print(plistlib.load(open("packaging/macos/Info.plist", "rb"))["CFBundleShortVersionString"])')
output="dist/DeskLedger-${version}-macOS-${arch}.dmg"
hdiutil create -ov -volname DeskLedger -srcfolder "$stage" -fs HFS+ -format UDZO "$output"
hdiutil verify "$output"
