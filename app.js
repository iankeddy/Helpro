// ============================================================
// HELPRO — app.js
// All original functions preserved + full chat system added
// ============================================================

// 1. Initialize Supabase
const supabaseUrl = 'https://cjpylodggpqqkuvojogb.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNqcHlsb2RnZ3BxcWt1dm9qb2diIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjcwODQ3ODgsImV4cCI6MjA4MjY2MDc4OH0.DpfpuCMQr8A3QV11KRVLE2JakuRWAmoGi1Ol_QUFWRE';

// Detect if localStorage is blocked by browser tracking prevention (Edge/Safari ITP)
const _storageAvailable = (() => {
  try { localStorage.setItem('_hpro_t','1'); localStorage.removeItem('_hpro_t'); return true; }
  catch(e) { return false; }
})();

const client = supabase.createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: _storageAvailable,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storage: _storageAvailable ? localStorage : undefined,
  }
});

// --- SHARED UTILITIES ---
function toggleLoader(show) {
    const loader = document.getElementById('loader-overlay');
    if (loader) loader.style.display = show ? 'flex' : 'none';
}

function showModal(title, message, type = 'success') {
    const modal = document.getElementById('custom-modal');
    if (!modal) {
        // No modal on this page — create a lightweight inline toast instead of alert()
        showToast(title, message, type);
        return;
    }
    document.getElementById('modal-title').innerText = title;
    document.getElementById('modal-message').innerText = message;
    modal.style.display = 'flex';
}

// ── GLOBAL TOAST (fallback for pages without #custom-modal) ──
// Shows a non-blocking pop-up at the top of the screen
function showToast(title, message, type = 'success') {
    const existing = document.getElementById('helpro-global-toast');
    if (existing) existing.remove();

    const colors = {
        success: { bg: '#e8f7e8', border: '#3db83a', icon: '✓', iconColor: '#3db83a' },
        error:   { bg: '#fef2f2', border: '#ef4444', icon: '✕', iconColor: '#ef4444' },
        warning: { bg: '#fff8ec', border: '#f07623', icon: '!', iconColor: '#f07623' },
    };
    const c = colors[type] || colors.success;

    const toast = document.createElement('div');
    toast.id = 'helpro-global-toast';
    toast.style.cssText = `
        position: fixed; top: 70px; left: 50%; transform: translateX(-50%) translateY(-12px);
        background: ${c.bg}; border: 1.5px solid ${c.border}; border-radius: 16px;
        padding: 14px 18px; display: flex; align-items: flex-start; gap: 12px;
        box-shadow: 0 8px 32px rgba(0,0,0,0.13); z-index: 99999;
        max-width: 340px; width: calc(100% - 32px);
        opacity: 0; transition: opacity 0.25s, transform 0.3s cubic-bezier(0.34,1.56,0.64,1);
        font-family: var(--font-body, 'DM Sans', sans-serif);
    `;
    toast.innerHTML = `
        <div style="width:26px;height:26px;border-radius:50%;background:${c.iconColor};color:white;
            display:flex;align-items:center;justify-content:center;font-size:13px;
            font-weight:800;flex-shrink:0;margin-top:1px">${c.icon}</div>
        <div style="flex:1;min-width:0">
            <div style="font-size:13px;font-weight:800;color:#111811;margin-bottom:2px">${escapeHtml(title)}</div>
            <div style="font-size:13px;color:#445044;line-height:1.4">${escapeHtml(message)}</div>
        </div>
        <button onclick="this.parentElement.remove()" style="background:none;border:none;
            color:#8a9a8a;font-size:18px;cursor:pointer;padding:0;line-height:1;flex-shrink:0">×</button>
    `;
    document.body.appendChild(toast);

    // Animate in
    requestAnimationFrame(() => {
        toast.style.opacity = '1';
        toast.style.transform = 'translateX(-50%) translateY(0)';
    });

    // Auto-dismiss after 4 seconds
    setTimeout(() => {
        if (toast.parentElement) {
            toast.style.opacity = '0';
            toast.style.transform = 'translateX(-50%) translateY(-12px)';
            setTimeout(() => toast.remove(), 300);
        }
    }, 4000);
}

// --- AUTHENTICATION ---
// NOTE: handleSignup() in auth.html is the primary signup handler.
// This legacy function is kept for any direct calls from other pages.
async function signUp(email, password, role, fullName) {
    toggleLoader(true);
    const { data, error } = await client.auth.signUp({
        email, password,
        options: { data: { full_name: fullName, role: role } }
    });
    if (error) {
        toggleLoader(false);
        return showModal("Signup Failed", error.message, "error");
    }
    if (!data.user) {
        toggleLoader(false);
        return showModal("Signup Failed", "Please try again.", "error");
    }
    // Detect already-registered (Supabase returns fake user with empty identities)
    if (data.user.identities && data.user.identities.length === 0) {
        toggleLoader(false);
        return showModal("Already Registered", "An account with this email already exists. Please sign in.", "warning");
    }
    const refCode = Math.random().toString(36).substring(2, 6).toUpperCase()
                  + Math.random().toString(36).substring(2, 6).toUpperCase();
    const profileData = { id: data.user.id, email, role, full_name: fullName, is_vetted: false, referral_code: refCode };
    if (data.session) {
        const { error: profileError } = await client.from('profiles').insert([profileData]);
        toggleLoader(false);
        profileError
            ? showModal("Error", "Profile save failed: " + profileError.message, "error")
            : showModal("Success!", "Account created! You are now signed in.", "success");
    } else {
        safeStorage.set('helpro_pending_profile', JSON.stringify(profileData));
        toggleLoader(false);
        showModal("Success!", "Account created! Check your email to confirm, then sign in.", "success");
    }
}

async function login(email, password) {
    toggleLoader(true);
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (error) {
        toggleLoader(false);
        showModal("Login Error", error.message, "error");
        return;
    }

    // ── Flush any pending profile from the email-confirm signup flow ──
    const pendingRaw = safeStorage.get('helpro_pending_profile');
    if (pendingRaw) {
        try {
            const pending = JSON.parse(pendingRaw);
            if (pending.id === data.user.id) {
                const { data: existing } = await client.from('profiles').select('id').eq('id', pending.id).maybeSingle();
                if (!existing) {
                    await client.from('profiles').upsert([pending], { onConflict: 'id' });
                    const refCode = pending.referred_by || null;
                    if (refCode) {
                        const { data: referrer } = await client.from('profiles').select('id').eq('referral_code', refCode).maybeSingle();
                        if (referrer) {
                            await client.from('referrals').insert([{
                                referrer_id: referrer.id, referred_id: pending.id,
                                referral_code: refCode, status: 'pending', reward_amount: 100
                            }]);
                        }
                    }
                }
                safeStorage.remove('helpro_pending_profile');
            }
        } catch(e) {
            console.warn('Pending profile flush failed:', e.message);
            safeStorage.remove('helpro_pending_profile');
        }
    }

    const { data: profile } = await client.from('profiles').select('role').eq('id', data.user.id).maybeSingle();
    toggleLoader(false);
    window.location.href = profile?.role === 'admin' ? './admin.html' : './dashboard.html';
}

// --- VETTING & LOCATION ---
async function detectMyLocation() {
    const locInput = document.getElementById('location-name');
    if (!locInput) return;
    locInput.value = "Detecting...";
    navigator.geolocation.getCurrentPosition(async (pos) => {
        try {
            const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${pos.coords.latitude}&lon=${pos.coords.longitude}`);
            const data = await res.json();
            locInput.value = data.address.suburb || data.address.city || "Location Found";
        } catch (e) { locInput.value = "Location Detected"; }
    }, () => { showModal("Location Error", "Geolocation failed. Please type your location manually.", "error"); locInput.value = ""; });
}

async function handleVettingUpload() {
    const selfie = document.getElementById('upload-selfie')?.files[0];
    const idCard = document.getElementById('upload-id')?.files[0];
    const tradeCert = document.getElementById('upload-trade-cert')?.files[0];
    const locName = document.getElementById('location-name')?.value;

    if (!selfie || !idCard) return showModal("Missing Documents", "Please upload your Selfie and National ID.", "warning");

    toggleLoader(true);
    try {
        const { data: { user } } = await client.auth.getUser();
        const files = [
            { file: selfie, name: 'selfie', col: 'selfie_url' },
            { file: idCard, name: 'id', col: 'id_url' },
            { file: tradeCert, name: 'trade-cert', col: 'trade_cert_url' }
        ];

        let updateData = { location_name: locName, is_vetted: false };

        for (const item of files) {
            const fileExt = item.file.name.split('.').pop();
            const filePath = `${user.id}/${item.name}.${fileExt}`;
            const { error: upErr } = await client.storage.from('verification-docs').upload(filePath, item.file, { upsert: true });
            if (upErr) throw upErr;
            const { data: signedData, error: signErr } = await client.storage
            .from('verification-docs')
            .createSignedUrl(filePath, 60 * 60 * 24 * 7); // 7-day signed URL
          if (signErr) throw signErr;
          updateData[item.col] = filePath; // store the storage PATH, not the public URL
        }

        const { error: upErr } = await client.from('profiles').update(updateData).eq('id', user.id);
        if (upErr) throw upErr;
        showModal("Success", "Documents uploaded for review.");
    } catch (err) { showModal("Upload Error", err.message, "error"); }
    finally { toggleLoader(false); }
}

// --- ADMIN DASHBOARD FUNCTIONS ---
async function loadDashboardStats() {
    try {
        const { count } = await client.from('profiles').select('*', { count: 'exact', head: true })
            .eq('role', 'helper').eq('is_vetted', false);

        const { data: bookings } = await client.from('bookings').select('total_price').eq('status', 'accepted');
        const total = bookings?.reduce((sum, b) => sum + (Number(b.total_price) || 0), 0) || 0;

        if (document.getElementById('stat-pending')) document.getElementById('stat-pending').innerText = count || 0;
        if (document.getElementById('stat-money')) document.getElementById('stat-money').innerText = `KES ${total.toLocaleString()}`;
    } catch (err) { /* Stats unavailable — non-critical, admin panel only */ }
}

async function loadPendingHelpers() {
    const { data: helpers, error } = await client.from('profiles').select('*').eq('role', 'helper').eq('is_vetted', false);
    if (error) return;

    const container = document.getElementById('queue-container');
    if (!container) return;
    container.innerHTML = helpers?.length ? '' : '<h3>🎉 All caught up!</h3>';

    helpers?.forEach(helper => {
        container.innerHTML += `
    <div class="vetting-card" id="card-${helper.id}">
        <div class="doc-viewer">
            <a href="${escapeHtml(helper.selfie_url || '')}" target="_blank"><img src="${escapeHtml(helper.selfie_url || '')}" class="doc-thumb" title="Selfie"></a>
            <a href="${escapeHtml(helper.id_url || '')}" target="_blank"><img src="${escapeHtml(helper.id_url || '')}" class="doc-thumb" title="ID Card"></a>
            <a href="${escapeHtml(helper.trade_cert_url || '')}" target="_blank"><img src="${escapeHtml(helper.trade_cert_url || '')}" class="doc-thumb" title="${escapeHtml(helper.trade_cert_label || 'Trade Cert')}"></a>
        </div>
        <div class="vetting-actions">
            <h2>${escapeHtml(helper.full_name || 'Anonymous')}</h2>
            <p>${escapeHtml(helper.email || '')}<br>Location: ${escapeHtml(helper.location_name || 'Unknown')}</p>
            <input type="text" id="feedback-${helper.id}" class="feedback-input" placeholder="Rejection reason...">
            <div class="action-btns">
                <button onclick="updateVettingStatus('${helper.id}', true)" class="btn-approve">Approve</button>
                <button onclick="updateVettingStatus('${helper.id}', false)" class="btn-reject">Reject</button>
            </div>
        </div>
    </div>`;
    });
}

async function updateVettingStatus(id, isApproved) {
    const feedback = document.getElementById(`feedback-${id}`)?.value;
    if (!isApproved && !feedback) return showModal("Reason Required", "Please provide a reason for rejecting this application.", "warning");
    const { error } = await client.from('profiles').update({ is_vetted: isApproved, rejection_feedback: isApproved ? null : feedback }).eq('id', id);
    if (error) showModal("Update Failed", error.message, "error");
    else {
        document.getElementById(`card-${id}`)?.remove();
        loadDashboardStats();
    }
}

function renderJob(job) {
  return `
    <div class="job-card">
      <div class="job-title">${job.title}</div>
      <p>${job.description || ""}</p>
      <div class="job-footer">
        <div class="job-price">${job.budget || "Budget not set"}</div>
      </div>
    </div>
  `;
}

// --- NAVIGATION ---
function goToPage(page) {
  if (window.location.pathname.includes(page)) return;
  window.location.href = page;
}

function toggleAppMenu() {
  const menu = document.getElementById("app-menu");
  if (!menu) return;
  menu.classList.toggle("hidden");
}

async function handleProfileClick() {
  try {
    const { data: { user } } = await client.auth.getUser();
    window.location.href = user ? "dashboard.html" : "auth.html";
  } catch (err) {
    window.location.href = "auth.html";
  }
}

async function ensureHelperIsApproved() {
  const { data: { user } } = await client.auth.getUser();
  if (!user) { showModal("Login Required", "Please log in first to continue.", "warning"); return false; }

  const { data: profile, error } = await client.from("profiles").select("role, is_vetted").eq("id", user.id).single();
  if (error || !profile) { showModal("Account Error", "Unable to verify your account status. Please try again.", "error"); return false; }

  if (profile.role === "helper" && profile.is_vetted !== true) {
    showModal("Account Under Review", "Your account is still being reviewed. You cannot apply for jobs yet. You'll be notified once approved.", "warning");
    return false;
  }
  return true;
}

// --- HOME SEARCH ---
let searchTimer = null;

document.addEventListener("DOMContentLoaded", () => {
  const searchInput = document.getElementById("homeSearch");
  if (!searchInput) return;

  const locationFilter = document.getElementById("location-filter");
  if (locationFilter) {
    locationFilter.addEventListener("change", () => {
      const query = searchInput?.value.trim() || "";
      searchOpenJobs(query);
    });
  }

  searchInput.addEventListener("input", (e) => {
    clearTimeout(searchTimer);
    const query = e.target.value.trim();
    if (query.length < 2) { document.getElementById("search-results").innerHTML = ""; return; }
    searchTimer = setTimeout(() => searchOpenJobs(query), 400);
  });
});

async function openJobFromSearch(jobId) {
  const allowed = await ensureHelperIsApproved();
  if (!allowed) return;
  // Pass the job ID via URL param — market.html will auto-open and highlight it
  window.location.href = 'market.html?mode=jobs&highlight=' + jobId;
}

async function searchOpenJobs(query) {
  const container = document.getElementById("search-results");
  const location = document.getElementById("location-filter")?.value || "";
  if (!container) return;

  container.innerHTML = "<p class='muted'>Searching jobs...</p>";

  let request = client.from("jobs").select("id, title, description, budget, location").eq("status", "open");
  if (query) request = request.or(`title.ilike.%${query}%,description.ilike.%${query}%`);
  if (location) request = request.ilike("location", `%${location}%`);

  const { data, error } = await request.order("created_at", { ascending: false }).limit(10);
  if (error) { container.innerHTML = "<p class='error'>Search failed</p>"; return; }
  if (!data || data.length === 0) { container.innerHTML = "<p class='muted'>No jobs found</p>"; return; }
  renderJobResults(data);
}

function renderJobResults(jobs) {
  const container = document.getElementById("search-results");
  container.innerHTML = jobs.map(job => `
    <div class="search-card" onclick="openJobFromSearch('${job.id}')">
      <h4>${escapeHtml(job.title)}</h4>
      <p>${escapeHtml(job.description?.slice(0, 80) || "")}</p>
      <div class="job-meta">
        <span>${escapeHtml(job.location || "Location not set")}</span>
        <span class="budget">${escapeHtml(job.budget || "Budget not set")}</span>
      </div>
    </div>
  `).join("");
}

// --- TRENDING JOBS ---
async function loadTrendingJobs() {
  const container = document.getElementById("trending-jobs-container");
  if (!container || !client) return;
  container.innerHTML = "<p class='muted'>Loading trending jobs...</p>";
  try {
    const { data, error } = await client.from("jobs").select("id, title, description, budget, created_at")
      .eq("status", "open").order("created_at", { ascending: false }).limit(5);
    if (error || !data) throw error;
    container.innerHTML = data.length
      ? data.map(job => `
        <div class="trending-job-card" onclick="openJobFromSearch('${job.id}')">
          <h4>${escapeHtml(job.title)}</h4>
          <p>${escapeHtml(job.description?.slice(0, 60) || "")}</p>
          <span class="budget">${escapeHtml(job.budget || "Budget not set")}</span>
        </div>`).join("")
      : `<div style="text-align:center;padding:28px 16px;background:var(--surface,#f5f7f5);border-radius:14px;border:1.5px dashed var(--border,#dfe6df)">
          <div style="width:52px;height:52px;border-radius:50%;background:var(--green-light,#e8f7e8);display:flex;align-items:center;justify-content:center;margin:0 auto 12px;font-size:22px;color:var(--green,#3db83a)"><i class="fas fa-briefcase"></i></div>
          <div style="font-family:var(--font-display,'Outfit',sans-serif);font-weight:800;font-size:15px;color:var(--text,#111811);margin-bottom:5px">No Trending Jobs</div>
          <div style="font-size:13px;color:var(--text-muted,#8a9a8a);line-height:1.5">No open jobs right now. Check back soon!</div>
        </div>`;
  } catch { container.innerHTML = "<p class='muted'>Could not load jobs</p>"; }
}

// --- MARKETPLACE JOBS ---
let allMarketplaceJobs = [];

async function loadMarketplaceJobs() {
  const container = document.getElementById("jobs-container");
  if (!container || !client) return;
  container.innerHTML = "<p class='muted'>Loading available jobs...</p>";
  try {
    const { data, error } = await client.from("jobs")
      .select("id, title, description, budget, category, created_at")
      .eq("status", "open").order("created_at", { ascending: false });
    if (error || !data) throw error;
    allMarketplaceJobs = data;
    renderMarketplaceJobs(allMarketplaceJobs);
  } catch { container.innerHTML = "<p class='muted'>Jobs unavailable</p>"; }
}

function filterJobs(category) {
  let filtered = [...allMarketplaceJobs];
  if (category !== "all") filtered = filtered.filter(job => job.category === category);
  renderMarketplaceJobs(filtered);
}

function renderMarketplaceJobs(jobs) {
  const container = document.getElementById("jobs-container");
  if (!container) return;
  if (!jobs.length) {
    container.innerHTML = `<div style="text-align:center;padding:28px 16px;background:var(--surface,#f5f7f5);border-radius:14px;border:1.5px dashed var(--border,#dfe6df)">
      <div style="width:52px;height:52px;border-radius:50%;background:var(--green-light,#e8f7e8);display:flex;align-items:center;justify-content:center;margin:0 auto 12px;font-size:22px;color:var(--green,#3db83a)"><i class="fas fa-map-marker-alt"></i></div>
      <div style="font-family:var(--font-display,'Outfit',sans-serif);font-weight:800;font-size:15px;color:var(--text,#111811);margin-bottom:5px">No Jobs Found</div>
      <div style="font-size:13px;color:var(--text-muted,#8a9a8a);line-height:1.5;max-width:220px;margin:0 auto">No open jobs match your search. Try a different category or check back later.</div>
      <button onclick="goToPage('market.html?mode=jobs')" style="margin-top:14px;background:var(--green,#3db83a);color:white;border:none;border-radius:30px;padding:9px 22px;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit">Browse All Jobs</button>
    </div>`;
    return;
  }
  container.innerHTML = jobs.map(job => `
    <div class="job-card" onclick="openJobFromSearch('${job.id}')">
      <div class="job-title">${escapeHtml(job.title || "Untitled Job")}</div>
      <p>${escapeHtml(job.description ? job.description.slice(0, 80) + "..." : "")}</p>
      <div class="job-footer">
        <span class="budget">${escapeHtml(job.budget || "Budget not set")}</span>
      </div>
    </div>`).join("");
}

async function handlePostJob() {
  const title       = document.getElementById('job-title')?.value.trim();
  const description = document.getElementById('job-desc')?.value.trim();
  const budget      = document.getElementById('job-budget')?.value.trim();
  const category    = document.getElementById('job-category')?.value;

  // Build location from city dropdown + optional area text
  const city = document.getElementById('job-city')?.value || '';
  const area = document.getElementById('job-area')?.value.trim() || '';
  const location = city ? (area ? `${area}, ${city}` : city) : '';

  if (!title || !description || !budget || !category) {
    showModal("Missing Fields", "Please fill in all fields including category.", "warning");
    return;
  }
  if (!city) {
    showModal("City Required", "Please select a city for the job location.", "warning");
    return;
  }
  toggleLoader(true);
  try {
    const { data: { user } } = await client.auth.getUser();
    const { error } = await client.from("jobs").insert([{
      title, description, budget, category, location,
      client_id: user.id, status: "open"
    }]);
    if (error) throw error;
    showModal("Job Posted! 🎉", "Your job is now live on the marketplace. Helpers can start applying.");
    document.getElementById('job-title').value    = "";
    document.getElementById('job-desc').value     = "";
    document.getElementById('job-budget').value   = "";
    document.getElementById('job-category').value = "";
    const cityEl = document.getElementById('job-city');
    const areaEl = document.getElementById('job-area');
    if (cityEl) cityEl.value = "";
    if (areaEl) areaEl.value = "";
    loadMarketplaceJobs?.();
  } catch (err) { showModal("Post Failed", err.message, "error"); }
  finally { toggleLoader(false); }
}

// --- NAV HIGHLIGHT ---
document.addEventListener("DOMContentLoaded", () => {
  const currentPage = window.location.pathname.split("/").pop();
  document.querySelectorAll(".nav-item").forEach(btn => btn.classList.remove("active"));
  if (currentPage.includes("dashboard")) document.querySelector(".nav-item:nth-child(1)")?.classList.add("active");
  else if (currentPage.includes("market")) document.querySelector(".nav-item:nth-child(2)")?.classList.add("active");
  else if (currentPage.includes("auth")) document.querySelector(".nav-item:nth-child(4)")?.classList.add("active");
});

document.addEventListener("DOMContentLoaded", async () => {
  const { data: { user } } = await client.auth.getUser();
  const logoutLink = document.querySelector(".menu-content a:last-child");
  if (!user && logoutLink) logoutLink.style.display = "none";
});


// ============================================================
// CHAT SYSTEM — Full implementation using messages table
// ============================================================

// Chat state
let chatCurrentUser = null;
let chatCurrentProfile = null;
let chatActiveThread = null;   // { recipientId, recipientName, recipientAvatar, jobId }
let chatRealtimeChannel = null;
let chatSendChannel = null;  // B-03 fix: track the send channel so it can be removed on close
let chatUnreadCount = 0;

// ── BOOT CHAT ──
// Called once per page from the auto-open / nav handler
async function initChat() {
  try {
    const { data: { user } } = await client.auth.getUser();
    if (!user) return;
    chatCurrentUser = user;
    const { data: profile } = await client.from('profiles').select('full_name, role, is_vetted').eq('id', user.id).maybeSingle();
    chatCurrentProfile = profile;
    await loadUnreadCount();
    updateUnreadBadge();
  } catch (e) { /* Chat init failed silently — page remains usable without chat */ }
}

// ── OPEN CHAT PAGE ──
function openChatPage() {
  const page = document.getElementById('chat-page');
  if (!page) return;
  page.classList.remove('hidden');
  showInbox();
  loadChatList();
}

function exitChat() {
  document.getElementById('chat-page')?.classList.add('hidden');
  chatActiveThread = null;
  // B-03 fix: remove both tracked channels on close to prevent event accumulation
  if (chatRealtimeChannel) {
    client.removeChannel(chatRealtimeChannel);
    chatRealtimeChannel = null;
  }
  if (chatSendChannel) {
    client.removeChannel(chatSendChannel);
    chatSendChannel = null;
  }
}

// ── OPEN CHAT FROM NAV ──
async function openChatFromNav() {
  const { data: { user } } = await client.auth.getUser();
  if (!user) { window.location.href = "auth.html"; return; }

  const { data: profile } = await client.from("profiles").select("role, is_vetted").eq("id", user.id).single();
  if (profile?.role === "helper" && profile?.is_vetted !== true) {
    showModal("Chat Locked", "Chat will be available after your account is approved by our team.", "warning");
    return;
  }

  const chatPage = document.getElementById("chat-page");
  if (chatPage) {
    openChatPage();
  } else {
    safeStorage.set("openChat", "true");
    window.location.href = "dashboard.html";
  }
}

// ── LOAD INBOX (contact list) ──
async function loadChatList() {
  const contactList = document.getElementById('contact-list');
  if (!contactList || !chatCurrentUser) return;

  contactList.innerHTML = '<div style="padding:20px;text-align:center;color:#999;font-size:13px">Loading conversations…</div>';

  try {
    // Get all messages involving current user (sent or received)
    const { data: msgs, error } = await client
      .from('messages')
      .select('*')
      .or(`sender_id.eq.${chatCurrentUser.id},recipient_id.eq.${chatCurrentUser.id}`)
      .order('created_at', { ascending: false });

    if (error) throw error;
    if (!msgs || msgs.length === 0) {
      contactList.innerHTML = `
        <div style="padding:40px 20px;text-align:center">
          <div style="font-size:32px;margin-bottom:10px">💬</div>
          <div style="font-weight:700;color:#333;margin-bottom:6px">No messages yet</div>
          <div style="font-size:13px;color:#999">Start a conversation by hiring a helper or applying for a job</div>
        </div>`;
      return;
    }

    // Deduplicate to one thread per unique conversation partner
    const threadsMap = new Map();
    msgs.forEach(m => {
      const otherId = m.sender_id === chatCurrentUser.id ? m.recipient_id : m.sender_id;
      if (!threadsMap.has(otherId)) threadsMap.set(otherId, m);
    });

    // Fetch profiles of all conversation partners
    const otherIds = [...threadsMap.keys()];
    const { data: profiles } = await client.from('profiles').select('id, full_name, email, role, selfie_url').in('id', otherIds);
    const profileMap = Object.fromEntries((profiles || []).map(p => [p.id, p]));

    // Count unread per thread
    const unreadMap = {};
    msgs.filter(m => m.recipient_id === chatCurrentUser.id && !m.is_read).forEach(m => {
      unreadMap[m.sender_id] = (unreadMap[m.sender_id] || 0) + 1;
    });
    chatUnreadCount = Object.values(unreadMap).reduce((a, b) => a + b, 0);
    updateUnreadBadge();

    // Render contact list
    contactList.innerHTML = [...threadsMap.entries()].map(([otherId, lastMsg]) => {
      const profile = profileMap[otherId] || {};
      const name = profile.full_name || profile.email || 'Unknown';
      const initials = name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
      const unread = unreadMap[otherId] || 0;
      const isMe = lastMsg.sender_id === chatCurrentUser.id;
      const preview = (isMe ? 'You: ' : '') + (lastMsg.content || '').slice(0, 45) + (lastMsg.content?.length > 45 ? '…' : '');
      const timeStr = formatChatTime(lastMsg.created_at);
      const avatarColor = stringToColor(name);

      return `
        <div class="contact-item" onclick="openThread('${otherId}', '${name.replace(/'/g, "\\'")}', '${lastMsg.job_id || ''}')">
          <div style="position:relative;flex-shrink:0">
            <div style="width:46px;height:46px;border-radius:50%;background:${avatarColor};display:flex;align-items:center;justify-content:center;font-weight:800;font-size:16px;color:white">${initials}</div>
            ${unread > 0 ? `<div style="position:absolute;top:-3px;right:-3px;background:#f07623;color:white;font-size:10px;font-weight:800;min-width:18px;height:18px;border-radius:9px;display:flex;align-items:center;justify-content:center;border:2px solid white;padding:0 4px">${unread}</div>` : ''}
          </div>
          <div style="flex:1;min-width:0;margin-left:12px">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:3px">
              <span style="font-weight:${unread > 0 ? 800 : 600};font-size:14px;color:#111">${name}</span>
              <span style="font-size:11px;color:#999;flex-shrink:0">${timeStr}</span>
            </div>
            <div style="font-size:13px;color:${unread > 0 ? '#111' : '#888'};font-weight:${unread > 0 ? 600 : 400};white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${preview}</div>
          </div>
        </div>`;
    }).join('');

  } catch (e) {
    contactList.innerHTML = `<div style="padding:20px;text-align:center;color:#ef4444;font-size:13px">Error loading conversations. Please try again.</div>`;
  }
}

// ── OPEN THREAD ──
async function openThread(recipientId, recipientName, jobId = '') {
  chatActiveThread = { recipientId, recipientName, jobId: jobId || null };

  // Update header
  document.getElementById('chat-with-name').innerText = recipientName;

  // Show hire button only if current user is a client
  const hireActions = document.getElementById('hire-actions');
  if (hireActions) {
    // Show hire button only to clients — hide once booking already accepted
    const showHire = chatCurrentProfile?.role === 'client';
    hireActions.style.display = showHire ? 'flex' : 'none';

    if (showHire && (jobId || chatActiveThread.jobId)) {
      // Check if already hired — grey out button if so
      const jid = jobId || chatActiveThread.jobId;
      client.from('bookings')
        .select('status')
        .eq('job_id', jid)
        .eq('helper_id', recipientId)
        .maybeSingle()
        .then(({ data: bk }) => {
          const btn = hireActions.querySelector('button');
          if (!btn) return;
          if (bk?.status === 'accepted' || bk?.status === 'completed') {
            btn.disabled = true;
            btn.innerHTML = '✅ Already Hired';
            btn.style.opacity = '0.6';
          } else {
            btn.disabled = false;
            btn.innerHTML = '✅ Confirm Hire';
            btn.style.opacity = '1';
          }
        });
    }
  }

  // Switch views
  document.getElementById('inbox-view').style.display = 'none';
  document.getElementById('chat-thread-view').classList.remove('hidden');

  // Mark messages as read
  await client.from('messages')
    .update({ is_read: true })
    .eq('sender_id', recipientId)
    .eq('recipient_id', chatCurrentUser.id);

  await loadMessages();
  subscribeToMessages();
}

// ── LOAD MESSAGES ──
async function loadMessages() {
  const container = document.getElementById('chat-messages');
  if (!container || !chatActiveThread || !chatCurrentUser) return;

  container.innerHTML = '<div style="padding:20px;text-align:center;color:#999;font-size:13px">Loading…</div>';

  try {
    const { data: msgs, error } = await client
      .from('messages')
      .select('*')
      .or(`and(sender_id.eq.${chatCurrentUser.id},recipient_id.eq.${chatActiveThread.recipientId}),and(sender_id.eq.${chatActiveThread.recipientId},recipient_id.eq.${chatCurrentUser.id})`)
      .order('created_at', { ascending: true });

    if (error) throw error;

    if (!msgs || msgs.length === 0) {
      container.innerHTML = `
        <div style="padding:40px 20px;text-align:center">
          <div style="font-size:28px;margin-bottom:8px">👋</div>
          <div style="font-size:13px;color:#999">Say hello to ${chatActiveThread.recipientName}!</div>
        </div>`;
      return;
    }

    renderMessages(msgs);
    scrollToBottom();
  } catch (e) {
    container.innerHTML = `<div style="padding:20px;text-align:center;color:#ef4444;font-size:13px">Error loading messages</div>`;
  }
}

// ── RENDER MESSAGES ──
function renderMessages(msgs) {
  const container = document.getElementById('chat-messages');
  if (!container) return;

  let html = '';
  let lastDate = '';

  msgs.forEach(msg => {
    const isMe = msg.sender_id === chatCurrentUser.id;
    const msgDate = new Date(msg.created_at).toLocaleDateString('en-KE', { weekday: 'short', month: 'short', day: 'numeric' });

    // Date separator
    if (msgDate !== lastDate) {
      html += `<div style="text-align:center;margin:12px 0;font-size:11px;color:#aaa;font-weight:600;letter-spacing:0.5px">${msgDate}</div>`;
      lastDate = msgDate;
    }

    const timeStr = new Date(msg.created_at).toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' });

    html += `
      <div style="display:flex;flex-direction:column;align-items:${isMe ? 'flex-end' : 'flex-start'};margin-bottom:6px">
        <div class="msg ${isMe ? 'me' : 'them'}" style="max-width:78%;word-break:break-word">
          ${escapeHtml(msg.content)}
        </div>
        <div style="font-size:10px;color:#bbb;margin-top:2px;padding:0 4px;display:flex;align-items:center;gap:4px">
          ${timeStr}
          ${isMe ? `<i class="fas fa-check${msg.is_read ? '-double' : ''}" style="font-size:10px;color:${msg.is_read ? '#3db83a' : '#bbb'}"></i>` : ''}
        </div>
      </div>`;
  });

  container.innerHTML = html;
}

// ── SEND MESSAGE ──
async function sendMessage() {
  const input = document.getElementById('msg-input');
  const content = input?.value.trim();
  if (!content || !chatActiveThread || !chatCurrentUser) return;

  input.value = '';
  input.focus();

  // Optimistic UI — add to DOM immediately
  const container = document.getElementById('chat-messages');
  const tempDiv = document.createElement('div');
  tempDiv.style.cssText = 'display:flex;flex-direction:column;align-items:flex-end;margin-bottom:6px';
  tempDiv.innerHTML = `
    <div class="msg me" style="max-width:78%;word-break:break-word;opacity:0.7">${escapeHtml(content)}</div>
    <div style="font-size:10px;color:#bbb;margin-top:2px;padding:0 4px">Sending…</div>`;
  container?.appendChild(tempDiv);
  scrollToBottom();

  try {
    const { error } = await client.from('messages').insert([{
      sender_id: chatCurrentUser.id,
      recipient_id: chatActiveThread.recipientId,
      job_id: chatActiveThread.jobId || null,
      content: content,
      is_read: false
    }]);

    if (error) throw error;
    tempDiv.remove();
    // Realtime will add the message via subscription
  } catch (e) {
    tempDiv.querySelector('.msg').style.background = '#ef4444';
    const errMsg = e?.message?.includes('row-level security')
      ? 'Permission denied — check Supabase RLS policy'
      : e?.message || 'Failed to send';
    tempDiv.querySelector('div:last-child').textContent = errMsg;
  }
}

// Enter key to send
document.addEventListener('DOMContentLoaded', () => {
  const msgInput = document.getElementById('msg-input');
  if (msgInput) {
    msgInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });
  }
});


// ── MESSAGE TOAST (for messages arriving on non-active threads) ──
function showMessageToast(msg) {
  // Don't show if chat thread is already visible
  if (chatActiveThread?.recipientId === msg.sender_id) return;

  // Find sender name from contact list or use fallback
  const existingToast = document.getElementById('msg-toast');
  if (existingToast) existingToast.remove();

  const senderName = document.querySelector(`[data-contact-id="${msg.sender_id}"] .contact-name`)?.textContent
    || 'New message';

  const toast = document.createElement('div');
  toast.id = 'msg-toast';
  toast.style.cssText = `
    position:fixed; bottom:calc(68px + 12px); left:50%; transform:translateX(-50%) translateY(20px);
    background:white; border:1.5px solid #c8e0c8; border-radius:16px;
    padding:12px 16px; display:flex; align-items:center; gap:10px;
    box-shadow:0 8px 32px rgba(0,0,0,0.14); z-index:5000;
    max-width:320px; width:calc(100% - 32px);
    opacity:0; transition:opacity 0.25s, transform 0.3s cubic-bezier(0.34,1.56,0.64,1);
    cursor:pointer;
  `;
  toast.innerHTML = `
    <div style="width:36px;height:36px;border-radius:10px;background:#f0f7f0;display:flex;align-items:center;justify-content:center;flex-shrink:0">
      <i class="fas fa-comment" style="color:#3db83a;font-size:15px"></i>
    </div>
    <div style="flex:1;min-width:0">
      <div style="font-size:12px;font-weight:800;color:#0d1a0d;margin-bottom:1px">${escapeHtml(senderName)}</div>
      <div style="font-size:12px;color:#5a6a5a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(msg.content)}</div>
    </div>
    <div style="font-size:10px;color:#9aaa9a;flex-shrink:0">Tap to open</div>
  `;
  toast.addEventListener('click', () => {
    toast.remove();
    // Open the chat thread
    if (typeof startChatWith === 'function') {
      startChatWith(msg.sender_id, senderName, msg.job_id || null);
    }
  });

  document.body.appendChild(toast);
  // Animate in
  setTimeout(() => { toast.style.opacity = '1'; toast.style.transform = 'translateX(-50%) translateY(0)'; }, 50);
  // Auto-dismiss after 5 seconds
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(-50%) translateY(20px)';
    setTimeout(() => toast.remove(), 300);
  }, 5000);
}

// ── REALTIME SUBSCRIPTION ──
function subscribeToMessages() {
  // Unsubscribe from any existing channel first
  if (chatRealtimeChannel) {
    client.removeChannel(chatRealtimeChannel);
  }

  chatRealtimeChannel = client
    .channel('messages-realtime-' + chatCurrentUser.id)
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'messages',
      filter: `recipient_id=eq.${chatCurrentUser.id}`
    }, async (payload) => {
      const msg = payload.new;

      // If the message is from the active thread, render it and mark as read
      if (msg.sender_id === chatActiveThread?.recipientId) {
        appendMessage(msg, false);
        scrollToBottom();
        await client.from('messages').update({ is_read: true }).eq('id', msg.id);
      } else {
        // Message from someone else — update unread badge
        chatUnreadCount++;
        updateUnreadBadge();
        // Refresh contact list if inbox is visible
        if (document.getElementById('inbox-view')?.style.display !== 'none') {
          loadChatList();
        }
        // Ring the notification bell and show in-app toast
        if (typeof ringBell === 'function') ringBell();
        showMessageToast(msg);
      }
    })
    .on('postgres_changes', {
      event: 'UPDATE',
      schema: 'public',
      table: 'messages',
      filter: `sender_id=eq.${chatCurrentUser.id}`
    }, (payload) => {
      // Update read receipts on our own messages
      const msg = payload.new;
      if (msg.is_read) {
        // Reload messages to refresh ticks
        if (chatActiveThread?.recipientId === msg.recipient_id) loadMessages();
      }
    })
    .subscribe();

  // Also subscribe to messages we send (for multi-device sync)
  // B-03 fix: assign to module-level variable so exitChat() can remove it
  if (chatSendChannel) {
    client.removeChannel(chatSendChannel);
  }
  chatSendChannel = client
    .channel('messages-sent-' + chatCurrentUser.id)
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'messages',
      filter: `sender_id=eq.${chatCurrentUser.id}`
    }, (payload) => {
      const msg = payload.new;
      if (msg.recipient_id === chatActiveThread?.recipientId) {
        appendMessage(msg, true);
        scrollToBottom();
      }
    })
    .subscribe();
}

function appendMessage(msg, isMe) {
  const container = document.getElementById('chat-messages');
  if (!container) return;
  const timeStr = new Date(msg.created_at).toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' });
  const div = document.createElement('div');
  div.style.cssText = `display:flex;flex-direction:column;align-items:${isMe ? 'flex-end' : 'flex-start'};margin-bottom:6px`;
  div.innerHTML = `
    <div class="msg ${isMe ? 'me' : 'them'}" style="max-width:78%;word-break:break-word">${escapeHtml(msg.content)}</div>
    <div style="font-size:10px;color:#bbb;margin-top:2px;padding:0 4px;display:flex;align-items:center;gap:4px">
      ${timeStr}
      ${isMe ? '<i class="fas fa-check" style="font-size:10px;color:#bbb"></i>' : ''}
    </div>`;
  container.appendChild(div);
}

// ── OPEN THREAD WITH SPECIFIC USER (from marketplace / hire flow) ──
async function startChatWith(recipientId, recipientName, jobId = null) {
  if (!chatCurrentUser) await initChat();
  if (!chatCurrentUser) { window.location.href = 'auth.html'; return; }

  chatActiveThread = { recipientId, recipientName, jobId };

  const chatPage = document.getElementById('chat-page');
  if (chatPage) {
    chatPage.classList.remove('hidden');
    document.getElementById('chat-with-name').innerText = recipientName;
    const hireActions = document.getElementById('hire-actions');
    if (hireActions) {
      const showBtn = chatCurrentProfile?.role === 'client';
      hireActions.style.display = showBtn ? 'flex' : 'none';
    }
    document.getElementById('inbox-view').style.display = 'none';
    document.getElementById('chat-thread-view')?.classList.remove('hidden');
    await loadMessages();
    subscribeToMessages();
  } else {
    safeStorage.set('openChat', 'true');
    safeStorage.set('chatRecipientId', recipientId);
    safeStorage.set('chatRecipientName', recipientName);
    if (jobId) safeStorage.set('chatJobId', jobId);
    window.location.href = 'dashboard.html';
  }
}

// ── CONFIRM HIRE (client confirms hiring a helper) ──
async function confirmHire() {
  if (!chatActiveThread || !chatCurrentUser) return;

  const helperName = chatActiveThread.recipientName || 'Helper';
  const helperId   = chatActiveThread.recipientId;
  const jobId      = chatActiveThread.jobId;

  // ── Step 1: Get or create booking ──
  let booking = null;

  if (jobId) {
    // Look for an existing pending booking
    const { data: existing } = await client.from('bookings')
      .select('id, status, job_id')
      .eq('job_id', jobId)
      .eq('helper_id', helperId)
      .maybeSingle();

    if (existing) {
      booking = existing;
    } else {
      // No booking exists (client initiated chat, helper didn't apply) — create one
      const { data: newBooking, error: bookErr } = await client.from('bookings').insert([{
        job_id:    jobId,
        helper_id: helperId,
        client_id: chatCurrentUser.id,
        status:    'pending',
      }]).select('id, status, job_id').maybeSingle();
      if (bookErr) throw new Error('Could not create booking: ' + bookErr.message);
      booking = newBooking;
    }
  } else {
    // No job context — create a booking-less hire (direct service request)
    const { data: newBooking, error: bookErr } = await client.from('bookings').insert([{
      job_id:    null,
      helper_id: helperId,
      client_id: chatCurrentUser.id,
      status:    'pending',
    }]).select('id, status').maybeSingle();
    if (bookErr) throw new Error('Could not create booking: ' + bookErr.message);
    booking = newBooking;
  }

  if (!booking) throw new Error('Booking could not be established');

  // ── Step 2: Accept the booking ──
  const { error: updateErr } = await client.from('bookings')
    .update({ status: 'accepted' })
    .eq('id', booking.id);
  if (updateErr) throw new Error('Could not accept booking: ' + updateErr.message);

  // ── Step 3: Send hire confirmation message in chat ──
  await client.from('messages').insert([{
    sender_id:    chatCurrentUser.id,
    recipient_id: helperId,
    job_id:       jobId || null,
    content:      `✅ I'd like to officially hire you! Your booking has been confirmed. Please proceed with the agreed work.`,
    is_read:      false,
  }]);

  // ── Step 4: Notify the helper ──
  await client.from('notifications').insert([{
    user_id: helperId,
    title:   '🎉 You have been hired!',
    body:    `${chatCurrentProfile?.full_name || 'A client'} has confirmed your hire. Check your bookings and get ready to work!`,
    type:    'hired',
    is_read: false,
    data: {
      client_id:   chatCurrentUser.id,
      client_name: chatCurrentProfile?.full_name || '',
      job_id:      jobId || null,
      booking_id:  booking.id,
    },
  }]);

  // ── Step 5: Show payment prompt ──
  // Fetch job budget so we can pre-fill the pay modal
  let jobBudget = 0;
  let jobTitle  = 'Service';
  if (jobId) {
    const { data: job } = await client.from('jobs').select('title, budget').eq('id', jobId).maybeSingle();
    if (job) {
      jobTitle  = job.title  || 'Service';
      jobBudget = parseInt((job.budget || '0').replace(/[^0-9]/g, '')) || 0;
    }
  }

  // Reload messages to show hire confirmation message
  loadMessages();

  // Prompt payment via escrow
  showModal(
    '✅ Hire Confirmed!',
    `${helperName} has been hired. To secure the booking, pay via M-Pesa escrow. The helper gets paid after you confirm the job is done.`,
    'success',
    [{
      label: '💳 Pay via M-Pesa',
      onclick: `closeModal();openPayModal('${booking.id}','${helperId}','${helperName}','${jobTitle}',${jobBudget})`,
    }, {
      label: 'Pay Later',
      onclick: 'closeModal()',
    }]
  );
}

// ── SHOW/HIDE INBOX ──
function showInbox() {
  const inboxView = document.getElementById('inbox-view');
  const threadView = document.getElementById('chat-thread-view');
  if (inboxView) inboxView.style.display = 'block';
  if (threadView) threadView.classList.add('hidden');
  document.getElementById('chat-with-name').innerText = 'Inbox';
  chatActiveThread = null;
  // B-03 fix: remove both channels when leaving a thread
  if (chatRealtimeChannel) { client.removeChannel(chatRealtimeChannel); chatRealtimeChannel = null; }
  if (chatSendChannel)     { client.removeChannel(chatSendChannel);     chatSendChannel = null; }
}

// ── LEGACY showChatThread (kept for backward compatibility) ──
function showChatThread(name) {
  document.getElementById('chat-with-name').innerText = name;
  document.getElementById('inbox-view').style.display = 'none';
  document.getElementById('chat-thread-view')?.classList.remove('hidden');
}

// ── UNREAD COUNT ──
async function loadUnreadCount() {
  if (!chatCurrentUser) return;
  try {
    const { count } = await client.from('messages')
      .select('*', { count: 'exact', head: true })
      .eq('recipient_id', chatCurrentUser.id)
      .eq('is_read', false);
    chatUnreadCount = count || 0;
  } catch (e) {}
}

function updateUnreadBadge() {
  // Update chat nav button badge
  const chatNav = document.getElementById('nav-chat');
  if (!chatNav) return;

  let badge = chatNav.querySelector('.chat-badge');
  if (chatUnreadCount > 0) {
    if (!badge) {
      badge = document.createElement('span');
      badge.className = 'chat-badge';
      badge.style.cssText = 'position:absolute;top:-4px;right:-4px;background:#f07623;color:white;font-size:9px;font-weight:800;min-width:16px;height:16px;border-radius:8px;display:flex;align-items:center;justify-content:center;padding:0 3px;border:2px solid white';
      chatNav.style.position = 'relative';
      chatNav.appendChild(badge);
    }
    badge.textContent = chatUnreadCount > 9 ? '9+' : chatUnreadCount;
  } else if (badge) {
    badge.remove();
  }
}

// ── HELPERS ──
function scrollToBottom() {
  const container = document.getElementById('chat-messages');
  if (container) container.scrollTop = container.scrollHeight;
}

function escapeHtml(text) {
  return (text || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');
}

function formatChatTime(dateStr) {
  const d = new Date(dateStr);
  const now = new Date();
  const diffDays = Math.floor((now - d) / 86400000);
  if (diffDays === 0) return d.toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' });
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return d.toLocaleDateString('en-KE', { weekday: 'short' });
  return d.toLocaleDateString('en-KE', { day: 'numeric', month: 'short' });
}

function stringToColor(str) {
  const colors = ['#3db83a','#3b82f6','#f07623','#8b5cf6','#ec4899','#f59e0b','#0891b2','#16a34a'];
  let h = 0; for (let c of (str||'?')) h = (h<<5)-h+c.charCodeAt(0);
  return colors[Math.abs(h) % colors.length];
}

// ── AUTO-BOOT CHAT ON DASHBOARD LOAD ──
document.addEventListener("DOMContentLoaded", async () => {
  // Init chat for any page that has the chat panel
  if (document.getElementById('chat-page')) {
    await initChat();
    updateUnreadBadge();

    // Auto-open chat if redirected from another page
    if (safeStorage.get("openChat") === "true") {
      safeStorage.remove("openChat");
      const recipientId = safeStorage.get('chatRecipientId');
      const recipientName = safeStorage.get('chatRecipientName');
      const jobId = safeStorage.get('chatJobId');
      if (recipientId && recipientName) {
        safeStorage.remove('chatRecipientId');
        safeStorage.remove('chatRecipientName');
        safeStorage.remove('chatJobId');
        setTimeout(() => startChatWith(recipientId, recipientName, jobId), 400);
      } else {
        setTimeout(() => openChatPage(), 300);
      }
    }
  }
});

// ============================================================
// GLOBAL EXPOSURE
// ============================================================
window.client = client;

// ── safeStorage: wraps localStorage to gracefully handle tracking prevention ──
const safeStorage = {
  get:    (k, def=null) => { try { const v = localStorage.getItem(k); return v !== null ? v : def; } catch(e) { return def; } },
  set:    (k, v) =>        { try { localStorage.setItem(k, v); } catch(e) { console.warn('Storage blocked:', k); } },
  remove: (k) =>           { try { localStorage.removeItem(k); } catch(e) {} },
  clear:  () =>            { try { localStorage.clear(); } catch(e) {} },
};

window.signUp = signUp;
window.login = login;
window.detectMyLocation = detectMyLocation;
window.handleVettingUpload = handleVettingUpload;
window.loadDashboardStats = loadDashboardStats;
window.loadPendingHelpers = loadPendingHelpers;
window.updateVettingStatus = updateVettingStatus;
window.loadTrendingJobs = loadTrendingJobs;
window.loadMarketplaceJobs = loadMarketplaceJobs;
window.filterJobs = filterJobs;
window.handlePostJob = handlePostJob;
window.toggleAppMenu = toggleAppMenu;
window.handleProfileClick = handleProfileClick;
window.logout = async () => { await client.auth.signOut(); window.location.href = 'index.html'; };

// Chat globals
window.openChatPage = openChatPage;
window.exitChat = exitChat;
window.openChatFromNav = openChatFromNav;
window.loadChatList = loadChatList;
window.openThread = openThread;
window.sendMessage = sendMessage;
window.confirmHire = confirmHire;
window.showChatThread = showChatThread;
window.showInbox = showInbox;
window.startChatWith = startChatWith;


// ============================================================
// HELPER ONBOARDING WIZARD
// 5-step guided verification flow
// Steps: Welcome → Profile → Location → Documents → Review & Submit
// ============================================================

const WIZARD_STEPS = [
  { id: 'welcome',   title: 'Welcome',    icon: 'fa-hand-wave' },
  { id: 'profile',   title: 'Profile',    icon: 'fa-user-pen' },
  { id: 'location',  title: 'Location',   icon: 'fa-map-pin' },
  { id: 'documents', title: 'Documents',  icon: 'fa-file-shield' },
  { id: 'review',    title: 'Submit',     icon: 'fa-circle-check' },
];

// ── TRADE CERTIFICATE CONFIG PER CATEGORY ──
// mandatory: cert is required to submit — helper cannot proceed without it
// label: what the upload field says
// hint: guidance text shown under the upload zone
// icon: Font Awesome icon class
const WIZ_CAT_ICONS = {
  'Cleaning':'fa-broom','Plumbing':'fa-faucet','Electrical':'fa-bolt','Painting':'fa-paint-roller',
  'Pest Control':'fa-bug-slash','Appliance Repair':'fa-plug','Carpentry':'fa-screwdriver-wrench',
  'Gardening':'fa-leaf','General Repairs':'fa-tools',
  'Masonry/Fundi':'fa-helmet-safety','Welding':'fa-gear','Solar Installation':'fa-solar-panel',
  'CCTV/Security Tech':'fa-camera','Wi-Fi/Internet Setup':'fa-wifi','Generator Service':'fa-plug-circle-bolt',
  'Water/Borehole':'fa-droplet',
  'Bookkeeping':'fa-book','Tax Filing':'fa-file-invoice','Graphic Design':'fa-palette',
  'IT Support':'fa-laptop','Printing':'fa-print','Company Registration':'fa-building',
  'Moving/Relocation':'fa-truck-moving','Laundry':'fa-shirt','Beauty/Barber':'fa-scissors',
  'Catering':'fa-utensils','Photography':'fa-camera-retro','Tutoring':'fa-graduation-cap',
  'Events':'fa-champagne-glasses','Pet Care':'fa-paw',
  'Car Wash':'fa-car','Mechanic':'fa-wrench','Tyre Services':'fa-circle-dot',
  'Driver/Transport':'fa-steering-wheel','Roadside Assistance':'fa-road',
  'Delivery':'fa-truck','Shopping/Errands':'fa-bag-shopping',
  'Legal (Lawyer)':'fa-scale-balanced','Accounting (CPA)':'fa-calculator',
  'Architecture':'fa-drafting-compass','Security Guard':'fa-shield-halved','Consulting':'fa-handshake',
}

const TRADE_CERT_CONFIG = {
  'Cleaning': {
    mandatory: false,
    label: 'Cleaning / Hospitality Certificate (Optional)',
    hint: 'NITA Housekeeping or Hospitality certificate strengthens your profile.',
    icon: 'fa-broom',
  },
  'Plumbing': {
    mandatory: true,
    label: 'NITA Plumbing Trade Test Certificate',
    hint: 'Upload your NITA Trade Test Certificate for Plumbing (Artisan Grade II or above). Mandatory for all plumbing helpers.',
    icon: 'fa-faucet',
  },
  'Electrical': {
    mandatory: true,
    label: 'NITA Electrical Wireman Licence',
    hint: 'Upload your EPRA Electrical Wireman Licence or NITA Electrical Installation certificate. Legally required to offer electrical services.',
    icon: 'fa-bolt',
  },
  'Painting': {
    mandatory: false,
    label: 'NITA Painting / Decorating Certificate (Optional)',
    hint: 'NITA Painting and Decorating trade certificate. Optional but increases client trust.',
    icon: 'fa-paint-roller',
  },
  'Pest Control': {
    mandatory: true,
    label: 'PCPB Pest Control Operator Licence',
    hint: 'Upload your Pest Control Products Board (PCPB) operator licence. Legally required for commercial pest control in Kenya.',
    icon: 'fa-bug-slash',
  },
  'Appliance Repair': {
    mandatory: false,
    label: 'NITA Electronics / Appliance Repair Certificate (Optional)',
    hint: 'NITA Electronics or Electrical Engineering certificate. Optional but builds confidence with clients.',
    icon: 'fa-plug',
  },
  'Carpentry': {
    mandatory: true,
    label: 'NITA Carpentry & Joinery Trade Test',
    hint: 'Upload your NITA Carpentry and Joinery Trade Test certificate (Artisan Grade II or above).',
    icon: 'fa-screwdriver-wrench',
  },
  'Gardening': {
    mandatory: false,
    label: 'Horticulture / Landscaping Certificate (Optional)',
    hint: 'NITA Landscaper or Horticulture certificate. Optional but increases trust.',
    icon: 'fa-seedling',
  },
  'General Repairs': {
    mandatory: true,
    label: 'NITA Trade Test Certificate',
    hint: 'Upload your NITA Trade Test Certificate (Artisan Grade II or above) for your specific trade.',
    icon: 'fa-scroll',
  },
  'Masonry/Fundi': {
    mandatory: true,
    label: 'NITA Masonry / Bricklaying Trade Test',
    hint: 'Upload your NITA Masonry or Bricklaying Trade Test certificate. Required for all construction helpers.',
    icon: 'fa-helmet-safety',
  },
  'Welding': {
    mandatory: true,
    label: 'NITA Welding & Fabrication Certificate',
    hint: 'Upload your NITA Welding and Fabrication trade test certificate. Mandatory for welding services.',
    icon: 'fa-gear',
  },
  'Solar Installation': {
    mandatory: true,
    label: 'EPRA Solar Installer Certification',
    hint: 'Upload your Energy and Petroleum Regulatory Authority (EPRA) solar installation certificate. Required for commercial solar work in Kenya.',
    icon: 'fa-solar-panel',
  },
  'CCTV/Security Tech': {
    mandatory: false,
    label: 'CCTV / Security Systems Certificate (Optional)',
    hint: 'Any CCTV installation or security systems certificate. Optional but builds trust with clients.',
    icon: 'fa-camera',
  },
  'Wi-Fi/Internet Setup': {
    mandatory: false,
    label: 'IT / Networking Certificate (Optional)',
    hint: 'CCNA, CompTIA Network+, or any ICT networking certificate. Optional but recommended.',
    icon: 'fa-wifi',
  },
  'Generator Service': {
    mandatory: false,
    label: 'Electrical / Generator Service Certificate (Optional)',
    hint: 'NITA Electrical or generator-specific training certificate. Optional.',
    icon: 'fa-plug-circle-bolt',
  },
  'Water/Borehole': {
    mandatory: true,
    label: 'Water Services Board Licence',
    hint: 'Upload your Water Services Regulatory Board (WASREB) or county water authority licence for borehole and plumbing works.',
    icon: 'fa-droplet',
  },
  'Bookkeeping': {
    mandatory: true,
    label: 'Bookkeeping / Accounting Qualification',
    hint: 'Upload your CPA (K), AAT, or KASNEB certificate. Required for all bookkeeping helpers.',
    icon: 'fa-book',
  },
  'Tax Filing': {
    mandatory: true,
    label: 'KRA PIN + CPA or Tax Agent Licence',
    hint: 'Upload your KRA PIN certificate and CPA (K) or Tax Agent registration. Required to offer tax services.',
    icon: 'fa-file-invoice',
  },
  'Graphic Design': {
    mandatory: false,
    label: 'Design Portfolio or Certificate (Optional)',
    hint: 'Any graphic design certificate or portfolio link. Optional but greatly increases bookings.',
    icon: 'fa-palette',
  },
  'IT Support': {
    mandatory: false,
    label: 'IT Certification (Optional)',
    hint: 'CompTIA A+, CCNA, Microsoft, or any IT certification. Optional but builds confidence.',
    icon: 'fa-laptop',
  },
  'Printing': {
    mandatory: false,
    label: 'Business Certificate (Optional)',
    hint: 'Business permit or any printing trade certificate. Optional.',
    icon: 'fa-print',
  },
  'Company Registration': {
    mandatory: true,
    label: 'Certified Agent / Paralegal Certificate',
    hint: 'Upload your Law Society of Kenya (LSK) paralegal certificate or company secretarial qualification.',
    icon: 'fa-building',
  },
  'Moving/Relocation': {
    mandatory: false,
    label: "Driver's Licence or Moving Experience Certificate (Optional)",
        hint: "A valid Kenya driver's licence or any certification for furniture/goods handling. Optional.",
    icon: 'fa-truck-moving',
  },
  'Laundry': {
    mandatory: false,
    label: 'Laundry / Textile Care Certificate (Optional)',
    hint: 'NITA Sewing/Textile or hospitality-laundry certificate. Not mandatory.',
    icon: 'fa-shirt',
  },
  'Beauty/Barber': {
    mandatory: true,
    label: 'NITA Beauty Therapy / Barbering Certificate',
    hint: 'Upload your NITA Beauty Therapy or Barbering certificate. Required for all beauty and grooming helpers.',
    icon: 'fa-scissors',
  },
  'Catering': {
    mandatory: false,
        label: "Food Handler's Certificate (Optional)",
    hint: 'County public health food handler certificate. Optional but strongly recommended for food-related services.',
    icon: 'fa-utensils',
  },
  'Photography': {
    mandatory: false,
    label: 'Photography Portfolio (Optional)',
    hint: 'A portfolio link or any photography certificate. Optional but increases bookings significantly.',
    icon: 'fa-camera-retro',
  },
  'Tutoring': {
    mandatory: true,
    label: 'Teaching Certificate / Academic Transcript',
    hint: 'Upload a TSC certificate, college diploma, or official academic transcript showing your subject competency.',
    icon: 'fa-graduation-cap',
  },
  'Events': {
    mandatory: false,
    label: 'Events / Catering Certificate (Optional)',
    hint: 'Any catering, event management, or hospitality certificate from a recognised institution.',
    icon: 'fa-champagne-glasses',
  },
  'Pet Care': {
    mandatory: false,
    label: 'Animal Care / Vet Assistant Certificate (Optional)',
    hint: 'NITA or TVETA animal husbandry/pet care certificate. Optional.',
    icon: 'fa-paw',
  },
  'Car Wash': {
    mandatory: false,
    label: 'Business Permit (Optional)',
    hint: 'County business permit or any car wash training certificate. Optional.',
    icon: 'fa-car',
  },
  'Mechanic': {
    mandatory: true,
    label: 'NITA Motor Vehicle Mechanics Certificate',
    hint: 'Upload your NITA Motor Vehicle Mechanics trade test certificate (Artisan Grade II or above).',
    icon: 'fa-wrench',
  },
  'Tyre Services': {
    mandatory: false,
    label: 'Tyre Fitting Certificate (Optional)',
    hint: 'Any tyre fitting or automotive certificate. Optional.',
    icon: 'fa-circle-dot',
  },
  'Driver/Transport': {
    mandatory: true,
        label: "PSV Badge & Driver's Licence",
    hint: "Upload your NTSA PSV Badge and valid Driver's Licence (Class B3 or above). Legally required for transport services.",
    icon: 'fa-id-badge',
  },
  'Roadside Assistance': {
    mandatory: false,
    label: "Driver's Licence (Optional)",
        hint: "A valid Kenya driver's licence. Optional but recommended.",
    icon: 'fa-road',
  },
  'Delivery': {
    mandatory: false,
        label: "Driver's Licence (Optional)",
    hint: "A valid Kenya driver's licence. Required only for vehicle deliveries.",
    icon: 'fa-truck',
  },
  'Shopping/Errands': {
    mandatory: false,
    label: 'Trade Certificate (Optional)',
    hint: 'Any relevant certificate e.g. retail, procurement, or customer service. Optional.',
    icon: 'fa-bag-shopping',
  },
  'Legal (Lawyer)': {
    mandatory: true,
    label: 'LSK Advocate Certificate',
    hint: 'Upload your Law Society of Kenya (LSK) advocate certificate and current practising certificate.',
    icon: 'fa-scale-balanced',
  },
  'Accounting (CPA)': {
    mandatory: true,
    label: 'ICPAK / CPA (K) Certificate',
    hint: 'Upload your ICPAK membership certificate and current practising licence.',
    icon: 'fa-calculator',
  },
  'Architecture': {
    mandatory: true,
    label: 'Board of Registration of Architects Certificate',
    hint: 'Upload your BoRAQ (Board of Registration of Architects and Quantity Surveyors) practising certificate.',
    icon: 'fa-drafting-compass',
  },
  'Security Guard': {
    mandatory: true,
    label: 'PSASB Security Guard Licence',
    hint: 'Upload your Private Security Regulatory Authority (PSRA/PSASB) guard licence or certificate of training.',
    icon: 'fa-shield-halved',
  },
  'Consulting': {
    mandatory: false,
    label: 'Professional Qualification Certificate (Optional)',
    hint: 'Any relevant professional certificate, degree, or qualification document.',
    icon: 'fa-handshake',
  },
};

// Returns the cert config for the current category, or a generic optional fallback
function getTradeCertConfig(category) {
  return TRADE_CERT_CONFIG[category] || {
    mandatory: false,
    label: 'Trade / Competence Certificate (Optional)',
    hint: 'Upload any relevant trade certificate, diploma, or licence that proves your competency in this field.',
    icon: 'fa-certificate',
  };
}


// Wizard state — persisted in localStorage so a refresh doesn't reset progress
const WIZ_KEY = 'helpro_wizard_state';
let wizState = {
  step: 0,
  fullName: '',
  bio: '',
  serviceCategory: '',
  hourlyRate: '',
  locationName: '',
  // File objects — never persisted (cannot be serialized)
  selfieFile: null,
  idFile: null,
  conductFile: null,
  tradeCertFile: null,
  // B-02 fix: store only filename flags, NOT base64 previews
  // Base64 images (up to 15MB total) reliably overflow the 5MB localStorage quota
  selfieFileName: null,
  idFileName: null,
  conductFileName: null,
  tradeCertFileName: null,
  selfieHasFile: false,
  idHasFile: false,
  conductHasFile: false,
  tradeCertHasFile: false,
};

function wizSave() {
  try {
    // B-02 fix: only persist lightweight metadata — never base64 previews or File objects
    const s = {
      step:             wizState.step,
      fullName:         wizState.fullName,
      bio:              wizState.bio,
      serviceCategory:  wizState.serviceCategory,
      hourlyRate:       wizState.hourlyRate,
      locationName:     wizState.locationName,
      selfieFileName:   wizState.selfieFileName,
      idFileName:       wizState.idFileName,
      conductFileName:  wizState.conductFileName,
      tradeCertFileName: wizState.tradeCertFileName,
      selfieHasFile:    wizState.selfieHasFile,
      idHasFile:        wizState.idHasFile,
      conductHasFile:   wizState.conductHasFile,
      tradeCertHasFile: wizState.tradeCertHasFile,
    };
    safeStorage.set(WIZ_KEY, JSON.stringify(s));
  } catch(e) {}
}

function wizLoad() {
  try {
    const saved = JSON.parse(safeStorage.get(WIZ_KEY) || '{}');
    wizState = { ...wizState, ...saved };
  } catch(e) {}
}

// ── MOUNT ──
function initOnboardingWizard(profile) {
  wizLoad();
  // Pre-fill from existing profile if available
  if (profile) {
    if (profile.full_name && !wizState.fullName)  wizState.fullName = profile.full_name;
    if (profile.bio && !wizState.bio)             wizState.bio = profile.bio;
    if (profile.location_name && !wizState.locationName) wizState.locationName = profile.location_name;
  }

  const container = document.getElementById('vetting-form');
  if (!container) return;
  injectWizardStyles();
  renderWizard();
}

// ── RENDER SHELL ──
function renderWizard() {
  const container = document.getElementById('vetting-form');
  if (!container) return;

  container.innerHTML = `
    <div class="wiz-wrap" id="wiz-wrap">
      <div class="wiz-progress-bar">
        <div class="wiz-progress-fill" id="wiz-fill"></div>
      </div>
      <div class="wiz-steps-row" id="wiz-steps-row"></div>
      <div class="wiz-body" id="wiz-body"></div>
      <div class="wiz-footer" id="wiz-footer"></div>
    </div>`;

  renderWizStep();
}

function renderWizStep() {
  const s = wizState.step;
  const total = WIZARD_STEPS.length;

  // Progress bar
  const pct = (s / (total - 1)) * 100;
  const fill = document.getElementById('wiz-fill');
  if (fill) fill.style.width = pct + '%';

  // Step dots
  const stepsRow = document.getElementById('wiz-steps-row');
  if (stepsRow) {
    stepsRow.innerHTML = WIZARD_STEPS.map((step, i) => `
      <div class="wiz-step-dot ${i < s ? 'done' : i === s ? 'active' : ''}">
        <div class="wiz-dot-circle">
          ${i < s ? '<i class="fas fa-check"></i>' : `<i class="fas ${step.icon}"></i>`}
        </div>
        <span>${step.label || step.title}</span>
      </div>`).join('');
  }

  // Body
  const body = document.getElementById('wiz-body');
  if (body) body.innerHTML = getStepHTML(s);

  // Footer
  renderWizFooter(s);

  // Bind step-specific events
  bindStepEvents(s);
}

// ── STEP CONTENT ──
function getStepHTML(step) {
  switch(step) {
    case 0: return stepWelcome();
    case 1: return stepProfile();
    case 2: return stepLocation();
    case 3: return stepDocuments();
    case 4: return stepReview();
    default: return '';
  }
}

function stepWelcome() {
  return `
    <div class="wiz-welcome">
      <div class="wiz-welcome-icon">
        <i class="fas fa-shield-halved"></i>
      </div>
      <h2 class="wiz-title">Become a Verified Helper</h2>
      <p class="wiz-subtitle">Verification builds trust with clients and unlocks all Helpro features — job applications, chat, and payouts.</p>
      <div class="wiz-checklist">
        <div class="wiz-check-item"><i class="fas fa-circle-check"></i> Takes about 5 minutes</div>
        <div class="wiz-check-item"><i class="fas fa-circle-check"></i> Your data is stored securely</div>
        <div class="wiz-check-item"><i class="fas fa-circle-check"></i> Admin reviews within 24 hours</div>
        <div class="wiz-check-item"><i class="fas fa-circle-check"></i> You get notified on approval</div>
      </div>
      <div class="wiz-what-need">
        <div class="wiz-need-title"><i class="fas fa-clipboard-list"></i> What you'll need</div>
        <div class="wiz-need-grid">
          <div class="wiz-need-item"><i class="fas fa-camera"></i><span>Selfie photo</span></div>
          <div class="wiz-need-item"><i class="fas fa-id-card"></i><span>National ID</span></div>
          <div class="wiz-need-item"><i class="fas fa-certificate"></i><span>Trade Certificate</span></div>
        </div>
      </div>
    </div>`;
}

function stepProfile() {
    const categories = ['Cleaning','Plumbing','Electrical','Painting','Pest Control','Appliance Repair','Carpentry','Gardening','General Repairs','Masonry/Fundi','Welding','Solar Installation','CCTV/Security Tech','Wi-Fi/Internet Setup','Generator Service','Water/Borehole','Bookkeeping','Tax Filing','Graphic Design','IT Support','Printing','Company Registration','Moving/Relocation','Laundry','Beauty/Barber','Catering','Photography','Tutoring','Events','Pet Care','Car Wash','Mechanic','Tyre Services','Driver/Transport','Roadside Assistance','Delivery','Shopping/Errands','Legal (Lawyer)','Accounting (CPA)','Architecture','Security Guard','Consulting'];
  return `
    <div class="wiz-step-content">
      <div class="wiz-step-header">
        <div class="wiz-step-icon"><i class="fas fa-user-pen"></i></div>
        <h2 class="wiz-title">Your Profile</h2>
        <p class="wiz-subtitle">Tell clients who you are and what you do best.</p>
      </div>
      <div class="wiz-field">
        <label class="wiz-label">Full Name <span class="wiz-required">*</span></label>
        <div class="wiz-input-wrap">
          <i class="fas fa-user"></i>
          <input type="text" id="wiz-fullname" class="wiz-input" placeholder="e.g. Grace Wanjiku" value="${escWiz(wizState.fullName)}">
        </div>
      </div>
      <div class="wiz-field">
        <label class="wiz-label">Service Category <span class="wiz-required">*</span></label>
        <div class="wiz-cat-grid" id="wiz-cat-grid">
          ${categories.map(c => `
            <div class="wiz-cat-opt ${wizState.serviceCategory === c ? 'selected' : ''}" onclick="selectWizCat('${c}')">
              ${c}
            </div>`).join('')}
        </div>
        <input type="hidden" id="wiz-category" value="${escWiz(wizState.serviceCategory)}">
      </div>
      <div class="wiz-field">
        <label class="wiz-label">Hourly Rate (KES)</label>
        <div class="wiz-input-wrap">
          <i class="fas fa-money-bill-wave"></i>
          <input type="number" id="wiz-rate" class="wiz-input" placeholder="e.g. 500" value="${escWiz(wizState.hourlyRate)}" min="0">
        </div>
        <div class="wiz-hint">Leave blank to negotiate per job</div>
      </div>
      <div class="wiz-field">
        <label class="wiz-label">Short Bio</label>
        <textarea id="wiz-bio" class="wiz-input wiz-textarea" placeholder="Describe your experience, skills, and availability…">${escWiz(wizState.bio)}</textarea>
        <div class="wiz-char-count" id="wiz-bio-count">${(wizState.bio||'').length}/200</div>
      </div>
    </div>`;
}

function stepLocation() {
  return `
    <div class="wiz-step-content">
      <div class="wiz-step-header">
        <div class="wiz-step-icon"><i class="fas fa-map-pin"></i></div>
        <h2 class="wiz-title">Your Location</h2>
        <p class="wiz-subtitle">Clients search by area. Your exact coordinates are never shared publicly.</p>
      </div>
      <div class="wiz-field">
        <label class="wiz-label">Area / Neighbourhood <span class="wiz-required">*</span></label>
        <div class="wiz-input-wrap">
          <i class="fas fa-location-dot"></i>
          <input type="text" id="location-name" class="wiz-input" placeholder="e.g. Westlands, Nairobi" value="${escWiz(wizState.locationName)}">
        </div>
      </div>
      <button class="wiz-detect-btn" onclick="wizDetectLocation()" id="wiz-detect-btn">
        <i class="fas fa-crosshairs"></i> Detect My Location
      </button>
      <input type="hidden" id="lat-coord">
      <input type="hidden" id="lng-coord">
      <div id="wiz-loc-feedback" class="wiz-loc-feedback" style="display:none"></div>
      <div class="wiz-location-tip">
        <i class="fas fa-circle-info"></i>
        <span>We use your location to match you with nearby jobs. Tap "Detect" for the most accurate result, or type your area manually.</span>
      </div>
    </div>`;
}

function stepDocuments() {
  return `
    <div class="wiz-step-content">
      <div class="wiz-step-header">
        <div class="wiz-step-icon"><i class="fas fa-file-shield"></i></div>
        <h2 class="wiz-title">Verification Documents</h2>
        <p class="wiz-subtitle">All documents are encrypted and only viewed by Helpro admins for verification.</p>
      </div>

      ${docUploadField({
        id: 'upload-selfie',
        label: 'Selfie Photo',
        required: true,
        icon: 'fa-camera',
        hint: 'A clear photo of your face. No sunglasses or hats.',
        hasFile: wizState.selfieHasFile,
        fileName: wizState.selfieFileName,
        needsReselect: wizState.selfieHasFile && !wizState.selfieFile,
      })}
      ${docUploadField({
        id: 'upload-id',
        label: 'National ID / Passport',
        required: true,
        icon: 'fa-id-card',
        hint: 'Front of your Kenya National ID or passport photo page.',
        hasFile: wizState.idHasFile,
        fileName: wizState.idFileName,
        needsReselect: wizState.idHasFile && !wizState.idFile,
      })}
      ${(function() {
        const certCfg = getTradeCertConfig(wizState.serviceCategory);
        return docUploadField({
          id: 'upload-trade-cert',
          label: certCfg.label,
          required: certCfg.mandatory,
          icon: certCfg.icon,
          hint: certCfg.hint,
          hasFile: wizState.tradeCertHasFile,
          fileName: wizState.tradeCertFileName,
          needsReselect: wizState.tradeCertHasFile && !wizState.tradeCertFile,
        });
      })()}
    </div>`;
}

function docUploadField({ id, label, required, icon, hint, hasFile, fileName, needsReselect }) {
  // needsReselect = true when localStorage says a file was chosen before,
  // but the page was refreshed and the File object is gone (cannot survive page reload).
  // We must warn the user to re-pick the file rather than show a false green checkmark.

  let zoneContent;
  if (needsReselect) {
    // Warn state — file name is known but File object is lost
    zoneContent = `
      <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;padding:16px;text-align:center">
        <i class="fas fa-rotate-right" style="font-size:24px;color:#f07623"></i>
        <span style="font-size:13px;font-weight:700;color:#7a4a10">Re-select required</span>
        <span style="font-size:11px;color:#9a6a30">${escWiz(fileName || 'Previously selected')} — tap to re-upload</span>
      </div>`;
  } else if (hasFile) {
    // Happy state — file is freshly selected this session
    zoneContent = `
      <div class="wiz-file-overlay" style="position:relative;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;padding:16px">
        <i class="fas fa-check-circle" style="font-size:24px;color:#3db83a"></i>
        <span style="font-size:13px;font-weight:700;color:#0d1a0d">${escWiz(fileName || 'File selected')}</span>
        <span class="wiz-change-link">Tap to change</span>
      </div>`;
  } else {
    // Empty state
    zoneContent = `
      <div class="wiz-upload-placeholder">
        <i class="fas fa-cloud-arrow-up"></i>
        <span>Tap to upload</span>
        <small>JPG, PNG or PDF · Max 5MB</small>
      </div>`;
  }

  // Zone border color: orange warning if needs re-select, green if done, dashed if empty
  const zoneClass = needsReselect
    ? 'wiz-upload-zone wiz-reselect'
    : hasFile ? 'wiz-upload-zone has-file' : 'wiz-upload-zone';

  return `
    <div class="wiz-doc-field" id="field-${id}">
      <div class="wiz-doc-label">
        <i class="fas ${icon}"></i> ${label} ${required ? '<span class="wiz-required">*</span>' : ''}
      </div>
      <div class="wiz-doc-hint">${hint}</div>
      <div class="${zoneClass}" id="zone-${id}" onclick="document.getElementById('${id}').click()">
        ${zoneContent}
      </div>
      <input type="file" id="${id}" accept="image/*,.pdf" style="display:none" onchange="wizHandleFile('${id}', this)">
    </div>`;
}

function stepReview() {
  const certCfgR = getTradeCertConfig(wizState.serviceCategory);
  const allDocs = wizState.selfieHasFile && wizState.idHasFile && (!certCfgR.mandatory || wizState.tradeCertHasFile);
  return `
    <div class="wiz-step-content">
      <div class="wiz-step-header">
        <div class="wiz-step-icon" style="background:var(--green-light);color:var(--green)"><i class="fas fa-circle-check"></i></div>
        <h2 class="wiz-title">Review & Submit</h2>
        <p class="wiz-subtitle">Check your details before submitting for admin review.</p>
      </div>

      <div class="wiz-review-card">
        <div class="wiz-review-row">
          <div class="wiz-review-label"><i class="fas fa-user"></i> Name</div>
          <div class="wiz-review-val">${escWiz(wizState.fullName) || '<span class="wiz-missing">Not set</span>'}</div>
          <button class="wiz-edit-btn" onclick="wizGoTo(1)"><i class="fas fa-pen"></i></button>
        </div>
        <div class="wiz-review-row">
          <div class="wiz-review-label"><i class="fas fa-briefcase"></i> Category</div>
          <div class="wiz-review-val">${escWiz(wizState.serviceCategory) || '<span class="wiz-missing">Not set</span>'}</div>
          <button class="wiz-edit-btn" onclick="wizGoTo(1)"><i class="fas fa-pen"></i></button>
        </div>
        <div class="wiz-review-row">
          <div class="wiz-review-label"><i class="fas fa-money-bill"></i> Rate</div>
          <div class="wiz-review-val">${wizState.hourlyRate ? 'KES ' + escWiz(wizState.hourlyRate) + '/hr' : 'Negotiable'}</div>
          <button class="wiz-edit-btn" onclick="wizGoTo(1)"><i class="fas fa-pen"></i></button>
        </div>
        <div class="wiz-review-row">
          <div class="wiz-review-label"><i class="fas fa-location-dot"></i> Location</div>
          <div class="wiz-review-val">${escWiz(wizState.locationName) || '<span class="wiz-missing">Not set</span>'}</div>
          <button class="wiz-edit-btn" onclick="wizGoTo(2)"><i class="fas fa-pen"></i></button>
        </div>
      </div>

      <div class="wiz-docs-review">
        <div class="wiz-review-label" style="margin-bottom:10px"><i class="fas fa-file-shield"></i> Documents</div>
        <div class="wiz-docs-grid">
          ${wizDocThumb(wizState.selfieHasFile, wizState.selfieFileName || 'Selfie', 1)}
          ${wizDocThumb(wizState.idHasFile, wizState.idFileName || 'National ID', 2)}
          ${(function(){const c=getTradeCertConfig(wizState.serviceCategory);return wizDocThumb(wizState.tradeCertHasFile, wizState.tradeCertFileName || c.label, 3, !c.mandatory);}())}
        </div>
      </div>

      ${!allDocs ? `<div class="wiz-warning"><i class="fas fa-triangle-exclamation"></i> Some documents are missing. <button onclick="wizGoTo(3)" class="wiz-text-link">Upload now</button></div>` : ''}

      <div class="wiz-declaration">
        <label class="wiz-checkbox-wrap">
          <input type="checkbox" id="wiz-declaration" onchange="wizToggleSubmit()">
          <span class="wiz-checkbox-box"></span>
          <span class="wiz-checkbox-label">I confirm all documents are genuine and belong to me. I agree to Helpro's <a href="#" style="color:var(--green-dark)">Terms of Service</a>.</span>
        </label>
      </div>
    </div>`;
}

function wizDocThumb(hasFile, label, step, isOptional) {
  return `
    <div class="wiz-doc-thumb ${hasFile ? 'ready' : isOptional ? 'optional' : 'missing'}" onclick="wizGoTo(3)">
      ${hasFile
        ? `<i class="fas fa-check-circle" style="font-size:28px;color:#3db83a"></i>`
        : isOptional ? `<i class="fas fa-circle-plus" style="color:#94a3b8"></i>` : `<i class="fas fa-circle-plus"></i>`}
      <span>${escWiz(label)}</span>
      ${hasFile ? '<div class="wiz-thumb-tick"><i class="fas fa-check"></i></div>' : ''}
    </div>`;
}

// ── FOOTER / NAVIGATION ──
function renderWizFooter(step) {
  const footer = document.getElementById('wiz-footer');
  if (!footer) return;
  const isFirst = step === 0;
  const isLast  = step === WIZARD_STEPS.length - 1;
  footer.innerHTML = `
    <div class="wiz-footer-inner">
      <button class="wiz-btn-back ${isFirst ? 'invisible' : ''}" onclick="wizBack()" ${isFirst ? 'disabled' : ''}>
        <i class="fas fa-arrow-left"></i> Back
      </button>
      <div class="wiz-step-counter">${step + 1} of ${WIZARD_STEPS.length}</div>
      ${isLast
        ? `<button class="wiz-btn-next wiz-btn-submit" id="wiz-submit-btn" onclick="wizSubmit()" disabled>
             <i class="fas fa-paper-plane"></i> Submit
           </button>`
        : `<button class="wiz-btn-next" onclick="wizNext()">
             ${isFirst ? 'Get Started' : 'Continue'} <i class="fas fa-arrow-right"></i>
           </button>`
      }
    </div>`;
}

// ── NAVIGATION ──
function wizNext() {
  if (!wizValidateStep(wizState.step)) return;
  wizCollectStep(wizState.step);
  wizState.step = Math.min(wizState.step + 1, WIZARD_STEPS.length - 1);
  wizSave();
  renderWizStep();
  document.getElementById('vetting-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function wizBack() {
  wizCollectStep(wizState.step);
  wizState.step = Math.max(wizState.step - 1, 0);
  wizSave();
  renderWizStep();
  document.getElementById('vetting-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function wizGoTo(step) {
  wizCollectStep(wizState.step);
  wizState.step = step;
  wizSave();
  renderWizStep();
  document.getElementById('vetting-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ── VALIDATION ──
function wizValidateStep(step) {
  if (step === 1) {
    const name = document.getElementById('wiz-fullname')?.value.trim();
    const cat  = document.getElementById('wiz-category')?.value;
    if (!name) { wizShakeField('wiz-fullname', 'Please enter your full name'); return false; }
    if (!cat)  { wizShowError('wiz-cat-grid', 'Please select a service category'); return false; }
  }
  if (step === 2) {
    const loc = document.getElementById('location-name')?.value.trim();
    if (!loc) { wizShakeField('location-name', 'Please enter your location'); return false; }
  }
  if (step === 3) {
    const missing   = [];
    const reselect  = [];

    // Check each doc: missing = never chosen, reselect = chosen before but page refreshed (File object lost)
    if (!wizState.selfieFile && !wizState.selfieHasFile)       missing.push('Selfie');
    else if (!wizState.selfieFile && wizState.selfieHasFile)   reselect.push('Selfie');

    if (!wizState.idFile && !wizState.idHasFile)               missing.push('National ID');
    else if (!wizState.idFile && wizState.idHasFile)           reselect.push('National ID');

    const certCfgV = getTradeCertConfig(wizState.serviceCategory);
    if (certCfgV.mandatory) {
      if (!wizState.tradeCertFile && !wizState.tradeCertHasFile)     missing.push(certCfgV.label);
      else if (!wizState.tradeCertFile && wizState.tradeCertHasFile) reselect.push(certCfgV.label);
    }

    if (reselect.length) {
      wizShowToast(`Page was refreshed — please re-select: ${reselect.join(', ')}`, 'warning');
      return false;
    }
    if (missing.length) {
      wizShowToast(`Please upload: ${missing.join(', ')}`, 'warning');
      return false;
    }
  }
  return true;
}

function wizShakeField(inputId, msg) {
  const el = document.getElementById(inputId);
  if (!el) return;
  el.classList.add('wiz-shake');
  el.focus();
  el.style.borderColor = '#ef4444';
  el.placeholder = msg;
  setTimeout(() => { el.classList.remove('wiz-shake'); el.style.borderColor = ''; }, 800);
}

function wizShowError(containerId, msg) {
  const el = document.getElementById(containerId);
  if (!el) return;
  el.classList.add('wiz-shake');
  wizShowToast(msg, 'warning');
  setTimeout(() => el.classList.remove('wiz-shake'), 800);
}

// ── COLLECT STEP DATA ──
function wizCollectStep(step) {
  if (step === 1) {
    wizState.fullName       = document.getElementById('wiz-fullname')?.value.trim() || wizState.fullName;
    wizState.serviceCategory = document.getElementById('wiz-category')?.value || wizState.serviceCategory;
    wizState.hourlyRate     = document.getElementById('wiz-rate')?.value || wizState.hourlyRate;
    wizState.bio            = document.getElementById('wiz-bio')?.value.trim() || wizState.bio;
  }
  if (step === 2) {
    wizState.locationName = document.getElementById('location-name')?.value.trim() || wizState.locationName;
  }
}

// ── BIND STEP EVENTS ──
function bindStepEvents(step) {
  if (step === 1) {
    const bio = document.getElementById('wiz-bio');
    if (bio) {
      bio.addEventListener('input', () => {
        const cnt = document.getElementById('wiz-bio-count');
        if (cnt) cnt.textContent = `${bio.value.length}/200`;
        if (bio.value.length > 200) bio.value = bio.value.slice(0, 200);
      });
    }
  }
}

// ── CATEGORY SELECT ──
function selectWizCat(cat) {
  wizState.serviceCategory = cat;
  document.getElementById('wiz-category').value = cat;
  document.querySelectorAll('.wiz-cat-opt').forEach(el => {
    el.classList.toggle('selected', el.textContent.trim() === cat);
  });
}

// ── LOCATION DETECT ──
async function wizDetectLocation() {
  const btn = document.getElementById('wiz-detect-btn');
  const feedback = document.getElementById('wiz-loc-feedback');
  if (btn) { btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Detecting…'; btn.disabled = true; }
  if (feedback) { feedback.style.display = 'none'; }

  navigator.geolocation.getCurrentPosition(async (pos) => {
    try {
      const res  = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${pos.coords.latitude}&lon=${pos.coords.longitude}`);
      const data = await res.json();
      const loc  = data.address.suburb || data.address.neighbourhood || data.address.city_district || data.address.city || 'Kenya';
      document.getElementById('location-name').value = loc;
      document.getElementById('lat-coord').value = pos.coords.latitude;
      document.getElementById('lng-coord').value = pos.coords.longitude;
      wizState.locationName = loc;
      if (feedback) {
        feedback.style.display = 'flex';
        feedback.innerHTML = `<i class="fas fa-check-circle" style="color:var(--green)"></i> Location set to <strong>${loc}</strong>`;
      }
    } catch(e) {
      document.getElementById('location-name').value = 'Kenya';
    }
    if (btn) { btn.innerHTML = '<i class="fas fa-crosshairs"></i> Detect My Location'; btn.disabled = false; }
  }, () => {
    if (btn) { btn.innerHTML = '<i class="fas fa-crosshairs"></i> Detect My Location'; btn.disabled = false; }
    wizShowToast('Could not detect location. Please type it manually.', 'warning');
  });
}

// ── FILE HANDLING ──
function wizHandleFile(inputId, input) {
  const file = input.files[0];
  if (!file) return;

  const MAX = 5 * 1024 * 1024;
  if (file.size > MAX) { wizShowToast('File is too large. Max 5MB.', 'warning'); input.value = ''; return; }

  // B-02 fix: store the File object and filename flag only — never base64
  // Base64-encoding three ID documents can exceed 15MB and silently blow localStorage quota
  if (inputId === 'upload-selfie') {
    wizState.selfieFile     = file;
    wizState.selfieFileName = file.name;
    wizState.selfieHasFile  = true;
  } else if (inputId === 'upload-id') {
    wizState.idFile     = file;
    wizState.idFileName = file.name;
    wizState.idHasFile  = true;
  } else if (inputId === 'upload-trade-cert') {
    wizState.tradeCertFile     = file;
    wizState.tradeCertFileName = file.name;
    wizState.tradeCertHasFile  = true;
  }
  wizSave();

  // Show a live preview in the upload zone using a temporary object URL
  // (object URLs are session-only and never stored in localStorage)
  const zone = document.getElementById(`zone-${inputId}`);
  if (zone) {
    const isImage = file.type.startsWith('image/');
    const previewSrc = isImage ? URL.createObjectURL(file) : null;
    zone.classList.add('has-file');
    zone.innerHTML = `
      ${previewSrc ? `<img src="${previewSrc}" class="wiz-preview-img" alt="Preview">` : `<div class="wiz-upload-placeholder"><i class="fas fa-file-check" style="color:#3db83a;font-size:26px"></i></div>`}
      <div class="wiz-file-overlay">
        <i class="fas fa-check-circle"></i>
        <span>${escWiz(file.name)}</span>
        <span class="wiz-change-link">Tap to change</span>
      </div>`;
  }
}

// ── DECLARATION TOGGLE ──
function wizToggleSubmit() {
  const checked = document.getElementById('wiz-declaration')?.checked;
  const btn = document.getElementById('wiz-submit-btn');
  if (btn) btn.disabled = !checked;
}

// ── SUBMIT ──
async function wizSubmit() {
  const btn = document.getElementById('wiz-submit-btn');
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Uploading…'; }

  // Final validation
  if (!wizState.fullName)     { wizShowToast('Missing name — go back to Profile', 'warning'); wizGoTo(1); return; }
  if (!wizState.locationName) { wizShowToast('Missing location — go back to Location', 'warning'); wizGoTo(2); return; }

  // Check for the refresh-lost-file scenario:
  // hasFile=true means it was selected before, but File=null means the page reloaded and the object is gone.
  // We must NOT silently skip uploading — show a clear message and send them back to re-pick.
  const needsReselect = [];
  if (wizState.selfieHasFile  && !wizState.selfieFile)  needsReselect.push('Selfie');
  if (wizState.idHasFile      && !wizState.idFile)      needsReselect.push('National ID');
  const certCfgS = getTradeCertConfig(wizState.serviceCategory);
  if (wizState.tradeCertHasFile && !wizState.tradeCertFile) needsReselect.push(certCfgS.label);
  if (needsReselect.length) {
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-paper-plane"></i> Submit'; }
    wizShowToast(`Page was refreshed — please re-select your files: ${needsReselect.join(', ')}`, 'warning');
    wizGoTo(3);
    return;
  }

  // Check for completely missing files
  if (!wizState.selfieFile && !wizState.selfieHasFile)  { wizShowToast('Missing selfie', 'warning'); wizGoTo(3); return; }
  if (!wizState.idFile && !wizState.idHasFile)          { wizShowToast('Missing National ID', 'warning'); wizGoTo(3); return; }
  if (certCfgS.mandatory && !wizState.tradeCertFile && !wizState.tradeCertHasFile) {
    wizShowToast('Missing ' + certCfgS.label, 'warning'); wizGoTo(3); return;
  }

  try {
    const { data: { user } } = await client.auth.getUser();

    const filesToUpload = [
      { file: wizState.selfieFile,    name: 'selfie',     col: 'selfie_url' },
      { file: wizState.idFile,        name: 'id',         col: 'id_url' },
      { file: wizState.tradeCertFile, name: 'trade-cert', col: 'trade_cert_url' },
    ].filter(f => f.file); // only upload new files

    // Store the human-readable cert label so admins know what cert type was uploaded
    if (wizState.tradeCertFile || wizState.tradeCertHasFile) {
      updateData.trade_cert_label = certCfgS.label;
    }

    let updateData = {
      full_name:        wizState.fullName,
      bio:              wizState.bio,
      service_category: wizState.serviceCategory,
      hourly_rate:      wizState.hourlyRate ? parseInt(wizState.hourlyRate) : null,
      location_name:    wizState.locationName,
      is_vetted:        false,
    };

    for (const item of filesToUpload) {
      const ext  = item.file.name.split('.').pop();
      const path = `${user.id}/${item.name}.${ext}`;
      const { error: upErr } = await client.storage
        .from('verification-docs').upload(path, item.file, { upsert: true });
      if (upErr) throw upErr;
      // Store the storage path only — never store a public URL for private identity documents
      updateData[item.col] = path;
    }

    const { error } = await client.from('profiles').update(updateData).eq('id', user.id);
    if (error) throw error;

    // Clear wizard state
    safeStorage.remove(WIZ_KEY);

    // Show success state
    const container = document.getElementById('vetting-form');
    if (container) {
      container.innerHTML = `
        <div class="wiz-success">
          <div class="wiz-success-icon"><i class="fas fa-circle-check"></i></div>
          <h2>Application Submitted!</h2>
          <p>Your documents are under review. We'll notify you within 24 hours once approved.</p>
          <div class="wiz-success-steps">
            <div class="wiz-success-step done"><i class="fas fa-check"></i> Documents uploaded</div>
            <div class="wiz-success-step active"><i class="fas fa-clock"></i> Admin review (up to 24 hrs)</div>
            <div class="wiz-success-step"><i class="fas fa-unlock"></i> Full access unlocked</div>
          </div>
        </div>`;
    }
  } catch(e) {
    wizShowToast('Upload failed: ' + e.message, 'error');
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-paper-plane"></i> Submit'; }
  }
}

// ── TOAST ──
function wizShowToast(msg, type = '') {
  let wrap = document.getElementById('wiz-toast');
  if (!wrap) {
    wrap = document.createElement('div');
    wrap.id = 'wiz-toast';
    document.body.appendChild(wrap);
  }
  wrap.className = `wiz-toast-el wiz-toast-${type}`;
  wrap.textContent = msg;
  wrap.style.display = 'block';
  clearTimeout(wrap._t);
  wrap._t = setTimeout(() => { wrap.style.display = 'none'; }, 3200);
}

// ── HELPER ──
function escWiz(str) {
  return (str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── CSS INJECTION ──
function injectWizardStyles() {
  if (document.getElementById('wiz-styles')) return;
  const style = document.createElement('style');
  style.id = 'wiz-styles';
  style.textContent = `
  .wiz-wrap { font-family: var(--font-body, 'DM Sans', sans-serif); }

  /* Progress */
  .wiz-progress-bar { height: 3px; background: var(--border,#dfe6df); position: relative; }
  .wiz-progress-fill { height: 100%; background: var(--green,#3db83a); transition: width 0.4s cubic-bezier(0.4,0,0.2,1); border-radius: 0 2px 2px 0; }

  /* Step dots */
  .wiz-steps-row { display: flex; justify-content: space-between; align-items: flex-start; padding: 14px 16px 0; gap: 4px; }
  .wiz-step-dot { display: flex; flex-direction: column; align-items: center; gap: 5px; flex: 1; }
  .wiz-dot-circle {
    width: 32px; height: 32px; border-radius: 50%;
    border: 2px solid var(--border,#dfe6df);
    background: white; display: flex; align-items: center; justify-content: center;
    font-size: 12px; color: var(--text-muted,#8a9a8a);
    transition: all 0.25s;
  }
  .wiz-step-dot span { font-size: 10px; color: var(--text-muted,#8a9a8a); font-weight: 600; text-align: center; }
  .wiz-step-dot.active .wiz-dot-circle { border-color: var(--green,#3db83a); background: var(--green,#3db83a); color: white; box-shadow: 0 0 0 4px var(--green-glow,rgba(61,184,58,0.14)); }
  .wiz-step-dot.active span { color: var(--green-dark,#2a8a28); }
  .wiz-step-dot.done .wiz-dot-circle { border-color: var(--green,#3db83a); background: var(--green-light,#e8f7e8); color: var(--green,#3db83a); }
  .wiz-step-dot.done span { color: var(--green-dark,#2a8a28); }

  /* Body */
  .wiz-body { padding: 16px 16px 8px; min-height: 320px; }
  .wiz-footer { padding: 12px 16px 18px; border-top: 1px solid var(--border,#dfe6df); }
  .wiz-footer-inner { display: flex; align-items: center; justify-content: space-between; gap: 10px; }

  /* Buttons */
  .wiz-btn-back {
    display: flex; align-items: center; gap: 7px;
    background: var(--surface-2,#edf0ed); border: 1.5px solid var(--border,#dfe6df);
    color: var(--text-mid,#445044); border-radius: 30px;
    padding: 10px 18px; font-size: 14px; font-weight: 700; cursor: pointer;
    transition: background 0.2s; font-family: inherit;
  }
  .wiz-btn-back:hover { background: var(--surface,#f5f7f5); }
  .wiz-btn-back.invisible { visibility: hidden; pointer-events: none; }
  .wiz-btn-next {
    display: flex; align-items: center; gap: 7px;
    background: var(--green,#3db83a); color: white;
    border: none; border-radius: 30px;
    padding: 10px 22px; font-size: 14px; font-weight: 700; cursor: pointer;
    transition: background 0.2s, transform 0.15s; font-family: inherit;
  }
  .wiz-btn-next:hover { background: var(--green-dark,#2a8a28); }
  .wiz-btn-next:active { transform: scale(0.96); }
  .wiz-btn-submit:disabled { background: var(--text-muted,#8a9a8a); cursor: not-allowed; transform: none; }
  .wiz-step-counter { font-size: 12px; color: var(--text-muted,#8a9a8a); font-weight: 600; }

  /* Step content */
  .wiz-step-content { animation: wizFadeIn 0.28s ease; }
  @keyframes wizFadeIn { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } }
  .wiz-step-header { text-align: center; margin-bottom: 20px; }
  .wiz-step-icon {
    width: 52px; height: 52px; border-radius: 16px;
    background: var(--green-light,#e8f7e8); color: var(--green,#3db83a);
    display: flex; align-items: center; justify-content: center;
    font-size: 22px; margin: 0 auto 12px;
  }
  .wiz-title { font-family: var(--font-display,'Outfit',sans-serif); font-weight: 800; font-size: 20px; color: var(--text,#111811); margin-bottom: 5px; }
  .wiz-subtitle { font-size: 13px; color: var(--text-muted,#8a9a8a); line-height: 1.5; }

  /* Welcome step */
  .wiz-welcome { text-align: center; }
  .wiz-welcome-icon {
    width: 72px; height: 72px; border-radius: 50%;
    background: linear-gradient(135deg, var(--green,#3db83a), var(--green-dark,#2a8a28));
    color: white; font-size: 28px;
    display: flex; align-items: center; justify-content: center;
    margin: 0 auto 16px; box-shadow: 0 8px 24px rgba(61,184,58,0.3);
  }
  .wiz-checklist { text-align: left; margin: 16px 0; display: flex; flex-direction: column; gap: 8px; }
  .wiz-check-item { display: flex; align-items: center; gap: 9px; font-size: 13px; color: var(--text-mid,#445044); }
  .wiz-check-item i { color: var(--green,#3db83a); font-size: 15px; flex-shrink: 0; }
  .wiz-what-need { background: var(--surface,#f5f7f5); border-radius: 14px; padding: 14px; margin-top: 16px; }
  .wiz-need-title { font-size: 12px; font-weight: 700; color: var(--text-muted,#8a9a8a); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 12px; display: flex; align-items: center; gap: 7px; }
  .wiz-need-grid { display: flex; justify-content: space-around; gap: 8px; }
  .wiz-need-item { display: flex; flex-direction: column; align-items: center; gap: 6px; font-size: 12px; font-weight: 700; color: var(--text-mid,#445044); }
  .wiz-need-item i { font-size: 22px; color: var(--green,#3db83a); }

  /* Fields */
  .wiz-field { margin-bottom: 14px; }
  .wiz-label { font-size: 12px; font-weight: 700; color: var(--text-muted,#8a9a8a); text-transform: uppercase; letter-spacing: 0.5px; display: block; margin-bottom: 7px; }
  .wiz-required { color: #ef4444; }
  .wiz-input-wrap { position: relative; }
  .wiz-input-wrap i { position: absolute; left: 13px; top: 50%; transform: translateY(-50%); color: var(--text-muted,#8a9a8a); font-size: 14px; pointer-events: none; }
  .wiz-input {
    width: 100%; padding: 11px 14px 11px 38px;
    border: 1.5px solid var(--border,#dfe6df);
    border-radius: 12px; font-size: 14px;
    color: var(--text,#111811); background: var(--surface-2,#edf0ed);
    outline: none; margin: 0;
    transition: border-color 0.2s, background 0.2s, box-shadow 0.2s;
    font-family: inherit;
  }
  .wiz-input:not(.wiz-input-wrap .wiz-input) { padding-left: 14px; }
  .wiz-input:focus { border-color: var(--green,#3db83a); background: white; box-shadow: 0 0 0 3px var(--green-glow,rgba(61,184,58,0.14)); }
  .wiz-textarea { padding-left: 14px; resize: none; height: 80px; line-height: 1.5; }
  .wiz-hint { font-size: 11px; color: var(--text-muted,#8a9a8a); margin-top: 5px; }
  .wiz-char-count { font-size: 11px; color: var(--text-muted,#8a9a8a); text-align: right; margin-top: 3px; }

  /* Category grid */
  .wiz-cat-grid { display: flex; flex-wrap: wrap; gap: 7px; margin-bottom: 4px; }
  .wiz-cat-opt {
    padding: 6px 14px; border-radius: 20px;
    border: 1.5px solid var(--border,#dfe6df);
    background: white; font-size: 12px; font-weight: 700;
    color: var(--text-mid,#445044); cursor: pointer;
    transition: all 0.18s;
  }
  .wiz-cat-opt:hover { border-color: var(--green-mid,#4ecb4b); color: var(--green-dark,#2a8a28); background: var(--green-light,#e8f7e8); }
  .wiz-cat-opt.selected { background: var(--green,#3db83a); color: white; border-color: var(--green,#3db83a); }

  /* Location */
  .wiz-detect-btn {
    width: 100%; padding: 11px;
    background: var(--green-light,#e8f7e8);
    border: 1.5px solid var(--green,#3db83a);
    border-radius: 12px; color: var(--green-dark,#2a8a28);
    font-size: 14px; font-weight: 700;
    display: flex; align-items: center; justify-content: center; gap: 8px;
    cursor: pointer; transition: background 0.2s; font-family: inherit;
    margin-bottom: 10px;
  }
  .wiz-detect-btn:hover { background: #d0f0d0; }
  .wiz-loc-feedback { display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--text-mid,#445044); margin-bottom: 8px; font-weight: 600; }
  .wiz-location-tip { display: flex; align-items: flex-start; gap: 9px; font-size: 12px; color: var(--text-muted,#8a9a8a); background: var(--surface,#f5f7f5); border-radius: 10px; padding: 10px 12px; margin-top: 6px; line-height: 1.5; }
  .wiz-location-tip i { color: var(--green,#3db83a); margin-top: 1px; flex-shrink: 0; }

  /* Document upload */
  .wiz-doc-field { margin-bottom: 16px; }
  .wiz-doc-label { font-size: 13px; font-weight: 700; color: var(--text,#111811); margin-bottom: 3px; display: flex; align-items: center; gap: 7px; }
  .wiz-doc-label i { color: var(--green,#3db83a); }
  .wiz-doc-hint { font-size: 11px; color: var(--text-muted,#8a9a8a); margin-bottom: 8px; }
  .wiz-upload-zone {
    border: 2px dashed var(--border,#dfe6df);
    border-radius: 14px; min-height: 90px;
    display: flex; align-items: center; justify-content: center;
    cursor: pointer; overflow: hidden; position: relative;
    background: var(--surface,#f5f7f5);
    transition: border-color 0.2s, background 0.2s;
  }
  .wiz-upload-zone:hover { border-color: var(--green,#3db83a); background: var(--green-light,#e8f7e8); }
  .wiz-upload-zone.has-file { border-style: solid; border-color: var(--green,#3db83a); background: #f0fdf0; }
  .wiz-upload-zone.wiz-reselect { border-style: solid; border-color: #f07623; background: #fff8ec; }
  .wiz-upload-zone.wiz-reselect:hover { border-color: #d4601a; background: #fef0e0; }
  .wiz-upload-placeholder { display: flex; flex-direction: column; align-items: center; gap: 5px; color: var(--text-muted,#8a9a8a); padding: 16px; text-align: center; }
  .wiz-upload-placeholder i { font-size: 26px; color: var(--green,#3db83a); }
  .wiz-upload-placeholder span { font-size: 13px; font-weight: 700; color: var(--text-mid,#445044); }
  .wiz-upload-placeholder small { font-size: 11px; }
  .wiz-preview-img { width: 100%; height: 90px; object-fit: cover; }
  .wiz-file-overlay {
    position: absolute; inset: 0;
    background: rgba(0,0,0,0.45); color: white;
    display: flex; flex-direction: column;
    align-items: center; justify-content: center; gap: 3px;
    font-size: 12px; font-weight: 700; text-align: center; padding: 8px;
  }
  .wiz-file-overlay i { font-size: 20px; color: #4ade80; }
  .wiz-change-link { font-size: 10px; opacity: 0.75; }

  /* Review */
  .wiz-review-card { border: 1.5px solid var(--border,#dfe6df); border-radius: 14px; overflow: hidden; margin-bottom: 14px; }
  .wiz-review-row { display: flex; align-items: center; gap: 10px; padding: 11px 14px; border-bottom: 1px solid var(--border,#dfe6df); }
  .wiz-review-row:last-child { border-bottom: none; }
  .wiz-review-label { display: flex; align-items: center; gap: 7px; font-size: 12px; color: var(--text-muted,#8a9a8a); font-weight: 700; min-width: 90px; flex-shrink: 0; }
  .wiz-review-label i { color: var(--green,#3db83a); width: 14px; text-align: center; }
  .wiz-review-val { flex: 1; font-size: 13px; font-weight: 600; color: var(--text,#111811); }
  .wiz-missing { color: #ef4444; font-weight: 600; }
  .wiz-edit-btn { background: none; border: none; color: var(--text-muted,#8a9a8a); font-size: 13px; cursor: pointer; padding: 4px; border-radius: 6px; transition: color 0.2s, background 0.2s; }
  .wiz-edit-btn:hover { color: var(--green,#3db83a); background: var(--green-light,#e8f7e8); }

  .wiz-docs-review { margin-bottom: 14px; }
  .wiz-docs-grid { display: flex; gap: 10px; }
  .wiz-doc-thumb {
    flex: 1; border-radius: 12px; overflow: hidden;
    border: 1.5px solid var(--border,#dfe6df);
    aspect-ratio: 1; display: flex; flex-direction: column;
    align-items: center; justify-content: center; cursor: pointer;
    position: relative; background: var(--surface,#f5f7f5);
    transition: border-color 0.2s;
  }
  .wiz-doc-thumb img { width: 100%; height: 100%; object-fit: cover; }
  .wiz-doc-thumb span { font-size: 10px; font-weight: 700; color: var(--text-muted,#8a9a8a); position: absolute; bottom: 4px; left: 0; right: 0; text-align: center; background: rgba(255,255,255,0.85); padding: 2px 0; }
  .wiz-doc-thumb.missing i { font-size: 22px; color: var(--border,#dfe6df); }
  .wiz-doc-thumb.ready { border-color: var(--green,#3db83a); }
  .wiz-doc-thumb.optional { border-color: #cbd5e1; background: #f8fafc; }
  .wiz-doc-thumb.optional span { color: #94a3b8; font-size:10px; }
  .wiz-thumb-tick {
    position: absolute; top: 5px; right: 5px;
    width: 18px; height: 18px; border-radius: 50%;
    background: var(--green,#3db83a); color: white;
    display: flex; align-items: center; justify-content: center; font-size: 10px;
  }

  .wiz-warning { display: flex; align-items: center; gap: 9px; background: #fff8ec; border: 1.5px solid #fdd6aa; border-radius: 10px; padding: 10px 12px; font-size: 13px; color: #7a4a10; margin-bottom: 12px; }
  .wiz-warning i { color: #f07623; flex-shrink: 0; }
  .wiz-text-link { background: none; border: none; color: var(--green-dark,#2a8a28); font-weight: 700; font-size: 13px; cursor: pointer; padding: 0; font-family: inherit; text-decoration: underline; }

  .wiz-declaration { background: var(--surface,#f5f7f5); border-radius: 12px; padding: 12px; margin-bottom: 4px; }
  .wiz-checkbox-wrap { display: flex; align-items: flex-start; gap: 10px; cursor: pointer; }
  .wiz-checkbox-wrap input[type=checkbox] { display: none; }
  .wiz-checkbox-box {
    width: 20px; height: 20px; border-radius: 6px;
    border: 2px solid var(--border,#dfe6df); background: white;
    flex-shrink: 0; margin-top: 1px;
    display: flex; align-items: center; justify-content: center;
    transition: all 0.2s;
  }
  .wiz-checkbox-wrap input:checked + .wiz-checkbox-box { background: var(--green,#3db83a); border-color: var(--green,#3db83a); }
  .wiz-checkbox-wrap input:checked + .wiz-checkbox-box::after { content: '✓'; color: white; font-size: 12px; font-weight: 800; }
  .wiz-checkbox-label { font-size: 12px; color: var(--text-mid,#445044); line-height: 1.5; }

  /* Success */
  .wiz-success { text-align: center; padding: 32px 20px 28px; }
  .wiz-success-icon { width: 72px; height: 72px; border-radius: 50%; background: var(--green-light,#e8f7e8); color: var(--green,#3db83a); font-size: 32px; display: flex; align-items: center; justify-content: center; margin: 0 auto 16px; }
  .wiz-success h2 { font-family: var(--font-display,'Outfit',sans-serif); font-weight: 800; font-size: 20px; margin-bottom: 8px; color: var(--text,#111811); }
  .wiz-success p { font-size: 13px; color: var(--text-muted,#8a9a8a); line-height: 1.6; margin-bottom: 20px; }
  .wiz-success-steps { display: flex; flex-direction: column; gap: 8px; text-align: left; }
  .wiz-success-step { display: flex; align-items: center; gap: 10px; font-size: 13px; font-weight: 600; color: var(--text-muted,#8a9a8a); padding: 10px 14px; background: var(--surface,#f5f7f5); border-radius: 10px; }
  .wiz-success-step i { width: 18px; text-align: center; }
  .wiz-success-step.done { color: var(--green-dark,#2a8a28); background: var(--green-light,#e8f7e8); }
  .wiz-success-step.done i { color: var(--green,#3db83a); }
  .wiz-success-step.active { color: #7a4a10; background: #fff8ec; }
  .wiz-success-step.active i { color: #f07623; }

  /* Shake animation */
  .wiz-shake { animation: wizShake 0.5s; }
  @keyframes wizShake { 0%,100%{transform:translateX(0)} 20%{transform:translateX(-6px)} 40%{transform:translateX(6px)} 60%{transform:translateX(-4px)} 80%{transform:translateX(4px)} }

  /* Toast */
  #wiz-toast {
    position: fixed; bottom: calc(var(--bottom-nav-h,64px) + 14px); left: 50%; transform: translateX(-50%);
    padding: 10px 20px; border-radius: 30px; font-size: 13px; font-weight: 700;
    white-space: nowrap; box-shadow: 0 8px 24px rgba(0,0,0,0.15);
    z-index: 9000; animation: wizFadeIn 0.25s ease;
  }
  .wiz-toast-warning { background: #f07623; color: white; }
  .wiz-toast-error   { background: #ef4444; color: white; }
  .wiz-toast-        { background: #111; color: white; }
  `;
  document.head.appendChild(style);
}

// Expose globals
window.initOnboardingWizard = initOnboardingWizard;
window.wizNext        = wizNext;
window.wizBack        = wizBack;
window.wizGoTo        = wizGoTo;
window.wizSubmit      = wizSubmit;
window.selectWizCat   = selectWizCat;
window.wizDetectLocation = wizDetectLocation;
window.wizHandleFile  = wizHandleFile;
window.wizToggleSubmit = wizToggleSubmit;

// ════════════════════════════════════════════════════════════════
// HELPRO — DANGER ZONE: Account Deactivation & Deletion
// ════════════════════════════════════════════════════════════════

function showDeactivateConfirm() {
  closeModals();
  document.getElementById('deactivate-modal').classList.add('open');
}

function showDeleteConfirm() {
  closeModals();
  const input = document.getElementById('delete-confirm-input');
  if (input) input.value = '';
  const btn = document.getElementById('confirm-delete-btn');
  if (btn) { btn.disabled = true; btn.style.opacity = '0.5'; }
  document.getElementById('delete-modal').classList.add('open');
}

function closeModals() {
  document.getElementById('deactivate-modal')?.classList.remove('open');
  document.getElementById('delete-modal')?.classList.remove('open');
}

// Close modals on backdrop click
document.addEventListener('click', (e) => {
  const deactivateModal = document.getElementById('deactivate-modal');
  const deleteModal     = document.getElementById('delete-modal');
  if (e.target === deactivateModal) closeModals();
  if (e.target === deleteModal)     closeModals();
});

async function confirmDeactivate() {
  const btn = document.querySelector('#deactivate-modal button');
  if (btn) { btn.disabled = true; btn.textContent = 'Deactivating…'; }
  try {
    const { data, error } = await client.rpc('deactivate_my_account');
    if (error) throw error;
    if (!data?.success) throw new Error(data?.error || 'Deactivation failed');
    closeModals();
    showToast('Account deactivated. Signing you out…', 'orange');
    setTimeout(async () => {
      await client.auth.signOut();
      window.location.href = './auth.html';
    }, 2000);
  } catch(e) {
    if (btn) { btn.disabled = false; btn.textContent = 'Yes, Deactivate My Account'; }
    showToast(e.message || 'Something went wrong', 'error');
  }
}

async function confirmDelete() {
  const btn = document.getElementById('confirm-delete-btn');
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Deleting…'; btn.style.opacity = '1'; }
  try {
    // Get session token to pass to edge function
    const { data: { session } } = await client.auth.getSession();
    if (!session) throw new Error('Session expired. Please sign in again.');

    const res = await fetch(
      'https://cjpylodggpqqkuvojogb.supabase.co/functions/v1/delete-account',
      {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': 'Bearer ' + session.access_token,
        },
      }
    );
    const result = await res.json();

    if (!res.ok || !result.success) {
      // Handle specific safety guard errors
      if (result.error === 'withdraw_first') {
        closeModals();
        showToast(
          'Please withdraw your wallet balance of KES ' + result.balance + ' before deleting your account.',
          'orange'
        );
        return;
      }
      if (result.error === 'active_bookings') {
        closeModals();
        showToast('You have active bookings. Please complete or cancel them before deleting your account.', 'orange');
        return;
      }
      throw new Error(result.error || 'Deletion failed');
    }

    closeModals();
    showToast('Account permanently deleted. Goodbye 👋', 'green');
    setTimeout(async () => {
      await client.auth.signOut();
      safeStorage.clear();
      window.location.href = './index.html';
    }, 2500);
  } catch(e) {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<i class="fas fa-trash-can"></i> Permanently Delete My Account';
      btn.style.opacity = '1';
    }
    showToast(e.message || 'Deletion failed — please try again', 'error');
  }
}

window.showDeactivateConfirm = showDeactivateConfirm;
window.showDeleteConfirm     = showDeleteConfirm;
window.closeModals           = closeModals;
window.confirmDeactivate     = confirmDeactivate;
window.confirmDelete         = confirmDelete;
