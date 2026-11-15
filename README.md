# DeskLedger

DeskLedger is an offline CRM for a single business on one computer. Record customers and sales, print invoices, track optional loyalty credit, and back up your records to a local file. The application has no runtime package dependencies beyond Python and a modern browser. The Windows package includes Python.

## Quick start

**Windows x64:** Extract the entire Windows ZIP to a writable folder. Double-click `Start-DeskLedger.cmd`. Leave the launcher open while working, and close it to stop DeskLedger. If the browser does not open automatically, open the address printed in the launcher. The browser connects only to the local application.

**macOS 15 or later:** Download the disk image matching your Mac (`arm64` for Apple Silicon or `x86_64` for Intel), open it, and drag DeskLedger into Applications. Open DeskLedger from Applications to launch your default browser. Keep its launcher window open while working. The preview is ad-hoc signed and has no Apple notarization; macOS may restrict launching downloads.

**Run from source:** With Python 3.11 or newer, run `python -m deskledger` from the extracted source directory. On Linux or macOS use `python3` if needed. You can also run `python DeskLedger.pyz` after building the portable archive. Use `--no-browser` to prevent automatic opening and `--data /path/to/profile.db` to start a separate profile.

1. Choose English, فارسی or العربية, and enter the business name, contact and address. Select your currency and modules.
2. In **Customers**, create or edit a customer and search by name, phone or email. In **Sales**, choose a customer or leave the sale as walk-in, add lines, then record and print the invoice.
3. Optional **Loyalty** requires Customers and Sales. Named customer sales earn the configured percentage of the paid amount, rounded down to the currency's smallest unit. Credit can be used on later named customer sales.
4. **Reports** shows gross and paid sales totals and filters by inclusive business dates. Open an invoice from Sales or Reports.
5. In **Backup**, download a JSON copy or select a JSON file and confirm replacement. Restore works before and after setup. Use `examples/sample-backup.json` in a fresh profile to explore fictitious records. Restoring it in an existing profile replaces that profile's data.

Settings can be edited any time. Deactivating a module keeps its data. Currency is fixed after the first sale to keep historical amounts meaningful. Persian uses the Solar Hijri calendar, Arabic uses Umm al-Qura and English uses Gregorian. Date inputs use year/month/day and accept local and Latin digits. Currency uses exact integer minor units. Amount entry accepts a period or Arabic decimal separator without grouping marks.

## Data and operation

- Windows stores its SQLite file at `%LOCALAPPDATA%\DeskLedger\deskledger.db`. On macOS the default is `~/Library/Application Support/DeskLedger/deskledger.db`, with existing profiles in the former Linux-style location still supported. On Linux the default is `$XDG_DATA_HOME/DeskLedger/deskledger.db` or `~/.local/share/DeskLedger/deskledger.db`.
- Backups contain business and customer records in readable JSON. Store them with the same care as the database. Restore supports schema versions 1 and 2 and uses one transaction. Version 1 invoices acquire the issuer details from the imported profile.
- DeskLedger listens on an ephemeral IPv4 loopback port. It is intended for local, single-business use under your OS account. Keep the launcher and data under that account. The launcher address carries a temporary access token for this run, so use the full address it prints and keep it on this computer. Closing just the browser does not stop the launcher.
- Invoices describe recorded sales and do not calculate tax. Each sale is immutable and stamped with the issuer details at the time of sale. If a connection message appears when recording a sale, retry the same form without changing the sale, or check Sales history first if the launcher or browser was closed.

## Reproducible builds and tests

```sh
python scripts/build.py
python scripts/smoke.py dist/DeskLedger.pyz
python -m unittest discover -s tests -v
npm ci
npm test
npx playwright install chromium firefox
node --test tests/browser.cjs
```

To build the Windows x64 ZIP, use `python scripts/build.py --windows`. It bundles the pinned official Python embeddable distribution and verifies SHA-256. To build with no internet access once that ZIP has been obtained, add `--python-embed path/to/python-3.14.9-embed-amd64.zip`. The Windows ZIP includes the Python license under `python/LICENSE.txt`.

The browser tests require Node.js 22+ and Playwright. Each language starts with a new database and browser, blocks requests outside the local server, checks recovery from a lost sales response, restarts the app, and restores the downloaded copy into a new database. The suite defaults to Chromium. Set `BROWSER_ENGINE=firefox` for Firefox. CI runs persistence and browser checks and builds the Windows package on a Windows runner. The DeskLedger ZIP is unsigned and targets x64 Windows.

## Build the Mac disk image

On macOS 15 or later, install Python 3.12 and the Xcode command-line tools. Run these commands in a Python virtual environment:

```sh
python -m pip install -r packaging/macos/requirements.txt
PYTHON=python bash scripts/build_macos.sh
```

Each Mac builds for its native architecture. The disk image includes the native launcher and the frozen Python runtime, so users do not need a separate Python installation. GitHub Actions builds both architectures, installs from the disk image, verifies startup and runs the three offline browser scenarios.

## شروع سریع فارسی

فایل ZIP ویندوز را کامل استخراج کنید و `Start-DeskLedger.cmd` را اجرا کنید. پنجرهٔ اجرا را هنگام کار باز نگه دارید. آدرس چاپ‌شده در پنجره را می‌توانید مستقیم در مرورگر باز کنید. زبان فارسی، نام و مشخصات کسب‌وکار، واحد پول و ماژول‌ها را انتخاب کنید. برای آزمایش با داده‌های ساختگی، فایل `examples/sample-backup.json` را در یک پروفایل تازه از بخش **پشتیبان** بازیابی کنید. بازیابی جایگزین داده‌های پروفایل مقصد می‌شود.

## بدء سريع بالعربية

فكّ ضغط حزمة Windows كاملة، ثم شغّل `Start-DeskLedger.cmd` واترك نافذة التشغيل مفتوحة. يمكنك فتح العنوان الظاهر في النافذة في متصفحك. اختر العربية وأدخل بيانات النشاط وحدد العملة والوحدات. لتجربة البيانات الافتراضية، استعد ملف `examples/sample-backup.json` في ملف تعريف جديد من قسم **النسخ الاحتياطي**. تستبدل الاستعادة بيانات ملف التعريف الحالي.

## License

DeskLedger is released under the [MIT License](LICENSE).
