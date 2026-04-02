const express = require('express');
const Database = require('better-sqlite3');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

/* ===== 資料庫初始化 ===== */
const fs = require('fs');
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
const db = new Database(path.join(dataDir, 'order.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS employees (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    floor INTEGER NOT NULL DEFAULT 11,
    role TEXT NOT NULL DEFAULT ''
  );

  CREATE TABLE IF NOT EXISTS vendors (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    phone TEXT DEFAULT '',
    note TEXT DEFAULT '',
    image TEXT DEFAULT ''
  );

  CREATE TABLE IF NOT EXISTS vendor_menu_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    vendor_id TEXT NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    price INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS daily_menus (
    id TEXT PRIMARY KEY,
    date TEXT NOT NULL,
    name TEXT NOT NULL,
    price INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY,
    date TEXT NOT NULL,
    employee_id TEXT NOT NULL,
    employee_name TEXT NOT NULL,
    floor INTEGER,
    total INTEGER NOT NULL DEFAULT 0,
    paid INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS order_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    menu_item_id TEXT NOT NULL,
    name TEXT NOT NULL,
    price INTEGER NOT NULL,
    qty INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS daily_settings (
    date TEXT NOT NULL,
    key TEXT NOT NULL,
    value TEXT,
    PRIMARY KEY (date, key)
  );
`);

/* ===== 工具函式 ===== */
function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function todayStr() {
  const d = new Date();
  return d.getFullYear() + '-' +
    String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0');
}

/* ===== 員工 API ===== */
app.get('/api/employees', (req, res) => {
  const rows = db.prepare('SELECT * FROM employees ORDER BY floor, name').all();
  res.json(rows);
});

app.post('/api/employees', (req, res) => {
  const { name, floor, role } = req.body;
  if (!name) return res.status(400).json({ error: '請輸入員工姓名' });
  const id = genId();
  db.prepare('INSERT INTO employees (id, name, floor, role) VALUES (?, ?, ?, ?)').run(id, name, floor || 11, role || '');
  res.json({ id, name, floor: floor || 11, role: role || '' });
});

app.delete('/api/employees/:id', (req, res) => {
  db.prepare('DELETE FROM employees WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

app.get('/api/employees/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM employees WHERE id = ?').get(req.params.id);
  res.json(row || null);
});

/* ===== 商家 API ===== */
app.get('/api/vendors', (req, res) => {
  const vendors = db.prepare('SELECT * FROM vendors ORDER BY name').all();
  const menuItems = db.prepare('SELECT * FROM vendor_menu_items ORDER BY id').all();
  vendors.forEach(v => {
    v.menu = menuItems.filter(m => m.vendor_id === v.id).map(m => ({ name: m.name, price: m.price }));
  });
  res.json(vendors);
});

app.post('/api/vendors', (req, res) => {
  const { name, phone, note } = req.body;
  if (!name) return res.status(400).json({ error: '請輸入商家名稱' });
  const id = genId();
  db.prepare('INSERT INTO vendors (id, name, phone, note) VALUES (?, ?, ?, ?)').run(id, name, phone || '', note || '');
  res.json({ id, name, phone: phone || '', note: note || '', menu: [], image: '' });
});

app.put('/api/vendors/:id', (req, res) => {
  const vendor = db.prepare('SELECT * FROM vendors WHERE id = ?').get(req.params.id);
  if (!vendor) return res.status(404).json({ error: '商家不存在' });
  const updates = req.body;
  if (updates.phone !== undefined) db.prepare('UPDATE vendors SET phone = ? WHERE id = ?').run(updates.phone, req.params.id);
  if (updates.note !== undefined) db.prepare('UPDATE vendors SET note = ? WHERE id = ?').run(updates.note, req.params.id);
  if (updates.image !== undefined) db.prepare('UPDATE vendors SET image = ? WHERE id = ?').run(updates.image, req.params.id);
  if (updates.menu !== undefined) {
    db.prepare('DELETE FROM vendor_menu_items WHERE vendor_id = ?').run(req.params.id);
    const insert = db.prepare('INSERT INTO vendor_menu_items (vendor_id, name, price) VALUES (?, ?, ?)');
    updates.menu.forEach(m => insert.run(req.params.id, m.name, m.price));
  }
  res.json({ ok: true });
});

app.delete('/api/vendors/:id', (req, res) => {
  db.prepare('DELETE FROM vendors WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

app.get('/api/vendors/:id', (req, res) => {
  const vendor = db.prepare('SELECT * FROM vendors WHERE id = ?').get(req.params.id);
  if (!vendor) return res.json(null);
  const menuItems = db.prepare('SELECT name, price FROM vendor_menu_items WHERE vendor_id = ? ORDER BY id').all(req.params.id);
  vendor.menu = menuItems;
  res.json(vendor);
});

/* ===== 每日菜單 API ===== */
app.get('/api/menu/:date', (req, res) => {
  const rows = db.prepare('SELECT * FROM daily_menus WHERE date = ?').all(req.params.date);
  res.json(rows);
});

app.post('/api/menu/:date', (req, res) => {
  const { items } = req.body; // array of { name, price }
  // 清除舊菜單再寫入
  db.prepare('DELETE FROM daily_menus WHERE date = ?').run(req.params.date);
  const insert = db.prepare('INSERT INTO daily_menus (id, date, name, price) VALUES (?, ?, ?, ?)');
  const result = [];
  items.forEach(item => {
    const id = item.id || genId();
    insert.run(id, req.params.date, item.name, item.price);
    result.push({ id, date: req.params.date, name: item.name, price: item.price });
  });
  res.json(result);
});

app.post('/api/menu/:date/item', (req, res) => {
  const { name, price } = req.body;
  const id = genId();
  db.prepare('INSERT INTO daily_menus (id, date, name, price) VALUES (?, ?, ?, ?)').run(id, req.params.date, name, price);
  res.json({ id, date: req.params.date, name, price });
});

app.delete('/api/menu/:date/:id', (req, res) => {
  db.prepare('DELETE FROM daily_menus WHERE id = ? AND date = ?').run(req.params.id, req.params.date);
  res.json({ ok: true });
});

/* ===== 訂單 API ===== */
app.get('/api/orders/:date', (req, res) => {
  const orders = db.prepare('SELECT * FROM orders WHERE date = ?').all(req.params.date);
  const allItems = db.prepare(
    'SELECT oi.* FROM order_items oi JOIN orders o ON oi.order_id = o.id WHERE o.date = ?'
  ).all(req.params.date);
  orders.forEach(o => {
    o.employeeId = o.employee_id;
    o.employeeName = o.employee_name;
    o.createdAt = o.created_at;
    o.items = allItems.filter(i => i.order_id === o.id).map(i => ({
      menuItemId: i.menu_item_id,
      name: i.name,
      price: i.price,
      qty: i.qty
    }));
  });
  res.json(orders);
});

app.post('/api/orders/:date', (req, res) => {
  const { employeeId, employeeName, floor, items, total } = req.body;
  const id = genId();
  const createdAt = new Date().toISOString();
  db.prepare(
    'INSERT INTO orders (id, date, employee_id, employee_name, floor, total, paid, created_at) VALUES (?, ?, ?, ?, ?, ?, 0, ?)'
  ).run(id, req.params.date, employeeId, employeeName, floor, total, createdAt);
  const insert = db.prepare('INSERT INTO order_items (order_id, menu_item_id, name, price, qty) VALUES (?, ?, ?, ?, ?)');
  items.forEach(it => insert.run(id, it.menuItemId, it.name, it.price, it.qty));
  res.json({ id, employeeId, employeeName, floor, items, total, paid: false, createdAt });
});

app.put('/api/orders/:date/:id', (req, res) => {
  const { items, total } = req.body;
  if (items !== undefined && total !== undefined) {
    db.prepare('UPDATE orders SET total = ? WHERE id = ?').run(total, req.params.id);
    db.prepare('DELETE FROM order_items WHERE order_id = ?').run(req.params.id);
    const insert = db.prepare('INSERT INTO order_items (order_id, menu_item_id, name, price, qty) VALUES (?, ?, ?, ?, ?)');
    items.forEach(it => insert.run(req.params.id, it.menuItemId, it.name, it.price, it.qty));
  }
  if (req.body.paid !== undefined) {
    db.prepare('UPDATE orders SET paid = ? WHERE id = ?').run(req.body.paid ? 1 : 0, req.params.id);
  }
  res.json({ ok: true });
});

app.delete('/api/orders/:date/:id', (req, res) => {
  db.prepare('DELETE FROM orders WHERE id = ? AND date = ?').run(req.params.id, req.params.date);
  res.json({ ok: true });
});

/* ===== 每日設定 API（截止時間、商家、菜單圖片） ===== */
app.get('/api/settings/:date', (req, res) => {
  const rows = db.prepare('SELECT key, value FROM daily_settings WHERE date = ?').all(req.params.date);
  const settings = {};
  rows.forEach(r => { settings[r.key] = r.value; });
  res.json(settings);
});

app.put('/api/settings/:date', (req, res) => {
  const upsert = db.prepare(
    'INSERT INTO daily_settings (date, key, value) VALUES (?, ?, ?) ON CONFLICT(date, key) DO UPDATE SET value = excluded.value'
  );
  for (const [key, value] of Object.entries(req.body)) {
    if (value === null) {
      db.prepare('DELETE FROM daily_settings WHERE date = ? AND key = ?').run(req.params.date, key);
    } else {
      upsert.run(req.params.date, key, value);
    }
  }
  res.json({ ok: true });
});

/* ===== 初始化預設資料 ===== */
const empCount = db.prepare('SELECT COUNT(*) as c FROM employees').get().c;
if (empCount === 0) {
  const defaults = [
    { name: '葉泉亨 Adam', floor: 19, role: '資通安全長' },
    { name: '楊松樺 David', floor: 11, role: '資安主管' },
    { name: '陳彥丞 Leon', floor: 11, role: '資安承辦' },
    { name: '張劭艾 Alex', floor: 11, role: '資安小組 / 單位主管 / 稽核' },
    { name: '龔怡貞 Ada', floor: 19, role: '專案部主管' },
    { name: '施玟安 Anna', floor: 19, role: '內部稽核' },
    { name: '李泰成 Daniel', floor: 11, role: 'RD技術人員' },
    { name: '蘇韋嫡 Wendy', floor: 11, role: 'RD技術人員' },
    { name: '呂世宥 Lasy', floor: 11, role: 'RD技術人員' },
    { name: '周柏叡 Ray', floor: 11, role: '標記工程師' },
    { name: '陳恆中 Chen', floor: 11, role: '標記工程師' },
    { name: '李亞翰 Hank', floor: 11, role: '標記工程師' },
    { name: '何嘉嘉 Jasmine', floor: 19, role: '專案經理' },
    { name: '劉謙玉 Sandy', floor: 19, role: '專案經理' },
    { name: '楊清逸 Serene', floor: 19, role: '專案經理' },
    { name: '李欣樺 Mico', floor: 19, role: '設計師' },
    { name: '林芯敏 Sidney', floor: 19, role: '會計師' },
  ];
  const insert = db.prepare('INSERT INTO employees (id, name, floor, role) VALUES (?, ?, ?, ?)');
  defaults.forEach(e => insert.run(genId(), e.name, e.floor, e.role));
  console.log('已初始化預設員工資料');
}

/* ===== 啟動 ===== */
app.listen(PORT, () => {
  console.log(`瑞艾呷奔趣伺服器已啟動：http://localhost:${PORT}`);
});
