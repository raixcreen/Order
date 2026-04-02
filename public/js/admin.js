/* ===== 管理後台邏輯 ===== */

let currentFloorFilter = 0;
let selectedDate = todayStr();

/* ---------- 初始化 ---------- */
(async function init() {
  const dateInput = document.getElementById('dateInput');
  dateInput.value = selectedDate;
  dateInput.addEventListener('change', () => {
    selectedDate = dateInput.value;
    refreshAll();
  });
  await refreshAll();
})();

function goToday() {
  selectedDate = todayStr();
  document.getElementById('dateInput').value = selectedDate;
  refreshAll();
}

async function refreshAll() {
  await Promise.all([
    renderDeadline(),
    renderMenuImage(),
    renderSummaryByItem(),
    renderVendors(),
    renderVendorQuickSelect(),
    renderEmployees(),
    renderOrders(),
  ]);
  await renderStats();
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
        <td style="color:var(--gray-500); font-size:.85rem;">${escHtml(emp.role || '')}</td>
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
  const roleEl = document.getElementById('newEmpRole');
  const name = nameEl.value.trim();
  const floor = parseInt(floorEl.value);
  const role = roleEl.value.trim();

  if (!name) { showToast('請輸入員工姓名', 'error'); return; }

  await DB.addEmployee({ name, floor, role });
  nameEl.value = '';
  roleEl.value = '';
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
  renderStats();
}

async function renderOrders() {
  let orders = await DB.getOrders(selectedDate);
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

  orders.forEach(order => {
    const emp = employees.find(e => e.id === order.employeeId);
    const floor = emp ? emp.floor : order.floor || '?';
    const itemsStr = order.items.map(it => `${it.name} x${it.qty}`).join('、');

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${escHtml(order.employeeName || (emp ? emp.name : '未知'))}</td>
      <td><span class="badge badge-floor${floor}">${floor} 樓</span></td>
      <td>${escHtml(itemsStr)}</td>
      <td><strong>${formatPrice(order.total)}</strong></td>
      <td>
        <button class="btn btn-ghost btn-sm" onclick="deleteOrderAction('${order.id}')" title="刪除">&#128465;</button>
      </td>
    `;
    tbody.appendChild(tr);
  });

  await renderFloorSummary();
}

async function deleteOrderAction(id) {
  await DB.deleteOrder(id, selectedDate);
  await refreshAll();
  showToast('訂單已刪除');
}

/* ========== 樓層小計 ========== */
async function renderFloorSummary() {
  const container = document.getElementById('floorSummary');
  const allOrders = await DB.getOrders(selectedDate);
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
  let orders = await DB.getOrders(selectedDate);
  const employees = await DB.getEmployees();

  if (currentFloorFilter > 0) {
    orders = orders.filter(o => {
      const emp = employees.find(e => e.id === o.employeeId);
      return emp && emp.floor === currentFloorFilter;
    });
  }

  const total = orders.reduce((s, o) => s + o.total, 0);

  document.getElementById('statOrders').textContent = orders.length;
  document.getElementById('statTotal').textContent = formatPrice(total);
}

/* ========== 截止時間 ========== */
async function renderDeadline() {
  const dl = await DB.getDeadline(selectedDate);
  const input = document.getElementById('deadlineInput');
  const status = document.getElementById('deadlineStatus');
  input.value = dl || '';

  if (!dl) {
    status.textContent = '（未設定截止時間）';
    status.style.color = 'var(--gray-400)';
  } else {
    const isOpen = await DB.isOrderOpen(selectedDate);
    if (selectedDate !== todayStr()) {
      status.textContent = `截止時間：${dl}`;
      status.style.color = 'var(--gray-500)';
    } else if (isOpen) {
      status.textContent = `開放中，${dl} 截止`;
      status.style.color = 'var(--success)';
    } else {
      status.textContent = `已截止（${dl}）`;
      status.style.color = 'var(--danger)';
    }
  }
}

async function saveDeadlineAction() {
  const time = document.getElementById('deadlineInput').value;
  if (!time) { showToast('請選擇截止時間', 'error'); return; }
  await DB.setDeadline(time, selectedDate);
  await renderDeadline();
  showToast(`已設定截止時間 ${time}`);
}

async function cutoffNowAction() {
  const now = new Date();
  const time = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
  await DB.setDeadline(time, selectedDate);
  document.getElementById('deadlineInput').value = time;
  await renderDeadline();
  showToast('已提前截止點餐');
}

/* ========== 菜單圖片管理 ========== */
async function renderMenuImage() {
  const dataUrl = await DB.getMenuImage(selectedDate);
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
      await DB.setMenuImage(compressed, selectedDate);
      const vendorId = document.getElementById('vendorQuickSelect').value;
      if (vendorId) await DB.updateVendor(vendorId, { image: compressed });
      await refreshAll();
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
  await DB.clearMenuImage(selectedDate);
  document.getElementById('menuImgInput').value = '';
  const vendorId = document.getElementById('vendorQuickSelect').value;
  if (vendorId) await DB.updateVendor(vendorId, { image: '' });
  await refreshAll();
  showToast('菜單圖片已移除');
}

/* ========== 訂購彙總（按品項） ========== */
async function renderSummaryByItem() {
  const orders = await DB.getOrders(selectedDate);
  const tbody = document.getElementById('summaryByItemBody');
  const tfoot = document.getElementById('summaryByItemFoot');
  const empty = document.getElementById('summaryByItemEmpty');
  const vendorInfo = document.getElementById('summaryVendorInfo');
  tbody.innerHTML = '';
  tfoot.innerHTML = '';

  const selectVendorId = document.getElementById('vendorQuickSelect').value;
  const savedVendorId = await DB.getVendorOfDay(selectedDate);
  const vendorId = selectVendorId || savedVendorId;
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

  const map = {};
  orders.forEach(o => {
    o.items.forEach(it => {
      const key = it.name + '|' + it.price;
      if (!map[key]) map[key] = { name: it.name, price: it.price, qty: 0 };
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
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${escHtml(item.name)}</strong></td>
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
  const sel = document.getElementById('vendorQuickSelect');
  const vendors = await DB.getVendors();
  const savedVendorId = await DB.getVendorOfDay(selectedDate);
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
  await DB.deleteVendor(id);
  await refreshAll();
  showToast('商家已刪除');
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
      await DB.setMenuImage(compressed, selectedDate);
      await refreshAll();
      showToast('菜單圖片已更新');
    });
  };
  reader.readAsDataURL(file);
}

async function removeVendorImage(vendorId) {
  await DB.updateVendor(vendorId, { image: '' });
  await DB.clearMenuImage(selectedDate);
  await refreshAll();
  showToast('菜單圖片已移除');
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

async function loadVendorMenu() {
  const vendorId = document.getElementById('vendorQuickSelect').value;
  if (!vendorId) { showToast('請先選擇商家', 'error'); return; }
  const vendor = await DB.getVendor(vendorId);
  if (!vendor || vendor.menu.length === 0) { showToast('該商家尚無菜單', 'error'); return; }

  await DB.setVendorOfDay(vendorId, selectedDate);

  const menuItems = vendor.menu.map(m => ({
    name: m.name,
    price: m.price
  }));
  await DB.saveMenu(menuItems, selectedDate);
  if (vendor.image) {
    await DB.setMenuImage(vendor.image, selectedDate);
  }
  await refreshAll();
  showToast(`已從「${vendor.name}」載入 ${vendor.menu.length} 個品項`);
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
