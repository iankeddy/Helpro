// ============================================================
// HELPRO — M-Pesa Payment & Wallet System
// mpesa-payments.js
// Handles:
//   • Client pays into escrow via STK Push
//   • Client confirms job complete → escrow released to helper
//   • Helper views wallet balance + transaction history
//   • Helper withdraws to M-Pesa via B2C
// ============================================================

const SUPABASE_FUNCTIONS_URL = 'https://cjpylodggpqqkuvojogb.supabase.co/functions/v1';

// ── STATE ────────────────────────────────────────────────────
let _payState = {
  bookingId:  null,
  helperId:   null,
  helperName: null,
  jobTitle:   null,
  jobBudget:  null,
};

// ══════════════════════════════════════════════════════════════
// PAY INTO ESCROW  (Client side)
// ══════════════════════════════════════════════════════════════

// Opens the pay modal — called from the booking card "Pay" button
function openPayModal(bookingId, helperId, helperName, jobTitle, jobBudget) {
  _payState = { bookingId, helperId, helperName, jobTitle, jobBudget };

  document.getElementById('pay-job-title').textContent  = jobTitle  || 'Service Job';
  document.getElementById('pay-helper-name').textContent = helperName ? `Helper: ${helperName}` : '';

  // Pre-fill amount from job budget if it's a number
  const budgetNum = jobBudget ? parseInt((jobBudget+'').replace(/[^\d]/g, '')) : '';
  const amountEl  = document.getElementById('pay-amount');
  if (amountEl && budgetNum) {
    amountEl.value = budgetNum;
    updatePaySummary();
  } else if (amountEl) {
    amountEl.value = '';
  }

  // Pre-fill phone from profile if available
  loadUserPhone();

  const modal = document.getElementById('pay-modal');
  if (modal) {
    modal.style.display = 'flex';
    // Animate up
    requestAnimationFrame(() => { modal.style.opacity = '1'; });
  }
}

function closePayModal() {
  const modal = document.getElementById('pay-modal');
  if (modal) modal.style.display = 'none';
}

function updatePaySummary() {
  const amount    = parseInt(document.getElementById('pay-amount')?.value || 0);
  const summaryEl = document.getElementById('pay-summary');
  const amountEl  = document.getElementById('pay-summary-amount');
  if (!summaryEl) return;
  if (amount > 0) {
    summaryEl.style.display = 'block';
    if (amountEl) amountEl.textContent = `KES ${amount.toLocaleString()}`;
  } else {
    summaryEl.style.display = 'none';
  }
}

async function loadUserPhone() {
  try {
    const { data: { user } } = await client.auth.getUser();
    if (!user) return;
    const { data: profile } = await client.from('profiles')
      .select('phone, mpesa_phone').eq('id', user.id).maybeSingle();
    const phone = profile?.mpesa_phone || profile?.phone || '';
    const phoneEl = document.getElementById('pay-phone');
    if (phoneEl && phone) phoneEl.value = phone;
  } catch(e) { /* silent */ }
}

async function submitPayment() {
  const amount = parseInt(document.getElementById('pay-amount')?.value || 0);
  const phone  = document.getElementById('pay-phone')?.value?.trim();
  const btn    = document.getElementById('pay-btn');

  if (!amount || amount < 1) {
    showModal('Amount Required', 'Please enter the payment amount in KES.', 'warning');
    return;
  }
  if (!phone) {
    showModal('Phone Required', 'Please enter your M-Pesa phone number.', 'warning');
    return;
  }

  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sending STK Push…';

  try {
    const { data: { session } } = await client.auth.getSession();
    if (!session) throw new Error('Not logged in');

    const res = await fetch(`${SUPABASE_FUNCTIONS_URL}/mpesa-stk-push`, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${session.access_token}`
      },
      body: JSON.stringify({
        booking_id:   _payState.bookingId,
        phone_number: phone,
        amount:       amount
      })
    });

    const data = await res.json();

    if (!res.ok || !data.success) {
      throw new Error(data.error || data.details || 'Payment initiation failed');
    }

    closePayModal();
    showModal(
      '📱 Check Your Phone!',
      `An M-Pesa prompt has been sent to ${phone}. Enter your M-Pesa PIN to complete the payment of KES ${amount}.`
    );

    // Poll for payment confirmation for up to 60 seconds
    pollPaymentStatus(data.checkout_request_id, _payState.bookingId);

  } catch(err) {
    showModal('Payment Failed', err.message, 'error');
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-lock"></i> Pay & Confirm Booking';
  }
}

// Poll the payments table every 4 seconds to detect when callback confirms payment
async function pollPaymentStatus(checkoutRequestId, bookingId) {
  let attempts = 0;
  const maxAttempts = 15; // 15 × 4s = 60 seconds

  const interval = setInterval(async () => {
    attempts++;
    try {
      const { data: payment } = await client
        .from('payments')
        .select('status, escrow_status, mpesa_receipt_number')
        .eq('checkout_request_id', checkoutRequestId)
        .maybeSingle();

      if (payment?.escrow_status === 'held') {
        clearInterval(interval);
        showModal(
          '✅ Payment Confirmed!',
          `Your payment has been received and held securely in escrow. Your helper has been notified to start work.`
        );
        // Refresh bookings list
        setTimeout(() => loadClientBookings?.(), 800);
        return;
      }

      if (payment?.status === 'failed') {
        clearInterval(interval);
        showModal('❌ Payment Failed', 'The M-Pesa payment was not completed. Please try again.', 'error');
        return;
      }
    } catch(e) { /* keep polling */ }

    if (attempts >= maxAttempts) {
      clearInterval(interval);
      showModal(
        '⏳ Payment Pending',
        'We are still waiting for M-Pesa confirmation. Check your notifications — you will be notified once payment is confirmed.'
      );
    }
  }, 4000);
}


// ══════════════════════════════════════════════════════════════
// CONFIRM JOB COMPLETE + RELEASE ESCROW  (Client side)
// Called when client clicks "Complete & Rate" — we release
// escrow FIRST, then open the rating modal
// ══════════════════════════════════════════════════════════════

async function confirmAndRelease(bookingId, helperId, helperName, jobTitle) {
  // Verify there's a held payment before proceeding
  const { data: payment } = await client
    .from('payments')
    .select('id, amount, escrow_status')
    .eq('booking_id', bookingId)
    .eq('escrow_status', 'held')
    .maybeSingle();

  if (!payment) {
    // No escrow held — just open rating (backward compat for old bookings)
    if (typeof openRatingModal === 'function') {
      openRatingModal(bookingId, helperId, helperName, jobTitle);
    }
    return;
  }

  try {
    const { data: { user } } = await client.auth.getUser();

    // Call the DB function to do the 80/20 split atomically
    const { data: result, error } = await client
      .rpc('release_escrow', {
        p_booking_id: bookingId,
        p_client_id:  user.id
      });

    if (error) throw error;
    if (!result?.success) throw new Error(result?.error || 'Release failed');

    const helperAmt = result.helper_amount?.toLocaleString();
    const commission = result.commission?.toLocaleString();

    showModal(
      '✅ Escrow Released',
      `KES ${helperAmt} has been sent to ${helperName}'s wallet (KES ${commission} Helpro commission deducted). Please leave a review!`
    );

    // Now open the rating modal
    setTimeout(() => {
      if (typeof openRatingModal === 'function') {
        openRatingModal(bookingId, helperId, helperName, jobTitle);
      }
    }, 1500);

  } catch(err) {
    showModal('Release Failed', err.message, 'error');
  }
}


// ══════════════════════════════════════════════════════════════
// WALLET  (Helper side)
// ══════════════════════════════════════════════════════════════

async function loadHelperWallet() {
  try {
    const { data: { user } } = await client.auth.getUser();
    if (!user) return;

    // Load wallet
    const { data: wallet } = await client
      .from('wallets')
      .select('*')
      .eq('helper_id', user.id)
      .maybeSingle();

    if (wallet) {
      const balEl       = document.getElementById('wallet-balance');
      const earnedEl    = document.getElementById('wallet-earned');
      const withdrawnEl = document.getElementById('wallet-withdrawn');
      const availEl     = document.getElementById('withdraw-available');

      if (balEl)       balEl.textContent       = `KES ${Number(wallet.balance).toLocaleString()}`;
      if (earnedEl)    earnedEl.textContent     = `KES ${Number(wallet.total_earned).toLocaleString()}`;
      if (withdrawnEl) withdrawnEl.textContent  = `KES ${Number(wallet.total_withdrawn).toLocaleString()}`;
      if (availEl)     availEl.textContent      = `KES ${Number(wallet.balance).toLocaleString()}`;
    }

    // Load recent transactions
    const { data: txns } = await client
      .from('wallet_transactions')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(10);

    renderWalletTransactions(txns || []);

  } catch(e) { /* silent */ }
}

function renderWalletTransactions(txns) {
  const container = document.getElementById('wallet-transactions-list');
  if (!container) return;

  if (!txns.length) {
    container.innerHTML = `
      <div style="text-align:center;padding:20px;color:var(--text-muted);font-size:13px">
        <i class="fas fa-receipt" style="font-size:24px;color:var(--border);display:block;margin-bottom:8px"></i>
        No transactions yet. Complete a job to earn!
      </div>`;
    return;
  }

  const typeLabel = {
    escrow_release: 'Job Payment',
    commission:     'Helpro Commission',
    withdrawal:     'Withdrawal',
    withdrawal_fee: 'Withdrawal Fee',
    refund:         'Refund',
    escrow_hold:    'Escrow Held',
  };
  const typeIcon = {
    escrow_release: 'fa-briefcase',
    commission:     'fa-percentage',
    withdrawal:     'fa-money-bill-wave',
    withdrawal_fee: 'fa-money-bill',
    refund:         'fa-rotate-left',
    escrow_hold:    'fa-lock',
  };

  container.innerHTML = txns.map(t => {
    const isCredit = t.direction === 'credit';
    const color    = isCredit ? '#3db83a' : '#f07623';
    const sign     = isCredit ? '+' : '-';
    const label    = typeLabel[t.type] || t.type;
    const icon     = typeIcon[t.type]  || 'fa-circle';
    const date     = new Date(t.created_at).toLocaleDateString('en-KE', {
      day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
    });

    return `
      <div style="display:flex;align-items:center;gap:12px;padding:12px 0;
        border-bottom:1px solid var(--border)">
        <div style="width:38px;height:38px;border-radius:50%;background:${isCredit ? '#e8f7e8' : '#fff3ec'};
          display:flex;align-items:center;justify-content:center;flex-shrink:0;color:${color}">
          <i class="fas ${icon}" style="font-size:14px"></i>
        </div>
        <div style="flex:1;min-width:0">
          <div style="font-size:13px;font-weight:700;color:var(--text)">${label}</div>
          <div style="font-size:11px;color:var(--text-muted);margin-top:1px">${date}</div>
          ${t.mpesa_ref ? `<div style="font-size:10px;color:#8a9a8a;margin-top:1px">Ref: ${t.mpesa_ref}</div>` : ''}
        </div>
        <div style="font-weight:800;font-size:14px;color:${color};flex-shrink:0">
          ${sign} KES ${Number(t.amount).toLocaleString()}
        </div>
      </div>`;
  }).join('');
}


// ══════════════════════════════════════════════════════════════
// WITHDRAW  (Helper side)
// ══════════════════════════════════════════════════════════════

async function openWithdrawSheet() {
  // Refresh balance display
  await loadHelperWallet();

  // Pre-fill phone
  try {
    const { data: { user } } = await client.auth.getUser();
    if (user) {
      const { data: p } = await client.from('profiles')
        .select('phone, mpesa_phone').eq('id', user.id).maybeSingle();
      const phoneEl = document.getElementById('withdraw-phone');
      if (phoneEl) phoneEl.value = p?.mpesa_phone || p?.phone || '';
    }
  } catch(e) { /* silent */ }

  const sheet = document.getElementById('withdraw-sheet');
  if (sheet) sheet.style.display = 'flex';
}

function closeWithdrawSheet() {
  const sheet = document.getElementById('withdraw-sheet');
  if (sheet) sheet.style.display = 'none';
}

async function submitWithdrawal() {
  const amount  = parseInt(document.getElementById('withdraw-amount')?.value || 0);
  const phone   = document.getElementById('withdraw-phone')?.value?.trim();
  const btn     = document.getElementById('withdraw-btn');

  if (!amount || amount < 100) {
    showModal('Minimum Amount', 'Minimum withdrawal is KES 100.', 'warning');
    return;
  }
  if (!phone) {
    showModal('Phone Required', 'Please enter your M-Pesa phone number.', 'warning');
    return;
  }

  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing…';

  try {
    const { data: { session } } = await client.auth.getSession();
    if (!session) throw new Error('Not logged in');

    const res = await fetch(`${SUPABASE_FUNCTIONS_URL}/mpesa-b2c`, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${session.access_token}`
      },
      body: JSON.stringify({ amount, phone_number: phone })
    });

    const data = await res.json();

    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Withdrawal failed');
    }

    closeWithdrawSheet();
    showModal(
      '💸 Withdrawal Initiated!',
      `KES ${amount} is being sent to ${phone}. It usually arrives within 1 minute.`
    );

    // Refresh wallet
    setTimeout(() => loadHelperWallet(), 3000);

  } catch(err) {
    showModal('Withdrawal Failed', err.message, 'error');
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-paper-plane"></i> Withdraw Now';
  }
}


// ══════════════════════════════════════════════════════════════
// EXPOSE GLOBALS
// ══════════════════════════════════════════════════════════════
window.openPayModal       = openPayModal;
window.closePayModal      = closePayModal;
window.updatePaySummary   = updatePaySummary;
window.submitPayment      = submitPayment;
window.confirmAndRelease  = confirmAndRelease;
window.loadHelperWallet   = loadHelperWallet;
window.openWithdrawSheet  = openWithdrawSheet;
window.closeWithdrawSheet = closeWithdrawSheet;
window.submitWithdrawal   = submitWithdrawal;
