"use strict";

const messages = {
  setup: ["Set up DeskLedger", "راه‌اندازی دسک‌لجر", "إعداد ديسك ليدجر"],
  setupHelp: ["Choose your language, business details and the tools you need.", "زبان، مشخصات کسب‌وکار و امکانات موردنیازتان را انتخاب کنید.", "اختر لغتك وأدخل بيانات نشاطك وحدد الأدوات التي تحتاجها."],
  language: ["Language", "زبان", "اللغة"],
  brand: ["Business name", "نام کسب‌وکار", "اسم النشاط التجاري"],
  contact: ["Business contact", "راه ارتباطی کسب‌وکار", "بيانات الاتصال بالنشاط"],
  address: ["Business address", "نشانی کسب‌وکار", "عنوان النشاط"],
  currency: ["Currency", "واحد پول", "العملة"],
  modules: ["Modules", "ماژول‌ها", "الوحدات"],
  moduleHelp: ["Loyalty requires Customers and Sales. Turning off a module keeps its records.", "وفاداری به ماژول‌های مشتریان و فروش نیاز دارد. خاموش‌کردن ماژول، سوابق آن را نگه می‌دارد.", "يتطلب الولاء تفعيل العملاء والمبيعات. إيقاف الوحدة يبقي سجلاتها."],
  reward: ["Reward rate (%)", "درصد اعتبار وفاداری", "نسبة مكافأة الولاء (%)"],
  save: ["Save", "ذخیره", "حفظ"],
  start: ["Start using DeskLedger", "شروع کار با دسک‌لجر", "ابدأ استخدام ديسك ليدجر"],
  settings: ["Settings", "تنظیمات", "الإعدادات"],
  customers: ["Customers", "مشتریان", "العملاء"],
  sales: ["Sales", "فروش", "المبيعات"],
  loyalty: ["Loyalty", "وفاداری", "الولاء"],
  reports: ["Reports", "گزارش‌ها", "التقارير"],
  backup: ["Backup", "پشتیبان", "النسخ الاحتياطي"],
  addCustomer: ["Add customer", "افزودن مشتری", "إضافة عميل"],
  editCustomer: ["Edit customer", "ویرایش مشتری", "تعديل العميل"],
  name: ["Name", "نام", "الاسم"],
  phone: ["Phone", "تلفن", "الهاتف"],
  email: ["Email", "ایمیل", "البريد الإلكتروني"],
  notes: ["Notes", "یادداشت", "ملاحظات"],
  search: ["Search by name, phone or email", "جست‌وجو با نام، تلفن یا ایمیل", "البحث بالاسم أو الهاتف أو البريد الإلكتروني"],
  emptyCustomers: ["No customers found.", "مشتری‌ای پیدا نشد.", "لم يتم العثور على عملاء."],
  edit: ["Edit", "ویرایش", "تعديل"],
  cancel: ["Cancel", "انصراف", "إلغاء"],
  balance: ["Wallet balance", "موجودی کیف پول", "رصيد المحفظة"],
  newSale: ["New sale", "فروش جدید", "عملية بيع جديدة"],
  customer: ["Customer", "مشتری", "العميل"],
  walkIn: ["Walk-in", "رهگذری", "عميل عابر"],
  day: ["Sale date", "تاریخ فروش", "تاريخ البيع"],
  item: ["Item or service", "کالا یا خدمت", "الصنف أو الخدمة"],
  qty: ["Quantity", "تعداد", "الكمية"],
  price: ["Unit price", "قیمت واحد", "سعر الوحدة"],
  number: ["Invoice number", "شمارهٔ فاکتور", "رقم الفاتورة"],
  addLine: ["Add line", "افزودن ردیف", "إضافة بند"],
  remove: ["Remove", "حذف", "حذف"],
  total: ["Total sales", "مبلغ فروش", "إجمالي المبيعات"],
  net: ["Net paid", "مبلغ پرداختی", "صافي المدفوع"],
  redeem: ["Wallet credit used", "اعتبار مصرف‌شده", "رصيد المحفظة المستخدم"],
  earned: ["Wallet credit earned", "اعتبار کسب‌شده", "رصيد المحفظة المكتسب"],
  finishSale: ["Record sale", "ثبت فروش", "تسجيل البيع"],
  history: ["Sales history", "سوابق فروش", "سجل المبيعات"],
  emptySales: ["No sales in this view.", "فروشی در این نما وجود ندارد.", "لا توجد مبيعات في هذا العرض."],
  invoice: ["Invoice", "فاکتور", "فاتورة"],
  print: ["Print invoice", "چاپ فاکتور", "طباعة الفاتورة"],
  close: ["Close", "بستن", "إغلاق"],
  from: ["From date", "از تاریخ", "من تاريخ"],
  to: ["To date", "تا تاریخ", "إلى تاريخ"],
  filter: ["Apply dates", "اعمال بازه", "تطبيق التواريخ"],
  clear: ["Clear dates", "پاک‌کردن بازه", "مسح التواريخ"],
  count: ["Sales count", "تعداد فروش", "عدد عمليات البيع"],
  walletHistory: ["Wallet activity", "گردش کیف پول", "حركة المحفظة"],
  export: ["Download backup", "دانلود پشتیبان", "تنزيل النسخة الاحتياطية"],
  import: ["Restore backup", "بازیابی پشتیبان", "استعادة النسخة الاحتياطية"],
  backupHelp: ["A backup contains your settings and business records. Keep a copy somewhere safe.", "پشتیبان شامل تنظیمات و سوابق کسب‌وکار است. یک نسخه را در جای امن نگه دارید.", "تحتوي النسخة على الإعدادات وسجلات النشاط التجاري. احتفظ بنسخة في مكان آمن."],
  restoreHelp: ["Restoring replaces the current settings and records. Download a backup first if you need them.", "بازیابی جایگزین تنظیمات و سوابق فعلی می‌شود. برای نگهداری سوابق فعلی، ابتدا پشتیبان بگیرید.", "تستبدل الاستعادة الإعدادات والسجلات الحالية. نزّل نسخة احتياطية أولًا إذا كنت بحاجة إليها."],
  chooseFile: ["Choose file", "انتخاب فایل", "اختيار ملف"],
  noFile: ["No file selected", "فایلی انتخاب نشده", "لم يتم اختيار ملف"],
  file: ["Backup file (.json)", "فایل پشتیبان (JSON)", "ملف النسخة الاحتياطية (JSON)"],
  ack: ["Replace the current data with this backup", "داده‌های فعلی با این پشتیبان جایگزین شوند", "استبدال البيانات الحالية بهذه النسخة"],
  restored: ["Backup restored.", "پشتیبان بازیابی شد.", "تمت استعادة النسخة الاحتياطية."],
  saved: ["Saved.", "ذخیره شد.", "تم الحفظ."],
  saleSaved: ["Sale recorded.", "فروش ثبت شد.", "تم تسجيل البيع."],
  skip: ["Skip to content", "رفتن به محتوا", "الانتقال إلى المحتوى"],
  navigation: ["Main navigation", "ناوبری اصلی", "التنقل الرئيسي"],
  invalid: ["Check the entered values and try again.", "مقادیر واردشده را بررسی کنید و دوباره تلاش کنید.", "تحقق من القيم المدخلة وحاول مرة أخرى."],
  required: ["Complete this field.", "این فیلد را پر کنید.", "أكمل هذا الحقل."],
  invalidDate: ["Enter a valid date using the displayed format.", "تاریخ معتبر را با قالب نمایش‌داده‌شده وارد کنید.", "أدخل تاريخًا صالحًا بالصيغة المعروضة."],
  dateOrder: ["The end date must be on or after the start date.", "تاریخ پایان باید برابر یا بعد از تاریخ شروع باشد.", "يجب أن يساوي تاريخ الانتهاء تاريخ البدء أو يليه."],
  invalidAmount: ["Enter an amount with the precision of the selected currency.", "مبلغ را با دقت واحد پول انتخاب‌شده وارد کنید.", "أدخل مبلغًا بعدد المنازل العشرية المناسبة للعملة المحددة."],
  currencyLocked: ["The currency is fixed after the first sale.", "واحد پول پس از اولین فروش ثابت می‌ماند.", "تُثبّت العملة بعد أول عملية بيع."],
  dependency: ["Enable Customers and Sales to use Loyalty.", "برای وفاداری، مشتریان و فروش را فعال کنید.", "فعّل العملاء والمبيعات لاستخدام الولاء."],
  invalidCustomer: ["Select an available customer.", "یک مشتری موجود را انتخاب کنید.", "اختر عميلًا متاحًا."],
  insufficient: ["The wallet cannot cover this amount.", "موجودی کیف پول برای این مبلغ کافی نیست.", "رصيد المحفظة لا يكفي لهذا المبلغ."],
  disabled: ["This module is disabled in Settings.", "این ماژول در تنظیمات غیرفعال است.", "هذه الوحدة معطّلة في الإعدادات."],
  duplicate: ["This sale was already recorded with different details. Open Sales history to check it.", "این فروش با مشخصات دیگری ثبت شده است. سوابق فروش را بررسی کنید.", "سُجّلت هذه العملية بتفاصيل أخرى. تحقق من سجل المبيعات."],
  badVersion: ["This backup version is unsupported.", "نسخهٔ این پشتیبان پشتیبانی نمی‌شود.", "إصدار هذه النسخة الاحتياطية غير مدعوم."],
  fileSize: ["The file must be smaller than 30 MB.", "حجم فایل باید کمتر از ۳۰ مگابایت باشد.", "يجب أن يكون حجم الملف أقل من ٣٠ ميغابايت."],
  storage: ["Storage could not complete the operation. Try again.", "عملیات ذخیره‌سازی انجام نشد. دوباره تلاش کنید.", "تعذّر إكمال عملية التخزين. حاول مرة أخرى."],
  connection: ["Open the local DeskLedger launcher and reload this page.", "برنامهٔ محلی دسک‌لجر را باز و صفحه را تازه کنید.", "افتح مشغّل ديسك ليدجر المحلي ثم أعد تحميل الصفحة."],
  forbidden: ["Refresh the page to reconnect to DeskLedger.", "برای اتصال دوباره به دسک‌لجر صفحه را تازه کنید.", "حدّث الصفحة لإعادة الاتصال بديسك ليدجر."],
  setupRequired: ["Complete setup first.", "ابتدا راه‌اندازی را کامل کنید.", "أكمل الإعداد أولًا."],
  notFound: ["This page is unavailable.", "این صفحه در دسترس نیست.", "هذه الصفحة غير متاحة."],
  IRT: ["Toman", "تومان", "تومان"],
  IRR: ["Iranian rial", "ریال ایران", "ريال إيراني"],
  USD: ["US dollar", "دلار آمریکا", "دولار أمريكي"],
  EUR: ["Euro", "یورو", "يورو"],
  AED: ["UAE dirham", "درهم امارات", "درهم إماراتي"],
  SAR: ["Saudi riyal", "ریال سعودی", "ريال سعودي"],
  IQD: ["Iraqi dinar", "دینار عراق", "دينار عراقي"],
};

const languages = { en: "English", fa: "فارسی", ar: "العربية" };
const locales = { en: "en-GB-u-ca-gregory-nu-latn", fa: "fa-IR-u-ca-persian-nu-arabext", ar: "ar-SA-u-ca-islamic-umalqura-nu-arab" };
const currencies = { IRT: 0, IRR: 0, USD: 2, EUR: 2, AED: 2, SAR: 2, IQD: 3 };

function normalizeDigits(text) {
  return String(text).replace(/[۰-۹٠-٩]/g, ch => "۰۱۲۳۴۵۶۷۸۹".includes(ch)
    ? "۰۱۲۳۴۵۶۷۸۹".indexOf(ch) : "٠١٢٣٤٥٦٧٨٩".indexOf(ch));
}

function fromMoney(text, precision) {
  const value = normalizeDigits(text).trim().replace(/٫/g, ".");
  const [whole, fraction = ""] = value.split(".");
  if (!/^\d+(\.\d+)?$/.test(value) || fraction.length > precision) return NaN;
  const result = Number(whole) * 10 ** precision + Number(fraction.padEnd(precision, "0"));
  return Number.isSafeInteger(result) && result <= 1e12 ? result : NaN;
}

function dateParts(day, language) {
  const formatter = new Intl.DateTimeFormat(locales[language], {year: "numeric", month: "2-digit", day: "2-digit", timeZone: "UTC"});
  const parts = Object.fromEntries(formatter.formatToParts(new Date(day + "T12:00:00Z")).map(p => [p.type, p.value]));
  return [parts.year, parts.month, parts.day];
}

function displayDay(day, language) {
  return dateParts(day, language).join("/");
}

function parseDay(text, language) {
  const value = normalizeDigits(text).trim().replace(/-/g, "/");
  if (!/^\d{4}\/\d{1,2}\/\d{1,2}$/.test(value)) return null;
  const [year, month, day] = value.split("/").map(Number);
  const guess = year + ({en: 0, fa: 621, ar: 622 - Math.floor(year / 33)}[language]);
  if (guess < 1898 || guess > 2202 || month < 1 || month > 12 || day < 1 || day > 31) return null;
  let low = Date.UTC(Math.max(1900, guess - 2), 0, 1) / 86400000;
  let high = Date.UTC(Math.min(2200, guess + 2), 11, 31) / 86400000;
  const target = year * 10000 + month * 100 + day;
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const iso = new Date(mid * 86400000).toISOString().slice(0, 10);
    const [y, m, d] = dateParts(iso, language).map(v => Number(normalizeDigits(v)));
    const rendered = y * 10000 + m * 100 + d;
    if (rendered === target) return iso;
    if (rendered < target) low = mid + 1;
    else high = mid - 1;
  }
  return null;
}
