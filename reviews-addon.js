// ============================================================
// HELPRO — Reviews & Ratings Addon
// Add this file as a <script src="reviews-addon.js"></script>
// AFTER <script src="app.js"></script> on:
//   • dashboard.html
//   • market.html
// ============================================================


// ── STAR RENDER HELPER ───────────────────────────────────────
function renderStarsHTML(rating, size = 14) {
  const r = parseFloat(rating) || 0;
  const full  = Math.floor(r);
  const half  = (r % 1) >= 0.4;
  let s = '';
  for (let i = 0; i < full; i++) s += `<i class="fas fa-star"></i>`;
  if (half) s += `<i class="fas fa-star-half-alt"></i>`;
  for (let i = full + (half ? 1 : 0); i < 5; i++) s += `<i class="far fa-star"></i>`;
  return `<span style="color:#f59e0b;font-size:${size}px;letter-spacing:1px">${s}</span>`;
}

function timeAgoShort(d) {
  if (!d) return '';
  const s = Math.floor((Date.now() - new Date(d)) / 1000);
  if (s < 3600)  return Math.floor(s / 60) + 'm ago';
  if (s < 86400) return Math.floor(s / 3600) + 'h ago';
  if (s < 604800) return Math.floor(s / 86400) + 'd ago';
  return new Date(d).toLocaleDateString('en-KE', { day:'numeric', month:'short' });
}

function colorFor(str) {
  const colors = ['#3db83a','#3b82f6','#f07623','#8b5cf6','#ec4899','#f59e0b','#0891b2','#16a34a'];
  let h = 0; for (const c of (str || '?')) h = (h << 5) - h + c.charCodeAt(0);
  return colors[Math.abs(h) % colors.length];
}

function initials(name) {
  return (name || '?').split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
}


// ── EMPTY STATE HELPER ───────────────────────────────────────
function emptyStateHTML(icon, title, message, action) {
  const btn = action ? `<button onclick="${action.onclick}" style="margin-top:14px;background:var(--green,#3db83a);color:white;border:none;border-radius:30px;padding:9px 22px;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit">${action.label}</button>` : '';
  return `<div style="text-align:center;padding:28px 16px;background:var(--surface,#f5f7f5);border-radius:14px;border:1.5px dashed var(--border,#dfe6df)">
    <div style="width:52px;height:52px;border-radius:50%;background:var(--green-light,#e8f7e8);display:flex;align-items:center;justify-content:center;margin:0 auto 12px;font-size:22px;color:var(--green,#3db83a)"><i class="fas ${icon}"></i></div>
    <div style="font-family:var(--font-display,'Outfit',sans-serif);font-weight:800;font-size:15px;color:var(--text,#111811);margin-bottom:5px">${title}</div>
    <div style="font-size:13px;color:var(--text-muted,#8a9a8a);line-height:1.5;max-width:220px;margin:0 auto">${message}</div>
    ${btn}
  </div>`;
}

// ── INJECT GLOBAL STYLES ─────────────────────────────────────
(function injectReviewStyles() {
  if (document.getElementById('review-styles')) return;
  const style = document.createElement('style');
  style.id = 'review-styles';
  style.textContent = `
    /* ── RATING MODAL ── */
    .rating-modal-overlay {
      position: fixed; inset: 0; z-index: 5000;
      background: rgba(10,20,10,0.6);
      backdrop-filter: blur(8px);
      display: flex; align-items: flex-end; justify-content: center;
      padding: 0; opacity: 0; pointer-events: none;
      transition: opacity 0.25s;
    }
    .rating-modal-overlay.open {
      opacity: 1; pointer-events: all;
    }
    @media (min-width: 600px) {
      .rating-modal-overlay { align-items: center; padding: 24px; }
      .rating-sheet { border-radius: 20px !important; }
    }
    .rating-sheet {
      background: white; width: 100%; max-width: 420px;
      border-radius: 20px 20px 0 0;
      box-shadow: 0 -12px 48px rgba(0,0,0,0.18);
      transform: translateY(100%); transition: transform 0.32s cubic-bezier(0.32,0.72,0,1);
      overflow: hidden;
    }
    .rating-modal-overlay.open .rating-sheet {
      transform: translateY(0);
    }
    .sheet-drag { width: 40px; height: 4px; background: #e0e8e0; border-radius: 2px; margin: 12px auto 0; }

    .rating-header {
      padding: 18px 22px 14px;
      border-bottom: 1px solid #edf3ed;
    }
    .rating-helper-row {
      display: flex; align-items: center; gap: 12px; margin-bottom: 4px;
    }
    .rating-avatar {
      width: 44px; height: 44px; border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      font-size: 15px; font-weight: 800; color: white; flex-shrink: 0;
    }
    .rating-helper-name { font-size: 17px; font-weight: 800; color: #0d1a0d; }
    .rating-sub { font-size: 12px; color: #8a9a8a; margin-top: 1px; }

    .rating-body { padding: 20px 22px; }

    .stars-prompt { font-size: 13px; font-weight: 700; color: #3a4d3a; margin-bottom: 12px; }

    /* Interactive stars */
    .star-row {
      display: flex; gap: 6px; margin-bottom: 18px;
    }
    .star-btn {
      font-size: 32px; cursor: pointer; background: none; border: none; padding: 2px;
      color: #e0e8e0; transition: color 0.1s, transform 0.1s;
      line-height: 1;
    }
    .star-btn.lit { color: #f59e0b; }
    .star-btn:hover { transform: scale(1.15); }

    .rating-label-text {
      font-size: 13px; color: #f59e0b; font-weight: 700;
      min-height: 18px; margin-bottom: 16px; margin-top: -10px;
    }

    .review-textarea {
      width: 100%; border: 1.5px solid #dce8dc; border-radius: 12px;
      padding: 12px 14px; font-size: 14px; font-family: inherit; color: #0d1a0d;
      resize: none; outline: none; min-height: 80px; line-height: 1.5;
      background: #f5f8f5; transition: border-color 0.2s, background 0.2s;
    }
    .review-textarea:focus { border-color: #3db83a; background: white; }
    .review-textarea::placeholder { color: #8a9a8a; }

    .char-count { font-size: 11px; color: #8a9a8a; text-align: right; margin-top: 4px; margin-bottom: 16px; }

    .rating-actions { display: flex; gap: 10px; }
    .btn-cancel-review {
      flex: 0.4; padding: 13px; border-radius: 12px;
      background: #f0f7f0; border: 1.5px solid #dce8dc;
      font-size: 14px; font-weight: 700; color: #3a4d3a; cursor: pointer;
      font-family: inherit; transition: background 0.15s;
    }
    .btn-cancel-review:hover { background: #e6f0e6; }
    .btn-submit-review {
      flex: 1; padding: 13px; border-radius: 12px;
      background: #3db83a; border: none; color: white;
      font-size: 14px; font-weight: 700; cursor: pointer;
      font-family: inherit; transition: background 0.15s, opacity 0.15s;
      display: flex; align-items: center; justify-content: center; gap: 7px;
    }
    .btn-submit-review:hover { background: #2a8a28; }
    .btn-submit-review:disabled { opacity: 0.5; cursor: not-allowed; }

    /* ── BOOKING CARD (Client Dashboard) ── */
    .booking-card {
      background: #f5f8f5; border: 1.5px solid #dce8dc;
      border-radius: 14px; padding: 14px 16px; margin-bottom: 10px;
    }
    .booking-card:last-child { margin-bottom: 0; }
    .booking-top { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; }
    .booking-avatar {
      width: 38px; height: 38px; border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      font-size: 13px; font-weight: 800; color: white; flex-shrink: 0;
    }
    .booking-name { font-size: 14px; font-weight: 700; color: #0d1a0d; }
    .booking-category { font-size: 11px; color: #8a9a8a; }
    .booking-status-chip {
      margin-left: auto; padding: 4px 10px; border-radius: 20px;
      font-size: 11px; font-weight: 700; flex-shrink: 0;
    }
    .status-pending   { background: #fff8ec; color: #b85a10; }
    .status-accepted  { background: #e6f7e6; color: #1a4a1a; }
    .status-completed { background: #eff6ff; color: #1d4ed8; }

    .booking-job-title { font-size: 13px; color: #3a4d3a; margin-bottom: 10px; line-height: 1.4; }

    .booking-footer { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
    .booking-date { font-size: 11px; color: #8a9a8a; }

    .btn-complete-rate {
      display: flex; align-items: center; gap: 6px;
      padding: 8px 16px; border-radius: 20px;
      background: #3db83a; color: white; border: none;
      font-size: 12px; font-weight: 700; cursor: pointer;
      font-family: inherit; transition: background 0.15s;
    }
    .btn-complete-rate:hover { background: #2a8a28; }

    .booking-rated {
      display: flex; align-items: center; gap: 6px; font-size: 12px; color: #3a4d3a;
    }

    /* ── REQUEST CARD (Helper Dashboard) ── */
    .request-card {
      background: #f5f8f5; border: 1.5px solid #dce8dc;
      border-radius: 14px; padding: 14px 16px; margin-bottom: 10px;
    }
    .request-top { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; margin-bottom: 8px; }
    .request-title { font-size: 14px; font-weight: 700; color: #0d1a0d; }
    .request-budget { background: #e6f7e6; color: #1a4a1a; font-size: 12px; font-weight: 700; padding: 4px 10px; border-radius: 20px; flex-shrink: 0; }
    .request-desc { font-size: 13px; color: #3a4d3a; margin-bottom: 10px; line-height: 1.4; }
    .request-client { display: flex; align-items: center; gap: 7px; font-size: 12px; color: #8a9a8a; }
    .request-client-dot { width: 22px; height: 22px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 9px; font-weight: 800; color: white; }

    /* ── REVIEWS IN HELPER MODAL ── */
    .reviews-section { padding: 0 20px 20px; }
    .reviews-section-title {
      font-size: 12px; font-weight: 700; color: #8a9a8a;
      text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 10px;
    }
    .review-item {
      background: #f5f8f5; border-radius: 12px; padding: 12px 14px; margin-bottom: 8px;
    }
    .review-item:last-child { margin-bottom: 0; }
    .review-top { display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px; }
    .reviewer-name { font-size: 13px; font-weight: 700; color: #0d1a0d; }
    .review-date { font-size: 11px; color: #8a9a8a; }
    .review-comment { font-size: 13px; color: #3a4d3a; line-height: 1.5; margin-top: 6px; }
    .no-reviews { text-align: center; padding: 20px; color: #8a9a8a; font-size: 13px; }

    /* ── TOAST ── */
    .review-toast {
      position: fixed; bottom: calc(var(--bottom-nav-h, 68px) + 16px); left: 50%;
      transform: translateX(-50%) translateY(20px);
      background: #0d1a0d; color: white; padding: 11px 22px;
      border-radius: 30px; font-size: 13px; font-weight: 600;
      box-shadow: 0 4px 24px rgba(0,0,0,0.2); white-space: nowrap;
      z-index: 6000; opacity: 0; transition: opacity 0.25s, transform 0.25s;
      pointer-events: none;
    }
    .review-toast.show { opacity: 1; transform: translateX(-50%) translateY(0); }
    .review-toast.green { background: #3db83a; }
    .review-toast.orange { background: #f07623; }
  `;
  document.head.appendChild(style);
})();


// ── TOAST ────────────────────────────────────────────────────
let _toastTimer;
function reviewToast(msg, type = '') {
  let toast = document.getElementById('review-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'review-toast';
    toast.className = 'review-toast';
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.className = `review-toast ${type}`;
  requestAnimationFrame(() => toast.classList.add('show'));
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => toast.classList.remove('show'), 3200);
}


// ── RATING MODAL STATE ────────────────────────────────────────
let _ratingState = { bookingId: null, helperId: null, helperName: null, jobTitle: null, stars: 0 };

const RATING_LABELS = ['', 'Poor', 'Fair', 'Good', 'Great', 'Excellent ✨'];

function openRatingModal(bookingId, helperId, helperName, jobTitle = '') {
  _ratingState = { bookingId, helperId, helperName, jobTitle, stars: 0 };

  // Create modal if it doesn't exist
  let overlay = document.getElementById('rating-modal');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'rating-modal';
    overlay.className = 'rating-modal-overlay';
    overlay.innerHTML = `
      <div class="rating-sheet" id="rating-sheet">
        <div class="sheet-drag"></div>
        <div class="rating-header">
          <div class="rating-helper-row">
            <div class="rating-avatar" id="rm-avatar"></div>
            <div>
              <div class="rating-helper-name" id="rm-name"></div>
              <div class="rating-sub" id="rm-job"></div>
            </div>
          </div>
        </div>
        <div class="rating-body">
          <div class="stars-prompt">How was your experience?</div>
          <div class="star-row" id="rm-stars">
            ${[1,2,3,4,5].map(n => `<button class="star-btn" data-star="${n}" onclick="setRatingStar(${n})">★</button>`).join('')}
          </div>
          <div class="rating-label-text" id="rm-label"></div>
          <textarea class="review-textarea" id="rm-comment" placeholder="Share details about your experience (optional)…" maxlength="280" oninput="updateCharCount()"></textarea>
          <div class="char-count"><span id="rm-chars">0</span>/280</div>
          <div class="rating-actions">
            <button class="btn-cancel-review" onclick="closeRatingModal()">Cancel</button>
            <button class="btn-submit-review" id="rm-submit-btn" onclick="submitReview()" disabled>
              <i class="fas fa-star"></i> Submit Review
            </button>
          </div>
        </div>
      </div>
    `;
    overlay.addEventListener('click', e => { if (e.target === overlay) closeRatingModal(); });
    document.body.appendChild(overlay);
  }

  // Populate
  const color = colorFor(helperName);
  document.getElementById('rm-avatar').style.background = color;
  document.getElementById('rm-avatar').textContent = initials(helperName);
  document.getElementById('rm-name').textContent = helperName;
  document.getElementById('rm-job').textContent = jobTitle ? `Job: ${jobTitle}` : 'Rate this helper';
  document.getElementById('rm-comment').value = '';
  document.getElementById('rm-chars').textContent = '0';
  document.getElementById('rm-label').textContent = '';
  document.getElementById('rm-submit-btn').disabled = true;
  document.querySelectorAll('.star-btn').forEach(b => b.classList.remove('lit'));

  requestAnimationFrame(() => overlay.classList.add('open'));
}

function closeRatingModal() {
  const overlay = document.getElementById('rating-modal');
  if (overlay) overlay.classList.remove('open');
}

function setRatingStar(n) {
  _ratingState.stars = n;
  document.querySelectorAll('.star-btn').forEach(b => {
    b.classList.toggle('lit', parseInt(b.dataset.star) <= n);
  });
  document.getElementById('rm-label').textContent = RATING_LABELS[n] || '';
  document.getElementById('rm-submit-btn').disabled = false;
}

function updateCharCount() {
  const val = document.getElementById('rm-comment')?.value || '';
  const el = document.getElementById('rm-chars');
  if (el) el.textContent = val.length;
}


// ── SUBMIT REVIEW ─────────────────────────────────────────────
async function submitReview() {
  const { bookingId, helperId, stars } = _ratingState;
  if (!stars) { reviewToast('Please select a star rating', 'orange'); return; }

  const comment = document.getElementById('rm-comment')?.value.trim() || null;
  const btn = document.getElementById('rm-submit-btn');
  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving…';

  try {
    const { data: { user } } = await client.auth.getUser();
    if (!user) throw new Error('Not logged in');

    // Get current booking to find job_id
    const { data: booking } = await client
      .from('bookings')
      .select('job_id')
      .eq('id', bookingId)
      .maybeSingle();

    // Insert review
    const { error: reviewErr } = await client.from('reviews').insert([{
      booking_id: bookingId,
      job_id:     booking?.job_id || null,
      helper_id:  helperId,
      client_id:  user.id,
      rating:     stars,
      comment:    comment
    }]);
    if (reviewErr) throw reviewErr;

    // Mark booking as completed
    await client.from('bookings')
      .update({ status: 'completed' })
      .eq('id', bookingId);

    // Mark the job itself as completed so it stays off the marketplace
    if (booking?.job_id) {
      await client.from('jobs')
        .update({ status: 'completed' })
        .eq('id', booking.job_id);
    }

    closeRatingModal();
    reviewToast('⭐ Review submitted! Thank you.', 'green');

    // Refresh bookings list
    setTimeout(() => loadClientBookings(), 600);

  } catch (err) {
    reviewToast('Error: ' + (err.message || 'Could not save review'), 'orange');
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-star"></i> Submit Review';
  }
}



// ── LOAD CLIENT JOB APPLICANTS ───────────────────────────────
// Shows helpers who have applied (pending bookings) for the client's jobs
// This is the key handshake — client sees applicants and can open chat
async function loadClientApplicants() {
  const container = document.getElementById('client-applicants-list');
  if (!container) return;
  container.innerHTML = '<p style="color:#8a9a8a;font-size:13px">Checking…</p>';

  try {
    const { data: { user } } = await client.auth.getUser();
    if (!user) return;

    // Get all pending bookings on jobs posted by this client
    const { data: bookings, error } = await client
      .from('bookings')
      .select(`
        id, status, created_at, job_id,
        helper:profiles!helper_id ( id, full_name, avg_rating, total_jobs, service_category ),
        job:jobs!job_id ( id, title, budget, category )
      `)
      .eq('client_id', user.id)
      .eq('status', 'pending')
      .order('created_at', { ascending: false });

    if (error) throw error;

    if (!bookings || bookings.length === 0) {
      container.innerHTML = emptyStateHTML('fa-inbox','No Applications Yet','When helpers apply for your jobs, they will appear here.',{label:'Post a Job',onclick:"document.getElementById('job-title')?.focus()"});
      return;
    }

    container.innerHTML = bookings.map(b => {
      const helper = b.helper || {};
      const job    = b.job    || {};
      const color  = colorFor(helper.full_name || 'H');
      const rating = parseFloat(helper.avg_rating) || 0;
      const starsHtml = rating > 0 ? renderStarsHTML(rating, 11) + ` <span style="font-size:11px;color:#3a4d3a">${rating.toFixed(1)}</span>` : '<span style="font-size:11px;color:#8a9a8a">New helper</span>';

      return `
        <div class="booking-card" style="border-left:3px solid #3db83a">
          <div class="booking-top">
            <div class="booking-avatar" style="background:${color}">${initials(helper.full_name)}</div>
            <div style="flex:1">
              <div class="booking-name">${helper.full_name || 'Helper'}</div>
              <div style="display:flex;align-items:center;gap:6px;margin-top:2px">${starsHtml}</div>
            </div>
            <div class="booking-status-chip status-pending">Applied</div>
          </div>
          ${job.title ? `<div class="booking-job-title">📌 For: ${job.title}${job.budget ? ` · ${job.budget}` : ''}</div>` : ''}
          <div class="booking-footer">
            <div class="booking-date">${timeAgoShort(b.created_at)}</div>
            <button class="btn-complete-rate" style="background:#3b82f6" 
              onclick="chatWithApplicant('${helper.id}','${(helper.full_name||'').replace(/'/g,"\'")}','${job.id || ''}')">
              <i class="fas fa-comments"></i> Chat & Review
            </button>
          </div>
        </div>`;
    }).join('');

  } catch (err) {
    container.innerHTML = `<p style="color:#f07623;font-size:13px">Error: ${err.message}</p>`;
  }
}

// Opens chat thread with the applicant — job context is passed so
// the "Confirm Hire" button in the chat header knows which job to accept
function chatWithApplicant(helperId, helperName, jobId) {
  if (typeof startChatWith === 'function') {
    startChatWith(helperId, helperName, jobId || null);
  } else {
    // Fallback: set localStorage and navigate to dashboard
    localStorage.setItem('openChat', 'true');
    localStorage.setItem('chatRecipientId', helperId);
    localStorage.setItem('chatRecipientName', helperName);
    if (jobId) localStorage.setItem('chatJobId', jobId);
    window.location.href = 'dashboard.html';
  }
}


// ── LOAD CLIENT BOOKINGS ──────────────────────────────────────
async function loadClientBookings() {
  const container = document.getElementById('my-bookings-list');
  if (!container) return;
  container.innerHTML = '<p style="color:#8a9a8a;font-size:13px">Loading…</p>';

  try {
    const { data: { user } } = await client.auth.getUser();
    if (!user) { container.innerHTML = '<p style="color:#8a9a8a;font-size:13px">Please log in.</p>'; return; }

    // Load bookings with helper profile and job info
    const { data: bookings, error } = await client
      .from('bookings')
      .select(`
        id, status, created_at, job_id,
        helper:profiles!helper_id ( id, full_name, avg_rating, selfie_url ),
        job:jobs!job_id ( title, budget )
      `)
      .eq('client_id', user.id)
      .order('created_at', { ascending: false });

    if (error) throw error;

    if (!bookings || bookings.length === 0) {
      container.innerHTML = emptyStateHTML('fa-calendar-check','No Hired Helpers Yet','Once you hire a helper, they will show up here with their payment status.',{label:'Browse Marketplace',onclick:"goToPage('market.html')"});
      return;
    }

    // Load which bookings already have a review
    const bookingIds = bookings.map(b => b.id);
    const { data: existingReviews } = await client
      .from('reviews')
      .select('booking_id, rating')
      .in('booking_id', bookingIds);
    const reviewedMap = {};
    (existingReviews || []).forEach(r => { reviewedMap[r.booking_id] = r.rating; });

    container.innerHTML = bookings.map(b => {
      const helper = b.helper || {};
      const job    = b.job    || {};
      const color  = colorFor(helper.full_name || 'H');
      const status = b.status || 'pending';
      const alreadyRated = reviewedMap[b.id];

            const statusLabel = { pending: 'Awaiting Payment', accepted: 'Active', completed: 'Completed' }[status] || status;
      const statusClass = { pending: 'status-pending', accepted: 'status-accepted', completed: 'status-completed' }[status] || '';
      const safeHN = encodeURIComponent(helper.full_name || '');
      const safeJT = encodeURIComponent(job.title || '');
      const safeJB = encodeURIComponent(job.budget || '');

      let actionBtn = '';
      if (alreadyRated) {
        actionBtn = '<div class="booking-rated">' + renderStarsHTML(alreadyRated, 12) + ' Rated</div>';
      } else if (status === 'completed') {
        actionBtn = '<div class="booking-rated" style="color:#3b82f6"><i class="fas fa-check-circle"></i> Done</div>';
      } else if (status === 'pending') {
        actionBtn = '<button class="btn-complete-rate" style="background:#3db83a" onclick="openPayModal(\'' + b.id + '\',\'' + (helper.id||'') + '\',decodeURIComponent(\'' + safeHN + '\'),decodeURIComponent(\'' + safeJT + '\'),decodeURIComponent(\'' + safeJB + '\'))"><i class="fas fa-lock"></i> Pay via M-Pesa</button>';
      } else if (status === 'accepted') {
        actionBtn = '<button class="btn-complete-rate" onclick="confirmAndRelease(\'' + b.id + '\',\'' + (helper.id||'') + '\',decodeURIComponent(\'' + safeHN + '\'),decodeURIComponent(\'' + safeJT + '\'))"><i class="fas fa-star"></i> Complete & Rate</button>';
      } else {
        actionBtn = '<div style="font-size:11px;color:#8a9a8a">Awaiting payment</div>';
      }

      return `
        <div class="booking-card" id="booking-${b.id}">
          <div class="booking-top">
            <div class="booking-avatar" style="background:${color}">${initials(helper.full_name)}</div>
            <div>
              <div class="booking-name">${helper.full_name || 'Helper'}</div>
              <div class="booking-category">Helper</div>
            </div>
            <div class="booking-status-chip ${statusClass}">${statusLabel}</div>
          </div>
          ${job.title ? '<div class="booking-job-title">Job: ' + job.title + (job.budget ? ' - ' + job.budget : '') + '</div>' : ''}
          <div class="booking-footer">
            <div class="booking-date">${timeAgoShort(b.created_at)}</div>
            ${actionBtn}
          </div>
        </div>`;
    }).join('');

  } catch (err) {
    container.innerHTML = `<p style="color:#f07623;font-size:13px">Could not load bookings: ${err.message}</p>`;
  }
}


// ── LOAD HELPER JOB REQUESTS ─────────────────────────────────
async function loadHelperRequests() {
  const container = document.getElementById('requests-list');
  if (!container) return;
  container.innerHTML = '<p style="color:#8a9a8a;font-size:13px">Checking…</p>';

  try {
    const { data: { user } } = await client.auth.getUser();
    if (!user) return;

    const { data: bookings, error } = await client
      .from('bookings')
      .select(`
        id, status, created_at,
        job:jobs!job_id ( id, title, description, budget, category ),
        client:profiles!client_id ( full_name, email )
      `)
      .eq('helper_id', user.id)
      .eq('status', 'pending')
      .order('created_at', { ascending: false });

    if (error) throw error;

    if (!bookings || bookings.length === 0) {
      container.innerHTML = emptyStateHTML('fa-bell','No Job Requests Yet','When a client selects you for a job, the request will appear here.',{label:'Browse Open Jobs',onclick:"goToPage('market.html?mode=jobs')"});
      return;
    }

    container.innerHTML = bookings.map(b => {
      const job    = b.job    || {};
      const client_profile = b.client || {};
      const color  = colorFor(client_profile.full_name || 'C');

      return `
        <div class="request-card">
          <div class="request-top">
            <div class="request-title">${job.title || 'Job Request'}</div>
            ${job.budget ? `<div class="request-budget">${job.budget}</div>` : ''}
          </div>
          <div class="request-desc">${(job.description || '').slice(0, 100)}${(job.description||'').length > 100 ? '…' : ''}</div>
          <div class="request-client">
            <div class="request-client-dot" style="background:${color}">${initials(client_profile.full_name)}</div>
            ${client_profile.full_name || 'Client'} · ${timeAgoShort(b.created_at)}
          </div>
        </div>`;
    }).join('');

  } catch (err) {
    container.innerHTML = `<p style="color:#f07623;font-size:13px">Error: ${err.message}</p>`;
  }
}


// ── LOAD HELPER ACTIVE JOBS ───────────────────────────────────
async function loadHelperActiveJobs() {
  const container = document.getElementById('active-jobs-list');
  if (!container) return;
  container.innerHTML = '<p style="color:#8a9a8a;font-size:13px">Loading…</p>';

  try {
    const { data: { user } } = await client.auth.getUser();
    if (!user) return;

    const { data: bookings, error } = await client
      .from('bookings')
      .select(`
        id, status, created_at,
        job:jobs!job_id ( title, budget, category ),
        client:profiles!client_id ( full_name )
      `)
      .eq('helper_id', user.id)
      .in('status', ['accepted'])
      .order('created_at', { ascending: false });

    if (error) throw error;

    if (!bookings || bookings.length === 0) {
      container.innerHTML = emptyStateHTML('fa-briefcase','No Active Jobs','Jobs you have been hired for will appear here.',{label:'Find Jobs',onclick:"goToPage('market.html?mode=jobs')"});
      return;
    }

    container.innerHTML = bookings.map(b => {
      const job = b.job || {};
      const cl  = b.client || {};
      const color = colorFor(cl.full_name || 'C');

      return `
        <div class="request-card">
          <div class="request-top">
            <div class="request-title">${job.title || 'Active Job'}</div>
            ${job.budget ? `<div class="request-budget">${job.budget}</div>` : ''}
          </div>
          <div class="request-client">
            <div class="request-client-dot" style="background:${color}">${initials(cl.full_name)}</div>
            Client: ${cl.full_name || 'Client'} · ${timeAgoShort(b.created_at)}
          </div>
        </div>`;
    }).join('');

  } catch (err) {
    container.innerHTML = `<p style="color:#f07623;font-size:13px">Error: ${err.message}</p>`;
  }
}


// ── LOAD HELPER REVIEWS (for Market modal) ────────────────────
async function loadHelperReviews(helperId) {
  try {
    const { data: reviews, error } = await client
      .from('reviews')
      .select(`
        id, rating, comment, created_at,
        client:profiles!client_id ( full_name )
      `)
      .eq('helper_id', helperId)
      .order('created_at', { ascending: false })
      .limit(5);

    if (error || !reviews || reviews.length === 0) return '';

    const reviewsHTML = reviews.map(r => {
      const name = r.client?.full_name || 'Client';
      return `
        <div class="review-item">
          <div class="review-top">
            <div class="reviewer-name">${name.split(' ')[0]}</div>
            <div class="review-date">${timeAgoShort(r.created_at)}</div>
          </div>
          ${renderStarsHTML(r.rating, 12)}
          ${r.comment ? `<div class="review-comment">${r.comment}</div>` : ''}
        </div>`;
    }).join('');

    return `
      <div class="reviews-section">
        <div class="reviews-section-title">Recent Reviews</div>
        ${reviewsHTML}
      </div>`;

  } catch (e) {
    return '';
  }
}


// ── EXPOSE GLOBALS ────────────────────────────────────────────
window.loadClientApplicants = loadClientApplicants;
window.chatWithApplicant    = chatWithApplicant;
window.loadClientBookings   = loadClientBookings;
window.loadHelperRequests   = loadHelperRequests;
window.loadHelperActiveJobs = loadHelperActiveJobs;
window.loadHelperReviews    = loadHelperReviews;
window.openRatingModal      = openRatingModal;
window.closeRatingModal     = closeRatingModal;
window.setRatingStar        = setRatingStar;
window.updateCharCount      = updateCharCount;
window.submitReview         = submitReview;
