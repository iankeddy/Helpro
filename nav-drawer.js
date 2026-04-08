// ============================================================
// HELPRO — Shared Navigation Drawer
// Drop this file into helpro-main/ and add:
//   <script src="nav-drawer.js"></script>
// as the FIRST script on every page (after supabase if needed).
// Then call: initNav('home') | 'market' | 'dashboard' | 'admin'
// ============================================================

(function() {

  // ── NAV ITEMS ──────────────────────────────────────────────
  const NAV_ITEMS = [
    { key: 'home',      href: 'index.html',     icon: 'fa-home',       label: 'Home'        },
    { key: 'market',    href: 'market.html',     icon: 'fa-store',      label: 'Marketplace' },
    { key: 'dashboard', href: 'dashboard.html',  icon: 'fa-th-large',   label: 'Dashboard'   },
    { key: 'referral',  href: 'referral.html',   icon: 'fa-gift',       label: 'Invite & Earn', badge: 'KES 100' },
  ];

  const LEGAL_ITEMS = [
    { href: 'about.html',   icon: 'fa-circle-info', label: 'About Helpro'    },
    { href: 'terms.html',   icon: 'fa-file-lines',  label: 'Terms & Conditions' },
    { href: 'privacy.html', icon: 'fa-shield-halved', label: 'Privacy Policy' },
  ];

  // ── INJECT DRAWER HTML ─────────────────────────────────────
  function buildDrawer(activeKey) {
    const navItems = NAV_ITEMS.map(n => `
      <button class="menu-item ${n.key === activeKey ? 'active' : ''}" onclick="goToPage('${n.href}')">
        <i class="fas ${n.icon}"></i> ${n.label}
        ${n.badge ? `<span class="nav-badge">${n.badge}</span>` : ''}
      </button>`).join('');

    const legalItems = LEGAL_ITEMS.map(l => `
      <a class="menu-item" href="${l.href}">
        <i class="fas ${l.icon}"></i> ${l.label}
      </a>`).join('');

    return `
      <div class="menu-content" onclick="event.stopPropagation()">

        <!-- Brand / Logo -->
        <div class="menu-brand">
          <img src="images/helpro-logo.png" alt="Helpro"
            class="menu-logo-img"
            onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">
          <div class="menu-brand-icon" style="display:none">A</div>
        </div>

        <!-- Main navigation -->
        <div class="menu-nav">
          ${navItems}

          <!-- Divider -->
          <div class="menu-divider">
            <span>Info</span>
          </div>

          ${legalItems}
        </div>

        <!-- User + Logout footer -->
        <div class="menu-footer">
          <div class="menu-user" id="menu-user-info" onclick="handleProfileClick ? handleProfileClick() : goToPage('auth.html')">
            <div class="menu-user-avatar" id="menu-avatar">?</div>
            <div>
              <div class="menu-user-name" id="menu-name">My Account</div>
              <div class="menu-user-role" id="menu-role">Tap to sign in</div>
            </div>
            <i class="fas fa-chevron-right" style="margin-left:auto;font-size:11px;color:var(--text-muted)"></i>
          </div>
          <button class="menu-item danger" id="menu-logout-btn" onclick="_navLogout()" style="margin-top:4px">
            <i class="fas fa-sign-out-alt"></i> Logout
          </button>
        </div>

      </div>`;
  }

  // ── INJECT STYLES ──────────────────────────────────────────
  function injectNavStyles() {
    if (document.getElementById('nav-drawer-styles')) return;
    const s = document.createElement('style');
    s.id = 'nav-drawer-styles';
    s.textContent = `
      /* ── MENU LOGO ── */
      .menu-logo-img {
        height: 32px;
        width: auto;
        object-fit: contain;
      }
      .menu-brand {
        padding: 20px 18px 16px;
        border-bottom: 1px solid var(--border);
        display: flex;
        align-items: center;
        min-height: 72px;
      }

      /* ── DIVIDER ── */
      .menu-divider {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 14px 12px 6px;
        font-size: 10px;
        font-weight: 800;
        color: var(--text-muted);
        text-transform: uppercase;
        letter-spacing: 0.8px;
      }
      .menu-divider::after {
        content: '';
        flex: 1;
        height: 1px;
        background: var(--border);
      }

      /* ── NAV BADGE ── */
      .nav-badge {
        margin-left: auto;
        background: var(--green);
        color: white;
        font-size: 9px;
        font-weight: 800;
        padding: 2px 7px;
        border-radius: 10px;
        letter-spacing: 0.2px;
        flex-shrink: 0;
      }
      .menu-item.active .nav-badge {
        background: white;
        color: var(--green-dark);
      }

      /* Legal links styled same as menu-items but slightly muted */
      .menu-item[href] {
        text-decoration: none;
        color: var(--text-mid);
        font-size: 13px;
      }
      .menu-item[href] i { color: var(--text-muted); }
      .menu-item[href]:hover { background: var(--surface); color: var(--text); }
      .menu-item[href]:hover i { color: var(--green); }

      /* ── DESKTOP LAYOUT (≥1024px) ── */
      @media (min-width: 1024px) {

        /* Persistent left sidebar — replaces the overlay drawer */
        .app-menu {
          position: fixed !important;
          top: 0; left: 0;
          width: 240px !important;
          height: 100vh;
          background: transparent !important;
          backdrop-filter: none !important;
          display: block !important;
          z-index: 200;
        }
        .app-menu.hidden { display: block !important; }

        .menu-content {
          width: 240px !important;
          height: 100%;
          border-right: 1px solid var(--border);
          background: white;
          box-shadow: none;
          animation: none !important;
        }

        /* Push page body right to clear the sidebar */
        body {
          padding-left: 240px !important;
        }

        /* Header spans only the content area */
        .app-header {
          left: 240px !important;
          width: calc(100% - 240px) !important;
        }

        /* Hamburger hidden on desktop */
        .app-header .icon-btn:first-child {
          display: none !important;
        }

        /* Bottom nav hidden — sidebar replaces it */
        .bottom-nav { display: none !important; }

        /* Content max-width and centering */
        .dashboard-content,
        .main-content,
        .section,
        .search-box,
        .category-scroll,
        .search-area {
          max-width: 860px;
          margin-left: auto;
          margin-right: auto;
        }

        /* Remove mobile bottom padding */
        body {
          padding-bottom: 24px !important;
        }

        /* Wider modal sheets on desktop */
        .modal-sheet,
        .rating-sheet,
        .gig-sheet {
          border-radius: 20px !important;
        }
      }

      /* ── TABLET (640px–1023px) ── */
      @media (min-width: 640px) and (max-width: 1023px) {
        body { max-width: 100% !important; }

        .dashboard-content,
        .main-content {
          max-width: 720px;
          margin: 0 auto;
        }

        .helpers-grid {
          grid-template-columns: repeat(auto-fill, minmax(190px, 1fr));
        }
      }

      /* ── WIDE DESKTOP (≥1280px) ── */
      @media (min-width: 1280px) {
        .app-menu { width: 260px !important; }
        .menu-content { width: 260px !important; }
        body { padding-left: 260px !important; }
        .app-header { left: 260px !important; width: calc(100% - 260px) !important; }

        .dashboard-content,
        .main-content {
          max-width: 980px;
        }
      }
    `;
    document.head.appendChild(s);
  }

  // ── LOAD USER INTO FOOTER ──────────────────────────────────
  async function loadNavUser() {
    try {
      // Try app.js client first, then market.html's db
      const supaClient = window.client || window.db;
      if (!supaClient) return;

      const { data: { user } } = await supaClient.auth.getUser();
      if (!user) {
        document.getElementById('menu-logout-btn')?.style && (document.getElementById('menu-logout-btn').style.display = 'none');
        return;
      }

      const { data: profile } = await supaClient
        .from('profiles')
        .select('full_name, role')
        .eq('id', user.id)
        .maybeSingle();

      if (profile) {
        const nameEl   = document.getElementById('menu-name');
        const roleEl   = document.getElementById('menu-role');
        const avatarEl = document.getElementById('menu-avatar');
        if (nameEl)   nameEl.textContent   = profile.full_name || user.email?.split('@')[0] || 'My Account';
        if (roleEl)   roleEl.textContent   = profile.role ? profile.role.charAt(0).toUpperCase() + profile.role.slice(1) : '';
        if (avatarEl) avatarEl.textContent = (profile.full_name || '?').split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
      }
    } catch (e) {
      // Non-fatal — user section just stays as default
    }
  }

  // ── LOGOUT ────────────────────────────────────────────────
  window._navLogout = async function() {
    try {
      const supaClient = window.client || window.db;
      if (supaClient) await supaClient.auth.signOut();
    } catch(e) {}
    window.location.href = 'auth.html';
  };

  // ── CLOSE ON OUTSIDE CLICK ─────────────────────────────────
  function setupCloseHandlers(overlay) {
    overlay.addEventListener('click', function(e) {
      if (e.target === overlay) {
        overlay.classList.add('hidden');
      }
    });
  }

  // ── INIT ──────────────────────────────────────────────────
  window.initNav = function(activeKey) {
    injectNavStyles();

    // Find or create the overlay element
    let overlay = document.getElementById('app-menu');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'app-menu';
      overlay.className = 'app-menu hidden';
      document.body.insertBefore(overlay, document.body.firstChild);
    }

    overlay.innerHTML = buildDrawer(activeKey);
    setupCloseHandlers(overlay);

    // Load user info after Supabase is ready
    // Retry a few times to handle async script loading order
    let attempts = 0;
    const tryLoad = () => {
      if (window.client || window.db) {
        loadNavUser();
      } else if (attempts++ < 20) {
        setTimeout(tryLoad, 250);
      }
    };
    setTimeout(tryLoad, 300);
  };

  // ── TOGGLE (called by hamburger button) ───────────────────
  // Unify all existing toggle function names
  window.toggleAppMenu = window.openMenu = function() {
    const overlay = document.getElementById('app-menu');
    if (overlay) overlay.classList.toggle('hidden');
  };
  window.closeMenu = function(e) {
    if (e && e.target !== document.getElementById('app-menu')) return;
    document.getElementById('app-menu')?.classList.add('hidden');
  };

})();
