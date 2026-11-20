/* ============================================================
   Parabu — Modern Features
   Yüklenme sırası: app.js'den SONRA
   ============================================================ */
(function () {
  'use strict';

  /* ---------- 1. Enhanced toast (tip algılamalı) ---------- */
  const detectToastType = msg => {
    if (/hata|başarısız|geçersiz|yanlış|silinemedi|kapat/i.test(msg)) return 'error';
    if (/başarı|eklendi|güncellendi|silindi|indirildi|yüklendi|kaydedildi/i.test(msg)) return 'success';
    return 'info';
  };
  const toastIcons = { success: '✓', error: '!', info: 'i' };
  const esc = s =>
    String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  window.toast = function (msg, type) {
    const el = document.getElementById('toast');
    if (!el) return;
    const t = type || detectToastType(msg);
    el.className = 'toast show toast-' + t;
    el.innerHTML = '<span class="toast-icon">' + (toastIcons[t] || 'i') + '</span><span>' + esc(msg) + '</span>';
    clearTimeout(window._toastTimer);
    window._toastTimer = setTimeout(() => el.classList.remove('show'), 2500);
  };

  /* ---------- 2. Animasyonlu sayı sayaçları ---------- */
  function getDisplayedVal(id) {
    const el = document.getElementById(id);
    if (!el) return 0;
    const v = parseFloat(el.dataset.val || '0');
    return Number.isFinite(v) ? v : 0;
  }
  function setDisplayedVal(id, v) {
    const el = document.getElementById(id);
    if (el) el.dataset.val = String(v);
  }
  function animateNumber(id, to, duration = 700) {
    const el = document.getElementById(id);
    if (!el) return;
    const from = getDisplayedVal(id);
    if (Math.abs(from - to) < 0.001) {
      el.textContent = fmtCurrency(to);
      return;
    }
    const start = performance.now();
    const step = now => {
      const p = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      const current = from + (to - from) * eased;
      el.textContent = fmtCurrency(current);
      if (p < 1) requestAnimationFrame(step);
      else {
        el.textContent = fmtCurrency(to);
        setDisplayedVal(id, to);
      }
    };
    requestAnimationFrame(step);
  }

  // app.js'deki renderSummary'yi override et
  if (typeof window.renderSummary === 'function') {
    window.renderSummary = function () {
      const inc = totalIncome();
      const exp = totalExpense();
      const bal = state.initialBalance + inc - exp;

      animateNumber('sumInitial', state.initialBalance);
      animateNumber('sumIncome', inc);
      animateNumber('sumExpense', exp);
      animateNumber('sumBalance', bal);

      setDisplayedVal('sumInitial', state.initialBalance);
      setDisplayedVal('sumIncome', inc);
      setDisplayedVal('sumExpense', exp);

      const el = document.getElementById('sumBalance');
      if (el) el.classList.toggle('negative', bal < 0);
    };
  }

  /* ---------- 3. FAB (sabit "+" butonu) ---------- */
  function addFab() {
    if (document.querySelector('.fab')) return;
    const fab = document.createElement('button');
    fab.className = 'fab';
    fab.type = 'button';
    fab.title = 'Yeni İşlem (N)';
    fab.setAttribute('aria-label', 'Yeni işlem ekle');
    fab.innerHTML = '+';
    fab.addEventListener('click', () => {
      if (typeof openTxDialog === 'function') openTxDialog(null);
    });
    document.body.appendChild(fab);
  }

  /* ---------- 4. Klavye kısayolları ---------- */
  document.addEventListener('keydown', e => {
    const tag = (e.target && e.target.tagName) || '';
    const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(tag);

    // N → yeni işlem
    if (!typing && (e.key === 'n' || e.key === 'N') && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      if (typeof openTxDialog === 'function') openTxDialog(null);
      return;
    }
    // / veya Ctrl+K → arama kutusuna odaklan
    if (!typing && (e.key === '/' || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k'))) {
      e.preventDefault();
      const s = document.getElementById('searchInput');
      if (s) {
        s.focus();
        s.select();
      }
      return;
    }
    // Escape → açık dialogları kapat
    if (e.key === 'Escape') {
      document.querySelectorAll('dialog[open]').forEach(d => {
        try { d.close(); } catch (_) {}
      });
    }
  });

  /* ---------- 5. Kısayol ipuçları ---------- */
  function addShortcutHints() {
    const addBtn = document.getElementById('addTxBtn');
    if (addBtn && !addBtn.querySelector('.kbd')) {
      addBtn.insertAdjacentHTML(
        'beforeend',
        ' <span class="kbd" style="margin-left:6px;opacity:0.7;font-size:11px;padding:1px 6px;border:1px solid currentColor;border-radius:4px;font-weight:700">N</span>'
      );
    }
    const search = document.getElementById('searchInput');
    if (search && !search.dataset.hintSet) {
      search.placeholder = 'Açıklama veya kategori ara… ( / )';
      search.dataset.hintSet = '1';
    }
  }

  /* ---------- Başlat ---------- */
  function init() {
    addFab();
    addShortcutHints();
    setDisplayedVal('sumInitial', 0);
    setDisplayedVal('sumIncome', 0);
    setDisplayedVal('sumExpense', 0);
    setDisplayedVal('sumBalance', 0);
    if (
      typeof window.renderAll === 'function' &&
      typeof window.hasAuthenticatedSession === 'function' &&
      window.hasAuthenticatedSession()
    ) {
      window.renderAll();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();