"use strict";

const assert = require("node:assert/strict");
const {spawn} = require("node:child_process");
const {once} = require("node:events");
const {mkdtemp, readFile, rm} = require("node:fs/promises");
const {tmpdir} = require("node:os");
const {join} = require("node:path");
const test = require("node:test");
const {chromium, firefox} = require("playwright");

const cases = {
  en: {date: "2026/07/03", price: "19.95", reward: "10", qty: "2", spend: "1.00", brand: "Example Workshop", name: "Example Visitor", item: "Sample repair",
    dayLabel: "Sale date", currency: "US dollar", required: "Complete this field.", wrongDate: "Enter a valid date", walkin: "Walk-in", restored: "Backup restored."},
  fa: {date: "۱۴۰۵/۰۴/۱۲", price: "۱۹٫۹۵", reward: "۱۰", qty: "۲", spend: "۱٫۰۰", brand: "کارگاه نمونه", name: "کیان نمونه", item: "خدمت نمونه",
    dayLabel: "تاریخ فروش", currency: "دلار آمریکا", required: "این فیلد را پر کنید.", wrongDate: "تاریخ معتبر", walkin: "رهگذری", restored: "پشتیبان بازیابی شد."},
  ar: {date: "١٤٤٨/٠١/١٨", price: "١٩٫٩٥", reward: "١٠", qty: "٢", spend: "١٫٠٠", brand: "ورشة تجريبية", name: "عميل تجريبي", item: "خدمة تجريبية",
    dayLabel: "تاريخ البيع", currency: "دولار أمريكي", required: "أكمل هذا الحقل.", wrongDate: "أدخل تاريخًا صالحًا", walkin: "عميل عابر", restored: "تمت استعادة النسخة الاحتياطية."},
};
const engine = process.env.BROWSER_ENGINE === "firefox" ? firefox : chromium;
const python = process.env.PYTHON || (process.platform === "win32" ? "python" : "python3");

async function start(file) {
  const executable = process.env.DESKLEDGER_EXECUTABLE;
  const cli = executable ? [] : process.env.DESKLEDGER_APP ? [process.env.DESKLEDGER_APP] : ["-m", "deskledger"];
  const child = spawn(executable || python, [...cli, "--data", file, "--no-browser"], {stdio: ["ignore", "pipe", "pipe"], windowsHide: true});
  const exit = once(child, "exit");
  let errors = "";
  child.stderr.on("data", chunk => { errors += chunk; });
  let buffer = "";
  const url = await Promise.race([
    new Promise(resolve => child.stdout.on("data", chunk => {
      buffer += chunk;
      const match = buffer.match(/http:\/\/127\.0\.0\.1:\d+\/#(?:[a-f0-9]{64})/);
      if (match) resolve(match[0]);
    })),
    exit.then(() => { throw new Error("DeskLedger failed to start: " + errors); }),
  ]);
  return {url, close: async () => { child.kill(); await exit; }};
}

async function view(browser, url, external, errors, width) {
  const context = await browser.newContext({viewport: {width, height: 850}, acceptDownloads: true, serviceWorkers: "block"});
  await context.route("**/*", route => {
    const address = route.request().url();
    if (new URL(address).origin === new URL(url).origin) return route.continue();
    external.push(address);
    return route.abort("internetdisconnected");
  });
  const page = await context.newPage();
  page.setDefaultTimeout(5000);
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(url);
  return {context, page};
}

async function snapshot(page) {
  return page.evaluate(async () => {
    const token = sessionStorage.getItem("deskledger-token");
    return (await (await fetch("/api/state", {headers: {"X-DeskLedger-Token": token}})).json()).state;
  });
}

async function restore(page, filename) {
  await page.locator("[name=backup]").setInputFiles(filename);
  await page.locator("[name=ack]").check();
  const response = page.waitForResponse(res => res.url().endsWith("/api/restore"));
  await page.locator("#restore-form [type=submit]").click();
  return response;
}

for (const [lang, values] of Object.entries(cases)) {
  test(`${engine.name()} ${lang}: offline setup, customer, sales, invoice, wallet, reports, restart and restore`, {timeout: 75000}, async () => {
    const directory = await mkdtemp(join(tmpdir(), "deskledger-e2e-"));
    const file = join(directory, "crm.db");
    const browser = await engine.launch({executablePath: process.env.BROWSER_EXECUTABLE || undefined});
    let server = await start(file);
    const external = [];
    const errors = [];
    const width = lang === "en" ? 1120 : 390;
    try {
      let {context, page} = await view(browser, server.url, external, errors, width);
      const go = module => page.locator(`nav [data-page=${module}]`).click();
      const fill = (name, value) => page.locator(`[name=${name}]`).fill(value);
      const settingsSubmit = () => page.locator("#configuration [type=submit]").click();
      const saleSubmit = () => page.locator("#sale-form [type=submit]").click();
      const closeInvoice = () => page.locator("#close-invoice").click();

      await fill("brand", values.brand);
      await page.locator("[name=lang]").selectOption(lang);
      assert.equal(await page.locator("html").getAttribute("lang"), lang);
      assert.equal(await page.locator("html").getAttribute("dir"), lang === "en" ? "ltr" : "rtl");
      assert.equal(await page.locator("[name=brand]").inputValue(), values.brand);
      await page.locator("[name=currency]").selectOption("USD");
      await fill("contact", "sample@example.invalid");
      await fill("address", "Example City");
      await page.locator("[name=loyalty]").check();
      await fill("reward", values.reward);
      await settingsSubmit();
      await page.locator("#customer-editor").waitFor();
      assert.equal(await snapshot(page).then(state => state.settings.address), "Example City");
      await page.locator("#customer-editor [type=submit]").click();
      assert.equal(await page.locator("#notice").innerText(), values.required);
      await fill("name", values.name);
      await fill("phone", "01234");
      await fill("email", "visitor@example.invalid");
      await page.locator("#customer-editor [type=submit]").click();
      await page.locator("#customer-list tbody tr").waitFor();
      await fill("search", "٠١٢٣٤");
      assert.ok((await page.locator("#customer-list").innerText()).includes(values.name));
      await fill("search", "missing");
      assert.equal(await page.locator("#customer-list tbody tr").count(), 0);
      await fill("search", "");
      await page.locator("#customer-list [data-id]").click();
      await fill("notes", "Synthetic fixture");
      await page.locator("#customer-editor [type=submit]").click();
      await page.locator("#cancel-edit").waitFor({state: "hidden"});
      const customerId = Object.keys((await snapshot(page)).customers)[0];

      await go("sales");
      assert.equal(await page.locator("[name=day]").locator("..").locator("span").innerText(), values.dayLabel);
      await fill("day", "0000/00/00");
      await fill("item", values.item);
      await fill("qty", values.qty);
      await fill("price", values.price);
      await saleSubmit();
      assert.ok((await page.locator("#notice").innerText()).includes(values.wrongDate));
      await fill("day", values.date);
      await page.locator("#add-line").click();
      await page.locator("[data-remove]").last().click();
      assert.equal(await page.locator(".line").count(), 1);
      await page.locator("[name=customer]").selectOption(customerId);
      let lostResponse = false;
      await page.route("**/api/sale", async route => {
        if (lostResponse) return route.continue();
        lostResponse = true;
        const committed = await route.fetch();
        assert.equal(committed.status(), 200);
        await route.abort("failed");
      });
      await saleSubmit();
      await page.locator("#notice[data-error=true]").waitFor();
      await saleSubmit();
      await page.locator("#invoice:not([hidden])").waitFor();
      assert.ok((await page.locator("#invoice").innerText()).includes(values.currency));
      assert.ok((await page.locator("#invoice").innerText()).includes(values.date));
      assert.ok((await page.locator("#invoice").innerText()).includes(values.name));
      assert.equal(Object.keys((await snapshot(page)).sales).length, 1);
      await page.emulateMedia({media: "print"});
      assert.equal(await page.locator("#top").isVisible(), false);
      assert.equal(await page.locator("#print-invoice").isVisible(), false);
      assert.equal(await page.locator("#invoice").isVisible(), true);
      if (engine === chromium) {
        const pdf = await page.pdf({format: "A4"});
        assert.equal(pdf.subarray(0, 5).toString(), "%PDF-");
        if (process.env.PRINT_TEST_DIR) await page.pdf({path: join(process.env.PRINT_TEST_DIR, lang + ".pdf"), format: "A4"});
      }
      await page.emulateMedia({media: "screen"});
      await closeInvoice();

      async function recordSale(id = null) {
        await fill("day", values.date);
        await fill("item", values.item);
        await fill("price", values.price);
        if (id) {
          await page.locator("[name=customer]").selectOption(id);
          await fill("redeem", values.spend);
        }
        await saleSubmit();
        await page.locator("#invoice:not([hidden])").waitFor();
      }
      await recordSale(customerId);
      await closeInvoice();
      await recordSale();
      assert.ok((await page.locator("#invoice").innerText()).includes(values.walkin));
      await closeInvoice();
      await go("loyalty");
      assert.equal(await page.locator("#content table").count(), 2);
      const sales = Object.values((await snapshot(page)).sales);
      assert.deepEqual(sales.map(sale => [sale.day, sale.total, sale.redeem, sale.earned]),
        [["2026-07-03", 3990, 0, 399], ["2026-07-03", 1995, 100, 189], ["2026-07-03", 1995, 0, 0]]);
      await go("reports");
      await fill("from", values.date);
      await fill("to", values.date);
      await page.locator("#report-filter [type=submit]").click();
      assert.equal(await page.locator("#content tbody tr").count(), 3);
      await go("settings");
      assert.equal(await page.locator("[name=currency]").isDisabled(), true);
      await page.locator("[name=customers]").uncheck();
      assert.equal(await page.locator("[name=loyalty]").isDisabled(), true);
      await settingsSubmit();
      await page.locator("[data-page=customers]").waitFor({state: "detached"});
      await go("sales");
      assert.equal(await page.locator("[name=customer]").count(), 0);
      await go("backup");
      const downloadPromise = page.waitForEvent("download");
      await page.locator("#download-backup").click();
      const backup = join(directory, "backup.json");
      await (await downloadPromise).saveAs(backup);
      const expected = JSON.parse(await readFile(backup, "utf8"));
      assert.equal(expected.settings.modules.loyalty, false);
      assert.equal(Object.keys(expected.customers).length, 1);
      assert.equal(Object.keys(expected.sales).length, 3);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      await context.close();
      await server.close();

      server = await start(file);
      ({context, page} = await view(browser, server.url, external, errors, width));
      await page.locator("[data-page=sales]").waitFor();
      assert.deepEqual(await snapshot(page), expected);
      await go("backup");
      await page.locator("[name=backup]").setInputFiles({name: "invalid.json", mimeType: "application/json", buffer: Buffer.from('{"version":99}')});
      await page.locator("[name=ack]").check();
      await page.locator("#restore-form [type=submit]").click();
      await page.locator("#notice[data-error=true]").waitFor();
      assert.deepEqual(await snapshot(page), expected);
      await context.close();
      await server.close();

      server = await start(join(directory, "restored.db"));
      ({context, page} = await view(browser, server.url, external, errors, width));
      await go("backup");
      assert.equal((await restore(page, backup)).status(), 200);
      await page.getByText(values.restored, {exact: true}).waitFor();
      assert.deepEqual(await snapshot(page), expected);
      await go("settings");
      await page.locator("[name=customers]").check();
      await page.locator("[name=loyalty]").check();
      await settingsSubmit();
      await go("loyalty");
      assert.ok((await page.locator("#content tbody").first().innerText()).includes(values.name));
      assert.equal(await page.locator("#content tbody").last().locator("tr").count(), 2);
      await context.close();
      assert.deepEqual(errors, []);
      assert.deepEqual(external, []);
    } finally {
      await browser.close();
      await server.close();
      await rm(directory, {recursive: true, force: true});
    }
  });
}
