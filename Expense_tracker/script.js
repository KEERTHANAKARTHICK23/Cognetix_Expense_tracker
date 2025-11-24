/* Expense Tracker
   - Stores transactions in localStorage under key: "expenseTrackerData"
   - Data shape: [{id, type:'income'|'expense', amount, description, category, date}]
*/

const LS_KEY = 'expenseTrackerData';

// form elements
const txForm = document.getElementById('txForm');
const typeEl = document.getElementById('type');
const amountEl = document.getElementById('amount');
const descEl = document.getElementById('description');
const categoryEl = document.getElementById('category');
const dateEl = document.getElementById('date');
const submitBtn = document.getElementById('submitBtn');
const cancelEditBtn = document.getElementById('cancelEdit');
const formTitle = document.getElementById('formTitle');
const formError = document.getElementById('formError');

const txListEl = document.getElementById('txList');
const monthSelect = document.getElementById('monthSelect');
const totalIncomeEl = document.getElementById('totalIncome');
const totalExpenseEl = document.getElementById('totalExpense');
const balanceEl = document.getElementById('balance');
const progressBar = document.getElementById('progressBar');
const chartCanvas = document.getElementById('chart');
const chartLegend = document.getElementById('chartLegend');
const allIncomeEl = document.getElementById('allIncome');
const allExpenseEl = document.getElementById('allExpense');
const clearAllBtn = document.getElementById('clearAll');

let transactions = [];
let editingId = null;

// init date inputs
(function initDates(){
  const today = new Date();
  dateEl.value = today.toISOString().slice(0,10);
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth()+1).padStart(2,'0');
  monthSelect.value = `${yyyy}-${mm}`;
})();

// helpers
function loadData(){
  const raw = localStorage.getItem(LS_KEY);
  transactions = raw ? JSON.parse(raw) : [];
}

function saveData(){
  localStorage.setItem(LS_KEY, JSON.stringify(transactions));
}

function uid(){
  return Date.now().toString(36) + Math.random().toString(36).slice(2,6);
}

function formatCurrency(num){
  // Indian Rupee symbol used; change if you want USD etc.
  return '₹' + Number(num).toLocaleString(undefined,{minimumFractionDigits:2, maximumFractionDigits:2});
}

function getMonthKey(dateStr){
  const d = new Date(dateStr);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
}

// render functions
function renderList(filterMonth){
  txListEl.innerHTML = '';
  const monthKey = filterMonth || monthSelect.value;

  const monthTx = transactions.filter(t => getMonthKey(t.date) === monthKey)
                             .sort((a,b)=> new Date(b.date) - new Date(a.date));

  if(monthTx.length === 0){
    txListEl.innerHTML = `<li class="tx-item"><div class="tx-desc">No transactions for selected month.</div></li>`;
    return;
  }

  for(const t of monthTx){
    const li = document.createElement('li');
    li.className = 'tx-item';
    const meta = document.createElement('div');
    meta.className = 'tx-meta';

    const badge = document.createElement('div');
    badge.className = 'badge ' + (t.type === 'income' ? 'income' : 'expense');
    badge.textContent = t.type === 'income' ? '+' : '-';

    const desc = document.createElement('div');
    desc.className = 'tx-desc';
    desc.innerHTML = `<div><strong>${t.description || '(no description)'}</strong> <small style="color:var(--muted)"> ${t.category?`• ${t.category}`:''}</small></div>`;

    const dateSpan = document.createElement('div');
    dateSpan.className = 'tx-date';
    dateSpan.textContent = new Date(t.date).toLocaleString();

    meta.appendChild(badge);
    meta.appendChild(desc);

    const right = document.createElement('div');
    right.style.textAlign = 'right';
    right.innerHTML = `<div style="font-weight:700">${t.type==='income'?formatCurrency(t.amount):formatCurrency(t.amount)}</div>
                       <div style="font-size:12px;color:var(--muted)">${new Date(t.date).toLocaleDateString()}</div>
                       <div style="margin-top:6px">
                         <button data-id="${t.id}" class="editBtn secondary">Edit</button>
                         <button data-id="${t.id}" class="delBtn danger">Delete</button>
                       </div>`;

    li.appendChild(meta);
    li.appendChild(right);
    txListEl.appendChild(li);
  }

  // attach events
  Array.from(document.getElementsByClassName('delBtn')).forEach(b=>{
    b.addEventListener('click', (e)=>{
      const id = e.currentTarget.dataset.id;
      if(confirm('Delete this transaction?')){ deleteTx(id); }
    });
  });
  Array.from(document.getElementsByClassName('editBtn')).forEach(b=>{
    b.addEventListener('click', (e)=>{
      const id = e.currentTarget.dataset.id;
      startEdit(id);
    });
  });
}

function renderSummary(filterMonth){
  const monthKey = filterMonth || monthSelect.value;
  const monthTx = transactions.filter(t => getMonthKey(t.date) === monthKey);

  const income = monthTx.filter(t=>t.type==='income').reduce((s,t)=>s+Number(t.amount),0);
  const expense = monthTx.filter(t=>t.type==='expense').reduce((s,t)=>s+Number(t.amount),0);
  const balance = income - expense;

  totalIncomeEl.textContent = formatCurrency(income);
  totalExpenseEl.textContent = formatCurrency(expense);
  balanceEl.textContent = formatCurrency(balance);

  // progress width: percentage of expenses vs income (if income > 0)
  let pct = 0;
  if(income > 0) pct = Math.min(100, Math.round((expense / income) * 100));
  else pct = expense > 0 ? 100 : 0;
  progressBar.style.width = pct + '%';

  // all-time totals
  const allIncome = transactions.filter(t=>t.type==='income').reduce((s,t)=>s+Number(t.amount),0);
  const allExpense = transactions.filter(t=>t.type==='expense').reduce((s,t)=>s+Number(t.amount),0);
  allIncomeEl.textContent = formatCurrency(allIncome);
  allExpenseEl.textContent = formatCurrency(allExpense);

  // draw chart for categories in the month (expenses vs income by category)
  drawChart(monthTx);
}

function drawChart(txArray){
  // simple donut/pie style: categories of expenses and incomes
  const ctx = chartCanvas.getContext('2d');
  ctx.clearRect(0,0,chartCanvas.width,chartCanvas.height);
  chartLegend.innerHTML = '';

  if(txArray.length === 0){
    ctx.fillStyle = '#f3f4f6';
    ctx.font = '14px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('No data', chartCanvas.width/2, chartCanvas.height/2);
    return;
  }

  // group by category + type
  const map = new Map();
  for(const t of txArray){
    const key = `${t.type}|${t.category || '(uncategorized)'}`;
    map.set(key, (map.get(key)||0) + Number(t.amount));
  }

  const entries = Array.from(map.entries()); // [ [key, value], ... ]
  const total = entries.reduce((s, e) => s + e[1], 0);
  if(total === 0){
    ctx.fillStyle = '#f3f4f6';
    ctx.font = '14px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('No amounts', chartCanvas.width/2, chartCanvas.height/2);
    return;
  }

  // colors: income green series, expense red series, fallback palette
  const colors = [];
  entries.forEach(([key])=>{
    if(key.startsWith('income|')) colors.push('#2ecc71');
    else if(key.startsWith('expense|')) colors.push('#e74c3c');
    else colors.push('#9ca3af');
  });

  // draw pie
  const cx = chartCanvas.width / 2;
  const cy = chartCanvas.height / 2;
  const radius = Math.min(cx, cy) - 10;
  let start = -Math.PI / 2;

  entries.forEach(([key, val], i) => {
    const slice = (val / total) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, radius, start, start + slice);
    ctx.closePath();
    ctx.fillStyle = colors[i] || '#888';
    ctx.fill();
    start += slice;
  });

  // legend
  entries.forEach(([key, val], i) => {
    const [type, cat] = key.split('|');
    const percent = ((val / total) * 100).toFixed(1);
    const item = document.createElement('div');
    item.style.display = 'flex';
    item.style.alignItems = 'center';
    item.style.gap = '8px';
    item.style.marginTop = '6px';
    const colorBox = document.createElement('div');
    colorBox.style.width = '12px';
    colorBox.style.height = '12px';
    colorBox.style.background = colors[i];
    colorBox.style.borderRadius = '3px';
    const label = document.createElement('div');
    label.style.fontSize = '13px';
    label.innerHTML = `<strong style="color:${type==='income'?'#16a34a':'#b91c1c'}">${type.toUpperCase()}</strong> • ${cat} — ${percent}% (${formatCurrency(val)})`;
    item.appendChild(colorBox);
    item.appendChild(label);
    chartLegend.appendChild(item);
  });
}

// actions
function addTx(e){
  e.preventDefault();
  formError.textContent = '';

  const amount = Number(amountEl.value);
  const desc = descEl.value.trim();
  const category = categoryEl.value.trim();
  const date = dateEl.value;
  const type = typeEl.value;

  if(!date || isNaN(amount) || amount <= 0){
    formError.textContent = 'Please enter a valid amount and date.';
    return;
  }

  if(editingId){
    // update
    const idx = transactions.findIndex(t=>t.id===editingId);
    if(idx !== -1){
      transactions[idx] = { ...transactions[idx], amount, description:desc, category, date, type };
      editingId = null;
      submitBtn.textContent = 'Add';
      cancelEditBtn.classList.add('hidden');
      formTitle.textContent = 'Add Transaction';
    }
  } else {
    const tx = { id: uid(), type, amount, description: desc, category, date };
    transactions.push(tx);
  }

  saveData();
  renderAll();
  txForm.reset();
  dateEl.value = new Date().toISOString().slice(0,10);
}

function deleteTx(id){
  transactions = transactions.filter(t=>t.id !== id);
  saveData();
  renderAll();
}

function startEdit(id){
  const tx = transactions.find(t=>t.id===id);
  if(!tx) return;
  editingId = id;
  typeEl.value = tx.type;
  amountEl.value = tx.amount;
  descEl.value = tx.description || '';
  categoryEl.value = tx.category || '';
  dateEl.value = tx.date;
  submitBtn.textContent = 'Update';
  cancelEditBtn.classList.remove('hidden');
  formTitle.textContent = 'Edit Transaction';
  window.scrollTo({top:0, behavior:'smooth'});
}

function cancelEdit(){
  editingId = null;
  txForm.reset();
  dateEl.value = new Date().toISOString().slice(0,10);
  submitBtn.textContent = 'Add';
  cancelEditBtn.classList.add('hidden');
  formTitle.textContent = 'Add Transaction';
}

function clearAll(){
  if(confirm('This will delete all saved transactions. Continue?')){
    transactions = [];
    saveData();
    renderAll();
  }
}

function renderAll(){
  renderList();
  renderSummary();
}

// events
txForm.addEventListener('submit', addTx);
cancelEditBtn.addEventListener('click', cancelEdit);
monthSelect.addEventListener('change', ()=>{ renderAll(); });
clearAllBtn.addEventListener('click', clearAll);

// initial load
loadData();
renderAll();
