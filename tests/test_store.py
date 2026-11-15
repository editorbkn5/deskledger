from concurrent.futures import ThreadPoolExecutor
from copy import deepcopy
import json
from pathlib import Path
import sqlite3
import tempfile
import unittest

from deskledger.store import Problem, Store, VERSION, balance, settings, validate_backup


CUSTOMER = "10000000-0000-4000-8000-000000000001"


def config(**changes):
    return {"lang": "en", "brand": "Fictional Workshop", "currency": "USD", "reward": 10,
            "modules": dict.fromkeys(("customers", "sales", "loyalty", "reports"), True), **changes}


def order(number=1, **changes):
    return {"id": f"20000000-0000-4000-8000-{number:012}", "day": "2026-07-03",
            "customer_id": CUSTOMER, "items": [{"label": "Example service", "qty": 2, "price": 1250}],
            **changes}


class StoreTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.path = Path(self.directory.name) / "test.db"
        self.store = Store(self.path)

    def ensure_setup(self):
        self.store.update("settings", config())
        self.store.update("customer", {"id": CUSTOMER, "name": "Example Customer"})

    def snapshot(self):
        self.ensure_setup()
        self.store.update("sale", order())
        return self.store.get()

    def test_blank_state_and_setup(self):
        self.assertIsNone(self.store.get())
        with self.assertRaisesRegex(Problem, "setupRequired"):
            self.store.update("sale", order())
        self.store.update("settings", config(lang="fa"))
        self.assertEqual(Store(self.path).get()["settings"]["lang"], "fa")

    def test_settings_validate_modules_and_reward(self):
        with self.assertRaisesRegex(Problem, "dependency"):
            settings(config(modules={"customers": False, "sales": True, "loyalty": True, "reports": False}))
        empty = dict.fromkeys(config()["modules"], False)
        self.assertEqual(settings(config(modules=empty))["modules"], empty)
        for changes in ({"reward": True}, {"reward": 101}, {"lang": "fr"}, {"currency": []}, {"brand": "   "}):
            with self.subTest(changes=changes), self.assertRaises(Problem):
                settings(config(**changes))

    def test_customer_update_and_restart(self):
        self.ensure_setup()
        self.store.update("customer", {"id": CUSTOMER, "name": "Updated", "email": "sample@example.invalid"})
        customers = Store(self.path).get()["customers"]
        self.assertEqual(len(customers), 1)
        self.assertEqual(customers[CUSTOMER]["name"], "Updated")

    def test_sale_totals_walkin_and_wallet(self):
        self.ensure_setup()
        earned = self.store.update("sale", order())
        used = self.store.update("sale", order(2, redeem=200))
        walkin = self.store.update("sale", order(3, customer_id=None))
        self.assertEqual((earned["total"], earned["earned"], used["earned"], walkin["earned"]), (2500, 250, 230, 0))
        self.assertEqual(balance(self.store.get(), CUSTOMER), 280)
        self.assertEqual([earned["invoice"], used["invoice"], walkin["invoice"]], [1, 2, 3])

    def test_issuer_and_customer_are_snapshotted(self):
        before = self.snapshot()["sales"]
        self.store.update("settings", config(brand="New Fictional Workshop"))
        self.store.update("customer", {"id": CUSTOMER, "name": "Renamed"})
        self.assertEqual(self.store.get()["sales"], before)

    def test_currency_locks_after_sale(self):
        self.snapshot()
        with self.assertRaisesRegex(Problem, "currencyLocked"):
            self.store.update("settings", config(currency="AED"))

    def test_rejected_sales_leave_no_partial_rows(self):
        original = self.snapshot()
        invalid_sales = [
            (order(2, redeem=251), "insufficient"),
            (order(2, customer_id=None, redeem=1), "insufficient"),
            (order(2, customer_id=order(99)["id"]), "invalidCustomer"),
            (order(2, day="2026-02-29"), "invalid"),
            (order(2, day="20260703"), "invalid"),
            (order(2, items=[{"label": "a", "qty": True, "price": 2}]), "invalid"),
            (order(2, items=[{"label": "a", "qty": 2, "price": 10**12}]), "invalid"),
        ]
        for request, problem in invalid_sales:
            with self.subTest(request=request), self.assertRaisesRegex(Problem, problem):
                self.store.update("sale", request)
        self.assertEqual(self.store.get(), original)

    def test_same_request_is_idempotent_and_changed_request_conflicts(self):
        self.ensure_setup()
        request = order()
        with ThreadPoolExecutor(max_workers=5) as pool:
            results = list(pool.map(lambda _: self.store.update("sale", request), range(10)))
        self.assertEqual(results, [results[0]] * 10)
        self.assertEqual(len(self.store.get()["sales"]), 1)
        with self.assertRaisesRegex(Problem, "duplicate"):
            self.store.update("sale", order(redeem=1))

    def test_concurrent_wallet_spending_is_serialized(self):
        self.snapshot()
        self.store.update("settings", config(reward=0))

        def spend(number):
            try:
                self.store.update("sale", order(number, redeem=200))
                return "ok"
            except Problem as error:
                return error.code

        with ThreadPoolExecutor(max_workers=2) as pool:
            self.assertCountEqual(pool.map(spend, [2, 3]), ["ok", "insufficient"])
        self.assertEqual(balance(self.store.get(), CUSTOMER), 50)

    def test_disabled_modules_preserve_history_and_reject_writes(self):
        original = self.snapshot()
        self.store.update("settings", config(modules={"customers": False, "sales": False, "loyalty": False, "reports": True}))
        with self.assertRaisesRegex(Problem, "disabled"):
            self.store.update("customer", {"id": CUSTOMER, "name": "Other"})
        with self.assertRaisesRegex(Problem, "disabled"):
            self.store.update("sale", order(2))
        self.store.update("settings", config())
        self.assertEqual(self.store.get(), original)

    def test_restore_round_trip_and_restart(self):
        original = self.snapshot()
        restored = Store(Path(self.directory.name) / "other.db")
        self.assertIsNone(restored.get())
        restored.update("restore", {"ack": True, "backup": json.loads(json.dumps(original))})
        self.assertEqual(Store(restored.path).get(), original)

    def test_invalid_and_unconfirmed_restore_are_atomic(self):
        original = self.snapshot()
        with self.assertRaises(Problem):
            self.store.update("restore", {"ack": False, "backup": original})
        for field, invalid in (("total", 500), ("invoice", 2), ("redeem", 1), ("issuer", {}),
                               ("created", "today"), ("day", "2026-99-01"), ("earned", 5000)):
            modified = deepcopy(original)
            modified["sales"][order()["id"]][field] = invalid
            with self.subTest(field=field), self.assertRaises(Problem):
                self.store.update("restore", {"ack": True, "backup": modified})
        self.assertEqual(self.store.get(), original)

    def test_legacy_restore_and_in_place_sqlite_upgrade(self):
        before = self.snapshot()
        legacy = deepcopy(before)
        legacy["version"] = 1
        del legacy["sales"][order()["id"]]["issuer"]
        self.assertEqual(validate_backup(legacy), before)
        with sqlite3.connect(self.path) as db:
            db.execute("UPDATE state SET body = ?", (json.dumps(legacy),))
        self.assertEqual(Store(self.path).get(), before)

    def test_future_version_does_not_overwrite_existing_storage(self):
        original = self.snapshot()
        original["version"] = VERSION + 1
        encoded = json.dumps(original)
        with sqlite3.connect(self.path) as db:
            db.execute("UPDATE state SET body = ?", (encoded,))
        with self.assertRaisesRegex(Problem, "badVersion"):
            Store(self.path)
        with sqlite3.connect(self.path) as db:
            self.assertEqual(db.execute("SELECT body FROM state").fetchone()[0], encoded)

    def test_sample_backup_is_valid(self):
        raw = json.loads((Path(__file__).parent.parent / "examples" / "sample-backup.json").read_text(encoding="utf8"))
        self.assertEqual(validate_backup(raw), raw)


if __name__ == "__main__":
    unittest.main()
