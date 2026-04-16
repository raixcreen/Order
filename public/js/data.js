/* ===== 資料層 — REST API ===== */

const API = '';

const DB = {
  /* ---------- 員工 ---------- */
  async getEmployees() {
    const res = await fetch(`${API}/api/employees`);
    return res.json();
  },
  async addEmployee(emp) {
    const res = await fetch(`${API}/api/employees`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(emp)
    });
    return res.json();
  },
  async deleteEmployee(id) {
    await fetch(`${API}/api/employees/${id}`, { method: 'DELETE' });
  },
  async getEmployee(id) {
    const res = await fetch(`${API}/api/employees/${id}`);
    return res.json();
  },

  /* ---------- 開團 ---------- */
  async getGroups(date) {
    const res = await fetch(`${API}/api/groups/${date || todayStr()}`);
    return res.json();
  },
  async addGroup(name, date) {
    const res = await fetch(`${API}/api/groups/${date || todayStr()}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name })
    });
    return res.json();
  },
  async updateGroup(id, updates) {
    await fetch(`${API}/api/groups/${id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates)
    });
  },
  async deleteGroup(id) {
    await fetch(`${API}/api/groups/${id}`, { method: 'DELETE' });
  },

  /* ---------- 每日菜單 ---------- */
  async getMenu(date, groupId) {
    let url = `${API}/api/menu/${date || todayStr()}`;
    if (groupId) url += `?group_id=${groupId}`;
    const res = await fetch(url);
    return res.json();
  },
  async saveMenu(items, date, groupId) {
    const res = await fetch(`${API}/api/menu/${date || todayStr()}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items, group_id: groupId || '' })
    });
    return res.json();
  },
  async addMenuItem(item, date, groupId) {
    const res = await fetch(`${API}/api/menu/${date || todayStr()}/item`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...item, group_id: groupId || '' })
    });
    return res.json();
  },
  async deleteMenuItem(id, date) {
    await fetch(`${API}/api/menu/${date || todayStr()}/${id}`, { method: 'DELETE' });
  },

  /* ---------- 訂單 ---------- */
  async getOrders(date, groupId) {
    let url = `${API}/api/orders/${date || todayStr()}`;
    if (groupId) url += `?group_id=${groupId}`;
    const res = await fetch(url);
    return res.json();
  },
  async addOrder(order, date) {
    const res = await fetch(`${API}/api/orders/${date || todayStr()}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(order)
    });
    return res.json();
  },
  async updateOrder(id, updates, date) {
    await fetch(`${API}/api/orders/${date || todayStr()}/${id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates)
    });
  },
  async deleteOrder(id, date) {
    await fetch(`${API}/api/orders/${date || todayStr()}/${id}`, { method: 'DELETE' });
  },
  async getOrderDates(employeeId) {
    const url = employeeId ? `${API}/api/order-dates?employeeId=${employeeId}` : `${API}/api/order-dates`;
    const res = await fetch(url);
    return res.json();
  },

  /* ---------- 商家資料庫 ---------- */
  async getVendors() {
    const res = await fetch(`${API}/api/vendors`);
    return res.json();
  },
  async addVendor(vendor) {
    const res = await fetch(`${API}/api/vendors`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(vendor)
    });
    return res.json();
  },
  async updateVendor(id, updates) {
    await fetch(`${API}/api/vendors/${id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates)
    });
  },
  async deleteVendor(id) {
    await fetch(`${API}/api/vendors/${id}`, { method: 'DELETE' });
  },
  async getVendor(id) {
    const res = await fetch(`${API}/api/vendors/${id}`);
    return res.json();
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
