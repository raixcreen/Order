/* ===== 員工訂餐頁面邏輯 ===== */

let currentEmployee = null;
let cart = {}; // { menuItemId: quantity }
let editingOrderId = null;
let orderClosed = false;
let deadlineTimer = null;

/* ---------- 初始化 ---------- */
(async function init() {
  await populateEmployeeSelect();
  document.getElementById('todayDate').textContent = todayStr();

  const saved = sessionStorage.getItem('currentEmployeeId');
  if (saved) {
    const emp = await DB.getEmployee(saved);
    if (emp) {
      document.getElementById('employeeSelect').value = saved;
      await employeeLogin();
    }
  }
})();

async function populateEmployeeSelect() {
  const sel = document.getElementById('employeeSelect');
  const employees = await DB.getEmployees();
  employees.sort((a, b) => a.floor - b.floor || a.name.localeCompare(b.name, 'zh-TW'));
  employees.forEach(emp => {
    const opt = document.createElement('option');
    opt.value = emp.id;
    opt.textContent = emp.name + '（' + emp.floor + 'F）';
    sel.appendChild(opt);
  });
}

/* ---------- 登入 ---------- */
async function employeeLogin() {
  const id = document.getElementById('employeeSelect').value;
  if (!id) { showToast('請先選擇員工', 'error'); return; }
  currentEmployee = await DB.getEmployee(id);
  sessionStorage.setItem('currentEmployeeId', id);

  document.getElementById('loginScreen').style.display = 'none';
  document.getElementById('orderScreen').style.display = 'block';
  document.getElementById('empInfo').textContent =
    currentEmployee.name + '（' + currentEmployee.floor + 'F）';

  document.getElementById('menuImageContent').style.display = 'none';
  document.getElementById('menuImageToggle').style.transform = 'rotate(-90deg)';

  await loadExistingOrder();
  await renderMenu();
  await renderMyOrders();
  await renderHistory();

  if (deadlineTimer) clearInterval(deadlineTimer);
  deadlineTimer = setInterval(() => { renderMenu(); }, 30000);
}

/* ---------- 載入既有訂單到購物車 ---------- */
async function loadExistingOrder() {
  if (!currentEmployee) return;
  const allOrders = await DB.getOrders();
  const orders = allOrders.filter(o => o.employeeId === currentEmployee.id);
  if (orders.length > 0) {
    cart = {};
    orders.forEach(o => {
      o.items.forEach(it => {
        cart[it.menuItemId] = (cart[it.menuItemId] || 0) + it.qty;
      });
    });
    editingOrderId = orders[0].id;
    for (let i = 1; i < orders.length; i++) {
      await DB.deleteOrder(orders[i].id);
    }
    const menu = await DB.getMenu();
    const items = [];
    let total = 0;
    for (const [id, qty] of Object.entries(cart)) {
      const item = menu.find(m => m.id === id);
      if (item) {
        items.push({ menuItemId: id, name: item.name, price: item.price, qty });
        total += qty * item.price;
      }
    }
    await DB.updateOrder(editingOrderId, { items, total });
  } else {
    cart = {};
    editingOrderId = null;
  }
}

/* ---------- 截止時間檢查 ---------- */
async function checkDeadline() {
  const banner = document.getElementById('deadlineBanner');
  const row = document.getElementById('deadlineRow');
  const dl = await DB.getDeadline();

  row.style.display = 'flex';

  if (!dl) {
    banner.style.background = 'var(--gray-100)';
    banner.style.color = 'var(--gray-500)';
    banner.textContent = '尚未設定截單時間';
    orderClosed = false;
    return;
  }

  const isOpen = await DB.isOrderOpen();
  orderClosed = !isOpen;

  if (isOpen) {
    banner.style.background = 'var(--warning-light)';
    banner.style.color = '#92400E';
    banner.textContent = `截單時間：${dl}`;
  } else {
    banner.style.background = 'var(--danger-light)';
    banner.style.color = '#991B1B';
    banner.textContent = `點餐已截止（${dl}），無法再下單`;
  }

  // 商家備註
  const noteEl = document.getElementById('vendorNote');
  const vendorId = await DB.getVendorOfDay();
  if (vendorId) {
    const vendor = await DB.getVendor(vendorId);
    if (vendor && vendor.note) {
      noteEl.textContent = vendor.note;
      noteEl.style.display = 'block';
    } else {
      noteEl.style.display = 'none';
    }
  } else {
    noteEl.style.display = 'none';
  }
}

/* ---------- 菜單圖片 ---------- */
async function renderMenuImage() {
  const section = document.getElementById('menuImageSection');
  const img = document.getElementById('menuImageDisplay');
  const dataUrl = await DB.getMenuImage();

  if (dataUrl) {
    img.src = dataUrl;
    section.style.display = 'block';
  } else {
    section.style.display = 'none';
  }
}

function toggleImageZoom(img) {
  if (img.style.maxWidth === '100%' || !img.style.maxWidth) {
    const overlay = document.createElement('div');
    overlay.id = 'imgZoomOverlay';
    overlay.style.cssText = 'position:fixed; inset:0; background:rgba(0,0,0,.85); z-index:300; display:flex; align-items:center; justify-content:center; cursor:pointer; animation:fadeIn .2s;';
    overlay.onclick = () => overlay.remove();
    const bigImg = document.createElement('img');
    bigImg.src = img.src;
    bigImg.style.cssText = 'max-width:95vw; max-height:95vh; border-radius:8px;';
    overlay.appendChild(bigImg);
    document.body.appendChild(overlay);
  }
}

/* ---------- 渲染菜單 ---------- */
async function renderMenu() {
  await checkDeadline();
  await renderMenuImage();
  const rawMenu = await DB.getMenu();
  const seen = new Set();
  const menu = [];
  rawMenu.forEach(item => {
    const key = item.name + '|' + item.price;
    if (!seen.has(key)) {
      seen.add(key);
      menu.push(item);
    }
  });
  if (menu.length !== rawMenu.length) {
    await DB.saveMenu(menu);
  }
  const grid = document.getElementById('menuGrid');
  const empty = document.getElementById('emptyMenu');
  grid.innerHTML = '';

  if (menu.length === 0) {
    grid.style.display = 'none';
    empty.style.display = 'block';
    document.getElementById('orderSummary').style.display = 'none';
    return;
  }
  grid.style.display = 'grid';
  empty.style.display = 'none';

  const disabled = orderClosed ? 'disabled style="opacity:.5; pointer-events:none;"' : '';
  menu.forEach(item => {
    const qty = cart[item.id] || 0;
    const div = document.createElement('div');
    div.className = 'menu-item' + (qty > 0 ? ' selected' : '');
    if (orderClosed) div.style.opacity = '0.6';
    div.innerHTML = `
      <div class="name">${escHtml(item.name)}</div>
      <div class="price">${formatPrice(item.price)}</div>
      <div class="qty-control">
        <button onclick="changeQty('${item.id}', -1)" ${disabled}>−</button>
        <span>${qty}</span>
        <button onclick="changeQty('${item.id}', 1)" ${disabled}>+</button>
      </div>
    `;
    grid.appendChild(div);
  });

  await updateSummary();
}

function changeQty(itemId, delta) {
  const current = cart[itemId] || 0;
  const next = Math.max(0, current + delta);
  if (next === 0) { delete cart[itemId]; } else { cart[itemId] = next; }
  renderMenu();
}

/* ---------- 訂單摘要 ---------- */
async function updateSummary() {
  const menu = await DB.getMenu();
  let count = 0, total = 0;
  for (const [id, qty] of Object.entries(cart)) {
    const item = menu.find(m => m.id === id);
    if (item) { count += qty; total += qty * item.price; }
  }
  document.getElementById('summaryCount').textContent = count;
  document.getElementById('summaryTotal').textContent = formatPrice(total);

  const btn = document.getElementById('submitBtn');
  if (editingOrderId) {
    btn.textContent = count > 0 ? '更新訂單' : '取消訂單';
    if (count === 0) btn.className = 'btn btn-danger';
    else btn.className = 'btn btn-success';
    document.getElementById('orderSummary').style.display = 'flex';
  } else {
    btn.textContent = '送出訂單';
    btn.className = 'btn btn-success';
    document.getElementById('orderSummary').style.display = count > 0 ? 'flex' : 'none';
  }
}

/* ---------- 送出訂單 ---------- */
async function submitOrder() {
  await checkDeadline();
  if (orderClosed) { showToast('點餐已截止，無法下單', 'error'); return; }
  if (Object.keys(cart).length === 0) {
    if (editingOrderId) {
      if (!confirm('確定要取消訂單嗎？此操作無法復原。')) return;
      await DB.deleteOrder(editingOrderId);
      editingOrderId = null;
      await renderMenu();
      await renderMyOrders();
      showToast('訂單已取消');
      return;
    }
    showToast('請先選擇餐點', 'error');
    return;
  }

  const menu = await DB.getMenu();
  const items = [];
  let total = 0;
  for (const [id, qty] of Object.entries(cart)) {
    const item = menu.find(m => m.id === id);
    if (item) {
      items.push({ menuItemId: id, name: item.name, price: item.price, qty });
      total += qty * item.price;
    }
  }

  if (editingOrderId) {
    await DB.updateOrder(editingOrderId, { items, total });
    showToast('訂單已更新！');
  } else {
    const order = await DB.addOrder({
      employeeId: currentEmployee.id,
      employeeName: currentEmployee.name,
      floor: currentEmployee.floor,
      items,
      total
    });
    editingOrderId = order.id;
    showToast('訂單送出成功！');
  }

  await renderMenu();
  await renderMyOrders();
}

/* ---------- 已點餐顯示 ---------- */
async function renderMyOrders() {
  if (!currentEmployee) return;
  const allOrders = await DB.getOrders();
  const orders = allOrders.filter(o => o.employeeId === currentEmployee.id);
  const card = document.getElementById('myOrderCard');
  const tbody = document.getElementById('myOrderBody');

  if (orders.length === 0) {
    card.style.display = 'none';
    document.getElementById('myOrderSummaryText').textContent = '';
    return;
  }
  card.style.display = 'block';
  tbody.innerHTML = '';

  let orderTotal = 0;
  orders.forEach(order => {
    order.items.forEach(it => {
      const sub = it.price * it.qty;
      orderTotal += sub;
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${escHtml(it.name)}</td>
        <td>${it.qty}</td>
        <td>${formatPrice(sub)}</td>
      `;
      tbody.appendChild(tr);
    });
  });

  const trTotal = document.createElement('tr');
  trTotal.style.fontWeight = '700';
  trTotal.innerHTML = `<td>合計</td><td></td><td>${formatPrice(orderTotal)}</td>`;
  tbody.appendChild(trTotal);

  let totalQty = 0;
  orders.forEach(o => o.items.forEach(it => { totalQty += it.qty; }));

  document.getElementById('myOrderSummaryText').textContent =
    `${totalQty} 項，${formatPrice(orderTotal)}`;

  const hint = document.getElementById('editHint');
  if (hint) {
    hint.style.display = (orderClosed) ? 'none' : 'block';
  }
}

/* ---------- 切換身份 ---------- */
function switchEmployee() {
  currentEmployee = null;
  cart = {};
  editingOrderId = null;
  if (deadlineTimer) { clearInterval(deadlineTimer); deadlineTimer = null; }
  sessionStorage.removeItem('currentEmployeeId');

  document.getElementById('orderScreen').style.display = 'none';
  document.getElementById('orderSummary').style.display = 'none';
  document.getElementById('loginScreen').style.display = 'block';
  document.getElementById('employeeSelect').value = '';
}

/* ---------- 展開/收合 ---------- */
function toggleMenuImage() {
  const content = document.getElementById('menuImageContent');
  const toggle = document.getElementById('menuImageToggle');
  const isHidden = content.style.display === 'none';
  content.style.display = isHidden ? 'block' : 'none';
  toggle.style.transform = isHidden ? '' : 'rotate(-90deg)';
}

function toggleOrderDetail() {
  const detail = document.getElementById('myOrderDetail');
  const toggle = document.getElementById('myOrderToggle');
  const isHidden = detail.style.display === 'none';
  detail.style.display = isHidden ? 'block' : 'none';
  toggle.style.transform = isHidden ? 'rotate(180deg)' : '';
}

/* ---------- 自訂品項 ---------- */
async function addCustomItem() {
  if (orderClosed) { showToast('點餐已截止', 'error'); return; }
  const nameEl = document.getElementById('customItemName');
  const priceEl = document.getElementById('customItemPrice');
  const name = nameEl.value.trim();
  const price = parseInt(priceEl.value);
  if (!name) { showToast('請輸入品項名稱', 'error'); return; }
  if (!price || price <= 0) { showToast('請輸入正確金額', 'error'); return; }

  const item = await DB.addMenuItem({ name, price });
  cart[item.id] = 1;
  nameEl.value = '';
  priceEl.value = '';
  await renderMenu();
  await updateSummary();
  showToast(`已加入「${name}」`);
}

/* ---------- 歷史訂單 ---------- */
function toggleHistoryDetail() {
  const detail = document.getElementById('historyDetail');
  const toggle = document.getElementById('historyToggle');
  const isHidden = detail.style.display === 'none';
  detail.style.display = isHidden ? 'block' : 'none';
  toggle.style.transform = isHidden ? '' : 'rotate(-90deg)';
}

async function renderHistory() {
  if (!currentEmployee) return;
  const card = document.getElementById('historyCard');
  const list = document.getElementById('historyList');

  const dates = await DB.getOrderDates(currentEmployee.id);
  const today = todayStr();
  const pastDates = dates.filter(d => d !== today);

  if (pastDates.length === 0) {
    card.style.display = 'none';
    return;
  }
  card.style.display = 'block';
  list.innerHTML = '';

  for (const date of pastDates.slice(0, 30)) {
    const orders = await DB.getOrders(date);
    const myOrders = orders.filter(o => o.employeeId === currentEmployee.id);
    if (myOrders.length === 0) continue;

    let total = 0;
    const items = [];
    myOrders.forEach(o => {
      o.items.forEach(it => {
        total += it.price * it.qty;
        items.push(it);
      });
    });

    const div = document.createElement('div');
    div.style.cssText = 'border:1px solid var(--gray-200); border-radius:8px; padding:12px 16px; margin-bottom:8px;';
    div.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
        <strong>${date}</strong>
        <span style="font-size:.85rem; color:var(--gray-500);">${formatPrice(total)}</span>
      </div>
      <div style="font-size:.85rem; color:var(--gray-600);">
        ${items.map(it => `${escHtml(it.name)} x${it.qty}`).join('、')}
      </div>
    `;
    list.appendChild(div);
  }
}

/* ---------- 工具 ---------- */
function escHtml(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}
