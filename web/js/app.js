/* ============================================================
   Parabu — Frontend
   ============================================================ */
const STORAGE_KEY = 'finansapp_v1';
const THEME_KEY = 'finansapp_theme';
const PENDING_LOCAL_MERGE_KEY = 'parabu_pending_local_merge';

const defaultState = () => ({
  initialBalance: 0,
  budgets: {},
  transactions: [],
  savingsGoals: [],
});

let state = load();
let currentUser = null;
let authMode = 'login';

function hasAuthenticatedSession() {
  return Boolean(currentUser && API.hasToken());
}

let _syncTimer = null;
let _syncing = false;
let _pendingPush = false;

/* ---------- Load / Save ---------- */
function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return normalizeImportedState(JSON.parse(raw));
  } catch (e) {
    console.warn('load hatası:', e);
  }
  return defaultState();
}

function setSyncStatus(status) {
  const el = document.getElementById('syncStatus');
  if (!el) return;
  const map = {
    local: 'Yerel',
    syncing: 'Senkronize ediliyor…',
    synced: 'Bulut ile senkron',
    error: '! Senkron hatası',
    offline: 'Çevrimdışı',
  };
  el.textContent = map[status] || status;
  el.dataset.status = status;
}

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  scheduleSync();
}

function scheduleSync() {
  if (!currentUser || !API.hasToken()) {
    setSyncStatus('local');
    return;
  }
  clearTimeout(_syncTimer);
  _syncTimer = setTimeout(pushToServer, 800);
}

async function pushToServer() {
  if (_syncing) {
    _pendingPush = true;
    return;
  }
  _syncing = true;
  setSyncStatus('syncing');
  try {
    await API.putState(state);
    setSyncStatus('synced');
  } catch (err) {
    console.warn('sync hatası:', err.message);
    setSyncStatus('error');
  } finally {
    _syncing = false;
    if (_pendingPush) {
      _pendingPush = false;
      scheduleSync();
    }
  }
}

/* ---------- Helpers ---------- */
const fmt = new Intl.NumberFormat('tr-TR', {
  style: 'currency',
  currency: 'TRY',
  maximumFractionDigits: 2,
});
const fmtCurrency = n => fmt.format(n);
const fmtCompact = n => {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M ₺';
  if (abs >= 1000) return (n / 1000).toFixed(1) + 'k ₺';
  return n.toFixed(0) + ' ₺';
};
const monthKey = s => s.slice(0, 7);
const todayISO = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};
const formatDateTR = iso => {
  const [y, m, d] = iso.split('-');
  return `${d}.${m}.${y}`;
};
const monthLabel = key => {
  if (!key || key === 'all') return 'Tüm Aylar';
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' });
};
const escapeHtml = s =>
  String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function nextTxId() {
  return Math.max(0, ...state.transactions.map(t => Number(t.id) || 0)) + 1;
}

/* ---------- Toast ---------- */
let _toastTimer;
function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
}

/* ---------- Totals ---------- */
const totalIncome = () =>
  state.transactions.filter(t => t.type === 'INCOME').reduce((s, t) => s + t.amount, 0);
const totalExpense = () =>
  state.transactions.filter(t => t.type === 'EXPENSE').reduce((s, t) => s + t.amount, 0);
const currentBalance = () => state.initialBalance + totalIncome() - totalExpense();

function filteredTransactions() {
  const q = document.getElementById('searchInput').value.trim().toLowerCase();
  const m = document.getElementById('monthFilter').value;
  const type = document.getElementById('typeFilter').value;
  return state.transactions
    .filter(t => {
      if (m !== 'all' && monthKey(t.date) !== m) return false;
      if (type !== 'all' && t.type !== type) return false;
      if (q) {
        const hay = (t.description + ' ' + t.category).toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    })
    .sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);
}

/* ---------- Render ---------- */
function renderAll() {
  renderSummary();
  renderMonthFilter();
  renderTransactionTable();
  renderInsights();
  renderCategoriesDatalist();
  renderBudgets();
  renderSavingsGoals();
  renderCharts();
  renderAuthArea();
  updateWelcomePreview();
}

function renderSummary() {
  document.getElementById('sumInitial').textContent = fmtCurrency(state.initialBalance);
  document.getElementById('sumIncome').textContent = fmtCurrency(totalIncome());
  document.getElementById('sumExpense').textContent = fmtCurrency(totalExpense());
  const bal = currentBalance();
  const el = document.getElementById('sumBalance');
  el.textContent = fmtCurrency(bal);
  el.classList.toggle('negative', bal < 0);
}

function renderMonthFilter() {
  const sel = document.getElementById('monthFilter');
  const cur = sel.value || 'all';
  const keys = [...new Set(state.transactions.map(t => monthKey(t.date)))].sort().reverse();
  const opts = ['<option value="all">Tüm Aylar</option>'];
  keys.forEach(k => opts.push(`<option value="${k}">${monthLabel(k)}</option>`));
  sel.innerHTML = opts.join('');
  if ([...sel.options].some(o => o.value === cur)) sel.value = cur;
}

function renderInsights() {
  const month = document.getElementById('monthFilter').value;
  const transactions = state.transactions.filter(
    t => month === 'all' || monthKey(t.date) === month
  );
  const income = transactions
    .filter(t => t.type === 'INCOME')
    .reduce((sum, t) => sum + t.amount, 0);
  const expense = transactions
    .filter(t => t.type === 'EXPENSE')
    .reduce((sum, t) => sum + t.amount, 0);
  const net = income - expense;
  const savings = income > 0 ? ((income - expense) / income) * 100 : 0;

  const spending = {};
  transactions
    .filter(t => t.type === 'EXPENSE')
    .forEach(t => {
      spending[t.category] = (spending[t.category] || 0) + t.amount;
    });
  const topCategory = Object.entries(spending).sort((a, b) => b[1] - a[1])[0];

  document.getElementById('insightNet').textContent = fmtCurrency(net);
  document.getElementById('insightNet').classList.toggle('negative', net < 0);
  document.getElementById('insightSavings').textContent =
    income > 0 ? `%${Math.max(-999, savings).toFixed(0)}` : '—';
  document.getElementById('insightTopExpense').textContent =
    topCategory ? `${topCategory[0]} · ${fmtCurrency(topCategory[1])}` : 'Gider yok';

  const recentMonths = Array.from({ length: 3 }, (_, index) => {
    const date = new Date();
    date.setDate(1);
    date.setMonth(date.getMonth() - index);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  });
  const monthlyNet = recentMonths.map(key => {
    const monthTransactions = state.transactions.filter(t => monthKey(t.date) === key);
    return monthTransactions
      .filter(t => t.type === 'INCOME')
      .reduce((sum, t) => sum + t.amount, 0) -
      monthTransactions
        .filter(t => t.type === 'EXPENSE')
        .reduce((sum, t) => sum + t.amount, 0);
  });
  document.getElementById('insightAverage').textContent =
    fmtCurrency(monthlyNet.reduce((sum, value) => sum + value, 0) / recentMonths.length);
}

function renderSavingsGoals() {
  const wrap = document.getElementById('goalList');
  if (state.savingsGoals.length === 0) {
    wrap.innerHTML = '<div class="empty">Henüz birikim hedefi yok. İlk hedefini ekleyerek ilerlemeni takip et.</div>';
    return;
  }
  wrap.innerHTML = state.savingsGoals.map(goal => {
    const percentage = goal.target > 0 ? Math.min(100, (goal.saved / goal.target) * 100) : 0;
    const remaining = Math.max(0, goal.target - goal.saved);
    const dateLabel = goal.dueDate
      ? new Date(`${goal.dueDate}T00:00:00`).toLocaleDateString('tr-TR')
      : 'Tarih belirlenmedi';
    const completed = goal.saved >= goal.target;
    return `
      <article class="goal-card">
        <div class="goal-head">
          <div>
            <h4>${escapeHtml(goal.name)}</h4>
            <span class="muted">${completed ? 'Hedef tamamlandı ✓' : `Kalan ${fmtCurrency(remaining)}`} · ${dateLabel}</span>
          </div>
          <button type="button" class="btn-icon" data-delete-goal="${goal.id}" aria-label="${escapeHtml(goal.name)} hedefini sil">✕</button>
        </div>
        <div class="goal-amounts"><strong>${fmtCurrency(goal.saved)}</strong><span> / ${fmtCurrency(goal.target)}</span></div>
        <div class="progress"><div class="progress-bar ${completed ? 'ok' : 'goal-progress'}" style="width:${percentage}%"></div></div>
        <div class="goal-foot"><span>%${percentage.toFixed(0)} tamamlandı</span>
          ${completed ? '' : `<button type="button" class="goal-add" data-add-to-goal="${goal.id}">+ Birikim ekle</button>`}
        </div>
      </article>`;
  }).join('');
}

function requireCalculatorSession() {
  if (hasAuthenticatedSession()) return true;
  openAuthDialog('login');
  return false;
}

document.getElementById('loanCalculatorForm').addEventListener('submit', event => {
  event.preventDefault();
  if (!requireCalculatorSession()) return;

  const principal = Number(document.getElementById('loanAmount').value);
  const monthlyRate = Number(document.getElementById('loanRate').value) / 100;
  const months = Number(document.getElementById('loanTerm').value);
  if (
    !Number.isFinite(principal) || principal <= 0 ||
    !Number.isFinite(monthlyRate) || monthlyRate < 0 || monthlyRate > 1 ||
    !Number.isInteger(months) || months < 1 || months > 600
  ) {
    toast('Kredi tutarı, aylık faiz ve vade değerlerini kontrol edin.');
    return;
  }

  const payment = monthlyRate === 0
    ? principal / months
    : principal * monthlyRate / (1 - Math.pow(1 + monthlyRate, -months));
  const totalPayment = payment * months;
  document.getElementById('loanMonthlyPayment').textContent = fmtCurrency(payment);
  document.getElementById('loanTotalPayment').textContent = fmtCurrency(totalPayment);
  document.getElementById('loanTotalInterest').textContent = fmtCurrency(totalPayment - principal);

  let remaining = principal;
  const rows = [];
  for (let month = 1; month <= Math.min(months, 12); month += 1) {
    const interest = remaining * monthlyRate;
    const principalPart = Math.min(remaining, payment - interest);
    remaining = Math.max(0, remaining - principalPart);
    rows.push(
      `<tr><td>${month}</td><td>${fmtCurrency(principalPart)}</td><td>${fmtCurrency(interest)}</td><td>${fmtCurrency(remaining)}</td></tr>`
    );
  }
  document.getElementById('loanSchedule').innerHTML = rows.join('');
  document.getElementById('loanResult').classList.remove('hidden');
});

document.getElementById('savingsCalculatorForm').addEventListener('submit', event => {
  event.preventDefault();
  if (!requireCalculatorSession()) return;

  const starting = Number(document.getElementById('savingsStart').value);
  const monthly = Number(document.getElementById('savingsMonthly').value);
  const annualRate = Number(document.getElementById('savingsRate').value) / 100;
  const years = Number(document.getElementById('savingsYears').value);
  if (
    !Number.isFinite(starting) || starting < 0 ||
    !Number.isFinite(monthly) || monthly < 0 ||
    !Number.isFinite(annualRate) || annualRate < 0 || annualRate > 1 ||
    !Number.isInteger(years) || years < 1 || years > 80
  ) {
    toast('Birikim değerlerini kontrol edin.');
    return;
  }

  const months = years * 12;
  const monthlyRate = annualRate / 12;
  let futureValue = starting;
  for (let month = 0; month < months; month += 1) {
    futureValue = futureValue * (1 + monthlyRate) + monthly;
  }
  const contributions = starting + monthly * months;
  document.getElementById('savingsFuture').textContent = fmtCurrency(futureValue);
  document.getElementById('savingsContributions').textContent = fmtCurrency(contributions);
  document.getElementById('savingsGrowth').textContent = fmtCurrency(futureValue - contributions);
  document.getElementById('savingsResult').classList.remove('hidden');
});

document.getElementById('creditScoreForm').addEventListener('submit', event => {
  event.preventDefault();
  if (!requireCalculatorSession()) return;

  const latePayments = Number(document.getElementById('creditLatePayments').value);
  const utilization = Number(document.getElementById('creditUtilization').value);
  const historyYears = Number(document.getElementById('creditHistory').value);
  const income = Number(document.getElementById('creditIncome').value);
  const monthlyDebt = Number(document.getElementById('creditDebt').value);
  if (
    !Number.isInteger(latePayments) || latePayments < 0 || latePayments > 2 ||
    !Number.isFinite(utilization) || utilization < 0 || utilization > 100 ||
    !Number.isFinite(historyYears) || historyYears < 0 || historyYears > 80 ||
    !Number.isFinite(income) || income <= 0 ||
    !Number.isFinite(monthlyDebt) || monthlyDebt < 0
  ) {
    toast('Kredi sağlığı simülasyonu için değerleri kontrol edin.');
    return;
  }

  const paymentPoints = [40, 25, 0][latePayments];
  const utilizationPoints = utilization <= 10 ? 30
    : utilization <= 30 ? 24
      : utilization <= 50 ? 15
        : utilization <= 70 ? 6 : 0;
  const historyPoints = historyYears >= 10 ? 15
    : historyYears >= 5 ? 12
      : historyYears >= 2 ? 8
        : historyYears > 0 ? 4 : 0;
  const debtRatio = (monthlyDebt / income) * 100;
  const debtPoints = debtRatio <= 20 ? 15
    : debtRatio <= 35 ? 10
      : debtRatio <= 50 ? 5 : 0;
  const score = paymentPoints + utilizationPoints + historyPoints + debtPoints;
  const label = score >= 75 ? 'Gösterge: daha güçlü' : score >= 45 ? 'Gösterge: orta' : 'Gösterge: dikkat';

  document.getElementById('creditScoreValue').textContent = String(score);
  document.getElementById('creditScoreLabel').textContent = label;
  document.getElementById('creditFactors').innerHTML = [
    ['Ödeme geçmişi', paymentPoints, 40],
    ['Kredi kullanım oranı', utilizationPoints, 30],
    ['Kredi geçmişi süresi', historyPoints, 15],
    ['Borç / gelir oranı', debtPoints, 15],
  ].map(([name, points, max]) =>
    `<li><span>${name}</span><strong>${points} / ${max}</strong></li>`
  ).join('');
  document.getElementById('creditResult').classList.remove('hidden');
});

function renderTransactionTable() {
  const tbody = document.querySelector('#txTable tbody');
  const empty = document.getElementById('emptyTx');
  const list = filteredTransactions();
  if (list.length === 0) {
    tbody.innerHTML = '';
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');
  tbody.innerHTML = list
    .map(t => {
      const isInc = t.type === 'INCOME';
      return `
      <tr>
        <td>${formatDateTR(t.date)}</td>
        <td>${escapeHtml(t.description)}</td>
        <td><span class="pill">${escapeHtml(t.category)}</span></td>
        <td><span class="badge ${isInc ? 'income' : 'expense'}">${isInc ? 'Gelir' : 'Gider'}</span></td>
        <td class="right ${isInc ? 'income-text' : 'expense-text'}">${isInc ? '+' : '−'}${fmtCurrency(t.amount)}</td>
        <td class="actions">
          <button class="btn-icon" data-edit="${t.id}" title="Düzenle" aria-label="İşlemi düzenle">
            <svg class="action-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z"/></svg>
          </button>
          <button class="btn-icon" data-delete="${t.id}" title="Sil" aria-label="İşlemi sil">
            <svg class="action-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="m19 6-1 14H6L5 6"/><path d="M10 11v5m4-5v5"/></svg>
          </button>
        </td>
      </tr>`;
    })
    .join('');
}

function renderCategoriesDatalist() {
  const cats = new Set([
    ...state.transactions.map(t => t.category),
    ...Object.keys(state.budgets),
  ]);
  document.getElementById('categoryList').innerHTML = [...cats]
    .map(c => `<option value="${escapeHtml(c)}">`)
    .join('');
}

function renderBudgets() {
  const wrap = document.getElementById('budgetList');
  const monthSel = document.getElementById('monthFilter').value;
  const targetMonth = monthSel === 'all' ? todayISO().slice(0, 7) : monthSel;
  document.getElementById('budgetMonthLabel').textContent = monthLabel(targetMonth);
  const entries = Object.entries(state.budgets);
  if (entries.length === 0) {
    wrap.innerHTML = '<div class="empty">Henüz bütçe yok. Yukarıdaki formdan ekleyebilirsin.</div>';
    return;
  }
  wrap.innerHTML = entries
    .map(([cat, limit]) => {
      const spent = state.transactions
        .filter(t => t.type === 'EXPENSE' && t.category === cat && monthKey(t.date) === targetMonth)
        .reduce((s, t) => s + t.amount, 0);
      const pct = limit > 0 ? (spent / limit) * 100 : 0;
      let cls = 'ok',
        warn = '',
        warnCls = 'ok-text';
      if (pct >= 100) {
        cls = 'over';
        warn = '! Limit aşıldı';
        warnCls = 'over-text';
      } else if (pct >= 80) {
        cls = 'warn';
        warn = '! Limite yaklaşıyorsun';
        warnCls = 'warn-text';
      }
      const width = Math.min(100, pct);
      return `
      <div class="budget-row">
        <div class="budget-head">
          <strong>${escapeHtml(cat)}</strong>
          <span class="muted">${fmtCurrency(spent)} / ${fmtCurrency(limit)}</span>
          <button class="btn-icon" data-remove-budget="${escapeHtml(cat)}" title="Bütçeyi sil">✕</button>
        </div>
        <div class="progress"><div class="progress-bar ${cls}" style="width:${width}%"></div></div>
        <div class="budget-foot">
          <span class="muted">%${pct.toFixed(0)} kullanıldı</span>
          <span class="${warnCls}">${warn}</span>
        </div>
      </div>`;
    })
    .join('');
}

/* ---------- Charts ---------- */
let pieChart, trendChart;

function chartTheme() {
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  return {
    text: isDark ? '#94a3b8' : '#64748b',
    grid: isDark ? 'rgba(148,163,184,0.15)' : 'rgba(100,116,139,0.15)',
  };
}

function isChartsTabActive() {
  return document.querySelector('.tab-content[data-tab="charts"]').classList.contains('active');
}

function renderCharts() {
  if (typeof Chart === 'undefined') return;
  if (!isChartsTabActive()) return;
  const t = chartTheme();
  const monthSel = document.getElementById('monthFilter').value;
  const expenseTx = state.transactions.filter(
    x => x.type === 'EXPENSE' && (monthSel === 'all' || monthKey(x.date) === monthSel)
  );
  const byCat = {};
  expenseTx.forEach(x => {
    byCat[x.category] = (byCat[x.category] || 0) + x.amount;
  });
  const labels = Object.keys(byCat);
  const data = Object.values(byCat);
  const palette = ['#2563eb', '#ef4444', '#f59e0b', '#10b981', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#6366f1'];
  const pieCanvas = document.getElementById('pieChart');
  const pieEmpty = document.getElementById('pieEmpty');
  if (pieChart) {
    pieChart.destroy();
    pieChart = null;
  }
  if (labels.length === 0) {
    pieCanvas.classList.add('hidden');
    pieEmpty.classList.remove('hidden');
  } else {
    pieCanvas.classList.remove('hidden');
    pieEmpty.classList.add('hidden');
    pieChart = new Chart(pieCanvas, {
      type: 'doughnut',
      data: {
        labels,
        datasets: [{
          data,
          backgroundColor: labels.map((_, i) => palette[i % palette.length]),
          borderWidth: 0,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'bottom', labels: { color: t.text } },
          tooltip: { callbacks: { label: c => `${c.label}: ${fmtCurrency(c.parsed)}` } },
        },
      },
    });
  }
  const months = [];
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  const inc = months.map(m =>
    state.transactions.filter(x => x.type === 'INCOME' && monthKey(x.date) === m).reduce((s, x) => s + x.amount, 0)
  );
  const exp = months.map(m =>
    state.transactions.filter(x => x.type === 'EXPENSE' && monthKey(x.date) === m).reduce((s, x) => s + x.amount, 0)
  );
  const trendLabels = months.map(m => {
    const [y, mm] = m.split('-');
    const name = new Date(+y, +mm - 1, 1).toLocaleDateString('tr-TR', { month: 'short' });
    return `${name} ${y.slice(2)}`;
  });
  if (trendChart) {
    trendChart.destroy();
    trendChart = null;
  }
  trendChart = new Chart(document.getElementById('trendChart'), {
    type: 'bar',
    data: {
      labels: trendLabels,
      datasets: [
        { label: 'Gelir', data: inc, backgroundColor: '#16a34a', borderRadius: 4 },
        { label: 'Gider', data: exp, backgroundColor: '#dc2626', borderRadius: 4 },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom', labels: { color: t.text } },
        tooltip: { callbacks: { label: c => `${c.dataset.label}: ${fmtCurrency(c.parsed.y)}` } },
      },
      scales: {
        x: { ticks: { color: t.text }, grid: { color: t.grid } },
        y: { beginAtZero: true, ticks: { color: t.text, callback: v => fmtCompact(v) }, grid: { color: t.grid } },
      },
    },
  });
}

/* ---------- Auth UI ---------- */
function renderAuthArea() {
  const area = document.getElementById('authArea');
  if (currentUser) {
    area.innerHTML = `
      <span class="user-chip"><span class="dot"></span>${escapeHtml(currentUser.email)}</span>
      <button id="logoutBtn" class="btn-secondary" style="padding:6px 12px;font-size:13px">Çıkış</button>`;
    document.getElementById('logoutBtn').addEventListener('click', handleLogout);
  } else {
    area.innerHTML = `<button id="loginBtn" class="btn-secondary" style="padding:6px 12px;font-size:13px">Giriş Yap</button>`;
    document.getElementById('loginBtn').addEventListener('click', () => openAuthDialog('login'));
  }
}

/* ---------- Theme ---------- */
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  document.getElementById('themeToggle').textContent = theme === 'dark' ? '◐' : '◑';
  localStorage.setItem(THEME_KEY, theme);
  if (isChartsTabActive()) renderCharts();
}

function initTheme() {
  const saved = localStorage.getItem(THEME_KEY);
  const prefersDark = matchMedia('(prefers-color-scheme: dark)').matches;
  applyTheme(saved || (prefersDark ? 'dark' : 'light'));
}

/* ---------- State normalization / merge ---------- */
function normalizeImportedState(obj) {
  const s = defaultState();
  if (!obj || typeof obj !== 'object') return s;

  // initialBalance
  const ib = Number(obj.initialBalance);
  if (Number.isFinite(ib)) s.initialBalance = ib;

  // budgets (prototype pollution koruması)
  if (obj.budgets && typeof obj.budgets === 'object' && !Array.isArray(obj.budgets)) {
    s.budgets = {};
    for (const [k, v] of Object.entries(obj.budgets)) {
      if (k === '__proto__' || k === 'constructor' || k === 'prototype') continue;
      const n = Number(v);
      if (Number.isFinite(n) && n > 0) s.budgets[String(k).slice(0, 50)] = n;
    }
  }

  // transactions
  if (Array.isArray(obj.transactions)) {
    const seenIds = new Set();
    const valid = [];
    for (const t of obj.transactions) {
      if (!t || typeof t !== 'object') continue;
      const amount = Number(t.amount);
      if (!Number.isFinite(amount) || amount <= 0) continue;
      const id =
        Number.isFinite(t.id) && t.id > 0 && !seenIds.has(t.id) ? Number(t.id) : 0;
      if (id) seenIds.add(id);
      valid.push({
        id,
        description: String(t.description || '').slice(0, 100),
        amount,
        type: t.type === 'INCOME' ? 'INCOME' : 'EXPENSE',
        category: String(t.category || '').slice(0, 50),
        date: /^\d{4}-\d{2}-\d{2}$/.test(t.date) ? t.date : todayISO(),
      });
    }
    let nextId = Math.max(0, ...seenIds) + 1;
    s.transactions = valid.map(t => (t.id ? t : { ...t, id: nextId++ }));
  }

  if (Array.isArray(obj.savingsGoals)) {
    const seenGoalIds = new Set();
    let nextGoalId = 1;
    s.savingsGoals = obj.savingsGoals
      .filter(goal => goal && typeof goal === 'object')
      .map(goal => {
        let id =
          Number.isInteger(goal.id) && goal.id > 0 && !seenGoalIds.has(goal.id)
            ? goal.id
            : nextGoalId;
        while (seenGoalIds.has(id)) id += 1;
        seenGoalIds.add(id);
        nextGoalId = Math.max(nextGoalId, id + 1);
        return {
          id,
          name: String(goal.name || '').trim().slice(0, 60),
          target: Number(goal.target),
          saved: Number(goal.saved),
          dueDate: /^\d{4}-\d{2}-\d{2}$/.test(goal.dueDate) ? goal.dueDate : '',
        };
      })
      .filter(goal =>
        goal.name &&
        Number.isFinite(goal.target) && goal.target > 0 &&
        Number.isFinite(goal.saved) && goal.saved >= 0
      );
  }

  return s;
}

function txSignature(t) {
  return `${t.date}|${t.amount}|${t.type}|${t.category}|${t.description}`;
}

function mergeStates(local, remote) {
  const base = defaultState();
  const localTx = Array.isArray(local.transactions) ? local.transactions : [];
  const remoteTx = Array.isArray(remote.transactions) ? remote.transactions : [];

  // İçerik imzasına göre tekilleştir — ID çakışması sorun değil
  const seen = new Set();
  const merged = [];
  for (const t of [...remoteTx, ...localTx]) {
    const sig = txSignature(t);
    if (!seen.has(sig)) {
      seen.add(sig);
      merged.push(t);
    }
  }

  // ID'leri yeniden ata (benzersizlik garantisi)
  const usedIds = new Set();
  const finalTx = merged.map(t => {
    let id = Number(t.id) || 0;
    if (!id || usedIds.has(id)) id = Math.max(0, ...usedIds) + 1;
    usedIds.add(id);
    return { ...t, id };
  });

  // Bütçe: yerel kazanır (kullanıcının son niyeti)
  const budgets = { ...(remote.budgets || {}), ...(local.budgets || {}) };
  const remoteGoals = Array.isArray(remote.savingsGoals) ? remote.savingsGoals : [];
  const localGoals = Array.isArray(local.savingsGoals) ? local.savingsGoals : [];
  const goalsById = new Map(remoteGoals.map(goal => [goal.id, goal]));
  localGoals.forEach(goal => goalsById.set(goal.id, goal));

  // initialBalance: sunucuda doluysa onu kullan, yoksa yerel
  const remoteIb = Number(remote.initialBalance);
  const localIb = Number(local.initialBalance);
  const initialBalance =
    Number.isFinite(remoteIb) && remoteIb !== 0
      ? remoteIb
      : Number.isFinite(localIb)
      ? localIb
      : 0;

  return { ...base, transactions: finalTx, budgets, initialBalance, savingsGoals: [...goalsById.values()] };
}

/* ---------- Dialogs ---------- */
function openTxDialog(tx) {
  if (!currentUser || !API.hasToken()) {
    openAuthDialog('login');
    return;
  }
  document.getElementById('txDialogTitle').textContent = tx ? 'İşlemi Düzenle' : 'Yeni İşlem';
  document.getElementById('txId').value = tx ? tx.id : '';
  document.getElementById('txDescription').value = tx ? tx.description : '';
  document.getElementById('txAmount').value = tx ? tx.amount : '';
  document.getElementById('txType').value = tx ? tx.type : 'EXPENSE';
  document.getElementById('txCategory').value = tx ? tx.category : '';
  document.getElementById('txDate').value = tx ? tx.date : todayISO();
  document.getElementById('txDialog').showModal();
  setTimeout(() => document.getElementById('txDescription').focus(), 50);
}

function openAuthDialog(mode = 'login') {
  document.getElementById('authForm').reset();
  document.getElementById('authError').classList.add('hidden');
  setAuthMode(mode);
  document.getElementById('authDialog').showModal();
  setTimeout(() => {
    if (mode === 'register') document.getElementById('authPolicyAccept').focus();
    else document.getElementById('authEmail').focus();
  }, 50);
}

function setAuthMode(mode) {
  authMode = mode;
  document.querySelectorAll('.auth-tab').forEach(t => {
    const active = t.dataset.mode === mode;
    t.classList.toggle('active', active);
    t.setAttribute('aria-selected', String(active));
  });
  document.getElementById('authTitle').textContent = mode === 'login' ? 'Giriş Yap' : 'Kayıt Ol';
  document.getElementById('authSubmit').textContent = mode === 'login' ? 'Giriş Yap' : 'Kayıt Ol';
  document.getElementById('authPassword').autocomplete = mode === 'login' ? 'current-password' : 'new-password';
  document.getElementById('authConsent').classList.toggle('hidden', mode !== 'register');
}

function showAuthError(msg) {
  const el = document.getElementById('authError');
  el.textContent = msg;
  el.classList.remove('hidden');
}

/* ---------- Auth akışı ---------- */
async function handleAuthSubmit(e) {
  e.preventDefault();
  const email = document.getElementById('authEmail').value.trim();
  const password = document.getElementById('authPassword').value;
  const submit = document.getElementById('authSubmit');
  let tokenEstablished = false;
  document.getElementById('authError').classList.add('hidden');
  if (authMode === 'register' && !document.getElementById('authPolicyAccept').checked) {
    showAuthError('Devam etmek için koşulları ve gizlilik politikasını kabul edin.');
    return;
  }
  submit.disabled = true;
  submit.textContent = '...';
  try {
    const result = authMode === 'login'
      ? await API.login(email, password)
      : await API.register(email, password);
    if (result.confirmationRequired) {
      localStorage.setItem(PENDING_LOCAL_MERGE_KEY, email.toLowerCase());
      submit.disabled = false;
      submit.textContent = 'Kayıt Ol';
      document.getElementById('authDialog').close();
      toast('Kayıt oluşturuldu. Giriş yapmadan önce e-posta adresinizi doğrulayın.');
      return;
    }
    if (!result.token || !result.user) throw new Error('Oturum başlatılamadı.');
    API.setToken(result.token, result.refreshToken);
    tokenEstablished = true;
    currentUser = result.user;
    await syncFromServer({ includeLocal: authMode === 'register' });
    document.getElementById('authDialog').close();
    renderAll();
    enterDashboard();
    toast(authMode === 'login' ? 'Giriş başarılı' : 'Hesap oluşturuldu');
  } catch (err) {
    if (tokenEstablished) {
      API.setToken(null);
      currentUser = null;
      state = defaultState();
    }
    showAuthError(err.message || 'Bir hata oluştu');
    renderAuthArea();
    submit.disabled = false;
    submit.textContent = authMode === 'login' ? 'Giriş Yap' : 'Kayıt Ol';
  }
}

async function syncFromServer({ includeLocal = false } = {}) {
  try {
    const res = await API.getState();
    const remote = res && res.data && typeof res.data === 'object' ? res.data : null;
    const hasRemote = remote && Object.keys(remote).length > 0;
    const localState = state;

    if (!hasRemote) {
      if (!includeLocal) state = defaultState();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      await API.putState(state);
      setSyncStatus('synced');
      return;
    }

    const remoteState = normalizeImportedState(remote);
    state = includeLocal ? mergeStates(localState, remoteState) : remoteState;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    // Birleşik hali sunucuya geri yaz
    await API.putState(state);
    setSyncStatus('synced');
  } catch (err) {
    console.warn('syncFromServer:', err.message);
    setSyncStatus('error');
    throw err;
  }
}

function handleLogout() {
  if (!confirm('Çıkış yapmak istediğine emin misin? Bu cihazdaki önbelleğe alınmış finans verileri de kaldırılacak.')) return;
  API.logout().catch(err => console.warn('Oturum kapatma isteği başarısız:', err.message));
  API.setToken(null);
  currentUser = null;
  state = defaultState();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  clearTimeout(_syncTimer);
  _syncing = false;
  _pendingPush = false;
  renderAll();
  setSyncStatus('local');
  renderAccessState();
  toast('Çıkış yapıldı');
}

async function bootstrapAuth() {
  if (!API.hasToken()) {
    setSyncStatus('local');
    renderAccessState();
    return;
  }
  try {
    const me = await API.me();
    currentUser = me.user;
    const pendingEmail = localStorage.getItem(PENDING_LOCAL_MERGE_KEY);
    const mergeLocal =
      pendingEmail && pendingEmail === String(me.user.email || '').toLowerCase();
    await syncFromServer({ includeLocal: mergeLocal });
    if (mergeLocal) localStorage.removeItem(PENDING_LOCAL_MERGE_KEY);
    setSyncStatus('synced');
  } catch (err) {
    if (err.status === 401) API.setToken(null);
    currentUser = null;
    setSyncStatus('local');
  } finally {
    if (hasAuthenticatedSession()) renderAll();
    renderAccessState();
  }
}

/* ---------- Export / Import ---------- */
function exportJSON() {
  const payload = {
    app: 'Parabu',
    version: 1,
    exportedAt: new Date().toISOString(),
    state,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `parabu-backup-${todayISO()}.json`;
  a.click();
  URL.revokeObjectURL(url);
  toast('JSON yedek indirildi');
}

function importJSONFile(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(reader.result);
      const data = parsed && parsed.state ? parsed.state : parsed;
      if (!data || typeof data !== 'object') throw new Error('Geçersiz format');
      state = normalizeImportedState(data);
      save();
      renderAll();
      toast('JSON başarıyla geri yüklendi');
    } catch (err) {
      toast('Geçersiz JSON dosyası');
      console.error(err);
    }
  };
  reader.readAsText(file);
}

/* ---------- Event listeners ---------- */
document.getElementById('themeToggle').addEventListener('click', () => {
  const cur = document.documentElement.getAttribute('data-theme');
  applyTheme(cur === 'dark' ? 'light' : 'dark');
});

document.getElementById('searchInput').addEventListener('input', () => {
  renderTransactionTable();
  renderInsights();
});
document.getElementById('typeFilter').addEventListener('change', renderTransactionTable);
document.getElementById('monthFilter').addEventListener('change', () => {
  renderTransactionTable();
  renderInsights();
  renderBudgets();
  renderCharts();
});

document.getElementById('addTxBtn').addEventListener('click', () => openTxDialog(null));
document.getElementById('txCancel').addEventListener('click', () => document.getElementById('txDialog').close());

document.getElementById('txForm').addEventListener('submit', e => {
  e.preventDefault();
  const id = document.getElementById('txId').value;
  const amount = parseFloat(document.getElementById('txAmount').value);
  const tx = {
    description: document.getElementById('txDescription').value.trim(),
    amount: Number.isFinite(amount) ? amount : 0,
    type: document.getElementById('txType').value,
    category: document.getElementById('txCategory').value.trim(),
    date: document.getElementById('txDate').value,
  };
  if (!tx.description || !tx.category || !(tx.amount > 0) || !tx.date) {
    toast('Lütfen tüm alanları doldur');
    return;
  }
  if (id) {
    const idx = state.transactions.findIndex(t => t.id == id);
    if (idx >= 0) state.transactions[idx] = { ...state.transactions[idx], ...tx };
  } else {
    state.transactions.push({ id: nextTxId(), ...tx });
  }
  save();
  document.getElementById('txDialog').close();
  renderAll();
  toast(id ? 'İşlem güncellendi' : 'İşlem eklendi');
});

document.querySelector('#txTable tbody').addEventListener('click', e => {
  const btn = e.target.closest('button');
  if (!btn) return;
  if (btn.dataset.edit) {
    const tx = state.transactions.find(t => t.id == btn.dataset.edit);
    if (tx) openTxDialog(tx);
  } else if (btn.dataset.delete) {
    if (confirm('Bu işlemi silmek istediğine emin misin?')) {
      state.transactions = state.transactions.filter(t => t.id != btn.dataset.delete);
      save();
      renderAll();
      toast('İşlem silindi');
    }
  }
});

document.getElementById('budgetForm').addEventListener('submit', e => {
  e.preventDefault();
  if (!currentUser || !API.hasToken()) {
    openAuthDialog('login');
    return;
  }
  const cat = document.getElementById('budgetCategory').value.trim();
  const amt = parseFloat(document.getElementById('budgetAmount').value);
  if (!cat || !(amt > 0)) {
    toast('Geçerli değerler gir');
    return;
  }
  const existed = cat in state.budgets;
  state.budgets[cat] = amt;
  save();
  document.getElementById('budgetForm').reset();
  renderAll();
  toast(existed ? 'Bütçe güncellendi' : 'Bütçe eklendi');
});

document.getElementById('budgetList').addEventListener('click', e => {
  const btn = e.target.closest('button[data-remove-budget]');
  if (!btn) return;
  const cat = btn.dataset.removeBudget;
  if (confirm(`"${cat}" bütçesini silmek istediğine emin misin?`)) {
    delete state.budgets[cat];
    save();
    renderAll();
    toast('Bütçe silindi');
  }
});

document.getElementById('goalForm').addEventListener('submit', e => {
  e.preventDefault();
  if (!currentUser || !API.hasToken()) {
    openAuthDialog('login');
    return;
  }
  const name = document.getElementById('goalName').value.trim();
  const target = Number(document.getElementById('goalTarget').value);
  const saved = Number(document.getElementById('goalSaved').value || 0);
  const dueDate = document.getElementById('goalDate').value;
  if (!name || !Number.isFinite(target) || target <= 0 || !Number.isFinite(saved) || saved < 0) {
    toast('Hedef için geçerli tutarlar gir');
    return;
  }
  state.savingsGoals.push({
    id: Math.max(0, ...state.savingsGoals.map(goal => goal.id)) + 1,
    name,
    target,
    saved,
    dueDate,
  });
  save();
  document.getElementById('goalForm').reset();
  document.getElementById('goalSaved').value = '0';
  renderAll();
  toast('Birikim hedefi eklendi');
});

document.getElementById('goalList').addEventListener('click', e => {
  if (!currentUser || !API.hasToken()) {
    openAuthDialog('login');
    return;
  }
  const button = e.target.closest('button');
  if (!button) return;
  if (button.dataset.deleteGoal) {
    const goalId = Number(button.dataset.deleteGoal);
    state.savingsGoals = state.savingsGoals.filter(goal => goal.id !== goalId);
    save();
    renderAll();
    toast('Birikim hedefi silindi');
  } else if (button.dataset.addToGoal) {
    const goal = state.savingsGoals.find(item => item.id === Number(button.dataset.addToGoal));
    if (!goal) return;
    const input = prompt(`${goal.name} hedefine eklenecek tutar (₺):`);
    if (input === null) return;
    const amount = Number(input.trim().replace(',', '.'));
    if (!Number.isFinite(amount) || amount <= 0) {
      toast('Geçerli bir tutar gir');
      return;
    }
    goal.saved += amount;
    save();
    renderAll();
    toast('Hedef birikimi güncellendi');
  }
});

document.getElementById('exportBtn').addEventListener('click', () => {
  const list = filteredTransactions();
  if (list.length === 0) {
    toast('Dışa aktarılacak işlem yok');
    return;
  }
  const rows = [['ID', 'Tarih', 'Aciklama', 'Kategori', 'Tur', 'Tutar']];
  list.forEach(t =>
    rows.push([
      t.id,
      t.date,
      String(t.description).replace(/[\r\n]+/g, ' '),
      String(t.category).replace(/[\r\n]+/g, ' '),
      t.type === 'INCOME' ? 'Gelir' : 'Gider',
      t.amount.toFixed(2).replace('.', ','),
    ])
  );
  const csv = '\uFEFF' + rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `parabu-${todayISO()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  toast('CSV indirildi');
});

document.getElementById('initialCard').addEventListener('click', () => {
  document.getElementById('initAmount').value = state.initialBalance || '';
  document.getElementById('initDialog').showModal();
});
document.getElementById('initCancel').addEventListener('click', () => document.getElementById('initDialog').close());
document.getElementById('initForm').addEventListener('submit', e => {
  e.preventDefault();
  const v = parseFloat(document.getElementById('initAmount').value);
  if (!Number.isFinite(v)) {
    toast('Geçerli bir sayı gir');
    return;
  }
  state.initialBalance = v;
  save();
  document.getElementById('initDialog').close();
  renderAll();
  toast('Başlangıç bakiyesi güncellendi');
});

document.getElementById('exportJsonBtn').addEventListener('click', exportJSON);
document.getElementById('importJsonBtn').addEventListener('click', () =>
  document.getElementById('importJsonInput').click()
);
document.getElementById('importJsonInput').addEventListener('change', e => {
  const file = e.target.files[0];
  if (file) importJSONFile(file);
  e.target.value = '';
});

document.getElementById('resetBtn').addEventListener('click', () => {
  if (confirm('Tüm veriler silinecek. Emin misin?')) {
    localStorage.removeItem(STORAGE_KEY);
    location.reload();
  }
});

document.querySelectorAll('.auth-tab').forEach(t =>
  t.addEventListener('click', () => setAuthMode(t.dataset.mode))
);
document.getElementById('authCancel').addEventListener('click', () => document.getElementById('authDialog').close());
document.getElementById('authForm').addEventListener('submit', handleAuthSubmit);

const policyTexts = {
  privacy: {
    title: 'Gizlilik Politikası',
    html: `
      <p><strong>Son güncelleme:</strong> 20 Kasım 2026</p>
      <h3>Toplanan veriler</h3>
      <p>Parabu; hesap için e-posta adresinizi ve senkronizasyon amacıyla işlemlerinizi, bütçelerinizi, başlangıç bakiyenizi ve birikim hedeflerinizi saklayabilir. Hesap parolaları Supabase Auth tarafından güvenli biçimde hashlenir; Parabu düz metin parolanıza erişmez.</p>
      <h3>Veri depolama</h3>
      <p>Yayımlanan sürümün web dosyaları Cloudflare Pages üzerinden, e-posta hesabınız ve senkronize finans verileriniz ise Supabase'in seçilen proje bölgesinde tutulur. Veritabanı kuralları her hesabın yalnızca kendi verisini okuyup yazmasına izin verir. Cloudflare Functions yalnızca herkese açık bağlantı ayarını sunar ve hesap silme isteğini iletir. Uygulama bankalardan otomatik veri çekmez.</p>
      <h3>Şifreler ve güvenlik</h3>
      <p>Şifreler düz metin olarak saklanmaz. Oturum anahtarı bu cihazın tarayıcı depolamasında tutulur; ortak cihazlarda oturumunuzu kapatın. Supabase Free projesi uzun süre etkinlik olmazsa duraklatılabilir ve ücretsiz kullanım sınırlarında istekler kısıtlanabilir.</p>
      <h3>Analitik ve reklam</h3>
      <p>Uygulama harici yazı tipi ve grafik kütüphanesi yükleyebilir; bu kaynaklara bağlantı sırasında IP adresiniz gibi standart ağ bilgileri ilgili sağlayıcılara iletilebilir. Bu kaynaklar kaldırılabilir veya kendi sunucunuzdan barındırılabilir.</p>
      <h3>Veri kontrolü</h3>
      <p>JSON yedek indirebilir, verilerinizi geri yükleyebilir veya hesabınızla birlikte Supabase'teki bulut verilerinizi kalıcı olarak silebilirsiniz. Ücretsiz plan otomatik veritabanı yedeği sunmaz; JSON yedeğinizi güvenli yerde saklayın.</p>
    `,
  },
  terms: {
    title: 'Kullanım Koşulları',
    html: `
      <p><strong>Son güncelleme:</strong> 20 Kasım 2026</p>
      <h3>Kullanım amacı</h3>
      <p>Parabu kişisel gelir-gider takibi, temel hesaplama ve bütçe planlaması için tasarlanmıştır. Finansal tavsiye, muhasebe veya bankacılık hizmeti değildir.</p>
      <h3>Kullanıcı sorumlulukları</h3>
      <p>Kullanıcı hesap bilgilerinin gizliliğinden, girilen verilerin doğruluğundan ve yedeklerin korunmasından sorumludur.</p>
      <h3>Veri kaybı</h3>
      <p>Cihazı sıfırlama, tarayıcı verisini temizleme veya hesabı silme işlemleri yerel veya bulut verilerinin kaybına neden olabilir. Yedek indirmeniz önerilir.</p>
      <h3>Hizmetin kullanım süresi</h3>
      <p>Uygulama bakım, güvenlik veya teknik ihtiyaçlar nedeniyle geçici olarak kullanılamayabilir. Hizmet hiçbir yatırım veya bankacılık garantisi vermez.</p>
      <h3>İptal</h3>
      <p>Dilediğiniz zaman çıkış yapabilir veya veri merkezi üzerinden hesabınızı ve buluttaki verilerinizi silebilirsiniz. Yayın öncesinde bu metinleri gerçek işletme, iletişim ve veri saklama uygulamalarınıza uygun şekilde inceleyin.</p>
    `,
  },
};

function openPolicy(type) {
  const policy = policyTexts[type];
  if (!policy) return;
  document.getElementById('policyTitle').textContent = policy.title;
  document.getElementById('policyContent').innerHTML = policy.html;
  document.getElementById('policyDialog').showModal();
}

function openPrivacyCenter() {
  if (!currentUser || !API.hasToken()) {
    openPolicy('privacy');
    return;
  }
  document.getElementById('privacyTxCount').textContent = state.transactions.length;
  document.getElementById('privacyBudgetCount').textContent = Object.keys(state.budgets).length;
  document.getElementById('privacyStorage').textContent =
    currentUser && API.hasToken() ? 'Yerel + Bulut' : 'Yalnızca Yerel';
  document.getElementById('deleteCloudData').classList.toggle(
    'hidden',
    !currentUser || !API.hasToken()
  );
  document.getElementById('privacyDialog').showModal();
}

document.querySelectorAll('[data-policy]').forEach(button =>
  button.addEventListener('click', () => openPolicy(button.dataset.policy))
);
document.getElementById('policyClose').addEventListener('click', () =>
  document.getElementById('policyDialog').close()
);
document.getElementById('policyDone').addEventListener('click', () =>
  document.getElementById('policyDialog').close()
);
document.getElementById('privacyBtn').addEventListener('click', openPrivacyCenter);
document.getElementById('privacyClose').addEventListener('click', () =>
  document.getElementById('privacyDialog').close()
);
document.getElementById('privacyExport').addEventListener('click', exportJSON);
document.getElementById('deleteCloudData').addEventListener('click', async () => {
  if (!confirm('Hesabınız ve sunucudaki tüm Parabu verileriniz kalıcı olarak silinecek. Devam edilsin mi?')) return;
  try {
    await API.deleteMe();
    API.setToken(null);
    currentUser = null;
    localStorage.removeItem(STORAGE_KEY);
    document.getElementById('privacyDialog').close();
    location.reload();
  } catch (err) {
    toast('Bulut verileri silinemedi');
    console.error(err);
  }
});

/* ---------- Service Worker ---------- */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(err => console.warn('SW:', err));
  });
}

/* ---------- Boot ---------- */
initTheme();
bootstrapAuth();

window.addEventListener('offline', () => setSyncStatus('offline'));
window.addEventListener('online', () => {
  if (currentUser && API.hasToken()) scheduleSync();
  else setSyncStatus('local');
});

function updateWelcomePreview() {
  if (!currentUser || !API.hasToken()) {
    ['welcomeBalance', 'welcomeIncome', 'welcomeExpense', 'welcomeSavings'].forEach(id => {
      document.getElementById(id).textContent = '••••';
    });
    document.getElementById('welcomeBalance').classList.remove('negative');
    return;
  }
  const income = totalIncome();
  const expense = totalExpense();
  const balance = currentBalance();
  const savings = income > 0 ? ((income - expense) / income) * 100 : 0;
  document.getElementById('welcomeBalance').textContent = fmtCurrency(balance);
  document.getElementById('welcomeIncome').textContent = fmtCurrency(income);
  document.getElementById('welcomeExpense').textContent = fmtCurrency(expense);
  document.getElementById('welcomeSavings').textContent =
    income > 0 ? `%${savings.toFixed(0)}` : '—';
  document.getElementById('welcomeBalance').classList.toggle('negative', balance < 0);
}

function renderAccessState() {
  const authenticated = hasAuthenticatedSession();
  const welcome = document.getElementById('welcomeScreen');
  const shell = document.getElementById('appShell');
  if (!authenticated) {
    shell.classList.add('hidden');
    welcome.classList.remove('hidden');
    updateWelcomePreview();
    return;
  }
  welcome.classList.add('hidden');
  shell.classList.remove('hidden');
}

function enterDashboard() {
  if (!currentUser || !API.hasToken()) {
    openAuthDialog('login');
    return;
  }
  const welcome = document.getElementById('welcomeScreen');
  const shell = document.getElementById('appShell');
  welcome.classList.add('welcome-leaving');
  setTimeout(() => {
    welcome.classList.add('hidden');
    welcome.classList.remove('welcome-leaving');
    shell.classList.remove('hidden');
  }, 260);
}

document.getElementById('welcomeRegister').addEventListener('click', () => openAuthDialog('register'));
document.getElementById('welcomeLogin').addEventListener('click', () => openAuthDialog('login'));
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    if (!currentUser || !API.hasToken()) {
      openAuthDialog('login');
      return;
    }
    document.querySelectorAll('.tab').forEach(item => {
      const active = item === tab;
      item.classList.toggle('active', active);
      item.setAttribute('aria-selected', String(active));
    });
    document.querySelectorAll('.tab-content').forEach(content =>
      content.classList.toggle('active', content.dataset.tab === tab.dataset.tab)
    );
    if (tab.dataset.tab === 'charts') renderCharts();
  });
});

updateWelcomePreview();
renderAccessState();