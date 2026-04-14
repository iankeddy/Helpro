// HELPRO — Map Market Module
// Leaflet + OpenStreetMap integration for the Marketplace page
// Drop into helpro-main/ — loaded by market.html after app.js

(function () {
  'use strict';

  /* ─── Constants ─── */
  const DEFAULT_LAT  = -1.2921;   // Nairobi centre
  const DEFAULT_LNG  = 36.8219;
  const DEFAULT_ZOOM = 12;
  const CITY_COORDS  = {
    nairobi:  { lat: -1.2921,  lng: 36.8219 },
    mombasa:  { lat: -4.0435,  lng: 39.6682 },
    kisumu:   { lat: -0.1022,  lng: 34.7617 },
    nakuru:   { lat: -0.3031,  lng: 36.0800 },
    eldoret:  { lat:  0.5143,  lng: 35.2698 },
    thika:    { lat: -1.0396,  lng: 37.0900 },
  };

  /* ─── State ─── */
  let map          = null;
  let markers      = [];      // Leaflet marker objects
  let markerData   = [];      // raw { gig, lat, lng } objects
  let mapVisible   = false;
  let selectedGigId = null;
  let userMarker   = null;

  /* ─── Public API (attached to window) ─── */
  window.mapMarket = {
    toggle:   toggleMap,
    refresh:  refreshMarkers,
    focusGig: focusGig,
  };

  /* ═══════════════════════════════════════════════════════
     INIT — inject the toggle button + map container into
     market.html's existing DOM, then lazy-load Leaflet
  ═══════════════════════════════════════════════════════ */
  function init() {
    injectHTML();
    injectCSS();
  }

  function injectHTML() {
    // 1. Map toggle button — sits in the sec-header alongside "Available Gigs"
    const secHeader = document.querySelector('#client-view .sec-header');
    if (secHeader && !document.getElementById('map-toggle-btn')) {
      const btn = document.createElement('button');
      btn.id        = 'map-toggle-btn';
      btn.className = 'map-toggle-btn';
      btn.innerHTML = '<i class="fas fa-map-marked-alt"></i> Map';
      btn.onclick   = toggleMap;
      secHeader.appendChild(btn);
    }

    // 2. Map container — inserted between sec-header and helpers-container
    if (!document.getElementById('map-container')) {
      const mainContent = document.querySelector('.main-content #client-view');
      const mapWrap = document.createElement('div');
      mapWrap.id        = 'map-container';
      mapWrap.className = 'map-container hidden';
      mapWrap.innerHTML = `
        <div id="map-el" style="width:100%;height:100%"></div>
        <div class="map-controls">
          <button class="map-ctrl-btn" id="map-locate-btn" onclick="mapMarket._locateUser()" title="My location">
            <i class="fas fa-location-arrow"></i>
          </button>
          <button class="map-ctrl-btn" id="map-zoom-in"  onclick="mapMarket._zoom(1)"  title="Zoom in"><i class="fas fa-plus"></i></button>
          <button class="map-ctrl-btn" id="map-zoom-out" onclick="mapMarket._zoom(-1)" title="Zoom out"><i class="fas fa-minus"></i></button>
        </div>
        <div class="map-legend">
          <span class="legend-dot vetted"></span>Vetted
          <span class="legend-dot new" style="margin-left:10px"></span>New
        </div>
        <div class="map-count-pill" id="map-count-pill">0 helpers</div>`;
      // Insert before #helpers-container
      const helpersCont = document.getElementById('helpers-container');
      mainContent.insertBefore(mapWrap, helpersCont);
    }

    // 3. Gig preview card (pops up from bottom of map)
    if (!document.getElementById('map-preview-card')) {
      const card = document.createElement('div');
      card.id        = 'map-preview-card';
      card.className = 'map-preview-card hidden';
      document.body.appendChild(card);
    }
  }

  function injectCSS() {
    if (document.getElementById('map-market-css')) return;
    const style = document.createElement('style');
    style.id = 'map-market-css';
    style.textContent = `
      /* Leaflet CDN */
      @import url("https://unpkg.com/leaflet@1.9.4/dist/leaflet.css");

      /* ── MAP TOGGLE BUTTON ── */
      .map-toggle-btn {
        display: flex; align-items: center; gap: 7px;
        padding: 8px 16px; border-radius: 30px;
        background: white; border: 1.5px solid var(--border);
        font-size: 13px; font-weight: 700; color: var(--text-mid);
        cursor: pointer; transition: all 0.2s;
        font-family: 'DM Sans', sans-serif;
        white-space: nowrap;
      }
      .map-toggle-btn:hover,
      .map-toggle-btn.active {
        background: var(--green-light);
        border-color: var(--green);
        color: var(--green-dark);
      }
      .map-toggle-btn i { font-size: 13px; }

      /* ── MAP CONTAINER ── */
      .map-container {
        position: relative;
        height: 340px;
        border-radius: 20px;
        overflow: hidden;
        border: 1.5px solid var(--border);
        margin-bottom: 18px;
        box-shadow: 0 4px 20px rgba(0,0,0,0.08);
        transition: height 0.35s cubic-bezier(0.4,0,0.2,1),
                    opacity 0.25s ease;
        opacity: 1;
      }
      .map-container.hidden {
        height: 0 !important;
        opacity: 0;
        border: none;
        margin-bottom: 0;
        pointer-events: none;
      }

      /* ── CUSTOM CONTROLS ── */
      .map-controls {
        position: absolute; top: 12px; right: 12px;
        display: flex; flex-direction: column; gap: 6px;
        z-index: 800;
      }
      .map-ctrl-btn {
        width: 36px; height: 36px; border-radius: 10px;
        background: white; border: 1.5px solid var(--border);
        font-size: 13px; color: var(--text-mid);
        display: flex; align-items: center; justify-content: center;
        cursor: pointer; box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        transition: all 0.18s;
      }
      .map-ctrl-btn:hover { background: var(--green-light); color: var(--green-dark); border-color: var(--green); }
      .map-ctrl-btn.active { background: var(--green); color: white; border-color: var(--green); }

      /* ── LEGEND ── */
      .map-legend {
        position: absolute; bottom: 12px; left: 12px;
        background: rgba(255,255,255,0.92);
        backdrop-filter: blur(8px);
        border-radius: 20px; padding: 6px 12px;
        font-size: 11px; font-weight: 600; color: var(--text-mid);
        display: flex; align-items: center; gap: 6px;
        z-index: 800; box-shadow: 0 2px 8px rgba(0,0,0,0.08);
      }
      .legend-dot {
        width: 10px; height: 10px; border-radius: 50%; display: inline-block;
      }
      .legend-dot.vetted { background: var(--green); box-shadow: 0 0 0 2px rgba(61,184,58,0.3); }
      .legend-dot.new    { background: #f07623;      box-shadow: 0 0 0 2px rgba(240,118,35,0.3); }

      /* ── COUNT PILL ── */
      .map-count-pill {
        position: absolute; top: 12px; left: 12px;
        background: rgba(255,255,255,0.92); backdrop-filter: blur(8px);
        border-radius: 20px; padding: 6px 12px;
        font-size: 12px; font-weight: 700; color: var(--text);
        z-index: 800; box-shadow: 0 2px 8px rgba(0,0,0,0.08);
      }

      /* ── CUSTOM MARKER PINS ── */
      .helpro-pin {
        display: flex; align-items: center; justify-content: center;
        width: 36px; height: 36px; border-radius: 50% 50% 50% 0;
        transform: rotate(-45deg);
        box-shadow: 0 3px 10px rgba(0,0,0,0.25);
        border: 2.5px solid white;
        transition: transform 0.2s, width 0.2s, height 0.2s;
        cursor: pointer;
      }
      .helpro-pin.vetted  { background: var(--green); }
      .helpro-pin.new     { background: #f07623; }
      .helpro-pin.selected {
        width: 46px; height: 46px;
        box-shadow: 0 4px 18px rgba(61,184,58,0.5);
        z-index: 1000;
      }
      .helpro-pin-inner {
        transform: rotate(45deg);
        font-size: 13px; font-weight: 900;
        color: white; font-family: 'Outfit', sans-serif;
        line-height: 1;
      }

      /* ── GIG PREVIEW CARD (bottom of map) ── */
      .map-preview-card {
        position: fixed;
        bottom: calc(var(--bottom-nav-h, 68px) + 12px);
        left: 50%; transform: translateX(-50%);
        width: calc(100% - 32px); max-width: 420px;
        background: white; border-radius: 18px;
        box-shadow: 0 8px 40px rgba(0,0,0,0.16);
        border: 1.5px solid var(--border);
        z-index: 1200;
        padding: 14px 16px;
        display: flex; align-items: center; gap: 14px;
        animation: previewIn 0.28s cubic-bezier(0.34,1.56,0.64,1);
        cursor: pointer;
      }
      .map-preview-card.hidden { display: none !important; }
      @keyframes previewIn {
        from { opacity: 0; transform: translateX(-50%) translateY(16px); }
        to   { opacity: 1; transform: translateX(-50%) translateY(0); }
      }
      .map-preview-avatar {
        width: 48px; height: 48px; border-radius: 14px; flex-shrink: 0;
        display: flex; align-items: center; justify-content: center;
        font-weight: 900; font-size: 18px; color: white;
        font-family: 'Outfit', sans-serif;
        overflow: hidden;
      }
      .map-preview-avatar img { width: 100%; height: 100%; object-fit: cover; }
      .map-preview-info { flex: 1; min-width: 0; }
      .map-preview-name {
        font-family: 'Outfit', sans-serif; font-weight: 800;
        font-size: 14px; color: var(--text);
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        margin-bottom: 2px;
      }
      .map-preview-cat {
        font-size: 11px; font-weight: 600;
        color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.3px;
      }
      .map-preview-price {
        font-family: 'Outfit', sans-serif; font-weight: 900;
        font-size: 15px; color: var(--green-dark); flex-shrink: 0;
      }
      .map-preview-close {
        width: 28px; height: 28px; border-radius: 50%;
        background: var(--surface-2); border: none;
        display: flex; align-items: center; justify-content: center;
        font-size: 11px; color: var(--text-muted);
        cursor: pointer; flex-shrink: 0;
        transition: background 0.18s;
      }
      .map-preview-close:hover { background: var(--border); }

      /* ── LEAFLET POPUP OVERRIDE ── */
      .leaflet-popup-content-wrapper {
        border-radius: 14px !important;
        box-shadow: 0 4px 20px rgba(0,0,0,0.12) !important;
        padding: 0 !important;
        overflow: hidden;
      }
      .leaflet-popup-content { margin: 0 !important; width: auto !important; }
      .leaflet-popup-tip-container { display: none; }
      .map-popup {
        padding: 12px 14px; font-family: 'DM Sans', sans-serif;
        min-width: 160px;
      }
      .map-popup-name {
        font-family: 'Outfit', sans-serif; font-weight: 800;
        font-size: 13px; color: var(--text); margin-bottom: 2px;
      }
      .map-popup-cat { font-size: 11px; color: var(--text-muted); margin-bottom: 6px; }
      .map-popup-price { font-size: 13px; font-weight: 700; color: var(--green-dark); }

      /* ── RESPONSIVE ── */
      @media (min-width: 640px) {
        .map-container { height: 400px; }
      }
      @media (min-width: 1024px) {
        .map-container { height: 440px; }
      }
    `;
    document.head.appendChild(style);
  }

  /* ═══════════════════════════════════════════════════════
     TOGGLE MAP ON / OFF
  ═══════════════════════════════════════════════════════ */
  function toggleMap() {
    mapVisible = !mapVisible;
    const container = document.getElementById('map-container');
    const btn       = document.getElementById('map-toggle-btn');
    if (!container || !btn) return;

    if (mapVisible) {
      container.classList.remove('hidden');
      btn.classList.add('active');
      btn.innerHTML = '<i class="fas fa-list"></i> List';
      // Lazy-load Leaflet then initialise
      loadLeaflet(() => {
        initMap();
        refreshMarkers();
      });
    } else {
      container.classList.add('hidden');
      btn.classList.remove('active');
      btn.innerHTML = '<i class="fas fa-map-marked-alt"></i> Map';
      hidePreviewCard();
    }
  }

  /* ═══════════════════════════════════════════════════════
     LAZY-LOAD LEAFLET FROM CDN
  ═══════════════════════════════════════════════════════ */
  function loadLeaflet(cb) {
    if (window.L) { cb(); return; }

    // CSS
    if (!document.getElementById('leaflet-css')) {
      const link = document.createElement('link');
      link.id   = 'leaflet-css';
      link.rel  = 'stylesheet';
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      document.head.appendChild(link);
    }
    // JS
    if (!document.getElementById('leaflet-js')) {
      const script   = document.createElement('script');
      script.id      = 'leaflet-js';
      script.src     = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
      script.onload  = cb;
      script.onerror = () => showToast('Map failed to load — check your connection', 'orange');
      document.head.appendChild(script);
    } else {
      // Script tag exists but L isn't ready yet — poll briefly
      const poll = setInterval(() => { if (window.L) { clearInterval(poll); cb(); } }, 80);
    }
  }

  /* ═══════════════════════════════════════════════════════
     INITIALISE LEAFLET MAP (once)
  ═══════════════════════════════════════════════════════ */
  function initMap() {
    if (map) { map.invalidateSize(); return; }

    map = L.map('map-el', {
      center:           [DEFAULT_LAT, DEFAULT_LNG],
      zoom:             DEFAULT_ZOOM,
      zoomControl:      false,   // we use our own buttons
      attributionControl: true,
    });

    // OpenStreetMap tile layer
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(map);

    // Fix Leaflet sizing when container transitions from height:0
    setTimeout(() => map.invalidateSize(), 350);

    // Close preview when clicking the map background
    map.on('click', () => hidePreviewCard());
  }

  /* ═══════════════════════════════════════════════════════
     BUILD MARKERS FROM CURRENT filteredGigs
  ═══════════════════════════════════════════════════════ */
  function refreshMarkers() {
    if (!map || !mapVisible) return;

    // Clear existing markers
    markers.forEach(m => m.remove());
    markers = [];
    markerData = [];

    // filteredGigs is a global in market.html — access it
    const gigs = (window.filteredGigs || window.allGigs || []);

    // Assign realistic Nairobi-area coordinates to helpers that have a
    // location_name but no lat/lng stored (common for MVP databases).
    // When lat/lng columns exist in the DB, just use those directly.
    gigs.forEach(g => {
      const h    = g.helper || {};
      const city = (h.location_name || 'nairobi').toLowerCase().split(',')[0].trim();
      const base = CITY_COORDS[city] || CITY_COORDS.nairobi;

      // Use stored coords if present, otherwise scatter around city centre
      const lat = h.lat ? parseFloat(h.lat) : base.lat + (seededRand(h.id + 'lat') - 0.5) * 0.08;
      const lng = h.lng ? parseFloat(h.lng) : base.lng + (seededRand(h.id + 'lng') - 0.5) * 0.09;

      markerData.push({ gig: g, lat, lng });
      addMarker(g, lat, lng);
    });

    // Update count pill
    const pill = document.getElementById('map-count-pill');
    if (pill) pill.textContent = `${markerData.length} helper${markerData.length !== 1 ? 's' : ''}`;

    // Fit bounds to all markers if any exist
    if (markerData.length > 0) {
      const group = L.featureGroup(markers);
      map.fitBounds(group.getBounds().pad(0.15), { maxZoom: 14 });
    }
  }

  /* ─── Add one marker ─── */
  function addMarker(gig, lat, lng) {
    const h        = gig.helper || {};
    const isVetted = true; // all gigs are from vetted helpers in this app
    const initStr  = initials(h.full_name);
    const pinClass = isVetted ? 'vetted' : 'new';

    const icon = L.divIcon({
      className: '',
      html: `<div class="helpro-pin ${pinClass}" data-id="${gig.id}">
               <div class="helpro-pin-inner">${initStr}</div>
             </div>`,
      iconSize:   [36, 36],
      iconAnchor: [18, 36],
      popupAnchor:[0, -38],
    });

    const marker = L.marker([lat, lng], { icon })
      .addTo(map)
      .bindPopup(popupHTML(gig), { closeButton: false, maxWidth: 220 });

    marker.on('click', () => {
      selectedGigId = gig.id;
      highlightMarker(gig.id);
      showPreviewCard(gig);
    });

    markers.push(marker);
  }

  function popupHTML(g) {
    const h        = g.helper || {};
    const priceStr = g.price
      ? (g.price_type === 'hourly' ? `KES ${g.price}/hr` : `From KES ${g.price}`)
      : 'Negotiable';
    return `<div class="map-popup">
      <div class="map-popup-name">${h.full_name || 'Helper'}</div>
      <div class="map-popup-cat">${(g.category || 'general').toUpperCase()}</div>
      <div class="map-popup-price">${priceStr}</div>
    </div>`;
  }

  /* ─── Highlight selected marker ─── */
  function highlightMarker(gigId) {
    document.querySelectorAll('.helpro-pin').forEach(el => {
      el.classList.toggle('selected', el.dataset.id === gigId);
    });
  }

  /* ─── Pan + highlight from list (public) ─── */
  function focusGig(gigId) {
    if (!map || !mapVisible) return;
    const entry = markerData.find(m => m.gig.id === gigId);
    if (!entry) return;
    map.setView([entry.lat, entry.lng], 15, { animate: true });
    highlightMarker(gigId);
    showPreviewCard(entry.gig);
  }

  /* ═══════════════════════════════════════════════════════
     PREVIEW CARD
  ═══════════════════════════════════════════════════════ */
  function showPreviewCard(gig) {
    const card = document.getElementById('map-preview-card');
    if (!card) return;
    const h        = gig.helper || {};
    const color    = colorFor(h.full_name);
    const priceStr = gig.price
      ? (gig.price_type === 'hourly' ? `KES ${gig.price}/hr` : `From KES ${gig.price}`)
      : 'Negotiable';

    card.innerHTML = `
      <div class="map-preview-avatar" style="background:${color}">
        ${h.selfie_url
          ? `<img src="${h.selfie_url}" alt="${h.full_name}" onerror="this.style.display='none'">`
          : initials(h.full_name)}
      </div>
      <div class="map-preview-info" onclick="openGigModal('${gig.id}')">
        <div class="map-preview-name">${gig.title || h.full_name}</div>
        <div class="map-preview-cat">${(gig.category || 'general').toUpperCase()} · ${h.location_name || 'Kenya'}</div>
      </div>
      <div class="map-preview-price" onclick="openGigModal('${gig.id}')">${priceStr}</div>
      <button class="map-preview-close" onclick="mapMarket._hidePreview()"><i class="fas fa-times"></i></button>`;

    card.classList.remove('hidden');
  }

  function hidePreviewCard() {
    const card = document.getElementById('map-preview-card');
    if (card) card.classList.add('hidden');
    selectedGigId = null;
    document.querySelectorAll('.helpro-pin.selected').forEach(el => el.classList.remove('selected'));
  }

  /* ═══════════════════════════════════════════════════════
     GEOLOCATION — "My Location" button
  ═══════════════════════════════════════════════════════ */
  function locateUser() {
    const btn = document.getElementById('map-locate-btn');
    if (!navigator.geolocation) {
      showToast('Geolocation not supported by your browser', 'orange');
      return;
    }
    if (btn) { btn.classList.add('active'); btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>'; }

    navigator.geolocation.getCurrentPosition(
      pos => {
        const { latitude: lat, longitude: lng } = pos.coords;
        map.setView([lat, lng], 14, { animate: true });

        if (userMarker) userMarker.remove();
        userMarker = L.circleMarker([lat, lng], {
          radius:      9,
          fillColor:   '#3b82f6',
          color:       'white',
          weight:      3,
          fillOpacity: 1,
        }).addTo(map).bindPopup('<div class="map-popup"><div class="map-popup-name">📍 You are here</div></div>');

        if (btn) { btn.classList.remove('active'); btn.innerHTML = '<i class="fas fa-location-arrow"></i>'; }
        showToast('Showing your location', 'green');
      },
      err => {
        if (btn) { btn.classList.remove('active'); btn.innerHTML = '<i class="fas fa-location-arrow"></i>'; }
        showToast('Could not get your location', 'orange');
      },
      { timeout: 8000 }
    );
  }

  /* ═══════════════════════════════════════════════════════
     ZOOM HELPERS
  ═══════════════════════════════════════════════════════ */
  function zoom(delta) {
    if (!map) return;
    map.setZoom(map.getZoom() + delta, { animate: true });
  }

  /* ═══════════════════════════════════════════════════════
     UTILITIES
  ═══════════════════════════════════════════════════════ */

  // Deterministic pseudo-random from a string seed (avoids Math.random scatter changing on reload)
  function seededRand(seed) {
    let h = 2166136261;
    for (let i = 0; i < (seed || '').length; i++) {
      h ^= seed.charCodeAt(i);
      h = (h * 16777619) >>> 0;
    }
    return (h % 10000) / 10000;
  }

  // Reuse market.html's helpers (they're global)
  function initials(name)  { return (name || '?').split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase(); }
  function colorFor(str)   {
    const colors = ['#3db83a','#3b82f6','#f07623','#8b5cf6','#ec4899','#f59e0b','#0891b2','#16a34a'];
    let h = 0;
    for (let c of (str || '?')) h = (h << 5) - h + c.charCodeAt(0);
    return colors[Math.abs(h) % colors.length];
  }

  /* ─── Expose internals needed by inline onclick handlers ─── */
  window.mapMarket._zoom        = zoom;
  window.mapMarket._locateUser  = locateUser;
  window.mapMarket._hidePreview = hidePreviewCard;

  /* ─── Hook into market.html's applyFilters so the map updates on filter change ─── */
  function hookFilters() {
    const original = window.applyFilters;
    if (typeof original !== 'function') return;
    window.applyFilters = function () {
      original.apply(this, arguments);
      if (mapVisible) {
        // Wait one tick so filteredGigs is updated
        setTimeout(refreshMarkers, 0);
      }
    };
  }

  /* ─── Wait for market.html scripts to finish, then init ─── */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => { init(); hookFilters(); });
  } else {
    init();
    hookFilters();
  }

})();
