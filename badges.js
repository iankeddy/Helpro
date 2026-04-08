// ============================================================
// HELPRO — badges.js
// Helper achievement badge system
// Computed from bookings + reviews — no new tables needed
// ============================================================

// ── BADGE DEFINITIONS ──────────────────────────────────────
// Each badge has: id, label, emoji, color (hex), bg (light hex), description, check fn
const BADGE_DEFS = [
  {
    id:    'vetted',
    label: 'Verified',
    emoji: '✅',
    icon:  'fa-shield-halved',
    color: '#1a7f37',
    bg:    '#dcfce7',
    desc:  'ID-verified & background checked by Helpro',
    check: ({ isVetted }) => isVetted === true,
  },
  {
    id:    'first_job',
    label: 'First Job',
    emoji: '🎯',
    icon:  'fa-bullseye',
    color: '#7c3aed',
    bg:    '#ede9fe',
    desc:  'Completed their first job on Helpro',
    check: ({ completedJobs }) => completedJobs >= 1,
  },
  {
    id:    'rising_star',
    label: 'Rising Star',
    emoji: '⭐',
    icon:  'fa-star',
    color: '#d97706',
    bg:    '#fef3c7',
    desc:  'Completed 5 or more jobs',
    check: ({ completedJobs }) => completedJobs >= 5,
  },
  {
    id:    'top_rated',
    label: 'Top Rated',
    emoji: '🏆',
    icon:  'fa-trophy',
    color: '#b45309',
    bg:    '#fff7ed',
    desc:  'Maintains a 4.5+ star average across 3+ reviews',
    check: ({ avgRating, reviewCount }) => avgRating >= 4.5 && reviewCount >= 3,
  },
  {
    id:    'pro',
    label: 'Pro Helper',
    emoji: '💼',
    icon:  'fa-briefcase',
    color: '#0369a1',
    bg:    '#e0f2fe',
    desc:  'Completed 10 or more jobs',
    check: ({ completedJobs }) => completedJobs >= 10,
  },
  {
    id:    'community_fav',
    label: 'Community Fav',
    emoji: '❤️',
    icon:  'fa-heart',
    color: '#be123c',
    bg:    '#fff1f2',
    desc:  'Loved by clients — 10+ reviews with 4.0+ average',
    check: ({ avgRating, reviewCount }) => reviewCount >= 10 && avgRating >= 4.0,
  },
];

// ── FETCH BADGE DATA ────────────────────────────────────────
async function fetchBadgeData(helperId) {
  const supaClient = window.client || window.db;
  if (!supaClient || !helperId) return null;

  try {
    // 1. Profile (vetted status)
    const { data: profile } = await supaClient
      .from('profiles')
      .select('is_vetted')
      .eq('id', helperId)
      .maybeSingle();

    // 2. Completed job count
    const { count: completedJobs } = await supaClient
      .from('bookings')
      .select('*', { count: 'exact', head: true })
      .eq('helper_id', helperId)
      .eq('status', 'completed');

    // 3. Reviews — avg rating and count
    const { data: reviews } = await supaClient
      .from('reviews')
      .select('rating')
      .eq('helper_id', helperId);

    const reviewCount = reviews?.length || 0;
    const avgRating = reviewCount > 0
      ? reviews.reduce((sum, r) => sum + (parseFloat(r.rating) || 0), 0) / reviewCount
      : 0;

    return {
      isVetted:     profile?.is_vetted === true,
      completedJobs: completedJobs || 0,
      reviewCount,
      avgRating,
    };
  } catch (e) {
    /* Badge fetch failed silently — badges are non-critical */
    return null;
  }
}

// ── COMPUTE EARNED BADGES ───────────────────────────────────
function computeBadges(data) {
  if (!data) return [];
  return BADGE_DEFS.filter(b => b.check(data));
}

// ── MAIN: GET BADGES FOR A HELPER ──────────────────────────
async function getHelperBadges(helperId) {
  const data = await fetchBadgeData(helperId);
  return computeBadges(data);
}

// ── RENDER: INLINE CHIPS (for cards / modal headers) ───────
// size: 'sm' | 'md'
function renderBadgeChips(badges, size = 'sm') {
  if (!badges || badges.length === 0) return '';
  const pad  = size === 'sm' ? '3px 8px' : '5px 12px';
  const font = size === 'sm' ? '11px' : '12px';
  const gap  = size === 'sm' ? '4px' : '6px';

  return `<div style="display:flex;flex-wrap:wrap;gap:${gap};margin-top:${size==='sm'?'5px':'8px'}">
    ${badges.map(b => `
      <div title="${b.desc}"
           style="display:inline-flex;align-items:center;gap:4px;padding:${pad};
                  background:${b.bg};color:${b.color};
                  border-radius:20px;font-size:${font};font-weight:700;
                  white-space:nowrap;line-height:1.2">
        <i class="fas ${b.icon}" style="font-size:${size==='sm'?'9px':'11px'}"></i>
        ${b.label}
      </div>`).join('')}
  </div>`;
}

// ── RENDER: BADGE SHOWCASE (for modal / profile) ───────────
// Full card with description, shown when there are badges to celebrate
function renderBadgeShowcase(badges) {
  if (!badges || badges.length === 0) return '';

  return `
    <div class="badge-showcase">
      <div class="badge-showcase-title">
        <i class="fas fa-award"></i> Achievements
      </div>
      <div class="badge-showcase-grid">
        ${badges.map(b => `
          <div class="badge-item" title="${b.desc}">
            <div class="badge-icon-wrap" style="background:${b.bg};color:${b.color}">
              <i class="fas ${b.icon}"></i>
            </div>
            <div class="badge-label">${b.label}</div>
            <div class="badge-desc">${b.desc}</div>
          </div>`).join('')}
      </div>
    </div>`;
}

// ── STYLES ─────────────────────────────────────────────────
(function injectBadgeStyles() {
  if (document.getElementById('badge-styles')) return;
  const s = document.createElement('style');
  s.id = 'badge-styles';
  s.textContent = `
    .badge-showcase {
      padding: 16px 20px;
      border-top: 1px solid var(--border);
      margin-top: 4px;
    }
    .badge-showcase-title {
      font-size: 11px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.6px;
      color: var(--text-muted);
      margin-bottom: 12px;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .badge-showcase-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
      gap: 10px;
    }
    .badge-item {
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
      padding: 12px 8px;
      border-radius: 12px;
      background: var(--surface);
      border: 1px solid var(--border);
      transition: transform 0.15s;
    }
    .badge-item:hover { transform: translateY(-2px); }
    .badge-icon-wrap {
      width: 42px; height: 42px;
      border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      font-size: 18px;
      margin-bottom: 7px;
      flex-shrink: 0;
    }
    .badge-label {
      font-size: 12px;
      font-weight: 800;
      color: var(--text);
      margin-bottom: 3px;
    }
    .badge-desc {
      font-size: 10px;
      color: var(--text-muted);
      line-height: 1.4;
    }

    /* Dashboard earned-badges card */
    .my-badges-wrap {
      margin-top: 12px;
    }
    .my-badges-title {
      font-size: 12px;
      font-weight: 800;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 10px;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .my-badges-empty {
      font-size: 13px;
      color: var(--text-muted);
      padding: 8px 0;
    }
    .my-badges-next {
      margin-top: 10px;
      padding: 10px 12px;
      background: var(--surface);
      border-radius: 10px;
      border: 1px dashed var(--border);
    }
    .my-badges-next-label {
      font-size: 11px;
      font-weight: 700;
      color: var(--text-muted);
      margin-bottom: 4px;
    }
    .my-badges-next-item {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 12px;
      color: var(--text-mid);
    }
    .my-badges-next-icon {
      width: 26px; height: 26px;
      border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      font-size: 11px;
      opacity: 0.45;
    }
  `;
  document.head.appendChild(s);
})();

// ── DASHBOARD: LOAD MY BADGES ──────────────────────────────
// Call this to render badges on the helper's dashboard
async function loadMyBadges(helperId) {
  const wrap = document.getElementById('my-badges-container');
  if (!wrap) return;

  const data = await fetchBadgeData(helperId);
  if (!data) { wrap.innerHTML = ''; return; }

  const earned = computeBadges(data);

  // Find next badge to unlock (first unearned)
  const notEarned = BADGE_DEFS.filter(b => !b.check(data));
  const next = notEarned[0] || null;

  let nextHTML = '';
  if (next) {
    let hint = '';
    if (next.id === 'first_job')     hint = `Complete your first job`;
    if (next.id === 'rising_star')   hint = `Complete ${5 - data.completedJobs} more job${5-data.completedJobs!==1?'s':''}`;
    if (next.id === 'pro')           hint = `Complete ${10 - data.completedJobs} more job${10-data.completedJobs!==1?'s':''}`;
    if (next.id === 'top_rated')     hint = `Reach 4.5★ avg with 3+ reviews`;
    if (next.id === 'community_fav') hint = `Get 10+ reviews with 4.0★+ avg`;
    if (next.id === 'vetted')        hint = `Complete your ID verification`;

    nextHTML = `
      <div class="my-badges-next">
        <div class="my-badges-next-label">Next to unlock</div>
        <div class="my-badges-next-item">
          <div class="my-badges-next-icon" style="background:${next.bg};color:${next.color}">
            <i class="fas ${next.icon}"></i>
          </div>
          <div>
            <span style="font-weight:700">${next.label}</span>
            ${hint ? `<span style="color:var(--text-muted)"> — ${hint}</span>` : ''}
          </div>
        </div>
      </div>`;
  }

  wrap.innerHTML = `
    <div class="my-badges-wrap">
      <div class="my-badges-title"><i class="fas fa-award"></i> Your Badges</div>
      ${earned.length > 0
        ? renderBadgeChips(earned, 'md')
        : `<div class="my-badges-empty">No badges yet — complete your first job to earn one!</div>`
      }
      ${nextHTML}
    </div>`;
}

// ── EXPORTS ─────────────────────────────────────────────────
window.getHelperBadges     = getHelperBadges;
window.renderBadgeChips    = renderBadgeChips;
window.renderBadgeShowcase = renderBadgeShowcase;
window.loadMyBadges        = loadMyBadges;
