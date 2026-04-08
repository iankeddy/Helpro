// ============================================================
// HELPRO — Gig Manager
// Add <script src="gig-manager.js"></script> AFTER app.js
// on dashboard.html ONLY
// ============================================================

// ── CONSTANTS ────────────────────────────────────────────────
const GIG_CATEGORIES = [
  { value:'cleaning',  label:'Cleaning',   icon:'fa-broom'        },
  { value:'delivery',  label:'Delivery',   icon:'fa-truck'        },
  { value:'repairs',   label:'Repairs',    icon:'fa-tools'        },
  { value:'shopping',  label:'Shopping',   icon:'fa-shopping-cart'},
  { value:'transport', label:'Transport',  icon:'fa-car'          },
  { value:'petcare',   label:'Pet Care',   icon:'fa-paw'          },
  { value:'gardening', label:'Gardening',  icon:'fa-leaf'         },
  { value:'laundry',   label:'Laundry',    icon:'fa-tshirt'       },
  { value:'moving',    label:'Moving',     icon:'fa-boxes'        },
  { value:'tutoring',  label:'Tutoring',   icon:'fa-book'         },
  { value:'events',    label:'Events',     icon:'fa-calendar-alt' },
  { value:'security',  label:'Security',   icon:'fa-shield-alt'   },
];

const GIG_CATEGORY_COLORS = {
  cleaning:'#3db83a',  delivery:'#3b82f6',  repairs:'#f07623',
  shopping:'#8b5cf6',  transport:'#0891b2', petcare:'#ec4899',
  gardening:'#16a34a', laundry:'#f59e0b',   moving:'#6366f1',
  tutoring:'#14b8a6',  events:'#ef4444',    security:'#78716c',
};

const DELIVERY_OPTIONS = [
  'Same day', '1–2 days', '2–3 days', 'Within a week', 'Flexible'
];

// ── STATE ─────────────────────────────────────────────────────
let _gigCurrentUser  = null;
let _gigEditingId    = null;   // null = create mode, uuid = edit mode
let _gigCoverFile    = null;
let _gigWhatList     = [];     // array of strings for "what you get"


// ── INJECT STYLES ────────────────────────────────────────────
(function injectGigStyles() {
  if (document.getElementById('gig-styles')) return;
  const s = document.createElement('style');
  s.id = 'gig-styles';
  s.textContent = `
    /* ── MY GIGS SECTION ── */
    .gigs-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
      gap: 12px;
    }

    /* Create new gig card (dashed) */
    .gig-add-card {
      border: 2px dashed #c8d8c8;
      border-radius: 16px;
      min-height: 180px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 8px;
      cursor: pointer;
      color: #8a9a8a;
      font-size: 13px;
      font-weight: 700;
      transition: all 0.2s;
      background: #fafcfa;
    }
    .gig-add-card:hover {
      border-color: #3db83a;
      color: #3db83a;
      background: #f0faf0;
    }
    .gig-add-card i { font-size: 26px; }

    /* Existing gig mini-card */
    .gig-mini-card {
      background: white;
      border: 1.5px solid #e0e8e0;
      border-radius: 16px;
      overflow: hidden;
      cursor: pointer;
      transition: transform 0.2s, box-shadow 0.2s, border-color 0.2s;
      display: flex;
      flex-direction: column;
    }
    .gig-mini-card:hover { transform: translateY(-3px); box-shadow: 0 6px 24px rgba(0,0,0,0.1); }

    .gig-mini-cover {
      height: 90px;
      position: relative;
      overflow: hidden;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .gig-mini-cover img {
      width: 100%; height: 100%; object-fit: cover;
    }
    .gig-mini-cover-icon {
      font-size: 32px;
      color: rgba(255,255,255,0.9);
    }
    .gig-active-dot {
      position: absolute;
      top: 8px; right: 8px;
      width: 10px; height: 10px;
      border-radius: 50%;
      border: 2px solid white;
    }
    .gig-active-dot.on  { background: #3db83a; }
    .gig-active-dot.off { background: #8a9a8a; }

    .gig-mini-body { padding: 9px 10px 10px; flex: 1; }
    .gig-mini-title {
      font-size: 13px; font-weight: 700; color: #0d1a0d;
      display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
      overflow: hidden; line-height: 1.35; margin-bottom: 5px;
    }
    .gig-mini-price {
      font-size: 13px; font-weight: 800; color: #2a8a28;
      font-family: 'Outfit', sans-serif;
    }
    .gig-mini-cat {
      font-size: 10px; color: #8a9a8a; font-weight: 600;
      text-transform: uppercase; letter-spacing: 0.3px; margin-top: 2px;
    }

    /* Gig form bottom sheet */
    .gig-sheet-overlay {
      position: fixed; inset: 0; z-index: 5000;
      background: rgba(10,20,10,0.55);
      backdrop-filter: blur(6px);
      display: flex; align-items: flex-end; justify-content: center;
      opacity: 0; pointer-events: none;
      transition: opacity 0.25s;
    }
    .gig-sheet-overlay.open { opacity: 1; pointer-events: all; }

    .gig-sheet {
      background: white;
      width: 100%; max-width: 540px;
      border-radius: 24px 24px 0 0;
      max-height: 92vh;
      overflow-y: auto;
      transform: translateY(100%);
      transition: transform 0.32s cubic-bezier(0.32,0.72,0,1);
    }
    .gig-sheet-overlay.open .gig-sheet {
      transform: translateY(0);
    }
    @media (min-width: 600px) {
      .gig-sheet-overlay { align-items: center; padding: 24px; }
      .gig-sheet { border-radius: 24px; max-height: 86vh; }
    }

    .gig-sheet-drag { width: 40px; height: 4px; background: #dce8dc; border-radius: 2px; margin: 14px auto 0; }
    .gig-sheet-head {
      display: flex; align-items: center; justify-content: space-between;
      padding: 14px 20px 12px;
      border-bottom: 1px solid #edf3ed;
    }
    .gig-sheet-title { font-family: 'Outfit', sans-serif; font-size: 18px; font-weight: 800; color: #0d1a0d; }
    .gig-sheet-close {
      width: 34px; height: 34px; border-radius: 50%;
      background: #f0f7f0; border: none; cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      font-size: 15px; color: #3a4d3a;
    }

    .gig-sheet-body { padding: 18px 20px; }

    /* Form fields */
    .gig-field { margin-bottom: 16px; }
    .gig-label {
      display: block; font-size: 12px; font-weight: 700;
      color: #8a9a8a; text-transform: uppercase; letter-spacing: 0.4px;
      margin-bottom: 6px;
    }
    .gig-input, .gig-textarea, .gig-select {
      width: 100%; padding: 11px 14px;
      border: 1.5px solid #dce8dc; border-radius: 12px;
      font-size: 14px; font-family: inherit; color: #0d1a0d;
      background: #f7faf7; outline: none;
      transition: border-color 0.2s, background 0.2s;
    }
    .gig-input:focus, .gig-textarea:focus, .gig-select:focus {
      border-color: #3db83a; background: white;
      box-shadow: 0 0 0 3px rgba(61,184,58,0.1);
    }
    .gig-textarea { min-height: 88px; resize: none; line-height: 1.5; }

    /* Category picker grid */
    .gig-cat-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 8px;
    }
    .gig-cat-opt {
      padding: 10px 6px;
      border: 1.5px solid #dce8dc;
      border-radius: 12px;
      text-align: center;
      cursor: pointer;
      font-size: 11px;
      font-weight: 700;
      color: #3a4d3a;
      background: #f7faf7;
      transition: all 0.15s;
    }
    .gig-cat-opt i { display: block; font-size: 18px; color: #3db83a; margin-bottom: 4px; }
    .gig-cat-opt.selected {
      border-color: #3db83a; background: #e8f7e8; color: #1a4a1a;
    }
    .gig-cat-opt:hover { border-color: #3db83a; }

    /* Price row */
    .gig-price-row { display: flex; gap: 8px; align-items: flex-start; }
    .gig-price-row .gig-input { width: auto; flex: 1; }
    .gig-price-row .gig-select { width: auto; flex: 1; }

    /* What you get */
    .what-list { margin-bottom: 8px; }
    .what-item {
      display: flex; align-items: center; gap: 8px;
      padding: 8px 12px; background: #f0faf0;
      border: 1px solid #c8e0c8; border-radius: 10px;
      margin-bottom: 6px; font-size: 13px; color: #0d1a0d;
    }
    .what-item i { color: #3db83a; font-size: 12px; flex-shrink: 0; }
    .what-item-del {
      margin-left: auto; background: none; border: none;
      color: #8a9a8a; cursor: pointer; padding: 2px 4px;
      font-size: 13px; transition: color 0.15s;
    }
    .what-item-del:hover { color: #ef4444; }
    .what-add-row {
      display: flex; gap: 8px;
    }
    .what-add-row .gig-input { flex: 1; }
    .btn-add-what {
      padding: 11px 16px; border-radius: 12px;
      background: #3db83a; color: white; border: none;
      font-size: 13px; font-weight: 700; cursor: pointer;
      flex-shrink: 0; transition: background 0.15s;
    }
    .btn-add-what:hover { background: #2a8a28; }

    /* Cover image uploader */
    .cover-upload-area {
      height: 100px; border: 2px dashed #c8d8c8;
      border-radius: 14px; display: flex;
      flex-direction: column; align-items: center; justify-content: center;
      gap: 6px; cursor: pointer; transition: all 0.2s;
      font-size: 13px; color: #8a9a8a; font-weight: 600;
      background: #fafcfa; overflow: hidden; position: relative;
    }
    .cover-upload-area:hover { border-color: #3db83a; color: #3db83a; background: #f0faf0; }
    .cover-upload-area img {
      position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover;
    }
    .cover-upload-area i { font-size: 22px; }
    .cover-upload-area input {
      position: absolute; inset: 0; opacity: 0; cursor: pointer; width: 100%; height: 100%;
    }

    /* Toggle switch */
    .toggle-row {
      display: flex; align-items: center; justify-content: space-between;
      padding: 12px 0;
    }
    .toggle-label { font-size: 14px; font-weight: 600; color: #0d1a0d; }
    .toggle-sub { font-size: 12px; color: #8a9a8a; }
    .toggle-switch {
      position: relative; width: 44px; height: 24px; flex-shrink: 0;
    }
    .toggle-switch input { opacity: 0; width: 0; height: 0; }
    .toggle-track {
      position: absolute; inset: 0; border-radius: 12px;
      background: #dce8dc; cursor: pointer; transition: background 0.2s;
    }
    .toggle-track::after {
      content: ''; position: absolute; top: 3px; left: 3px;
      width: 18px; height: 18px; border-radius: 50%;
      background: white; box-shadow: 0 1px 4px rgba(0,0,0,0.2);
      transition: transform 0.2s;
    }
    .toggle-switch input:checked + .toggle-track { background: #3db83a; }
    .toggle-switch input:checked + .toggle-track::after { transform: translateX(20px); }

    /* Sheet footer */
    .gig-sheet-footer {
      padding: 16px 20px 28px;
      border-top: 1px solid #edf3ed;
      display: flex; gap: 10px;
      position: sticky; bottom: 0; background: white;
    }
    .btn-gig-save {
      flex: 1; padding: 14px; border-radius: 14px;
      background: #3db83a; color: white; border: none;
      font-size: 15px; font-weight: 700; cursor: pointer;
      font-family: inherit; transition: background 0.15s;
      display: flex; align-items: center; justify-content: center; gap: 8px;
    }
    .btn-gig-save:hover { background: #2a8a28; }
    .btn-gig-save:disabled { opacity: 0.55; cursor: not-allowed; }
    .btn-gig-del {
      padding: 14px 18px; border-radius: 14px;
      background: #fff0f0; color: #dc2626; border: 1.5px solid #fccaca;
      font-size: 14px; font-weight: 700; cursor: pointer;
      font-family: inherit; transition: background 0.15s;
    }
    .btn-gig-del:hover { background: #fee2e2; }

    /* Gig toast */
    .gig-toast {
      position: fixed;
      bottom: calc(68px + 14px);
      left: 50%;
      transform: translateX(-50%) translateY(16px);
      background: #0d1a0d; color: white;
      padding: 10px 22px; border-radius: 30px;
      font-size: 13px; font-weight: 600;
      box-shadow: 0 4px 20px rgba(0,0,0,0.18);
      z-index: 6000; opacity: 0; pointer-events: none;
      transition: opacity 0.22s, transform 0.22s;
      white-space: nowrap;
    }
    .gig-toast.show { opacity: 1; transform: translateX(-50%) translateY(0); }
    .gig-toast.green  { background: #3db83a; }
    .gig-toast.orange { background: #f07623; }
    .gig-toast.red    { background: #dc2626; }
  `;
  document.head.appendChild(s);
})();


// ── TOAST ─────────────────────────────────────────────────────
let _gigToastTimer;
function gigToast(msg, type = '') {
  let el = document.getElementById('gig-toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'gig-toast';
    el.className = 'gig-toast';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.className = `gig-toast ${type}`;
  requestAnimationFrame(() => el.classList.add('show'));
  clearTimeout(_gigToastTimer);
  _gigToastTimer = setTimeout(() => el.classList.remove('show'), 3000);
}


// ── LOAD MY GIGS ─────────────────────────────────────────────
async function loadMyGigs() {
  const container = document.getElementById('my-gigs-grid');
  if (!container) return;
  container.innerHTML = '<p style="color:#8a9a8a;font-size:13px;padding:8px 0">Loading your gigs…</p>';

  try {
    const { data: { user } } = await client.auth.getUser();
    if (!user) return;
    _gigCurrentUser = user;

    const { data: gigs, error } = await client
      .from('gigs')
      .select('*')
      .eq('helper_id', user.id)
      .order('created_at', { ascending: false });

    if (error) throw error;

    const addCard = `
      <div class="gig-add-card" onclick="openGigSheet()">
        <i class="fas fa-plus-circle"></i>
        <span>Create New Gig</span>
      </div>`;

    if (!gigs || gigs.length === 0) {
      container.innerHTML = `
        <div style="text-align:center;padding:28px 16px;background:var(--surface,#f5f7f5);
          border-radius:14px;border:1.5px dashed var(--border,#dfe6df);margin-bottom:12px">
          <div style="width:52px;height:52px;border-radius:50%;background:var(--green-light,#e8f7e8);
            display:flex;align-items:center;justify-content:center;margin:0 auto 12px;
            font-size:22px;color:var(--green,#3db83a)"><i class="fas fa-store"></i></div>
          <div style="font-family:var(--font-display,'Outfit',sans-serif);font-weight:800;
            font-size:15px;color:var(--text,#111811);margin-bottom:5px">No Gigs Yet</div>
          <div style="font-size:13px;color:var(--text-muted,#8a9a8a);line-height:1.5;
            max-width:220px;margin:0 auto">Create your first gig so clients can find and hire you directly.</div>
        </div>` + addCard;
      return;
    }

    const gigCards = gigs.map(g => gigMiniCardHTML(g)).join('');
    container.innerHTML = addCard + gigCards;

  } catch (err) {
    container.innerHTML = `<p style="color:#f07623;font-size:13px">Error: ${err.message}</p>`;
  }
}

function gigMiniCardHTML(g) {
  const color = GIG_CATEGORY_COLORS[g.category] || '#3db83a';
  const icon  = GIG_CATEGORIES.find(c => c.value === g.category)?.icon || 'fa-star';
  const price = g.price
    ? (g.price_type === 'hourly' ? `KES ${g.price}/hr` : `KES ${g.price}`)
    : 'Negotiable';

  const safeTitle = (g.title || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  const safeCat   = (g.category || 'General').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const safeCover = (g.cover_image_url || '').replace(/"/g,'&quot;');

  return `
    <div class="gig-mini-card" onclick="openGigSheet('${g.id}')">
      <div class="gig-mini-cover" style="background:linear-gradient(135deg,${color},${color}99)">
        ${g.cover_image_url
          ? `<img src="${safeCover}" alt="${safeTitle}" onerror="this.style.display='none'">`
          : `<i class="fas ${icon} gig-mini-cover-icon"></i>`}
        <div class="gig-active-dot ${g.is_active ? 'on' : 'off'}" title="${g.is_active ? 'Active' : 'Paused'}"></div>
      </div>
      <div class="gig-mini-body">
        <div class="gig-mini-title">${safeTitle}</div>
        <div class="gig-mini-price">${price}</div>
        <div class="gig-mini-cat">${safeCat}</div>
      </div>
    </div>`;
}


// ── OPEN GIG SHEET ────────────────────────────────────────────
async function openGigSheet(gigId = null) {
  _gigEditingId = gigId;
  _gigCoverFile = null;
  _gigWhatList  = [];

  let gig = null;
  if (gigId) {
    const { data } = await client.from('gigs').select('*').eq('id', gigId).maybeSingle();
    gig = data;
    if (gig?.what_you_get) _gigWhatList = [...gig.what_you_get];
  }

  let overlay = document.getElementById('gig-sheet-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'gig-sheet-overlay';
    overlay.className = 'gig-sheet-overlay';
    overlay.innerHTML = `
      <div class="gig-sheet" id="gig-sheet-inner">
        <div class="gig-sheet-drag"></div>
        <div class="gig-sheet-head">
          <div class="gig-sheet-title" id="gig-sheet-title">New Gig</div>
          <button class="gig-sheet-close" onclick="closeGigSheet()"><i class="fas fa-times"></i></button>
        </div>
        <div class="gig-sheet-body" id="gig-sheet-body"></div>
        <div class="gig-sheet-footer" id="gig-sheet-footer"></div>
      </div>`;
    overlay.addEventListener('click', e => { if (e.target === overlay) closeGigSheet(); });
    document.body.appendChild(overlay);
  }

  document.getElementById('gig-sheet-title').textContent = gigId ? 'Edit Gig' : 'Create New Gig';
  renderGigForm(gig);
  requestAnimationFrame(() => overlay.classList.add('open'));
}

function closeGigSheet() {
  const overlay = document.getElementById('gig-sheet-overlay');
  if (overlay) overlay.classList.remove('open');
}

function renderGigForm(gig) {
  const body   = document.getElementById('gig-sheet-body');
  const footer = document.getElementById('gig-sheet-footer');

  // Sanitize all user-sourced values before interpolation
  function esc(v) {
    return (v || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  const safeTitle    = esc(gig?.title);
  const safeDesc     = esc(gig?.description);
  const safeCoverUrl = esc(gig?.cover_image_url);
  const safeCategory = esc(gig?.category);

  // Category picker
  const catPicker = GIG_CATEGORIES.map(c => `
    <div class="gig-cat-opt ${gig?.category === c.value ? 'selected' : ''}"
         onclick="selectGigCat('${c.value}')" data-cat="${c.value}">
      <i class="fas ${c.icon}"></i>${c.label}
    </div>`).join('');

  // Delivery time options
  const deliveryOpts = DELIVERY_OPTIONS.map(d =>
    `<option value="${d}" ${gig?.delivery_time === d ? 'selected' : ''}>${d}</option>`
  ).join('');

  // What you get items
  const whatItems = _gigWhatList.map((item, i) => `
    <div class="what-item" id="what-${i}">
      <i class="fas fa-check-circle"></i>
      <span>${item}</span>
      <button class="what-item-del" onclick="removeWhatItem(${i})"><i class="fas fa-times"></i></button>
    </div>`).join('');

  body.innerHTML = `
    <!-- Cover image -->
    <div class="gig-field">
      <label class="gig-label"><i class="fas fa-image" style="margin-right:4px"></i> Cover Photo (optional)</label>
      <div class="cover-upload-area" id="cover-preview" onclick="document.getElementById('cover-file-input').click()">
        ${safeCoverUrl ? `<img src="${safeCoverUrl}" alt="cover">` : ''}
        <i class="fas fa-cloud-upload-alt" ${safeCoverUrl ? 'style="display:none"' : ''}></i>
        <span ${safeCoverUrl ? 'style="display:none"' : ''}>Tap to upload</span>
        <input type="file" id="cover-file-input" accept="image/*" onchange="previewCover(event)" style="opacity:0;position:absolute;inset:0;cursor:pointer">
      </div>
    </div>

    <!-- Title -->
    <div class="gig-field">
      <label class="gig-label"><i class="fas fa-pen" style="margin-right:4px"></i> Gig Title *</label>
      <input class="gig-input" id="gig-title-input" type="text"
        placeholder="e.g. Deep House Cleaning – Kitchen & Bathrooms"
        maxlength="80" value="${safeTitle}">
    </div>

    <!-- Description -->
    <div class="gig-field">
      <label class="gig-label"><i class="fas fa-align-left" style="margin-right:4px"></i> Description *</label>
      <textarea class="gig-textarea" id="gig-desc-input"
        placeholder="Describe exactly what you'll do, your experience, and what makes you the right hire…"
        maxlength="400">${safeDesc}</textarea>
    </div>

    <!-- Category -->
    <div class="gig-field">
      <label class="gig-label"><i class="fas fa-tag" style="margin-right:4px"></i> Category *</label>
      <input type="hidden" id="gig-cat-input" value="${safeCategory}">
      <div class="gig-cat-grid">${catPicker}</div>
    </div>

    <!-- Price -->
    <div class="gig-field">
      <label class="gig-label"><i class="fas fa-money-bill-wave" style="margin-right:4px"></i> Price</label>
      <div class="gig-price-row">
        <input class="gig-input" id="gig-price-input" type="number" min="0"
          placeholder="e.g. 1500" value="${gig?.price || ''}">
        <select class="gig-select" id="gig-price-type-input">
          <option value="fixed"      ${gig?.price_type === 'fixed'      ? 'selected' : ''}>Fixed</option>
          <option value="hourly"     ${gig?.price_type === 'hourly'     ? 'selected' : ''}>Per Hour</option>
          <option value="negotiable" ${gig?.price_type === 'negotiable' ? 'selected' : ''}>Negotiable</option>
        </select>
      </div>
    </div>

    <!-- Delivery time -->
    <div class="gig-field">
      <label class="gig-label"><i class="fas fa-clock" style="margin-right:4px"></i> Delivery / Availability</label>
      <select class="gig-select" id="gig-delivery-input">
        <option value="">Select…</option>
        ${deliveryOpts}
      </select>
    </div>

    <!-- What you get -->
    <div class="gig-field">
      <label class="gig-label"><i class="fas fa-list-check" style="margin-right:4px"></i> What's Included</label>
      <div class="what-list" id="what-list">${whatItems}</div>
      <div class="what-add-row">
        <input class="gig-input" id="what-input" type="text"
          placeholder="e.g. Mopping, dusting, taking out bins"
          onkeydown="if(event.key==='Enter'){event.preventDefault();addWhatItem()}"
          maxlength="80">
        <button class="btn-add-what" onclick="addWhatItem()">
          <i class="fas fa-plus"></i>
        </button>
      </div>
    </div>

    <!-- Active toggle -->
    <div class="gig-field" style="border-top:1px solid #edf3ed;padding-top:14px">
      <div class="toggle-row">
        <div>
          <div class="toggle-label">Gig Active</div>
          <div class="toggle-sub">Active gigs appear on the marketplace</div>
        </div>
        <label class="toggle-switch">
          <input type="checkbox" id="gig-active-toggle" ${gig?.is_active !== false ? 'checked' : ''}>
          <div class="toggle-track"></div>
        </label>
      </div>
    </div>
  `;

  footer.innerHTML = `
    ${_gigEditingId ? `<button class="btn-gig-del" onclick="confirmDeleteGig()"><i class="fas fa-trash"></i></button>` : ''}
    <button class="btn-gig-save" id="gig-save-btn" onclick="saveGig()">
      <i class="fas fa-check"></i> ${_gigEditingId ? 'Save Changes' : 'Publish Gig'}
    </button>
  `;
}


// ── FORM HELPERS ──────────────────────────────────────────────
function selectGigCat(val) {
  document.getElementById('gig-cat-input').value = val;
  document.querySelectorAll('.gig-cat-opt').forEach(el => {
    el.classList.toggle('selected', el.dataset.cat === val);
  });
}

function previewCover(e) {
  const file = e.target.files[0];
  if (!file) return;
  _gigCoverFile = file;
  const url = URL.createObjectURL(file);
  const area = document.getElementById('cover-preview');
  let img = area.querySelector('img');
  if (!img) {
    img = document.createElement('img');
    area.appendChild(img);
  }
  img.src = url;
  area.querySelector('i')?.style && (area.querySelector('i').style.display = 'none');
  area.querySelectorAll('span').forEach(s => s.style.display = 'none');
}

function addWhatItem() {
  const input = document.getElementById('what-input');
  const val = (input?.value || '').trim();
  if (!val) return;
  _gigWhatList.push(val);
  input.value = '';
  refreshWhatList();
}

function removeWhatItem(i) {
  _gigWhatList.splice(i, 1);
  refreshWhatList();
}

function refreshWhatList() {
  const list = document.getElementById('what-list');
  if (!list) return;
  list.innerHTML = _gigWhatList.map((item, i) => `
    <div class="what-item" id="what-${i}">
      <i class="fas fa-check-circle"></i>
      <span>${item}</span>
      <button class="what-item-del" onclick="removeWhatItem(${i})"><i class="fas fa-times"></i></button>
    </div>`).join('');
}


// ── SAVE GIG ──────────────────────────────────────────────────
async function saveGig() {
  const title      = document.getElementById('gig-title-input')?.value.trim();
  const desc       = document.getElementById('gig-desc-input')?.value.trim();
  const category   = document.getElementById('gig-cat-input')?.value;
  const price      = document.getElementById('gig-price-input')?.value;
  const priceType  = document.getElementById('gig-price-type-input')?.value;
  const delivery   = document.getElementById('gig-delivery-input')?.value;
  const isActive   = document.getElementById('gig-active-toggle')?.checked;

  if (!title)    { gigToast('Please enter a gig title', 'orange'); return; }
  if (!desc)     { gigToast('Please add a description', 'orange'); return; }
  if (!category) { gigToast('Please select a category', 'orange'); return; }

  const btn = document.getElementById('gig-save-btn');
  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving…';

  try {
    const { data: { user } } = await client.auth.getUser();
    if (!user) throw new Error('Not logged in');

    // Upload cover image if selected
    let coverUrl = null;
    if (_gigCoverFile) {
      const ext  = _gigCoverFile.name.split('.').pop();
      const path = `${user.id}/${Date.now()}.${ext}`;
      const { error: uploadErr } = await client.storage
        .from('gig-covers')
        .upload(path, _gigCoverFile, { upsert: true });
      if (uploadErr) throw uploadErr;
      const { data: { publicUrl } } = client.storage.from('gig-covers').getPublicUrl(path);
      coverUrl = publicUrl;
    }

    const payload = {
      helper_id:       user.id,
      title,
      description:     desc,
      category,
      price:           price ? parseFloat(price) : null,
      price_type:      priceType,
      delivery_time:   delivery || null,
      what_you_get:    _gigWhatList,
      is_active:       isActive,
      ...(coverUrl && { cover_image_url: coverUrl }),
    };

    if (_gigEditingId) {
      const { error } = await client.from('gigs').update(payload).eq('id', _gigEditingId);
      if (error) throw error;
      gigToast('✅ Gig updated!', 'green');
    } else {
      const { error } = await client.from('gigs').insert([payload]);
      if (error) throw error;
      gigToast('🎉 Gig published!', 'green');
    }

    closeGigSheet();
    setTimeout(loadMyGigs, 500);

  } catch (err) {
    gigToast('Error: ' + (err.message || 'Could not save gig'), 'orange');
    btn.disabled = false;
    btn.innerHTML = `<i class="fas fa-check"></i> ${_gigEditingId ? 'Save Changes' : 'Publish Gig'}`;
  }
}


// ── DELETE GIG ────────────────────────────────────────────────
function confirmDeleteGig() {
  if (!confirm('Delete this gig? This cannot be undone.')) return;
  deleteGig();
}

async function deleteGig() {
  if (!_gigEditingId) return;
  try {
    const { error } = await client.from('gigs').delete().eq('id', _gigEditingId);
    if (error) throw error;
    gigToast('Gig deleted', 'red');
    closeGigSheet();
    setTimeout(loadMyGigs, 500);
  } catch (err) {
    gigToast('Error: ' + err.message, 'orange');
  }
}


// ── EXPOSE GLOBALS ────────────────────────────────────────────
window.loadMyGigs       = loadMyGigs;
window.openGigSheet     = openGigSheet;
window.closeGigSheet    = closeGigSheet;
window.selectGigCat     = selectGigCat;
window.previewCover     = previewCover;
window.addWhatItem      = addWhatItem;
window.removeWhatItem   = removeWhatItem;
window.saveGig          = saveGig;
window.confirmDeleteGig = confirmDeleteGig;
window.deleteGig        = deleteGig;
