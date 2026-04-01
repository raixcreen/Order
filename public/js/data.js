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

  /* ---------- 每日菜單 ---------- */
  async getMenu(date) {
    const res = await fetch(`${API}/api/menu/${date || todayStr()}`);
    return res.json();
  },
  async saveMenu(items, date) {
    const res = await fetch(`${API}/api/menu/${date || todayStr()}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items })
    });
    return res.json();
  },
  async addMenuItem(item, date) {
    const res = await fetch(`${API}/api/menu/${date || todayStr()}/item`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(item)
    });
    return res.json();
  },
  async deleteMenuItem(id, date) {
    await fetch(`${API}/api/menu/${date || todayStr()}/${id}`, { method: 'DELETE' });
  },

  /* ---------- 訂單 ---------- */
  async getOrders(date) {
    const res = await fetch(`${API}/api/orders/${date || todayStr()}`);
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
  async getOrdersByFloor(floor, date) {
    const orders = await this.getOrders(date);
    const employees = await this.getEmployees();
    return orders.filter(o => {
      const emp = employees.find(e => e.id === o.employeeId);
      return emp && emp.floor === floor;
    });
  },

  /* ---------- 每日設定（截止時間、商家、菜單圖片） ---------- */
  async _getSettings(date) {
    const res = await fetch(`${API}/api/settings/${date || todayStr()}`);
    return res.json();
  },
  async _setSetting(key, value, date) {
    await fetch(`${API}/api/settings/${date || todayStr()}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [key]: value })
    });
  },

  async getMenuImage(date) {
    const s = await this._getSettings(date);
    return s.menuImage || null;
  },
  async setMenuImage(dataUrl, date) {
    await this._setSetting('menuImage', dataUrl, date);
  },
  async clearMenuImage(date) {
    await this._setSetting('menuImage', null, date);
  },

  async getVendorOfDay(date) {
    const s = await this._getSettings(date);
    return s.vendorOfDay || null;
  },
  async setVendorOfDay(vendorId, date) {
    await this._setSetting('vendorOfDay', vendorId, date);
  },

  async getDeadline(date) {
    const s = await this._getSettings(date);
    return s.deadline || null;
  },
  async setDeadline(time, date) {
    await this._setSetting('deadline', time, date);
  },
  async isOrderOpen(date) {
    const dl = await this.getDeadline(date);
    if (!dl) return true;
    const now = new Date();
    const [h, m] = dl.split(':').map(Number);
    const deadlineTime = new Date();
    deadlineTime.setHours(h, m, 0, 0);
    return now <= deadlineTime;
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

  /* ---------- 初始化（伺服器端已處理） ---------- */
  async initDefaults() { /* no-op: server handles defaults */ }
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
