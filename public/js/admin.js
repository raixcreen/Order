/* ===== 管理後台邏輯 ===== */

let currentFloorFilter = 0;
let viewDate = null;        // null = 即將開團（預設）；'YYYY-MM-DD' = 查詢指定歷史日期
let selectedGroupId = null;
let groups = [];

/* ---------- 初始化 ---------- */
(async function init() {
  document.getElementById('newGroupDate').value = todayStr();
  await refreshAll();
})();

// 目前選中團的取餐日期（菜單/訂單都歸在這天）
function selectedGroupDate() {
  const g = groups.find(x => x.id === selectedGroupId);
  return g ? g.date : todayStr();
}

// 依目前檢視模式載入團清單：預設「近期 5 團（含已截止）」，或查詢指定歷史日期
async function reloadGroups() {
  groups = viewDate ? await DB.getGroups(viewDate) : await DB.getRecentGroups();
}

// 團是否已不可點餐（手動截止或已過截止時間）
function groupClosed(g) {
  if (g.closed) return true;
  const dl = parseDeadline(g);
  return dl ? new Date() > dl : false;
}

// 預設選團：優先選今天或未來且尚可點餐的最近一團，否則選最接近今天的團
function pickDefaultGroupId() {
  const today = todayStr();
  const openCurrent = groups.find(g => g.date >= today && !groupClosed(g));
  if (openCurrent) return openCurrent.id;
  const todayOrPast = groups.filter(g => g.date <= today);
  if (todayOrPast.length) return todayOrPast[todayOrPast.length - 1].id;
  return groups[0].id;
}

// 查詢過去日期的團（對帳用）
async function queryHistory() {
  const d = document.getElementById('historyDate').value;
  if (!d) { showToast('請選擇要查詢的日期', 'error'); return; }
  viewDate = d;
  selectedGroupId = null;
  document.getElementById('backToCurrentBtn').style.display = '';
  await refreshAll();
  showToast(`已查詢 ${dateLabel(d)}`);
}

// 回到目前（即將開團）
async function backToCurrent() {
  viewDate = null;
  selectedGroupId = null;
  document.getElementById('backToCurrentBtn').style.display = 'none';
  await refreshAll();
}

async function refreshAll() {
  await loadGroups();
  await Promise.all([
    renderVendors(),
    renderEmployees(),
  ]);
  if (selectedGroupId) {
    await refreshGroupContent();
  }
}

async function refreshGroupContent() {
  if (!selectedGroupId) return;
  await Promise.all([
    renderDeadline(),
    renderMenuImage(),
    renderSummaryByItem(),
    renderVendorQuickSelect(),
    renderOrders(),
  ]);
  await renderStats();
  await updateVendorLock();
}

/* ========== 開團管理 ========== */
async function loadGroups() {
  await reloadGroups();
  renderGroupTabs();

  if (groups.length > 0) {
    if (!selectedGroupId || !groups.find(g => g.id === selectedGroupId)) {
      selectedGroupId = pickDefaultGroupId();
    }
    document.getElementById('noGroupAdmin').style.display = 'none';
    document.getElementById('groupSettings').style.display = 'block';
    renderGroupTabs();
    await refreshGroupContent();
  } else {
    selectedGroupId = null;
    document.getElementById('noGroupAdmin').style.display = 'block';
    document.getElementById('groupSettings').style.display = 'none';
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

  const today = todayStr();
  groups.forEach(g => {
    const btn = document.createElement('button');
    btn.className = 'group-tab' + (g.id === selectedGroupId ? ' active' : '');
    // 非今天的團標出取餐日，方便一次看到跨日的多團
    btn.textContent = g.name + (g.date !== today ? ` · ${dateLabel(g.date)}` : '');
    if (groupClosed(g)) btn.textContent += '（已截止）';
    // tab 內括號一律用半形
    btn.textContent = toHalfWidthParens(btn.textContent);
    btn.onclick = async () => {
      selectedGroupId = g.id;
      currentFloorFilter = 0;
      renderGroupTabs();
      await refreshGroupContent();
      // 重置樓層 tab
      document.querySelectorAll('.floor-tab').forEach((t, i) => {
        t.classList.toggle('active', i === 0);
      });
    };
    container.appendChild(btn);
  });
}

async function addGroupAction() {
  const nameEl = document.getElementById('newGroupName');
  const name = nameEl.value.trim();
  if (!name) { showToast('請輸入團名', 'error'); return; }

  // 取餐日：員工會在這天取餐、紀錄也歸在這天
  const mealDate = document.getElementById('newGroupDate').value || todayStr();
  const g = await DB.addGroup(name, mealDate);
  nameEl.value = '';
  // 今天或未來的團 → 回到「即將開團」檢視；選了過去日期 → 切到該歷史日期
  if (mealDate < todayStr()) {
    viewDate = mealDate;
    document.getElementById('backToCurrentBtn').style.display = '';
  } else {
    viewDate = null;
    document.getElementById('backToCurrentBtn').style.display = 'none';
  }
  selectedGroupId = g.id;
  await refreshAll();
  const label = mealDate === todayStr() ? '' : `（${dateLabel(mealDate)}）`;
  showToast(`已建立「${name}」${label}`);
}

async function deleteGroupAction() {
  const group = groups.find(g => g.id === selectedGroupId);
  if (!group) return;
  openModal('刪除開團', `確定要刪除「${group.name}」嗎？此團的菜單與訂單都會一併刪除，無法復原。`, async () => {
    await DB.deleteGroup(selectedGroupId);
    selectedGroupId = null;
    await refreshAll();
    showToast('開團已刪除');
  });
}

/* ========== 員工管理 ========== */
async function renderEmployees() {
  const employees = await DB.getEmployees();
  employees.sort((a, b) => a.name.localeCompare(b.name, 'zh-TW'));

  const f11 = employees.filter(e => e.floor === 11);
  const f19 = employees.filter(e => e.floor === 19);

  document.getElementById('empCount').textContent = `共 ${employees.length} 人`;
  document.getElementById('empCount11').textContent = `${f11.length} 人`;
  document.getElementById('empCount19').textContent = `${f19.length} 人`;

  const tbody11 = document.getElementById('empBody11');
  const tbody19 = document.getElementById('empBody19');
  tbody11.innerHTML = '';
  tbody19.innerHTML = '';

  function renderList(list, tbody) {
    list.forEach(emp => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${escHtml(emp.name)}</td>
        <td>
          <button class="btn btn-ghost btn-sm" onclick="deleteEmployeeAction('${emp.id}')" title="刪除">&#128465;</button>
        </td>
      `;
      tbody.appendChild(tr);
    });
  }

  renderList(f11, tbody11);
  renderList(f19, tbody19);
}

async function addEmployeeAction() {
  const nameEl = document.getElementById('newEmpName');
  const floorEl = document.getElementById('newEmpFloor');
  const name = nameEl.value.trim();
  const floor = parseInt(floorEl.value);

  if (!name) { showToast('請輸入員工姓名', 'error'); return; }

  await DB.addEmployee({ name, floor });
  nameEl.value = '';
  await refreshAll();
  showToast('員工已新增');
}

async function deleteEmployeeAction(id) {
  await DB.deleteEmployee(id);
  await refreshAll();
  showToast('員工已刪除');
}

/* ========== 訂單明細 ========== */
function switchFloor(floor, btn) {
  currentFloorFilter = floor;
  document.querySelectorAll('.floor-tab').forEach(t => t.classList.remove('active'));
  btn.classList.add('active');
  renderOrders();
}

async function renderOrders() {
  if (!selectedGroupId) return;
  let orders = await DB.getOrders(selectedGroupDate(), selectedGroupId);
  const employees = await DB.getEmployees();

  if (currentFloorFilter > 0) {
    orders = orders.filter(o => {
      const emp = employees.find(e => e.id === o.employeeId);
      return emp && emp.floor === currentFloorFilter;
    });
  }

  const tbody = document.getElementById('orderBody');
  const empty = document.getElementById('orderEmpty');
  tbody.innerHTML = '';

  if (orders.length === 0) {
    empty.style.display = 'block';
    document.getElementById('floorSummary').innerHTML = '';
    return;
  }
  empty.style.display = 'none';

  // 展開每筆訂單的每個品項為一行
  const rows = [];
  orders.forEach(order => {
    const emp = employees.find(e => e.id === order.employeeId);
    const floor = emp ? emp.floor : order.floor || '?';
    order.items.forEach((it, idx) => {
      rows.push({ order, emp, floor, item: it, isFirst: idx === 0 });
    });
  });
  rows.sort((a, b) => a.item.name.localeCompare(b.item.name, 'zh-TW'));

  rows.forEach(({ order, emp, floor, item }) => {
    const tr = document.createElement('tr');
    const noteHtml = item.note ? escHtml(item.note) : '<span style="color:var(--gray-300);">—</span>';
    tr.innerHTML = `
      <td>${escHtml(order.employeeName || (emp ? emp.name : '未知'))}</td>
      <td><span class="badge badge-floor${floor}">${floor} 樓</span></td>
      <td>${escHtml(item.name)} x${item.qty}</td>
      <td><strong>${formatPrice(item.price * item.qty)}</strong></td>
      <td style="font-size:.8rem; max-width:150px;" title="${escHtml(item.note || '')}">${noteHtml}</td>
      <td>
        <button class="btn btn-ghost btn-sm" onclick="deleteOrderAction('${order.id}')" title="刪除">&#128465;</button>
      </td>
    `;
    tbody.appendChild(tr);
  });

  await renderFloorSummary();
}

async function deleteOrderAction(id) {
  await DB.deleteOrder(id, selectedGroupDate());
  await refreshGroupContent();
  showToast('訂單已刪除');
}

/* ========== 樓層小計 ========== */
async function renderFloorSummary() {
  const container = document.getElementById('floorSummary');
  const allOrders = await DB.getOrders(selectedGroupDate(), selectedGroupId);
  const employees = await DB.getEmployees();

  const floors = [11, 19];
  let html = '';

  floors.forEach(f => {
    const floorOrders = allOrders.filter(o => {
      const emp = employees.find(e => e.id === o.employeeId);
      return emp && emp.floor === f;
    });
    const total = floorOrders.reduce((s, o) => s + o.total, 0);
    const count = floorOrders.length;

    html += `
      <div style="flex:1; min-width:200px; background:var(--gray-50); border-radius:8px; padding:16px;">
        <strong class="badge badge-floor${f}">${f} 樓</strong>
        <div style="margin-top:8px; font-size:.9rem; color:var(--gray-600);">
          訂單：${count} 筆　金額：<strong>${formatPrice(total)}</strong>
        </div>
      </div>
    `;
  });

  container.innerHTML = html;
}

/* ========== 統計 ========== */
async function renderStats() {
  if (!selectedGroupId) return;
  const orders = await DB.getOrders(selectedGroupDate(), selectedGroupId);
  const total = orders.reduce((s, o) => s + o.total, 0);

  document.getElementById('statOrders').textContent = orders.length;
  document.getElementById('statTotal').textContent = formatPrice(total);

  const group = groups.find(g => g.id === selectedGroupId);
  document.getElementById('groupSettingTitle').textContent =
    group ? `${group.name} — 設定` : '團設定';
}

/* ========== 截止時間 ========== */
async function renderDeadline() {
  if (!selectedGroupId) return;
  const group = groups.find(g => g.id === selectedGroupId);
  if (!group) return;

  const input = document.getElementById('deadlineInput');
  const status = document.getElementById('deadlineStatus');
  input.value = deadlineInputValue(group);

  if (!group.deadline && !group.closed) {
    status.textContent = '（未設定截止時間）';
    status.style.color = 'var(--gray-400)';
  } else if (group.closed) {
    status.textContent = '已截止';
    status.style.color = 'var(--danger)';
  } else {
    const dl = parseDeadline(group);
    const isOpen = !dl || new Date() <= dl;

    if (isOpen) {
      status.textContent = `開放中，${deadlineLabel(group)} 截止`;
      status.style.color = 'var(--success)';
    } else {
      status.textContent = `已截止（${deadlineLabel(group)}）`;
      status.style.color = 'var(--danger)';
    }
  }
}

// datetime-local 欄位的值：有截止時間就帶入，否則預設取餐日中午 12:00
function deadlineInputValue(group) {
  const dl = parseDeadline(group);
  const d = dl || new Date(`${group.date}T12:00`);
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

async function saveDeadlineAction() {
  const val = document.getElementById('deadlineInput').value;
  if (!val) { showToast('請選擇截止時間', 'error'); return; }
  await DB.updateGroup(selectedGroupId, { deadline: val, closed: false });
  await reloadGroups();
  renderGroupTabs();
  await renderDeadline();
  const g = groups.find(x => x.id === selectedGroupId);
  showToast(`已設定截止時間 ${deadlineLabel(g)}`);
}

async function cutoffNowAction() {
  const now = new Date();
  const p = n => String(n).padStart(2, '0');
  const val = `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}T${p(now.getHours())}:${p(now.getMinutes())}`;
  await DB.updateGroup(selectedGroupId, { deadline: val, closed: true });
  await reloadGroups();
  renderGroupTabs();
  await renderDeadline();
  showToast('已提前截止點餐');
}

async function reopenAction() {
  await DB.updateGroup(selectedGroupId, { closed: false });
  await reloadGroups();
  renderGroupTabs();
  await renderDeadline();
  showToast('已重新開放點餐');
}

/* ========== 菜單圖片管理 ========== */
async function renderMenuImage() {
  if (!selectedGroupId) return;
  const dataUrl = await DB.getGroupImage(selectedGroupId);
  const preview = document.getElementById('menuImgPreview');
  const uploadZone = document.getElementById('menuImgUploadZone');

  if (dataUrl) {
    document.getElementById('menuImgThumb').src = dataUrl;
    preview.style.display = 'block';
    uploadZone.style.display = 'none';
  } else {
    preview.style.display = 'none';
    uploadZone.style.display = 'block';
  }
}

function handleMenuImgDrop(e) {
  e.preventDefault();
  e.currentTarget.style.borderColor = 'var(--gray-300)';
  e.currentTarget.style.background = '';
  const file = e.dataTransfer.files[0];
  if (file && file.type.startsWith('image/')) handleMenuImgFile(file);
}

function handleMenuImgFile(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async function(e) {
    compressImage(e.target.result, 1200, 0.8, async function(compressed) {
      await DB.updateGroup(selectedGroupId, { menu_image: compressed });
      await reloadGroups();
      await renderMenuImage();
      showToast('菜單圖片已上傳');
    });
  };
  reader.readAsDataURL(file);
}

function compressImage(dataUrl, maxWidth, quality, callback) {
  const img = new Image();
  img.onload = function() {
    const canvas = document.createElement('canvas');
    let w = img.width, h = img.height;
    if (w > maxWidth) { h = h * maxWidth / w; w = maxWidth; }
    canvas.width = w;
    canvas.height = h;
    canvas.getContext('2d').drawImage(img, 0, 0, w, h);
    callback(canvas.toDataURL('image/jpeg', quality));
  };
  img.src = dataUrl;
}

async function clearMenuImageAction() {
  await DB.updateGroup(selectedGroupId, { menu_image: '' });
  await reloadGroups();
  document.getElementById('menuImgInput').value = '';
  await renderMenuImage();
  showToast('菜單圖片已移除');
}

/* ========== 訂購彙總（按品項） ========== */
async function renderSummaryByItem() {
  if (!selectedGroupId) return;
  const orders = await DB.getOrders(selectedGroupDate(), selectedGroupId);
  const tbody = document.getElementById('summaryByItemBody');
  const tfoot = document.getElementById('summaryByItemFoot');
  const empty = document.getElementById('summaryByItemEmpty');
  const vendorInfo = document.getElementById('summaryVendorInfo');
  tbody.innerHTML = '';
  tfoot.innerHTML = '';

  const group = groups.find(g => g.id === selectedGroupId);
  const vendorId = group ? group.vendor_id : '';
  const vendor = vendorId ? await DB.getVendor(vendorId) : null;
  if (vendor) {
    let html = `<strong style="font-size:1rem;">${escHtml(vendor.name)}</strong>`;
    if (vendor.phone) html += `<span style="margin-left:12px;">&#128222; ${escHtml(vendor.phone)}</span>`;
    if (vendor.note) html += `<div style="margin-top:4px; color:var(--gray-500); font-size:.85rem;">${escHtml(vendor.note)}</div>`;
    vendorInfo.innerHTML = html;
  } else {
    vendorInfo.textContent = '尚未選擇商家';
  }

  if (orders.length === 0) {
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';

  // 同品項+同備註 合併為一行，不同備註分開顯示
  const map = {};
  orders.forEach(o => {
    o.items.forEach(it => {
      const note = it.note || '';
      const key = it.name + '|' + it.price + '|' + note;
      if (!map[key]) map[key] = { name: it.name, price: it.price, qty: 0, note };
      map[key].qty += it.qty;
    });
  });

  const sorted = Object.values(map).sort((a, b) => a.name.localeCompare(b.name, 'zh-TW'));
  let grandTotal = 0;
  let grandQty = 0;

  sorted.forEach(item => {
    const subtotal = item.price * item.qty;
    grandTotal += subtotal;
    grandQty += item.qty;
    const noteHtml = item.note
      ? `<div style="font-size:.8rem; color:var(--gray-500); margin-top:2px;">備註：${escHtml(item.note)}</div>`
      : '';
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${escHtml(item.name)}</strong>${noteHtml}</td>
      <td>${formatPrice(item.price)}</td>
      <td><strong>${item.qty}</strong></td>
      <td>${formatPrice(subtotal)}</td>
    `;
    tbody.appendChild(tr);
  });

  tfoot.innerHTML = `
    <tr style="font-weight:800; background:var(--gray-50);">
      <td>合計</td>
      <td></td>
      <td>${grandQty}</td>
      <td>${formatPrice(grandTotal)}</td>
    </tr>
  `;
}

/* ========== 商家資料庫 ========== */
async function renderVendors() {
  const vendors = await DB.getVendors();
  document.getElementById('vendorCount').textContent = `共 ${vendors.length} 家`;
  const container = document.getElementById('vendorList');
  const empty = document.getElementById('vendorEmpty');
  container.innerHTML = '';

  if (vendors.length === 0) {
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';

  vendors.forEach(v => {
    const hasImg = !!v.image;
    const div = document.createElement('div');
    div.style.cssText = 'border:1px solid var(--gray-200); border-radius:8px; padding:16px; margin-bottom:12px;';
    div.innerHTML = `
      <div style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:8px; margin-bottom:8px;">
        <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
          <strong style="font-size:1.05rem;">${escHtml(v.name)}</strong>
          <input type="text" class="form-control" value="${escHtml(v.phone || '')}" placeholder="電話" id="vp_${v.id}" onchange="updateVendorPhone('${v.id}', this.value)" style="width:130px; padding:4px 8px; font-size:.85rem;">
          <input type="text" class="form-control" value="${escHtml(v.note || '')}" placeholder="備註" id="vn_${v.id}" onchange="updateVendorNote('${v.id}', this.value)" style="width:180px; padding:4px 8px; font-size:.85rem;">
        </div>
        <div style="display:flex; gap:6px;">
          <button class="btn btn-ghost btn-sm" onclick="deleteVendorAction('${v.id}')" title="刪除商家">&#128465;</button>
        </div>
      </div>
      <div style="display:flex; gap:12px; flex-wrap:wrap; margin-bottom:8px;">
        <div style="flex-shrink:0;">
          ${hasImg
            ? `<img src="${v.image}" style="width:80px; height:80px; object-fit:cover; border-radius:8px; border:1px solid var(--gray-200); cursor:pointer;" onclick="this.nextElementSibling.click()" title="點擊替換圖片">`
            : `<div style="width:80px; height:80px; border:2px dashed var(--gray-300); border-radius:8px; display:flex; align-items:center; justify-content:center; cursor:pointer; font-size:.75rem; color:var(--gray-400); text-align:center;" onclick="this.nextElementSibling.click()">上傳<br>菜單圖</div>`
          }
          <input type="file" accept="image/*" style="display:none" onchange="uploadVendorImage('${v.id}', this.files[0])">
          ${hasImg ? `<div style="margin-top:4px; text-align:center;"><button class="btn btn-ghost btn-sm" onclick="removeVendorImage('${v.id}')" style="font-size:.7rem; padding:2px 6px;">移除</button></div>` : ''}
        </div>
        <div style="flex:1; font-size:.85rem; color:var(--gray-600);">
          <strong>菜單：</strong>
          ${v.menu.length === 0 ? '<span style="color:var(--gray-400);">尚無菜單</span>' :
            v.menu.map((m, i) => `<span style="display:inline-flex; align-items:center; gap:2px; background:var(--gray-100); border-radius:4px; padding:2px 8px; margin:2px;">${escHtml(m.name)} ${formatPrice(m.price)}<button onclick="deleteVendorMenuItem('${v.id}', ${i})" style="border:none; background:none; cursor:pointer; color:var(--gray-400); font-size:.9rem; padding:0 2px;" title="刪除此品項">&times;</button></span>`).join('')
          }
        </div>
      </div>
      <div style="display:flex; gap:8px; flex-wrap:wrap;">
        <input type="text" class="form-control" placeholder="品項名稱" id="vi_name_${v.id}" style="flex:2; min-width:100px; padding:6px 10px; font-size:.85rem;">
        <input type="number" class="form-control" placeholder="價格" id="vi_price_${v.id}" style="flex:1; min-width:80px; padding:6px 10px; font-size:.85rem;">
        <button class="btn btn-primary btn-sm" onclick="addVendorMenuItem('${v.id}')">加品項</button>
      </div>
    `;
    container.appendChild(div);
  });
}

async function renderVendorQuickSelect() {
  if (!selectedGroupId) return;
  const sel = document.getElementById('vendorQuickSelect');
  const vendors = await DB.getVendors();
  const group = groups.find(g => g.id === selectedGroupId);
  const savedVendorId = group ? group.vendor_id : '';
  sel.innerHTML = '<option value="">-- 載入商家 --</option>';
  vendors.forEach(v => {
    const opt = document.createElement('option');
    opt.value = v.id;
    opt.textContent = v.name + (v.menu.length ? ` (${v.menu.length} 品項)` : '');
    if (v.id === savedVendorId) opt.selected = true;
    sel.appendChild(opt);
  });
}

async function addVendorAction() {
  const nameEl = document.getElementById('newVendorName');
  const phoneEl = document.getElementById('newVendorPhone');
  const noteEl = document.getElementById('newVendorNote');
  const name = nameEl.value.trim();
  const phone = phoneEl.value.trim();
  const note = noteEl.value.trim();
  if (!name) { showToast('請輸入商家名稱', 'error'); return; }

  await DB.addVendor({ name, phone, note, menu: [] });
  nameEl.value = '';
  phoneEl.value = '';
  noteEl.value = '';
  await refreshAll();
  showToast('商家已新增');
}

async function deleteVendorAction(id) {
  const vendor = await DB.getVendor(id);
  const name = vendor ? vendor.name : '此商家';
  openModal('刪除商家', `確定要刪除「${name}」嗎？此操作無法復原。`, async () => {
    await DB.deleteVendor(id);
    await refreshAll();
    showToast('商家已刪除');
  });
}

async function updateVendorPhone(id, phone) {
  await DB.updateVendor(id, { phone: phone.trim() });
  showToast('電話已更新');
}

async function updateVendorNote(id, note) {
  await DB.updateVendor(id, { note: note.trim() });
  showToast('備註已更新');
}

function uploadVendorImage(vendorId, file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(e) {
    compressImage(e.target.result, 1200, 0.8, async function(compressed) {
      await DB.updateVendor(vendorId, { image: compressed });
      await refreshAll();
      showToast('商家圖片已更新');
    });
  };
  reader.readAsDataURL(file);
}

async function removeVendorImage(vendorId) {
  await DB.updateVendor(vendorId, { image: '' });
  await refreshAll();
  showToast('商家圖片已移除');
}

async function deleteVendorMenuItem(vendorId, index) {
  const vendor = await DB.getVendor(vendorId);
  if (!vendor) return;
  vendor.menu.splice(index, 1);
  await DB.updateVendor(vendorId, { menu: vendor.menu });
  await refreshAll();
  showToast('品項已刪除');
}

async function addVendorMenuItem(vendorId) {
  const nameEl = document.getElementById('vi_name_' + vendorId);
  const priceEl = document.getElementById('vi_price_' + vendorId);
  const name = nameEl.value.trim();
  const price = parseInt(priceEl.value);
  if (!name) { showToast('請輸入品項名稱', 'error'); return; }
  if (!price || price <= 0) { showToast('請輸入正確價格', 'error'); return; }

  const vendor = await DB.getVendor(vendorId);
  vendor.menu.push({ name, price });
  await DB.updateVendor(vendorId, { menu: vendor.menu });
  nameEl.value = '';
  priceEl.value = '';
  await refreshAll();
  showToast('品項已加入商家菜單');
}

async function updateVendorLock() {
  if (!selectedGroupId) return;
  const orders = await DB.getOrders(selectedGroupDate(), selectedGroupId);
  const locked = orders.length > 0;

  const sel = document.getElementById('vendorQuickSelect');
  const btn = document.querySelector('[onclick="loadVendorMenu()"]');
  const clearBtn = document.getElementById('clearOrdersBtn');

  sel.disabled = locked;
  if (btn) btn.disabled = locked;
  if (clearBtn) clearBtn.style.display = locked ? 'inline-block' : 'none';

  if (locked) {
    sel.title = '已有訂單，無法切換商家';
    if (btn) btn.title = '已有訂單，無法載入菜單';
  } else {
    sel.title = '';
    if (btn) btn.title = '';
  }
}

async function clearAllOrdersAction() {
  const orders = await DB.getOrders(selectedGroupDate(), selectedGroupId);
  const group = groups.find(g => g.id === selectedGroupId);
  const groupName = group ? group.name : '';
  openModal('清空訂單', `確定要清空「${groupName}」的全部 ${orders.length} 筆訂單嗎？此操作無法復原。`, async () => {
    for (const o of orders) {
      await DB.deleteOrder(o.id, selectedGroupDate());
    }
    await refreshGroupContent();
    showToast('所有訂單已清空');
  });
}

async function loadVendorMenu() {
  const vendorId = document.getElementById('vendorQuickSelect').value;
  if (!vendorId) { showToast('請先選擇商家', 'error'); return; }
  const vendor = await DB.getVendor(vendorId);
  if (!vendor || vendor.menu.length === 0) { showToast('該商家尚無菜單', 'error'); return; }

  // 儲存商家到團
  await DB.updateGroup(selectedGroupId, { vendor_id: vendorId });

  // 載入商家菜單圖到團
  if (vendor.image) {
    await DB.updateGroup(selectedGroupId, { menu_image: vendor.image });
  }

  const menuItems = vendor.menu.map(m => ({
    name: m.name,
    price: m.price
  }));
  await DB.saveMenu(menuItems, selectedGroupDate(), selectedGroupId);
  await reloadGroups();
  await refreshGroupContent();
  showToast(`已從「${vendor.name}」載入 ${vendor.menu.length} 個品項`);
}

/* ========== 收合/展開區塊 ========== */
function toggleSection(sectionId, toggleId) {
  const section = document.getElementById(sectionId);
  const toggle = document.getElementById(toggleId);
  const isHidden = section.style.display === 'none';
  section.style.display = isHidden ? 'block' : 'none';
  toggle.style.transform = isHidden ? '' : 'rotate(-90deg)';
}

/* ========== Modal ========== */
function openModal(title, msg, onConfirm) {
  document.getElementById('modalTitle').textContent = title;
  document.getElementById('modalMsg').textContent = msg;
  document.getElementById('modalOverlay').style.display = 'flex';
  document.getElementById('modalConfirm').onclick = () => { onConfirm(); closeModal(); };
}
function closeModal() {
  document.getElementById('modalOverlay').style.display = 'none';
}

/* ========== 工具 ========== */
function escHtml(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}
