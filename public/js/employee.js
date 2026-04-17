/* ===== 員工訂餐頁面邏輯 ===== */

let currentEmployee = null;
let currentGroupId = null;
let groups = [];
let carts = {};        // { groupId: { menuItemId: qty } }
let itemNotes = {};    // { groupId: { menuItemId: 'note' } }
let editingOrders = {}; // { groupId: orderId }
let orderClosed = false;
let deadlineTimer = null;

/* ---------- 初始化 ---------- */
(async function init() {
  await populateEmployeeSelect();
  document.getElementById('todayDate').textContent = todayStr();

  // 先檢查有沒有開團 / 是否全部截止
  const todayGroups = await DB.getGroups();
  const hasGroups = todayGroups.length > 0;
  const allClosed = hasGroups && todayGroups.every(g => isGroupClosed(g));

  if (!hasGroups || allClosed) {
    const noGroupEl = document.getElementById('loginNoGroup');
    noGroupEl.style.display = 'block';
    document.getElementById('loginForm').style.display = 'none';

    if (!hasGroups) {
      document.getElementById('loginNoGroupIcon').innerHTML = '&#128164;';
      document.getElementById('loginNoGroupTitle').textContent = '今天還沒有開團';
      document.getElementById('loginNoGroupDesc').innerHTML = '管理員尚未建立今日的訂餐團<br>開團後即可點餐，請稍候';
    } else {
      document.getElementById('loginNoGroupIcon').innerHTML = '&#128683;';
      document.getElementById('loginNoGroupTitle').textContent = '今天的團都已截止';
      document.getElementById('loginNoGroupDesc').innerHTML = '所有訂餐團已結束點餐<br>如有需要請聯絡管理員';
    }
  } else {
    document.getElementById('loginNoGroup').style.display = 'none';
    document.getElementById('loginForm').style.display = 'block';

    const saved = sessionStorage.getItem('currentEmployeeId');
    if (saved) {
      const emp = await DB.getEmployee(saved);
      if (emp) {
        document.getElementById('employeeSelect').value = saved;
        await employeeLogin();
      }
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

  await loadGroups();

  if (deadlineTimer) clearInterval(deadlineTimer);
  deadlineTimer = setInterval(() => {
    if (currentGroupId) renderMenu();
  }, 30000);
}

/* ---------- 載入開團 ---------- */
async function loadGroups() {
  groups = await DB.getGroups();
  renderGroupTabs();

  if (groups.length > 0) {
    const savedGroup = sessionStorage.getItem('currentGroupId');
    const found = savedGroup && groups.find(g => g.id === savedGroup);
    await selectGroup(found ? found.id : groups[0].id);
  } else {
    currentGroupId = null;
    document.getElementById('noGroupMsg').style.display = 'block';
    document.getElementById('groupContent').style.display = 'none';
    document.getElementById('orderSummary').style.display = 'none';
  }
}

function renderGroupTabs() {
  const container = document.getElementById('groupTabs');
  container.innerHTML = '';

  if (groups.length === 0) {
    container.style.display = 'none';
    return;
  }
  container.style.display = 'flex';

  groups.forEach(g => {
    const btn = document.createElement('button');
    btn.className = 'group-tab' + (g.id === currentGroupId ? ' active' : '');
    btn.textContent = g.name;
    if (g.closed) {
      btn.textContent += '（已截止）';
      btn.style.opacity = '0.7';
    }
    btn.onclick = () => selectGroup(g.id);
    container.appendChild(btn);
  });
}

async function selectGroup(groupId) {
  currentGroupId = groupId;
  sessionStorage.setItem('currentGroupId', groupId);

  document.getElementById('noGroupMsg').style.display = 'none';
  document.getElementById('groupContent').style.display = 'block';

  if (!carts[groupId]) carts[groupId] = {};
  if (!itemNotes[groupId]) itemNotes[groupId] = {};

  document.getElementById('menuImageContent').style.display = 'none';
  document.getElementById('menuImageToggle').style.transform = 'rotate(-90deg)';

  renderGroupTabs();
  await loadExistingOrder();
  await renderMenu();
  await renderMyOrders();
}

/* ---------- 載入既有訂單到購物車 ---------- */
async function loadExistingOrder() {
  if (!currentEmployee || !currentGroupId) return;
  const allOrders = await DB.getOrders(null, currentGroupId);
  const orders = allOrders.filter(o => o.employeeId === currentEmployee.id);

  if (orders.length > 0) {
    carts[currentGroupId] = {};
    itemNotes[currentGroupId] = {};
    orders.forEach(o => {
      o.items.forEach(it => {
        carts[currentGroupId][it.menuItemId] = (carts[currentGroupId][it.menuItemId] || 0) + it.qty;
        if (it.note) itemNotes[currentGroupId][it.menuItemId] = it.note;
      });
    });
    editingOrders[currentGroupId] = orders[0].id;

    // 合併多筆訂單為一筆
    for (let i = 1; i < orders.length; i++) {
      await DB.deleteOrder(orders[i].id);
    }
    const menu = await DB.getMenu(null, currentGroupId);
    const items = [];
    let total = 0;
    for (const [id, qty] of Object.entries(carts[currentGroupId])) {
      const item = menu.find(m => m.id === id);
      if (item) {
        items.push({ menuItemId: id, name: item.name, price: item.price, qty, note: itemNotes[currentGroupId][id] || '' });
        total += qty * item.price;
      }
    }
    await DB.updateOrder(editingOrders[currentGroupId], { items, total });
  } else {
    carts[currentGroupId] = {};
    itemNotes[currentGroupId] = {};
    editingOrders[currentGroupId] = null;
  }
}

/* ---------- 截止時間檢查 ---------- */
async function checkDeadline() {
  const banner = document.getElementById('deadlineBanner');
  const row = document.getElementById('deadlineRow');
  const group = groups.find(g => g.id === currentGroupId);

  if (!group) { orderClosed = false; return; }

  const dl = group.deadline;
  row.style.display = 'flex';

  if (!dl && !group.closed) {
    banner.style.background = 'var(--gray-100)';
    banner.style.color = 'var(--gray-500)';
    banner.textContent = '尚未設定截單時間';
    orderClosed = false;
    return;
  }

  if (group.closed) {
    banner.style.background = 'var(--danger-light)';
    banner.style.color = '#991B1B';
    banner.textContent = `點餐已截止` + (dl ? `（${dl}）` : '');
    orderClosed = true;
  } else if (dl) {
    const now = new Date();
    const [h, m] = dl.split(':').map(Number);
    const deadlineTime = new Date();
    deadlineTime.setHours(h, m, 0, 0);
    const isOpen = now <= deadlineTime;
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
  }

  // 商家備註
  const noteEl = document.getElementById('vendorNote');
  if (group.vendor_id) {
    const vendor = await DB.getVendor(group.vendor_id);
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
  const dataUrl = currentGroupId ? await DB.getGroupImage(currentGroupId) : '';

  if (dataUrl) {
    img.src = dataUrl;
    section.style.display = 'block';
  } else {
    section.style.display = 'none';
  }
}

function toggleImageZoom(img) {
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

/* ---------- 渲染菜單 ---------- */
async function renderMenu() {
  await checkDeadline();
  await renderMenuImage();
  const rawMenu = await DB.getMenu(null, currentGroupId);
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
    await DB.saveMenu(menu, null, currentGroupId);
  }
  const grid = document.getElementById('menuGrid');
  const empty = document.getElementById('emptyMenu');
  const cart = carts[currentGroupId] || {};
  const notes = itemNotes[currentGroupId] || {};
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
    const noteVal = notes[item.id] || '';
    const div = document.createElement('div');
    div.className = 'menu-item' + (qty > 0 ? ' selected' : '');
    if (orderClosed) div.style.opacity = '0.6';

    let noteHtml = '';
    if (qty > 0 && !orderClosed) {
      noteHtml = `<input type="text" class="item-note-input" placeholder="備註（如：不要辣）" value="${escHtml(noteVal)}" onchange="updateItemNote('${item.id}', this.value)" onclick="event.stopPropagation()">`;
    } else if (qty > 0 && noteVal) {
      noteHtml = `<div class="item-note-display">${escHtml(noteVal)}</div>`;
    }

    div.innerHTML = `
      <div class="name">${escHtml(item.name)}</div>
      <div class="price">${formatPrice(item.price)}</div>
      <div class="qty-control">
        <button onclick="changeQty('${item.id}', -1)" ${disabled}>−</button>
        <span>${qty}</span>
        <button onclick="changeQty('${item.id}', 1)" ${disabled}>+</button>
      </div>
      ${noteHtml}
    `;
    grid.appendChild(div);
  });

  await updateSummary();
}

function changeQty(itemId, delta) {
  const cart = carts[currentGroupId] || {};
  const current = cart[itemId] || 0;
  const next = Math.max(0, current + delta);
  if (next === 0) {
    delete cart[itemId];
    // 清除備註
    if (itemNotes[currentGroupId]) delete itemNotes[currentGroupId][itemId];
  } else {
    cart[itemId] = next;
  }
  carts[currentGroupId] = cart;
  renderMenu();
}

function updateItemNote(itemId, note) {
  if (!itemNotes[currentGroupId]) itemNotes[currentGroupId] = {};
  itemNotes[currentGroupId][itemId] = note;
}

/* ---------- 訂單摘要 ---------- */
async function updateSummary() {
  const menu = await DB.getMenu(null, currentGroupId);
  const cart = carts[currentGroupId] || {};
  let count = 0, total = 0;
  for (const [id, qty] of Object.entries(cart)) {
    const item = menu.find(m => m.id === id);
    if (item) { count += qty; total += qty * item.price; }
  }
  document.getElementById('summaryCount').textContent = count;
  document.getElementById('summaryTotal').textContent = formatPrice(total);

  const btn = document.getElementById('submitBtn');
  const editingId = editingOrders[currentGroupId];
  if (editingId) {
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
  groups = await DB.getGroups();
  await checkDeadline();
  if (orderClosed) { showToast('點餐已截止，無法下單', 'error'); return; }

  const cart = carts[currentGroupId] || {};
  const notes = itemNotes[currentGroupId] || {};

  if (Object.keys(cart).length === 0) {
    const editingId = editingOrders[currentGroupId];
    if (editingId) {
      if (!confirm('確定要取消訂單嗎？此操作無法復原。')) return;
      await DB.deleteOrder(editingId);
      editingOrders[currentGroupId] = null;
      itemNotes[currentGroupId] = {};
      await renderMenu();
      await renderMyOrders();
      showToast('訂單已取消');
      return;
    }
    showToast('請先選擇餐點', 'error');
    return;
  }

  const menu = await DB.getMenu(null, currentGroupId);
  const items = [];
  let total = 0;
  for (const [id, qty] of Object.entries(cart)) {
    const item = menu.find(m => m.id === id);
    if (item) {
      items.push({ menuItemId: id, name: item.name, price: item.price, qty, note: notes[id] || '' });
      total += qty * item.price;
    }
  }

  const editingId = editingOrders[currentGroupId];
  if (editingId) {
    await DB.updateOrder(editingId, { items, total });
    showToast('訂單已更新！');
  } else {
    const order = await DB.addOrder({
      employeeId: currentEmployee.id,
      employeeName: currentEmployee.name,
      floor: currentEmployee.floor,
      group_id: currentGroupId,
      items,
      total
    });
    editingOrders[currentGroupId] = order.id;
    showToast('訂單送出成功！');
  }

  await renderMenu();
  await renderMyOrders();
}

/* ---------- 已點餐顯示 ---------- */
async function renderMyOrders() {
  if (!currentEmployee || !currentGroupId) return;
  const allOrders = await DB.getOrders(null, currentGroupId);
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
      const noteHtml = it.note ? `<div style="font-size:.8rem; color:var(--gray-500); margin-top:2px;">備註：${escHtml(it.note)}</div>` : '';
      tr.innerHTML = `
        <td>${escHtml(it.name)}${noteHtml}</td>
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
  currentGroupId = null;
  carts = {};
  itemNotes = {};
  editingOrders = {};
  if (deadlineTimer) { clearInterval(deadlineTimer); deadlineTimer = null; }
  sessionStorage.removeItem('currentEmployeeId');

  document.getElementById('orderScreen').style.display = 'none';
  document.getElementById('orderSummary').style.display = 'none';
  document.getElementById('groupContent').style.display = 'none';
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

  const item = await DB.addMenuItem({ name, price }, null, currentGroupId);
  if (!carts[currentGroupId]) carts[currentGroupId] = {};
  carts[currentGroupId][item.id] = 1;
  nameEl.value = '';
  priceEl.value = '';
  await renderMenu();
  await updateSummary();
  showToast(`已加入「${name}」`);
}

/* ---------- 工具 ---------- */
function isGroupClosed(group) {
  if (group.closed) return true;
  if (!group.deadline) return false;
  const now = new Date();
  const [h, m] = group.deadline.split(':').map(Number);
  const dl = new Date();
  dl.setHours(h, m, 0, 0);
  return now > dl;
}

function escHtml(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}
