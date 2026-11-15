"use strict";

const assert = require("node:assert/strict");
const {readFileSync} = require("node:fs");
const {join} = require("node:path");
const {test} = require("node:test");
const {runInNewContext} = require("node:vm");

const source = readFileSync(join(__dirname, "../deskledger/static/i18n.js"), "utf8");
const {displayDay, parseDay, fromMoney, messages} = runInNewContext(
  source + "\n({displayDay, parseDay, fromMoney, messages})"
);

test("translates every visible message in all three languages", () => {
  for (const [key, translations] of Object.entries(messages)) {
    assert.equal(translations.length, 3, key);
    assert.ok(translations.every(text => typeof text === "string" && text.trim()), key);
  }
});

test("round-trips the same dates across Gregorian, Solar Hijri and Umm al-Qura", () => {
  for (const lang of ["en", "fa", "ar"]) {
    for (const day of ["1900-01-01", "1900-12-31", "2000-02-29", "2024-03-20",
      "2026-07-03", "2099-12-31", "2200-01-01", "2200-12-31"]) {
      assert.equal(parseDay(displayDay(day, lang), lang), day, `${lang} ${day}`);
    }
  }
  assert.equal(parseDay("۱۴۰۵/۰۴/۱۲", "fa"), "2026-07-03");
  assert.equal(parseDay("١٤٤٨/٠١/١٨", "ar"), "2026-07-03");
});

test("rejects nonexistent dates and unexpected formats", () => {
  assert.equal(parseDay("2025/02/29", "en"), null);
  assert.equal(parseDay("۱۴۰۴/۱۲/۳۰", "fa"), null);
  assert.equal(parseDay("١٤٤٨/١٢/٣١", "ar"), null);
  assert.equal(parseDay("03/07/2026", "en"), null);
});

test("parses local digits and exact minor units without floating-point conversion", () => {
  assert.equal(fromMoney("۰٫۱۰", 2), 10);
  assert.equal(fromMoney("١٢٫٣٤٥", 3), 12345);
  assert.equal(fromMoney("۲۵۰۰۰", 0), 25000);
  assert.equal(fromMoney("1000000000000", 0), 10 ** 12);
  for (const invalid of ["1.001", "1e3", "1,234", "-10", "10000000000.01", ""]) {
    assert.ok(Number.isNaN(fromMoney(invalid, 2)), invalid);
  }
});
