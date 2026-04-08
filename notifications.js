// ============================================================
// HELPRO — Notifications (Phase 1: In-App)
// Drop into helpro-main/ and add AFTER app.js on every page:
//   <script src="notifications.js"></script>
// ============================================================

(function () {

  // ── STATE ─────────────────────────────────────────────────
  let _notifUser       = null;
  let _notifChannel    = null;
  let _notifUnread     = 0;
  let _notifAll        = [];
  let _panelOpen       = false;

  // ── PWA / PUSH STATE ──────────────────────────────────────
  const VAPID_PUBLIC_KEY = 'BNbcuKENfrcqh36ldyoxGv_0Tjr_3jDgHqgpnexRzXPt6Dqe3VnslDuGTY2slNhiiuPkINE6Hg1l_0mSfP7BlQE';
  let _swRegistration    = null;
  let _pushGranted       = false;

  // ── NOTIFICATION ICONS / COLOURS ──────────────────────────
  const NOTIF_META = {
    new_application: { icon: 'fa-file-lines',     color: '#3b82f6', bg: '#eff6ff' },
    hired:           { icon: 'fa-handshake',       color: '#3db83a', bg: '#e8f7e8' },
    job_completed:   { icon: 'fa-circle-check',    color: '#3db83a', bg: '#e8f7e8' },
    new_review:      { icon: 'fa-star',            color: '#f59e0b', bg: '#fffbeb' },
    account_approved:{ icon: 'fa-shield-check',    color: '#3db83a', bg: '#e8f7e8' },
    account_rejected:{ icon: 'fa-circle-xmark',    color: '#ef4444', bg: '#fef2f2' },
    new_message:     { icon: 'fa-comment',         color: '#8b5cf6', bg: '#f5f3ff' },
    new_helper:      { icon: 'fa-user-plus',       color: '#f07623', bg: '#fff3ec' },
    new_job:         { icon: 'fa-briefcase',       color: '#0891b2', bg: '#ecfeff' },
  };

  // ── INJECT CSS ────────────────────────────────────────────
  function injectStyles() {
    if (document.getElementById('notif-styles')) return;
    const s = document.createElement('style');
    s.id = 'notif-styles';
    s.textContent = `
      /* ── BELL BUTTON ── */
      #notif-bell-btn {
        position: relative;
        width: 38px; height: 38px;
        border-radius: 50%;
        background: none; border: none;
        display: flex; align-items: center; justify-content: center;
        font-size: 18px; color: var(--text, #111);
        cursor: pointer; flex-shrink: 0;
        transition: background 0.2s, color 0.2s, transform 0.2s;
      }
      #notif-bell-btn:hover  { background: var(--surface-2, #eee); color: var(--green-dark, #2a8a28); }
      #notif-bell-btn:active { transform: scale(0.92); }
      #notif-bell-btn.ringing i {
        animation: bellRing 0.5s ease;
      }
      @keyframes bellRing {
        0%,100% { transform: rotate(0);     }
        15%      { transform: rotate(12deg); }
        30%      { transform: rotate(-10deg);}
        45%      { transform: rotate(8deg);  }
        60%      { transform: rotate(-6deg); }
        75%      { transform: rotate(4deg);  }
      }

      /* ── BADGE ── */
      #notif-badge {
        position: absolute; top: -3px; right: -3px;
        min-width: 17px; height: 17px;
        background: #ef4444; color: white;
        font-size: 9px; font-weight: 800;
        border-radius: 9px; border: 2px solid white;
        display: flex; align-items: center; justify-content: center;
        padding: 0 3px; pointer-events: none;
        transition: transform 0.2s cubic-bezier(0.34,1.56,0.64,1), opacity 0.2s;
      }
      #notif-badge.hidden { transform: scale(0); opacity: 0; }

      /* ── PANEL OVERLAY ── */
      #notif-overlay {
        position: fixed; inset: 0;
        background: rgba(10,20,10,0.4);
        backdrop-filter: blur(4px);
        z-index: 4500;
        opacity: 0; pointer-events: none;
        transition: opacity 0.22s;
      }
      #notif-overlay.open { opacity: 1; pointer-events: all; }

      /* ── PANEL SHEET ── */
      #notif-panel {
        position: fixed;
        top: 0; right: 0;
        width: 340px; max-width: 100vw;
        height: 100%;
        background: white;
        z-index: 4600;
        display: flex; flex-direction: column;
        box-shadow: -8px 0 40px rgba(0,0,0,0.14);
        transform: translateX(100%);
        transition: transform 0.3s cubic-bezier(0.32,0.72,0,1);
      }
      #notif-panel.open { transform: translateX(0); }

      /* Panel header */
      .notif-panel-head {
        display: flex; align-items: center; justify-content: space-between;
        padding: 18px 18px 14px;
        border-bottom: 1px solid #e8f0e8;
        flex-shrink: 0;
      }
      .notif-panel-title {
        font-family: 'Outfit', sans-serif;
        font-weight: 800; font-size: 18px; color: #0d1a0d;
        display: flex; align-items: center; gap: 8px;
      }
      .notif-panel-title span {
        background: #3db83a; color: white;
        font-size: 11px; font-weight: 800;
        padding: 2px 7px; border-radius: 10px;
      }
      .notif-close-btn {
        width: 32px; height: 32px; border-radius: 50%;
        background: #f0f7f0; border: none; cursor: pointer;
        display: flex; align-items: center; justify-content: center;
        font-size: 14px; color: #3a4d3a; transition: background 0.15s;
      }
      .notif-close-btn:hover { background: #e0ede0; }

      /* Mark all read button */
      .notif-mark-all {
        padding: 8px 18px 10px;
        border-bottom: 1px solid #f0f5f0;
        display: flex; justify-content: flex-end;
        flex-shrink: 0;
      }
      .notif-mark-all button {
        background: none; border: none;
        font-size: 12px; font-weight: 700;
        color: #3db83a; cursor: pointer; padding: 4px 0;
        transition: color 0.15s;
      }
      .notif-mark-all button:hover { color: #2a8a28; text-decoration: underline; }

      /* List */
      .notif-list {
        flex: 1; overflow-y: auto;
        padding: 6px 0;
        scrollbar-width: thin;
        scrollbar-color: #dce8dc transparent;
      }
      .notif-list::-webkit-scrollbar { width: 4px; }
      .notif-list::-webkit-scrollbar-thumb { background: #dce8dc; border-radius: 2px; }

      /* Empty state */
      .notif-empty {
        display: flex; flex-direction: column;
        align-items: center; justify-content: center;
        gap: 10px; padding: 60px 20px; text-align: center;
        color: #8a9a8a;
      }
      .notif-empty i { font-size: 36px; opacity: 0.35; }
      .notif-empty p { font-size: 14px; line-height: 1.5; }

      /* Individual notification row */
      .notif-item {
        display: flex; align-items: flex-start; gap: 12px;
        padding: 13px 16px;
        border-bottom: 1px solid #f5f8f5;
        cursor: pointer;
        transition: background 0.15s;
        position: relative;
        animation: notifIn 0.25s ease both;
      }
      @keyframes notifIn {
        from { opacity:0; transform: translateX(10px); }
        to   { opacity:1; transform: translateX(0); }
      }
      .notif-item:hover { background: #fafcfa; }
      .notif-item.unread { background: #f7fdf7; }
      .notif-item.unread::before {
        content: '';
        position: absolute; left: 0; top: 0; bottom: 0;
        width: 3px; border-radius: 0 2px 2px 0;
        background: #3db83a;
      }

      /* Icon circle */
      .notif-icon {
        width: 38px; height: 38px; border-radius: 12px;
        display: flex; align-items: center; justify-content: center;
        font-size: 15px; flex-shrink: 0;
      }

      /* Text */
      .notif-content { flex: 1; min-width: 0; }
      .notif-title {
        font-size: 13px; font-weight: 700; color: #0d1a0d;
        margin-bottom: 2px; line-height: 1.35;
      }
      .notif-item.unread .notif-title { color: #1a3a1a; }
      .notif-body {
        font-size: 12px; color: #5a6a5a; line-height: 1.5;
        display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
        overflow: hidden;
      }
      .notif-time {
        font-size: 10px; color: #9aaa9a;
        font-weight: 600; margin-top: 4px;
      }

      /* Unread dot */
      .notif-unread-dot {
        width: 8px; height: 8px; border-radius: 50%;
        background: #3db83a; flex-shrink: 0; margin-top: 4px;
      }

      /* Panel footer — settings link */
      .notif-footer {
        padding: 12px 18px 20px;
        border-top: 1px solid #e8f0e8;
        text-align: center;
        flex-shrink: 0;
      }
      .notif-footer a {
        font-size: 12px; color: #8a9a8a; text-decoration: none;
        font-weight: 600; transition: color 0.15s;
      }
      .notif-footer a:hover { color: #3db83a; }


      /* ── PUSH PERMISSION PROMPT ── */
      #push-prompt {
        position: fixed;
        bottom: calc(68px + 12px);
        left: 50%; transform: translateX(-50%) translateY(20px);
        background: white;
        border: 1.5px solid #c8e0c8;
        border-radius: 18px;
        padding: 14px 18px;
        display: flex; align-items: center; gap: 12px;
        box-shadow: 0 8px 32px rgba(0,0,0,0.14);
        z-index: 4000;
        max-width: 340px; width: calc(100% - 32px);
        opacity: 0; pointer-events: none;
        transition: opacity 0.3s, transform 0.3s cubic-bezier(0.34,1.56,0.64,1);
      }
      #push-prompt.show {
        opacity: 1; pointer-events: all;
        transform: translateX(-50%) translateY(0);
      }
      .push-prompt-icon {
        width: 40px; height: 40px; border-radius: 12px;
        background: #e8f7e8; color: #3db83a;
        display: flex; align-items: center; justify-content: center;
        font-size: 18px; flex-shrink: 0;
      }
      .push-prompt-text { flex: 1; }
      .push-prompt-text strong {
        display: block; font-size: 13px; font-weight: 700;
        color: #0d1a0d; margin-bottom: 2px;
      }
      .push-prompt-text span { font-size: 11px; color: #5a6a5a; line-height: 1.4; }
      .push-prompt-actions { display: flex; gap: 6px; flex-shrink: 0; }
      .btn-push-allow {
        padding: 7px 14px; border-radius: 20px;
        background: #3db83a; color: white; border: none;
        font-size: 12px; font-weight: 700; cursor: pointer;
        transition: background 0.15s;
      }
      .btn-push-allow:hover { background: #2a8a28; }
      .btn-push-dismiss {
        padding: 7px 10px; border-radius: 20px;
        background: #f0f5f0; color: #5a6a5a; border: none;
        font-size: 12px; cursor: pointer;
        transition: background 0.15s;
      }
      .btn-push-dismiss:hover { background: #e0ede0; }

      /* Push enabled indicator in panel footer */
      .push-status-row {
        display: flex; align-items: center; gap: 8px;
        font-size: 12px; font-weight: 600;
        margin-bottom: 6px;
      }
      .push-status-dot {
        width: 8px; height: 8px; border-radius: 50%;
      }
      .push-status-dot.on  { background: #3db83a; }
      .push-status-dot.off { background: #9aaa9a; }
      /* Mobile: full-width panel */
      @media (max-width: 420px) {
        #notif-panel { width: 100vw; }
      }
    `;
    document.head.appendChild(s);
  }


  // ── TIME HELPER ───────────────────────────────────────────
  function timeAgo(d) {
    if (!d) return '';
    const s = Math.floor((Date.now() - new Date(d)) / 1000);
    if (s < 60)     return 'just now';
    if (s < 3600)   return Math.floor(s / 60) + 'm ago';
    if (s < 86400)  return Math.floor(s / 3600) + 'h ago';
    if (s < 604800) return Math.floor(s / 86400) + 'd ago';
    return new Date(d).toLocaleDateString('en-KE', { day: 'numeric', month: 'short' });
  }


  // ── INJECT BELL INTO HEADER ───────────────────────────────
  function injectBell() {
    if (document.getElementById('notif-bell-btn')) return;

    const header = document.querySelector('.app-header');
    if (!header) return;

    // The header is: [hamburger] [logo] [profile-btn]
    // We replace the profile btn with [bell] [profile-btn] side by side
    const profileBtn = header.querySelector('.icon-btn:last-child');

    const bell = document.createElement('button');
    bell.id = 'notif-bell-btn';
    bell.setAttribute('aria-label', 'Notifications');
    bell.setAttribute('title', 'Notifications');
    bell.innerHTML = `
      <i class="fas fa-bell"></i>
      <span id="notif-badge" class="hidden">0</span>`;
    bell.addEventListener('click', togglePanel);

    if (profileBtn) {
      header.insertBefore(bell, profileBtn);
    } else {
      header.appendChild(bell);
    }
  }


  // ── PANEL DOM ────────────────────────────────────────────
  function injectPanel() {
    if (document.getElementById('notif-panel')) return;

    const overlay = document.createElement('div');
    overlay.id = 'notif-overlay';
    overlay.addEventListener('click', closePanel);
    document.body.appendChild(overlay);

    const panel = document.createElement('div');
    panel.id = 'notif-panel';
    panel.innerHTML = `
      <div class="notif-panel-head">
        <div class="notif-panel-title">
          <i class="fas fa-bell" style="color:#3db83a"></i>
          Notifications
          <span id="notif-panel-count" style="display:none">0</span>
        </div>
        <button class="notif-close-btn" onclick="window._closeNotifPanel()">
          <i class="fas fa-times"></i>
        </button>
      </div>
      <div class="notif-mark-all">
        <button onclick="window._markAllRead()">Mark all as read</button>
      </div>
      <div class="notif-list" id="notif-list">
        <div class="notif-empty">
          <i class="fas fa-bell-slash"></i>
          <p>No notifications yet.<br>You'll see updates here.</p>
        </div>
      </div>
      <div class="notif-footer">
        <a href="#">Notification settings coming soon</a>
      </div>
    `;
    document.body.appendChild(panel);
  }


  // ── RENDER NOTIFICATIONS ─────────────────────────────────
  function renderNotifList() {
    const list = document.getElementById('notif-list');
    if (!list) return;

    if (!_notifAll.length) {
      list.innerHTML = `
        <div class="notif-empty">
          <i class="fas fa-bell-slash"></i>
          <p>No notifications yet.<br>You'll see updates here.</p>
        </div>`;
      return;
    }

    list.innerHTML = _notifAll.map((n, i) => {
      const meta = NOTIF_META[n.type] || { icon: 'fa-circle-info', color: '#8a9a8a', bg: '#f5f5f5' };
      return `
        <div class="notif-item ${n.is_read ? '' : 'unread'}"
             style="animation-delay:${i * 0.04}s"
             onclick="window._notifItemClick('${n.id}', ${JSON.stringify(n.data || {}).replace(/"/g, '&quot;')})">
          <div class="notif-icon" style="background:${meta.bg};color:${meta.color}">
            <i class="fas ${meta.icon}"></i>
          </div>
          <div class="notif-content">
            <div class="notif-title">${escapeHtml(n.title)}</div>
            <div class="notif-body">${escapeHtml(n.body || '')}</div>
            <div class="notif-time">${timeAgo(n.created_at)}</div>
          </div>
          ${n.is_read ? '' : '<div class="notif-unread-dot"></div>'}
        </div>`;
    }).join('');
  }

  function escapeHtml(t) {
    return (t || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }


  // ── UPDATE BADGE ─────────────────────────────────────────
  function updateBadge() {
    const badge = document.getElementById('notif-badge');
    const count = document.getElementById('notif-panel-count');
    if (!badge) return;

    if (_notifUnread > 0) {
      badge.textContent  = _notifUnread > 99 ? '99+' : _notifUnread;
      badge.classList.remove('hidden');
    } else {
      badge.classList.add('hidden');
    }

    if (count) {
      count.textContent = _notifUnread;
      count.style.display = _notifUnread > 0 ? 'inline-flex' : 'none';
    }
  }


  // ── RING BELL ────────────────────────────────────────────
  function ringBell() {
    const btn = document.getElementById('notif-bell-btn');
    if (!btn) return;
    btn.classList.add('ringing');
    setTimeout(() => btn.classList.remove('ringing'), 600);
  }


  // ── OPEN / CLOSE PANEL ───────────────────────────────────
  function togglePanel() {
    _panelOpen ? closePanel() : openPanel();
  }

  function openPanel() {
    _panelOpen = true;
    document.getElementById('notif-overlay')?.classList.add('open');
    document.getElementById('notif-panel')?.classList.add('open');
    renderNotifList();
    // Mark visible unread as read after a short delay
    setTimeout(markVisibleAsRead, 1200);
  }

  function closePanel() {
    _panelOpen = false;
    document.getElementById('notif-overlay')?.classList.remove('open');
    document.getElementById('notif-panel')?.classList.remove('open');
  }

  window._closeNotifPanel = closePanel;


  // ── MARK ALL READ ────────────────────────────────────────
  async function markAllRead() {
    if (!_notifUser) return;
    const supaClient = window.client || window.db;
    if (!supaClient) return;

    try {
      await supaClient
        .from('notifications')
        .update({ is_read: true })
        .eq('user_id', _notifUser.id)
        .eq('is_read', false);

      _notifAll.forEach(n => n.is_read = true);
      _notifUnread = 0;
      updateBadge();
      renderNotifList();
    } catch (e) {}
  }

  window._markAllRead = markAllRead;


  // ── MARK VISIBLE AS READ (when panel opens) ───────────────
  async function markVisibleAsRead() {
    if (!_notifUser || _notifUnread === 0) return;
    const supaClient = window.client || window.db;
    if (!supaClient) return;

    try {
      await supaClient
        .from('notifications')
        .update({ is_read: true })
        .eq('user_id', _notifUser.id)
        .eq('is_read', false);

      _notifAll.forEach(n => n.is_read = true);
      _notifUnread = 0;
      updateBadge();
      // Re-render to remove unread styling
      renderNotifList();
    } catch (e) {}
  }


  // ── NOTIFICATION ITEM CLICK ──────────────────────────────
  window._notifItemClick = function(id, data) {
    // Navigate based on notification data
    if (data.job_id && (data.booking_id || data.helper_id)) {
      // Application or hire — open dashboard
      closePanel();
      if (typeof goToPage === 'function') goToPage('dashboard.html');
    } else if (data.helper_id && !data.job_id) {
      // New helper for admin — go to admin
      closePanel();
      if (typeof goToPage === 'function') goToPage('admin.html');
    }
  };


  // ── LOAD NOTIFICATIONS ────────────────────────────────────
  async function loadNotifications() {
    const supaClient = window.client || window.db;
    if (!supaClient || !_notifUser) return;

    try {
      const { data, error } = await supaClient
        .from('notifications')
        .select('*')
        .eq('user_id', _notifUser.id)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;

      _notifAll    = data || [];
      _notifUnread = _notifAll.filter(n => !n.is_read).length;
      updateBadge();
      if (_panelOpen) renderNotifList();
    } catch (e) {}
  }


  // ── REALTIME SUBSCRIPTION ────────────────────────────────
  function subscribeToNotifications() {
    const supaClient = window.client || window.db;
    if (!supaClient || !_notifUser) return;

    // Remove any old channel
    if (_notifChannel) supaClient.removeChannel(_notifChannel);

    _notifChannel = supaClient
      .channel('notifications-' + _notifUser.id)
      .on('postgres_changes', {
        event:  'INSERT',
        schema: 'public',
        table:  'notifications',
        filter: `user_id=eq.${_notifUser.id}`
      }, (payload) => {
        const notif = payload.new;
        // Prepend to list
        _notifAll.unshift(notif);
        if (!notif.is_read) {
          _notifUnread++;
          updateBadge();
          ringBell();
        }
        // Update panel if open
        if (_panelOpen) renderNotifList();
      })
      .subscribe();
  }



  // ── PWA & PUSH FUNCTIONS ─────────────────────────────────

  // Register service worker
  async function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return null;
    try {
      const reg = await navigator.serviceWorker.register('sw.js', { scope: './' });
      _swRegistration = reg;
      // Send VAPID key to SW for re-subscribe handling
      if (reg.active) {
        reg.active.postMessage({ type: 'SET_VAPID_KEY', key: VAPID_PUBLIC_KEY });
      }
      return reg;
    } catch (e) {
      return null;
    }
  }

  // Convert VAPID public key to Uint8Array
  function vapidKeyToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64  = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const raw     = atob(base64);
    return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
  }

  // Subscribe browser to push
  async function subscribeToPush() {
    if (!_swRegistration) return null;
    try {
      const existing = await _swRegistration.pushManager.getSubscription();
      if (existing) return existing;

      const sub = await _swRegistration.pushManager.subscribe({
        userVisibleOnly:      true,
        applicationServerKey: vapidKeyToUint8Array(VAPID_PUBLIC_KEY),
      });
      return sub;
    } catch (e) {
      return null;
    }
  }

  // Save subscription to Supabase
  async function saveSubscription(sub) {
    if (!_notifUser || !sub) return;
    const supaClient = window.client || window.db;
    if (!supaClient) return;

    const json = sub.toJSON();
    try {
      await supaClient.from('push_subscriptions').upsert({
        user_id:    _notifUser.id,
        endpoint:   json.endpoint,
        p256dh:     json.keys?.p256dh,
        auth:       json.keys?.auth,
        user_agent: navigator.userAgent.slice(0, 200),
        last_used_at: new Date().toISOString(),
      }, { onConflict: 'endpoint' });
    } catch (e) {}
  }

  // Remove subscription from Supabase (on explicit disable)
  async function removeSubscription() {
    if (!_notifUser || !_swRegistration) return;
    const supaClient = window.client || window.db;
    if (!supaClient) return;

    try {
      const sub = await _swRegistration.pushManager.getSubscription();
      if (sub) {
        await supaClient
          .from('push_subscriptions')
          .delete()
          .eq('endpoint', sub.endpoint);
        await sub.unsubscribe();
      }
    } catch (e) {}
  }

  // Show permission prompt (once per device, 3 days after dismiss)
  function showPushPrompt() {
    // Don't show if already on page
    if (document.getElementById('push-prompt')) return;

    // Don't show if browser already granted or denied — no point asking again
    if ('Notification' in window && Notification.permission !== 'default') return;

    // Don't show if user already clicked Allow in our custom UI
    if (localStorage.getItem('push_asked') === '1') return;

    // Don't show if user dismissed recently (3-day cooldown)
    if (localStorage.getItem('push_dismissed_until')) {
      const until = parseInt(localStorage.getItem('push_dismissed_until'));
      if (Date.now() < until) return;
    }

    const prompt = document.createElement('div');
    prompt.id = 'push-prompt';
    prompt.innerHTML = `
      <div class="push-prompt-icon"><i class="fas fa-bell"></i></div>
      <div class="push-prompt-text">
        <strong>Stay in the loop</strong>
        <span>Get notified about jobs, messages & hires — even when the app is closed.</span>
      </div>
      <div class="push-prompt-actions">
        <button class="btn-push-allow" onclick="window._allowPush()">Allow</button>
        <button class="btn-push-dismiss" onclick="window._dismissPush()">✕</button>
      </div>`;
    document.body.appendChild(prompt);
    // Animate in
    setTimeout(() => prompt.classList.add('show'), 100);
  }

  window._allowPush = async function() {
    const prompt = document.getElementById('push-prompt');
    if (prompt) { prompt.classList.remove('show'); setTimeout(() => prompt.remove(), 300); }

    // Mark as asked immediately — no matter what the user picks in the browser dialog
    // This prevents the prompt from looping if the user denies or ignores
    localStorage.setItem('push_asked', '1');

    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      _pushGranted = true;
      const sub = await subscribeToPush();
      if (sub) {
        await saveSubscription(sub);
        updatePushStatusInPanel();
        // Show a brief in-app confirmation so user knows it worked
        if (typeof showToast === 'function') {
          showToast('Notifications enabled ✓', 'You will now receive job and message alerts.', 'success');
        }
      }
    } else if (permission === 'denied') {
      // User blocked it — update the panel footer to reflect this
      updatePushStatusInPanel();
    }
  };

  window._dismissPush = function() {
    const prompt = document.getElementById('push-prompt');
    if (prompt) { prompt.classList.remove('show'); setTimeout(() => prompt.remove(), 300); }
    // Don't ask again for 7 days (increased from 3 — less annoying)
    localStorage.setItem('push_dismissed_until', String(Date.now() + 7 * 86400000));
  };

  // Update push status line in the notification panel footer
  function updatePushStatusInPanel() {
    const footer = document.querySelector('.notif-footer');
    if (!footer) return;
    const perm = Notification.permission;
    const isOn = perm === 'granted' && _pushGranted;
    footer.innerHTML = `
      <div class="push-status-row">
        <div class="push-status-dot ${isOn ? 'on' : 'off'}"></div>
        <span style="color:#5a6a5a">${isOn ? 'Push notifications on' : 'Push notifications off'}</span>
        ${!isOn && perm !== 'denied'
          ? '<button onclick="window._allowPush()" style="margin-left:auto;background:none;border:none;color:#3db83a;font-size:12px;font-weight:700;cursor:pointer">Enable</button>'
          : ''}
        ${isOn ? '<button onclick="window._disablePush()" style="margin-left:auto;background:none;border:none;color:#9aaa9a;font-size:12px;cursor:pointer">Disable</button>' : ''}
      </div>
      <a href="#" style="font-size:11px;color:#9aaa9a">Notification preferences coming soon</a>`;
  }

  window._disablePush = async function() {
    await removeSubscription();
    _pushGranted = false;
    updatePushStatusInPanel();
  };

  // Handle SW message about subscription change
  navigator.serviceWorker?.addEventListener('message', async (event) => {
    if (event.data?.type === 'PUSH_SUBSCRIPTION_CHANGED') {
      const sub = event.data.subscription;
      if (sub && _notifUser) {
        const supaClient = window.client || window.db;
        if (supaClient) {
          await supaClient.from('push_subscriptions').upsert({
            user_id:  _notifUser.id,
            endpoint: sub.endpoint,
            p256dh:   sub.keys?.p256dh,
            auth:     sub.keys?.auth,
          }, { onConflict: 'endpoint' });
        }
      }
    }
  });

  // ── INIT ─────────────────────────────────────────────────
  async function initNotifications() {
    injectStyles();
    injectBell();
    injectPanel();

    // Register service worker (non-blocking)
    registerServiceWorker();

    // Wait for Supabase client
    const supaClient = window.client || window.db;
    if (!supaClient) return;

    try {
      const { data: { user } } = await supaClient.auth.getUser();
      if (!user) return;
      _notifUser = user;

      await loadNotifications();
      subscribeToNotifications();

      // Check push permission state and handle accordingly
      if ('Notification' in window) {
        if (Notification.permission === 'granted') {
          _pushGranted = true;
          // Ensure subscription is still saved (handles reinstalls / cleared data)
          const sub = await subscribeToPush();
          if (sub) await saveSubscription(sub);
        } else if (Notification.permission === 'default') {
          // Only show prompt if user hasn't already been asked or dismissed recently.
          // showPushPrompt() has all the guards built in, so it's safe to call.
          // Wait 10 seconds so the user can settle into the page first.
          setTimeout(showPushPrompt, 10000);
        }
        // If 'denied' — do nothing. Respect the user's browser setting silently.
      }
      updatePushStatusInPanel();

    } catch (e) {}
  }

  // Run after DOM + scripts are ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(initNotifications, 400));
  } else {
    setTimeout(initNotifications, 400);
  }

  // Expose for manual refresh and cross-module use
  window.refreshNotifications = loadNotifications;
  window.ringBell = ringBell;
  window.openNotifPanel = openPanel;

})();
