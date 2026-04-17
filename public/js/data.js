/* ===== 資料層 — REST API ===== */

const API = '';

/* ---------- 簡易快取：同一秒內相同 URL 不重複 fetch ---------- */
const _cache = {};
const CACHE_TTL = 1500; // ms

async function cachedFetch(url) {
  const now = Date.now();
  if (_cache[url] && now - _cache[url].time < CACHE_TTL) {
    return _cache[url].data;
  }
  const res = await fetch(url);
  const data = await res.json();
  _cache[url] = { data, time: now };
  return data;
}

function invalidateCache(prefix) {
  for (const key of Object.keys(_cache)) {
    if (!prefix || key.includes(prefix)) delete _cache[key];
  }
}

const DB = {
  /* ---------- 員工 ---------- */
  async getEmployees() {
    return cachedFetch(`${API}/api/employees`);
  },
  async addEmployee(emp) {
    invalidateCache('/api/employees');
    const res = await fetch(`${API}/api/employees`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(emp)
    });
    return res.json();
  },
  async deleteEmployee(id) {
    invalidateCache('/api/employees');
    await fetch(`${API}/api/employees/${id}`, { method: 'DELETE' });
  },
  async getEmployee(id) {
    return cachedFetch(`${API}/api/employees/${id}`);
  },

  /* ---------- 開團 ---------- */
  async getGroups(date) {
    return cachedFetch(`${API}/api/groups/${date || todayStr()}`);
  },
  async getGroupImage(groupId) {
    const data = await cachedFetch(`${API}/api/group-image/${groupId}`);
    return data.menu_image || '';
  },
  async addGroup(name, date) {
    invalidateCache('/api/groups');
    const res = await fetch(`${API}/api/groups/${date || todayStr()}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name })
    });
    return res.json();
  },
  async updateGroup(id, updates) {
    invalidateCache('/api/groups');
    invalidateCache('/api/group-image');
    await fetch(`${API}/api/groups/${id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates)
    });
  },
  async deleteGroup(id) {
    invalidateCache('/api/groups');
    await fetch(`${API}/api/groups/${id}`, { method: 'DELETE' });
  },

  /* ---------- 每日菜單 ---------- */
  async getMenu(date, groupId) {
    let url = `${API}/api/menu/${date || todayStr()}`;
    if (groupId) url += `?group_id=${groupId}`;
    return cachedFetch(url);
  },
  async saveMenu(items, date, groupId) {
    invalidateCache('/api/menu');
    const res = await fetch(`${API}/api/menu/${date || todayStr()}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items, group_id: groupId || '' })
    });
    return res.json();
  },
  async addMenuItem(item, date, groupId) {
    invalidateCache('/api/menu');
    const res = await fetch(`${API}/api/menu/${date || todayStr()}/item`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...item, group_id: groupId || '' })
    });
    return res.json();
  },
  async deleteMenuItem(id, date) {
    invalidateCache('/api/menu');
    await fetch(`${API}/api/menu/${date || todayStr()}/${id}`, { method: 'DELETE' });
  },

  /* ---------- 訂單 ---------- */
  async getOrders(date, groupId) {
    let url = `${API}/api/orders/${date || todayStr()}`;
    if (groupId) url += `?group_id=${groupId}`;
    return cachedFetch(url);
  },
  async addOrder(order, date) {
    invalidateCache('/api/orders');
    const res = await fetch(`${API}/api/orders/${date || todayStr()}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(order)
    });
    return res.json();
  },
  async updateOrder(id, updates, date) {
    invalidateCache('/api/orders');
    await fetch(`${API}/api/orders/${date || todayStr()}/${id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates)
    });
  },
  async deleteOrder(id, date) {
    invalidateCache('/api/orders');
    await fetch(`${API}/api/orders/${date || todayStr()}/${id}`, { method: 'DELETE' });
  },
  async getOrderDates(employeeId) {
    const url = employeeId ? `${API}/api/order-dates?employeeId=${employeeId}` : `${API}/api/order-dates`;
    return cachedFetch(url);
  },

  /* ---------- 商家資料庫 ---------- */
  async getVendors() {
    return cachedFetch(`${API}/api/vendors`);
  },
  async addVendor(vendor) {
    invalidateCache('/api/vendors');
    const res = await fetch(`${API}/api/vendors`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(vendor)
    });
    return res.json();
  },
  async updateVendor(id, updates) {
    invalidateCache('/api/vendors');
    await fetch(`${API}/api/vendors/${id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates)
    });
  },
  async deleteVendor(id) {
    invalidateCache('/api/vendors');
    await fetch(`${API}/api/vendors/${id}`, { method: 'DELETE' });
  },
  async getVendor(id) {
    return cachedFetch(`${API}/api/vendors/${id}`);
  },
};

/* ===== 工具函式 ===== */
function todayStr() {
  const d = new Date();
  return d.getFullYear() + '-' +
    String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0');
}

function formatPrice(n) {
  return '$' + Number(n).toLocaleString();
}

function showToast(msg, type = 'success') {
  let container = document.querySelector('.toast-container');
  if (!container) {
    container = document.createElement('div');
    container.className = 'toast-container';
    document.body.appendChild(container);
  }
  const t = document.createElement('div');
  t.className = 'toast toast-' + type;
  t.textContent = msg;
  container.appendChild(t);
  setTimeout(() => { t.remove(); }, 2500);
}
