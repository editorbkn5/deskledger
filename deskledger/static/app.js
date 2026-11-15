"use strict";

const $ = (selector, root = document) => root.querySelector(selector);
const content = $("#content");
const notice = $("#notice");
let state = null;
const token = (() => {
  const fragment = location.hash.slice(1);
  if (/^[a-f0-9]{64}$/.test(fragment)) {
    try { sessionStorage.setItem("deskledger-token", fragment); } catch {}
    history.replaceState(null, "", location.pathname);
    return fragment;
  }
  try { return sessionStorage.getItem("deskledger-token") || ""; } catch { return ""; }
})();
let language = "en";
let page = "settings";
let filters = {from: "", to: ""};
let pendingSale = null;

const t = key => (messages[key] || messages.invalid)[["en", "fa", "ar"].indexOf(language)];
const esc = value => String(value ?? "").replace(/[&<>"']/g, char => (
  {"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"}[char]
));
const o = (value, label, chosen) => `<option value="${esc(value)}"${value === chosen ? " selected" : ""}>${esc(label)}</option>`;
const localNumber = (value, options) => new Intl.NumberFormat(locales[language], options).format(value);
const dayLabel = day => displayDay(day, language);
const money = amount => {
  const code = state.settings.currency;
  const precision = currencies[code];
  const absolute = BigInt(amount) < 0n ? -BigInt(amount) : BigInt(amount);
  const scale = 10n ** BigInt(precision);
  const whole = localNumber(absolute / scale);
  const digitFormatter = new Intl.NumberFormat(locales[language], {useGrouping: false});
  const separator = new Intl.NumberFormat(locales[language]).formatToParts(1.1).find(part => part.type === "decimal").value;
  const fraction = String(absolute % scale).padStart(precision, "0").replace(/\d/g, digit => digitFormatter.format(Number(digit)));
  return `${BigInt(amount) < 0n ? "−" : ""}${whole}${precision ? separator + fraction : ""} ${t(code)}`;
};

function today() {
  const now = new Date();
  return [now.getFullYear(), now.getMonth() + 1, now.getDate()].map(n => String(n).padStart(2, "0")).join("-");
}

function announce(key, error = false) {
  notice.textContent = key ? t(key) : "";
  notice.dataset.error = String(error);
}

function localize() {
  document.documentElement.lang = language;
  document.documentElement.dir = language === "en" ? "ltr" : "rtl";
  $("#skip").textContent = t("skip");
  $("#nav").ariaLabel = t("navigation");
  $("#brand").textContent = state?.settings.brand || "";
}

async function api(path, data) {
  let response;
  try {
    const headers = {"X-DeskLedger-Token": token};
    const request = data === undefined ? {headers} : {
      method: "POST",
      headers: {...headers, "Content-Type": "application/json"},
      body: JSON.stringify(data),
    };
    response = await fetch("/api/" + path, request);
  } catch {
    throw new Error("connection");
  }
  const result = await response.json();
  if (!response.ok) throw new Error(result.error);
  return result;
}

async function refresh() {
  ({state} = await api("state"));
  if (state) language = state.settings.lang;
}

function header(key, help) {
  $("#heading").innerHTML = `<h1>${t(key)}</h1>${help ? `<p class="quiet">${t(help)}</p>` : ""}`;
}

function input(name, label, value = "", attributes = "") {
  return `<label class="field"><span>${esc(label)}</span><input name="${name}" value="${esc(value)}" ${attributes}></label>`;
}

function dateInput(name, value = "") {
  return input(name, t(name), value, `dir="ltr" maxlength="10" placeholder="${dayLabel(today())}"`);
}

function check(name, checked, label) {
  return `<label class="check"><input type="checkbox" name="${name}" ${checked ? "checked" : ""}>${t(label)}</label>`;
}

function button(key, attributes = "") {
  return `<button type="button" ${attributes}>${t(key)}</button>`;
}

function submit(key) {
  return `<button class="primary" type="submit">${t(key)}</button>`;
}

function bindForm(form, action) {
  form.addEventListener("submit", async event => {
    event.preventDefault();
    const ready = $("button[type=submit]", form);
    if (ready.disabled) return;
    announce();
    const missing = [...form.querySelectorAll("[required]")].find(control =>
      !control.disabled && (control.type === "file" ? !control.files.length : !control.value.trim()));
    if (missing) {
      missing.focus();
      announce("required", true);
      return;
    }
    ready.disabled = true;
    try {
      await action(new FormData(form), form);
    } catch (error) {
      announce(error.message, true);
    } finally {
      ready.disabled = false;
    }
  });
}

function choosePage(destination, message) {
  if (state && page === "settings" && destination !== page) language = state.settings.lang;
  page = destination;
  render();
  announce(message);
  $("#main").focus();
}

function render() {
  localize();
  content.onclick = null;
  $("#layout").hidden = false;
  $("#invoice").hidden = true;
  const modulePages = state ? Object.keys(state.settings.modules).filter(key => state.settings.modules[key]) : [];
  const pages = state ? [...modulePages, "settings", "backup"] : ["settings", "backup"];
  if (!pages.includes(page)) page = "settings";
  $("#nav").innerHTML = pages.map(key => button(key === "settings" && !state ? "setup" : key,
    `data-page="${key}" ${key === page ? 'aria-current="page"' : ""}`)).join("");
  $("#nav").onclick = event => {
    if (event.target.dataset.page) choosePage(event.target.dataset.page);
  };
  ({settings: showSettings, customers: showCustomers, sales: showSales, loyalty: showLoyalty,
    reports: showReports, backup: showBackup})[page]();
}

function showSettings(draft) {
  const config = draft || state?.settings || {brand: "", contact: "", address: "", currency: {en: "USD", fa: "IRT", ar: "AED"}[language],
    modules: {customers: true, sales: true, loyalty: false, reports: true}, reward: 5};
  const locked = Boolean(Object.keys(state?.sales || {}).length);
  header(state ? "settings" : "setup", state ? null : "setupHelp");
  content.innerHTML = `<form class="card" novalidate id="configuration"><div class="grid">
    <label class="field"><span>${t("language")}</span><select name="lang">${Object.entries(languages).map(([code, label]) => o(code, label, language)).join("")}</select></label>
    ${input("brand", t("brand"), config.brand, "required maxlength=100 dir=auto")}
    ${input("contact", t("contact"), config.contact, "maxlength=100 dir=auto")}
    ${input("address", t("address"), config.address, "maxlength=200 dir=auto")}
    <label class="field"><span>${t("currency")}</span><select name="currency" ${locked ? "disabled" : ""}>${Object.keys(currencies).map(code => o(code, t(code), config.currency)).join("")}</select>${locked ? `<small>${t("currencyLocked")}</small>` : ""}</label>
    </div><fieldset><legend>${t("modules")}</legend><p class="quiet">${t("moduleHelp")}</p>
    <div class="grid">${Object.keys(config.modules).map(key => check(key, config.modules[key], key)).join("")}</div>
    </fieldset><div id="reward">${input("reward", t("reward"), localNumber(config.reward, {useGrouping: false}), 'inputmode="numeric" maxlength="3"')}</div>
    ${submit(state ? "save" : "start")}</form>`;
  const form = $("#configuration");
  const fields = form.elements;
  function values() {
    const reward = normalizeDigits(fields.reward.value).trim();
    return {lang: fields.lang.value, brand: fields.brand.value, address: fields.address.value, contact: fields.contact.value,
      currency: fields.currency.value, reward: /^\d{1,3}$/.test(reward) ? Number(reward) : NaN,
      modules: Object.fromEntries(Object.keys(config.modules).map(key => [key, fields[key].checked]))};
  }
  function syncModules() {
    fields.loyalty.disabled = !fields.customers.checked || !fields.sales.checked;
    if (fields.loyalty.disabled) fields.loyalty.checked = false;
    $("#reward").hidden = !fields.loyalty.checked;
  }
  form.addEventListener("change", event => {
    if (event.target === fields.lang) {
      const next = values();
      language = next.lang;
      localize();
      render();
      showSettings(next);
      announce();
      $("#configuration [name=lang]").focus();
      return;
    }
    syncModules();
  });
  syncModules();
  bindForm(form, async () => {
    const config = values();
    if (config.modules.loyalty && !Number.isInteger(config.reward)) {
      fields.reward.focus();
      throw new Error("invalid");
    }
    if (!Number.isInteger(config.reward)) config.reward = state?.settings.reward ?? 5;
    const wasSetup = !state;
    state = await api("settings", config);
    language = state.settings.lang;
    choosePage(wasSetup ? Object.keys(state.settings.modules).find(key => state.settings.modules[key]) : "settings", "saved");
  });
}

function normalizeSearch(text) {
  return normalizeDigits(text.normalize("NFKC").toLocaleLowerCase().replace(/ي/g, "ی").replace(/ك/g, "ک"))
    .replace(/[\p{Mn}\p{Cf}]/gu, "");
}

function table(headings, rows) {
  return `<div class="table-wrap"><table><thead><tr>${headings.map(key => `<th scope="col">${t(key)}</th>`).join("")}</tr></thead>
    <tbody>${rows.map(row => `<tr>${row.map(cell => `<td>${cell}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
}

function showCustomers() {
  header("customers");
  content.innerHTML = `<div class="split"><section class="card" id="customer-editor"></section><section class="card">
    ${input("search", t("search"), "", 'type="search" dir="auto"')}<div id="customer-list"></div></section></div>`;
  const search = $("[name=search]");
  function showList() {
    const query = normalizeSearch(search.value.trim());
    const list = Object.entries(state.customers).filter(([, c]) =>
      [c.name, c.phone, c.email].some(value => normalizeSearch(value).includes(query)));
    $("#customer-list").innerHTML = list.length ? table(["name", "phone", "email", "edit"], list.map(([id, c]) =>
      [`<bdi>${esc(c.name)}</bdi>`, `<bdi>${esc(c.phone)}</bdi>`, `<bdi>${esc(c.email)}</bdi>`,
        button("edit", `data-id="${id}" aria-label="${t("edit")} ${esc(c.name)}"`)])) : `<p>${t("emptyCustomers")}</p>`;
  }
  function editor(id) {
    const c = state.customers[id] || {};
    $("#customer-editor").innerHTML = `<h2>${t(id ? "editCustomer" : "addCustomer")}</h2><form novalidate>
      ${input("name", t("name"), c.name, "required maxlength=100 dir=auto")}
      ${input("phone", t("phone"), c.phone, 'maxlength=50 inputmode="tel" dir=ltr')}
      ${input("email", t("email"), c.email, 'maxlength=120 inputmode="email" dir=ltr')}
      ${input("notes", t("notes"), c.notes, "maxlength=200 dir=auto")}
      <div class="actions">${submit("save")}${id ? button("cancel", "id=cancel-edit") : ""}</div></form>`;
    const form = $("form", $("#customer-editor"));
    const requestId = id || crypto.randomUUID();
    bindForm(form, async formData => {
      await api("customer", {id: requestId, ...Object.fromEntries(formData)});
      await refresh();
      editor();
      showList();
      announce("saved");
      $("[name=name]", $("#customer-editor")).focus();
    });
    if (id) {
      $("#cancel-edit").onclick = () => { editor(); search.focus(); };
      $("[name=name]", form).focus();
    }
  }
  $("#customer-list").onclick = event => {
    if (event.target.dataset.id) editor(event.target.dataset.id);
  };
  search.oninput = showList;
  editor();
  showList();
}

function saleValues() {
  return Object.values(state.sales).sort((a, b) => b.invoice - a.invoice);
}

function amountCell(value) {
  return `<bdi class="money">${money(value)}</bdi>`;
}

function saleTable(sales) {
  if (!sales.length) return `<p>${t("emptySales")}</p>`;
  return table(["number", "day", "customer", "total", "net", "invoice"], sales.map(sale => [
    localNumber(sale.invoice), `<bdi class="date">${dayLabel(sale.day)}</bdi>`,
    `<bdi>${esc(sale.customer_name || t("walkIn"))}</bdi>`, amountCell(sale.total), amountCell(sale.total - sale.redeem),
    button("invoice", `data-invoice="${sale.id}" aria-label="${t("invoice")} ${localNumber(sale.invoice)}"`),
  ]));
}

function wallet(id) {
  return saleValues().filter(sale => sale.customer_id === id)
    .reduce((total, sale) => total + BigInt(sale.earned) - BigInt(sale.redeem), 0n);
}

function parseField(form, name, optional = false) {
  const control = form.elements[name];
  if (optional && !control.value.trim()) return "";
  const day = parseDay(control.value, language);
  if (!day) {
    control.focus();
    throw new Error("invalidDate");
  }
  return day;
}

function showSales() {
  header("sales");
  const enabled = state.settings.modules;
  const precision = currencies[state.settings.currency];
  content.innerHTML = `<section class="card"><h2>${t("newSale")}</h2><form novalidate id="sale-form">
    <div class="grid">${dateInput("day", dayLabel(today()))}
    ${enabled.customers ? `<label class="field"><span>${t("customer")}</span><select name="customer">${o("", t("walkIn"), "")}
      ${Object.entries(state.customers).map(([id, c]) => o(id, c.phone ? c.name + " · " + c.phone : c.name, "")).join("")}
    </select></label>` : ""}</div>
    <div class="lines" id="lines"></div>${button("addLine", "id=add-line")}
    ${enabled.loyalty ? `<div id="wallet-fields" hidden><p id="available"></p>
      ${input("redeem", t("redeem") + " · " + t(state.settings.currency), "", 'inputmode="decimal" maxlength="18"')}</div>` : ""}
    <p id="sale-total" aria-live="polite"></p>${submit("finishSale")}</form></section>
    <section class="card"><h2>${t("history")}</h2>${saleTable(saleValues())}</section>`;
  const form = $("#sale-form");
  const lines = $("#lines");
  function rows() {
    return [...lines.children].map(element => {
      const qty = normalizeDigits($("[name=qty]", element).value).trim();
      return {element, label: $("[name=item]", element).value.trim(),
        qty: /^\d+$/.test(qty) ? Number(qty) : NaN,
        price: fromMoney($("[name=price]", element).value, precision)};
    });
  }
  function updateTotal() {
    const total = rows().reduce((sum, line) => sum + line.qty * line.price, 0);
    $("#sale-total").textContent = Number.isSafeInteger(total) && total >= 0 && total <= 1e12 ? t("total") + " · " + money(total) : "";
  }
  function updateLines() {
    lines.querySelectorAll("[data-remove]").forEach(control => { control.disabled = lines.children.length === 1; });
    $("#add-line").disabled = lines.children.length >= 50;
    updateTotal();
  }
  function addLine(item = {}, focus = false) {
    const element = document.createElement("div");
    element.className = "line";
    const amount = item.price === undefined ? "" : (item.price / 10 ** precision).toFixed(precision);
    element.innerHTML = `${input("item", t("item"), item.label, "required maxlength=120 dir=auto")}
      ${input("qty", t("qty"), localNumber(item.qty || 1, {useGrouping: false}), 'required inputmode="numeric" maxlength="6"')}
      ${input("price", t("price") + " · " + t(state.settings.currency), amount, 'required inputmode="decimal" maxlength="18"')}
      ${button("remove", "data-remove")}`;
    lines.append(element);
    updateLines();
    if (focus) $("[name=item]", element).focus();
  }
  function updateWallet() {
    if (!enabled.loyalty) return;
    const id = form.elements.customer.value;
    $("#wallet-fields").hidden = !id;
    form.elements.redeem.disabled = !id;
    if (!id) form.elements.redeem.value = "";
    $("#available").textContent = id ? t("balance") + " · " + money(wallet(id)) : "";
  }
  if (pendingSale) {
    form.elements.day.value = dayLabel(pendingSale.day);
    if (form.elements.customer) form.elements.customer.value = pendingSale.customer_id || "";
    pendingSale.items.forEach(item => addLine(item));
    if (form.elements.redeem && pendingSale.redeem) {
      form.elements.redeem.value = (pendingSale.redeem / 10 ** precision).toFixed(precision);
    }
  } else addLine();
  updateWallet();
  $("#add-line").onclick = () => addLine({}, true);
  lines.onclick = event => {
    if (!event.target.hasAttribute("data-remove") || lines.children.length <= 1) return;
    event.target.closest(".line").remove();
    updateLines();
    $("#add-line").focus();
  };
  form.addEventListener("input", updateTotal);
  form.elements.customer?.addEventListener("change", updateWallet);
  bindForm(form, async () => {
    const day = parseField(form, "day");
    const lines = rows();
    for (const line of lines) {
      if (!Number.isInteger(line.qty) || line.qty < 1 || line.qty > 100000) {
        $("[name=qty]", line.element).focus();
        throw new Error("invalid");
      }
      if (!Number.isSafeInteger(line.price) || line.price < 1) {
        $("[name=price]", line.element).focus();
        throw new Error("invalidAmount");
      }
    }
    const customer_id = form.elements.customer?.value || null;
    const rawRedeem = customer_id && enabled.loyalty ? form.elements.redeem.value.trim() : "";
    const redeem = rawRedeem ? fromMoney(rawRedeem, precision) : 0;
    if (!Number.isSafeInteger(redeem)) {
      form.elements.redeem.focus();
      throw new Error("invalidAmount");
    }
    const items = lines.map(({label, qty, price}) => ({label, qty, price}));
    const draft = {id: pendingSale?.id || crypto.randomUUID(), day, customer_id, items, redeem};
    pendingSale = draft;
    let saved;
    try {
      saved = await api("sale", draft);
    } catch (error) {
      if (error.message !== "connection" && error.message !== "storage") pendingSale = null;
      throw error;
    }
    await refresh();
    pendingSale = null;
    if (page === "sales") {
      render();
      showInvoice(saved);
      announce("saleSaved");
    }
  });
  registerInvoiceLinks();
}

function registerInvoiceLinks() {
  content.onclick = event => {
    if (event.target.dataset.invoice) showInvoice(state.sales[event.target.dataset.invoice]);
  };
}

function showInvoice(sale) {
  const invoice = $("#invoice");
  const issuer = sale.issuer;
  invoice.innerHTML = `<h1 tabindex="-1">${t("invoice")} <bdi>${localNumber(sale.invoice)}</bdi></h1>
    <p><strong dir="auto">${esc(issuer.brand)}</strong><br><bdi>${esc(issuer.address)}</bdi><br><bdi>${esc(issuer.contact)}</bdi></p>
    <p>${t("day")} · <bdi>${dayLabel(sale.day)}</bdi><br>${t("customer")} · <bdi>${esc(sale.customer_name || t("walkIn"))}</bdi></p>
    ${table(["item", "qty", "price", "total"], sale.items.map(item => [`<bdi>${esc(item.label)}</bdi>`, localNumber(item.qty),
      amountCell(item.price), amountCell(item.qty * item.price)]))}
    <p>${t("total")} · ${amountCell(sale.total)}<br>${t("net")} · ${amountCell(sale.total - sale.redeem)}
      ${sale.redeem ? `<br>${t("redeem")} · ${amountCell(sale.redeem)}` : ""}
      ${sale.earned ? `<br>${t("earned")} · ${amountCell(sale.earned)}` : ""}</p>
    <div class="actions print-controls">${button("print", "id=print-invoice")}${button("close", "id=close-invoice")}</div>`;
  $("#layout").hidden = true;
  invoice.hidden = false;
  $("h1", invoice).focus();
  $("#print-invoice").onclick = () => window.print();
  $("#close-invoice").onclick = () => {
    invoice.hidden = true;
    $("#layout").hidden = false;
    const link = content.querySelector(`[data-invoice="${sale.id}"]`);
    (link || $("#main")).focus();
  };
}

function showLoyalty() {
  header("loyalty");
  const customers = Object.entries(state.customers);
  const activity = saleValues().filter(sale => sale.earned || sale.redeem);
  content.innerHTML = `<section class="card"><h2>${t("balance")}</h2>
    ${customers.length ? table(["customer", "balance"], customers.map(([id, c]) => [
      `<bdi>${esc(c.name)}</bdi>`, amountCell(wallet(id)),
    ])) : `<p>${t("emptyCustomers")}</p>`}</section>
    <section class="card"><h2>${t("walletHistory")}</h2>
    ${activity.length ? table(["number", "day", "customer", "earned", "redeem"], activity.map(sale => [
      localNumber(sale.invoice), `<bdi>${dayLabel(sale.day)}</bdi>`, `<bdi>${esc(sale.customer_name)}</bdi>`,
      amountCell(sale.earned), amountCell(sale.redeem),
    ])) : `<p>${t("emptySales")}</p>`}</section>`;
}

function showReports() {
  header("reports");
  const sales = saleValues().filter(sale => (!filters.from || sale.day >= filters.from) && (!filters.to || sale.day <= filters.to));
  const total = sales.reduce((sum, sale) => sum + BigInt(sale.total), 0n);
  const net = sales.reduce((sum, sale) => sum + BigInt(sale.total - sale.redeem), 0n);
  content.innerHTML = `<section class="card"><form id="report-filter" novalidate><div class="grid">
    ${dateInput("from", filters.from ? dayLabel(filters.from) : "")}
    ${dateInput("to", filters.to ? dayLabel(filters.to) : "")}</div>
    <div class="actions">${submit("filter")}${button("clear", "id=clear-dates")}</div></form></section>
    <section class="card"><div class="metrics">${[["count", localNumber(sales.length)], ["total", amountCell(total)], ["net", amountCell(net)]]
      .map(([key, value]) => `<div class="metric">${t(key)}<strong>${value}</strong></div>`).join("")}</div>
    ${saleTable(sales)}</section>`;
  bindForm($("#report-filter"), async (_, form) => {
    const from = parseField(form, "from", true);
    const to = parseField(form, "to", true);
    if (from && to && from > to) throw new Error("dateOrder");
    filters = {from, to};
    showReports();
    $("[name=from]", content).focus();
  });
  $("#clear-dates").onclick = () => {
    filters = {from: "", to: ""};
    announce();
    showReports();
    $("[name=from]", content).focus();
  };
  registerInvoiceLinks();
}

function showBackup() {
  header("backup");
  content.innerHTML = `<section class="card"><p>${t("backupHelp")}</p>${state ? button("export", "id=download-backup") : ""}
    </section><section class="card"><h2>${t("import")}</h2><p>${t("restoreHelp")}</p>
    <form id="restore-form" novalidate><label class="field"><span>${t("file")}</span>
      <span class="file-picker"><span class="file-button">${t("chooseFile")}</span>
        <span id="file-name" dir="auto">${t("noFile")}</span>
        <input name="backup" type="file" accept=".json,application/json" required>
      </span></label>
    <p>${check("ack", false, "ack")}</p>${submit("import")}</form></section>`;
  if (state) $("#download-backup").onclick = async () => {
    try {
      await refresh();
      const url = URL.createObjectURL(new Blob([JSON.stringify(state, null, 2)], {type: "application/json"}));
      const link = document.createElement("a");
      link.href = url;
      link.download = "DeskLedger-" + today() + ".json";
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) { announce(error.message, true); }
  };
  const form = $("#restore-form");
  form.elements.backup.onchange = () => {
    $("#file-name").textContent = form.elements.backup.files[0]?.name || t("noFile");
  };
  bindForm(form, async (data, form) => {
    if (!data.has("ack")) {
      form.elements.ack.focus();
      throw new Error("required");
    }
    const file = data.get("backup");
    if (file.size >= 30 * 1024 * 1024) throw new Error("fileSize");
    let backup;
    try {
      backup = JSON.parse(await file.text());
    } catch { throw new Error("invalid"); }
    state = await api("restore", {ack: true, backup});
    language = state.settings.lang;
    pendingSale = null;
    filters = {from: "", to: ""};
    choosePage("backup", "restored");
  });
}

refresh().then(() => {
  if (state) page = Object.keys(state.settings.modules).find(key => state.settings.modules[key]);
  render();
}).catch(error => {
  localize();
  header("setup");
  announce(error.message === "forbidden" ? "connection" : error.message, true);
});
