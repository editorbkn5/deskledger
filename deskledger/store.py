"""Transactional local storage and domain rules."""
from contextlib import contextmanager
from datetime import date, datetime, timezone
import json
import re
import sqlite3
import unicodedata

CURRENCIES = {"IRT": 0, "IRR": 0, "USD": 2, "EUR": 2, "AED": 2, "SAR": 2, "IQD": 3}
MODULES = ("customers", "sales", "loyalty", "reports")
MAX_VALUE = 10**12
VERSION = 2


class Problem(Exception):
    def __init__(self, code, status=400):
        super().__init__(code)
        self.code, self.status = code, status


def require(condition, code="invalid", status=400):
    if not condition:
        raise Problem(code, status)


def field(value, limit=200, required=False):
    require(isinstance(value, str))
    value = value.strip()
    require(len(value) <= limit and (value or not required))
    require(not any(unicodedata.category(char) in {"Cc", "Cs"} for char in value))
    return value


def integer(value, low, high):
    require(type(value) is int and low <= value <= high)
    return value


def identifier(value):
    value = field(value, 36, True)
    require(re.fullmatch(r"[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}", value))
    return value


def choice(value, choices):
    require(isinstance(value, str) and value in choices)
    return value


def record(value):
    require(isinstance(value, dict))
    return value


def utc_now():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def timestamp(value):
    value = field(value, 32, True)
    require(bool(re.fullmatch(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+00:00", value)))
    try:
        datetime.fromisoformat(value)
    except ValueError as error:
        raise Problem("invalid") from error
    return value


def business_day(value):
    try:
        value = field(value, 10, True)
        require(re.fullmatch(r"[0-9]{4}-[0-9]{2}-[0-9]{2}", value))
        day = date.fromisoformat(value)
        require(1900 <= day.year <= 2200)
        return day.isoformat()
    except ValueError as error:
        raise Problem("invalid") from error


def settings(data):
    data = record(data)
    modules = record(data.get("modules"))
    require(set(modules) == set(MODULES) and all(type(v) is bool for v in modules.values()))
    require(not modules["loyalty"] or (modules["customers"] and modules["sales"]), "dependency")
    return {
        "lang": choice(data.get("lang"), ("fa", "en", "ar")),
        "brand": field(data.get("brand"), 100, True),
        "contact": field(data.get("contact", ""), 100),
        "address": field(data.get("address", ""), 200),
        "currency": choice(data.get("currency"), CURRENCIES),
        "modules": modules,
        "reward": integer(data.get("reward", 0), 0, 100),
    }


def customer(data):
    data = record(data)
    return {
        "name": field(data.get("name"), 100, True),
        "phone": field(data.get("phone", ""), 50),
        "email": field(data.get("email", ""), 120),
        "notes": field(data.get("notes", ""), 200),
    }


def items(data):
    require(isinstance(data, list) and 1 <= len(data) <= 50)
    lines = []
    for value in data:
        line = record(value)
        lines.append({"label": field(line.get("label"), 120, True),
                      "qty": integer(line.get("qty"), 1, 100000),
                      "price": integer(line.get("price"), 1, MAX_VALUE)})
    total = sum(line["qty"] * line["price"] for line in lines)
    require(total <= MAX_VALUE)
    return lines, total


def sale(data):
    data = record(data)
    lines, total = items(data.get("items"))
    redeem = integer(data.get("redeem", 0), 0, total)
    return {
        "id": identifier(data.get("id")), "day": business_day(data.get("day")),
        "customer_id": None if data.get("customer_id") is None else identifier(data["customer_id"]),
        "items": lines, "total": total, "redeem": redeem,
    }


class Store:
    def __init__(self, path):
        self.path = path
        with self.transaction(write=True) as db:
            db.execute("CREATE TABLE IF NOT EXISTS state (id INTEGER PRIMARY KEY CHECK(id = 1), body TEXT NOT NULL)")
            row = self.read(db)
            if row is not None and row.get("version") != VERSION:
                self.write(db, validate_backup(row))

    @contextmanager
    def transaction(self, write=False):
        db = sqlite3.connect(self.path, timeout=10, isolation_level=None)
        try:
            db.execute("BEGIN IMMEDIATE" if write else "BEGIN")
            yield db
            db.commit()
        except BaseException:
            db.rollback()
            raise
        finally:
            db.close()

    @staticmethod
    def read(db):
        row = db.execute("SELECT body FROM state WHERE id = 1").fetchone()
        return json.loads(row[0]) if row else None

    @staticmethod
    def write(db, data):
        db.execute("INSERT INTO state VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET body=excluded.body",
                   (json.dumps(data, ensure_ascii=False, separators=(",", ":")),))

    def get(self):
        with self.transaction() as db:
            return self.read(db)

    def update(self, operation, data):
        with self.transaction(write=True) as db:
            state = self.read(db)
            if operation == "restore":
                require(isinstance(data, dict) and data.get("ack") is True)
                state = validate_backup(data.get("backup"))
                self.write(db, state)
                return state
            if operation == "settings":
                config = settings(data)
                if state is None:
                    state = {"version": VERSION, "customers": {}, "sales": {}}
                elif state["sales"]:
                    require(config["currency"] == state["settings"]["currency"], "currencyLocked")
                state["settings"] = config
                self.write(db, state)
                return state
            require(state is not None, "setupRequired", 409)
            config = state["settings"]
            enabled = config["modules"]
            if operation == "customer":
                require(enabled["customers"], "disabled", 403)
                key = identifier(data.get("id"))
                value = customer(data)
                state["customers"][key] = value
            elif operation == "sale":
                require(enabled["sales"], "disabled", 403)
                value = sale(data)
                key = value["id"]
                existing = state["sales"].get(key)
                if existing is not None:
                    require(all(existing[k] == v for k, v in value.items()), "duplicate", 409)
                    return existing
                customer_id = value["customer_id"]
                require(customer_id is None or (enabled["customers"] and customer_id in state["customers"]),
                        "invalidCustomer")
                require(value["redeem"] == 0 or
                        (enabled["loyalty"] and customer_id and value["redeem"] <= balance(state, customer_id)),
                        "insufficient")
                value["earned"] = ((value["total"] - value["redeem"]) * config["reward"] // 100
                                   if enabled["loyalty"] and customer_id else 0)
                value["customer_name"] = state["customers"][customer_id]["name"] if customer_id else ""
                value["invoice"] = len(state["sales"]) + 1
                value["created"] = utc_now()
                value["issuer"] = {field: config[field] for field in ("brand", "address", "contact")}
                state["sales"][key] = value
            else:
                raise Problem("notFound", 404)
            self.write(db, state)
            return value


def balance(state, key):
    return sum(value["earned"] - value["redeem"] for value in state["sales"].values()
               if value["customer_id"] == key)


def validate_backup(raw):
    raw = record(raw)
    version = raw.get("version")
    require(type(version) is int and version in (1, VERSION), "badVersion")
    raw_config = record(raw.get("settings"))
    config = settings(raw_config)
    customers = {identifier(key): customer(value) for key, value in record(raw.get("customers")).items()}
    sales = {}
    entries = record(raw.get("sales"))
    ordered = sorted(entries.items(), key=lambda item: integer(record(item[1]).get("invoice"), 1, len(entries)))
    balances = {}
    for number, (key, original) in enumerate(ordered, 1):
        value = sale(original)
        require(identifier(key) == value["id"] and original["invoice"] == number and
                type(original.get("total")) is int and original["total"] == value["total"])
        customer_id = value["customer_id"]
        earned = integer(original.get("earned"), 0, value["total"] - value["redeem"])
        require(customer_id in customers or (customer_id is None and earned == value["redeem"] == 0))
        previous = balances.get(customer_id, 0)
        require(previous >= value["redeem"])
        balances[customer_id] = previous + earned - value["redeem"]
        value["invoice"] = number
        value["earned"] = earned
        value["created"] = timestamp(original.get("created"))
        value["customer_name"] = field(original.get("customer_name"), 100, bool(customer_id))
        issuer = config if version == 1 else record(original.get("issuer"))
        value["issuer"] = {"brand": field(issuer.get("brand"), 100, True),
                           "contact": field(issuer.get("contact", ""), 100),
                           "address": field(issuer.get("address", ""), 200)}
        sales[key] = value
    return {"version": VERSION, "settings": config, "customers": customers, "sales": sales}
