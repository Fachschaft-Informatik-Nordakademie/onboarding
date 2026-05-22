// wizard.ts – Client-side logic for the onboarding wizard

// Test mode: activated via ?mode=test in the URL.
// Skips email-verification gate and GitHub "already a member" check.
const TEST_MODE = new URLSearchParams(window.location.search).get('mode') === 'test';

const TOTAL_STEPS        = 9;
const CHECKLIST_KEY      = 'fsinf-checklist';
const INTRO_DONE_KEY     = 'fsinf-intro-done';
const MAX_STEP_KEY       = 'fsinf-max-step';
const VERIFIED_EMAIL_KEY = 'fsinf-verified-email';
const INVITE_LINKS_KEY   = 'fsinf-invite-links';

let currentStep      = 0;
let maxReachedStep   = 0;
let introMode        = false;

// Items to auto-check when LEAVING a step (clicking Weiter)
const STEP_AUTO_CHECKS: Record<number, string[]> = {};

// Items that must be checked before Weiter is allowed on a given step
const STEP_REQUIRED: Record<number, string[]> = {
  2: ['email-verified'],
  3: ['whatsapp'],
  4: ['discord'],
  5: ['instagram'],
  6: ['github'],
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function getStepPanels() { return document.querySelectorAll<HTMLElement>('[data-step]'); }
function getDots()        { return document.querySelectorAll<HTMLButtonElement>('.step-dot'); }

// ─── Theme ───────────────────────────────────────────────────────────────────

function initTheme(): void {
  document.getElementById('theme-toggle')?.addEventListener('click', () => {
    const isDark = document.documentElement.classList.toggle('dark');
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
  });
}

// ─── Checklist ───────────────────────────────────────────────────────────────

function loadChecklistState(): Record<string, boolean> {
  try { return JSON.parse(localStorage.getItem(CHECKLIST_KEY) ?? '{}'); }
  catch { return {}; }
}

function saveChecklistState(state: Record<string, boolean>): void {
  localStorage.setItem(CHECKLIST_KEY, JSON.stringify(state));
}

function checkItem(id: string): void {
  const state = loadChecklistState();
  if (state[id]) return; // already checked
  state[id] = true;
  saveChecklistState(state);

  const checkbox = document.querySelector<HTMLInputElement>(`[data-checklist-id="${id}"]`);
  if (checkbox) {
    checkbox.checked = true;
    checkbox.closest('label')?.classList.add('checked');
  }
  updateChecklistProgress(state);
  updateNextButtonGate();
}

function updateChecklistProgress(state: Record<string, boolean>): void {
  const items = document.querySelectorAll<HTMLInputElement>('[data-checklist-id]');
  const total = items.length;
  const done  = Object.values(state).filter(Boolean).length;

  const bar  = document.getElementById('checklist-progress-bar');
  const text = document.getElementById('checklist-progress-text');
  if (bar)  bar.style.width = total > 0 ? `${(done / total) * 100}%` : '0%';
  if (text) text.textContent = `${done} / ${total}`;
}

function initChecklist(): void {
  const state = loadChecklistState();
  document.querySelectorAll<HTMLInputElement>('[data-checklist-id]').forEach(checkbox => {
    const id = checkbox.dataset.checklistId!;
    checkbox.checked = state[id] ?? false;
    const label = checkbox.closest('label');
    if (label) label.classList.toggle('checked', checkbox.checked);

    checkbox.addEventListener('change', () => {
      state[id] = checkbox.checked;
      label?.classList.toggle('checked', checkbox.checked);
      saveChecklistState(state);
      updateChecklistProgress(state);
    });
  });
  updateChecklistProgress(state);
}

// ─── Navigation ──────────────────────────────────────────────────────────────

function goToStep(n: number): void {
  if (n < 0 || n >= TOTAL_STEPS) return;

  // Show/hide panels
  getStepPanels().forEach((panel, i) => panel.classList.toggle('hidden', i !== n));

  // Track furthest step
  if (n > maxReachedStep) {
    maxReachedStep = n;
    localStorage.setItem(MAX_STEP_KEY, String(maxReachedStep));
  }

  currentStep = n;
  updateDots();
  updateNavButtons();
  updateNextButtonGate();
  window.scrollTo({ top: 0, behavior: 'smooth' });

  // Accessibility focus
  const panel = getStepPanels()[n];
  panel?.querySelector<HTMLElement>('h1, h2')?.focus();
}

function updateDots(): void {
  getDots().forEach((dot, i) => {
    const circle = dot.querySelector<HTMLElement>('div');
    if (!circle) return;

    if (i === currentStep) {
      circle.className = 'w-3 h-3 rounded-full transition-all duration-300 bg-fsinf-navy dark:bg-fsinf-cyan scale-125';
      dot.style.cursor = 'default';
      dot.style.pointerEvents = 'none';
      dot.setAttribute('aria-current', 'step');
    } else if (i <= maxReachedStep) {
      circle.className = 'w-3 h-3 rounded-full transition-all duration-300 bg-fsinf-navy/60 dark:bg-fsinf-cyan/60 hover:bg-fsinf-navy/90 dark:hover:bg-fsinf-cyan/90';
      dot.style.cursor = 'pointer';
      dot.style.pointerEvents = 'auto';
      dot.removeAttribute('aria-current');
    } else {
      circle.className = 'w-3 h-3 rounded-full transition-all duration-300 bg-fsinf-navy/20 dark:bg-fsinf-cyan/20';
      dot.style.cursor = 'not-allowed';
      dot.style.pointerEvents = 'none';
      dot.removeAttribute('aria-current');
    }
  });
}

function updateNavButtons(): void {
  const prevBtn    = document.getElementById('btn-prev') as HTMLButtonElement | null;
  const nextBtn    = document.getElementById('btn-next') as HTMLButtonElement | null;
  const counter    = document.getElementById('step-counter');
  const startBtn   = document.getElementById('wizard-start-btn');

  if (introMode) {
    prevBtn?.classList.add('invisible');
    nextBtn?.classList.add('invisible');
    startBtn?.classList.remove('hidden');
    if (counter) counter.textContent = 'Deine Roadmap';
    return;
  }

  startBtn?.classList.add('hidden');
  prevBtn?.classList.remove('invisible');
  nextBtn?.classList.remove('invisible');

  if (prevBtn) prevBtn.disabled = currentStep === 0;
  if (nextBtn) {
    const isLast = currentStep === TOTAL_STEPS - 1;
    nextBtn.classList.toggle('opacity-0', isLast);
    nextBtn.classList.toggle('pointer-events-none', isLast);
  }
  if (counter) counter.textContent = `${currentStep + 1} / ${TOTAL_STEPS}`;
}

function startWizard(): void {
  introMode = false;
  localStorage.setItem(INTRO_DONE_KEY, 'true');
  maxReachedStep = 0;
  localStorage.setItem(MAX_STEP_KEY, '0');
  goToStep(0);
}

function canAdvance(): boolean {
  const required = STEP_REQUIRED[currentStep];
  if (!required) return true;
  const state = loadChecklistState();
  return required.every(id => state[id]);
}

function advanceStep(): void {
  if (introMode || currentStep >= TOTAL_STEPS - 1) return;
  if (!canAdvance()) {
    // Shake the next button as feedback
    const btn = document.getElementById('btn-next');
    btn?.classList.add('animate-pulse');
    setTimeout(() => btn?.classList.remove('animate-pulse'), 600);
    return;
  }
  (STEP_AUTO_CHECKS[currentStep] ?? []).forEach(checkItem);
  goToStep(currentStep + 1);
}

function updateNextButtonGate(): void {
  const btn = document.getElementById('btn-next') as HTMLButtonElement | null;
  if (!btn) return;
  const required = STEP_REQUIRED[currentStep];
  if (!required) {
    btn.removeAttribute('title');
    btn.classList.remove('opacity-50');
    return;
  }
  const state = loadChecklistState();
  const allDone = required.every(id => state[id]);
  btn.classList.toggle('opacity-50', !allDone);
  btn.title = allDone ? '' : 'Bitte erst die Aufgabe auf dieser Seite erledigen';
}

function initNavigation(): void {
  document.getElementById('btn-prev')?.addEventListener('click', () => goToStep(currentStep - 1));
  document.getElementById('btn-next')?.addEventListener('click', advanceStep);
  document.getElementById('wizard-start-btn')?.addEventListener('click', startWizard);
  document.getElementById('back-to-checklist')?.addEventListener('click', () => goToStep(4));

  // Dot clicks (only for visited steps)
  getDots().forEach(dot => {
    const target = parseInt(dot.dataset.goto ?? '0', 10);
    dot.addEventListener('click', () => {
      if (!introMode && target <= maxReachedStep) goToStep(target);
    });
  });

  // Arrow-key navigation
  document.addEventListener('keydown', e => {
    const t = e.target as HTMLElement;
    if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA') return;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); advanceStep(); }
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); goToStep(currentStep - 1); }
  });

  // Auto-check on action-button clicks (join links, project board, etc.)
  document.addEventListener('click', e => {
    const target = (e.target as HTMLElement).closest<HTMLElement>('[data-auto-check]');
    if (target?.dataset.autoCheck) checkItem(target.dataset.autoCheck);
  });
}

// ─── Invite Links ─────────────────────────────────────────────────────────────

function applyInviteLinks(links: { whatsappInvite?: string | null; discordInvite?: string | null }): void {
  const wa = document.getElementById('whatsapp-invite-link') as HTMLAnchorElement | null;
  const dc = document.getElementById('discord-invite-link')  as HTMLAnchorElement | null;
  if (wa && links.whatsappInvite) wa.href = links.whatsappInvite;
  if (dc && links.discordInvite)  dc.href = links.discordInvite;
}

function loadAndApplyInviteLinks(): void {
  try {
    const raw = localStorage.getItem(INVITE_LINKS_KEY);
    if (raw) applyInviteLinks(JSON.parse(raw));
  } catch { /* ignore */ }
}

// ─── Email Verification ───────────────────────────────────────────────────────

function initEmailVerify(): void {
  const emailInput     = document.getElementById('verify-email-input')    as HTMLInputElement | null;
  const sendBtn        = document.getElementById('send-code-btn');
  const sendBtnText    = document.getElementById('send-code-btn-text');
  const sendSection    = document.getElementById('email-send-section');
  const verifySection  = document.getElementById('email-verify-section');
  const codeInput      = document.getElementById('verify-code-input')     as HTMLInputElement | null;
  const verifyBtn      = document.getElementById('verify-code-btn');
  const verifyBtnText  = document.getElementById('verify-code-btn-text');
  const resendBtn      = document.getElementById('resend-code-btn');
  const emailDisplay   = document.getElementById('verify-email-display');
  const infoBox        = document.getElementById('email-verify-info');
  const infoText       = document.getElementById('email-verify-info-text');
  const errorBox       = document.getElementById('email-verify-error');
  const errorText      = document.getElementById('email-verify-error-text');
  const successBox     = document.getElementById('email-verify-success');
  const successEmail   = document.getElementById('email-verify-success-email');

  if (!emailInput || !sendBtn) return;

  // If already verified in this session, restore UI
  const alreadyVerified = localStorage.getItem(VERIFIED_EMAIL_KEY);
  if (alreadyVerified && loadChecklistState()['email-verified']) {
    emailInput.value = alreadyVerified;
    emailInput.readOnly = true;
    sendBtn.setAttribute('disabled', 'true');
    sendSection?.classList.add('opacity-50');
    if (successEmail) successEmail.textContent = alreadyVerified;
    successBox?.classList.remove('hidden');
    verifySection?.classList.add('hidden');
  }

  function showInfo(msg: string) {
    errorBox?.classList.add('hidden');
    if (infoText) infoText.textContent = msg;
    infoBox?.classList.remove('hidden');
  }
  function showError(msg: string) {
    infoBox?.classList.add('hidden');
    if (errorText) errorText.textContent = msg;
    errorBox?.classList.remove('hidden');
  }
  function clearFeedback() {
    infoBox?.classList.add('hidden');
    errorBox?.classList.add('hidden');
  }

  async function sendCode() {
    const email = emailInput!.value.trim();
    if (!email) { emailInput!.focus(); return; }

    clearFeedback();
    if (sendBtnText) sendBtnText.textContent = 'Wird gesendet…';
    sendBtn!.setAttribute('disabled', 'true');

    try {
      const res  = await fetch('/api/verify-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();

      if (res.ok) {
        if (emailDisplay) emailDisplay.textContent = email;
        showInfo(data.message);
        verifySection?.classList.remove('hidden');
        codeInput?.focus();
        // Lock email field while verifying
        emailInput!.readOnly = true;
        sendSection?.classList.add('opacity-50');
      } else {
        showError(data.message || 'Fehler beim Senden.');
        sendBtn!.removeAttribute('disabled');
      }
    } catch {
      showError('Netzwerkfehler. Bitte überprüfe deine Internetverbindung.');
      sendBtn!.removeAttribute('disabled');
    } finally {
      if (sendBtnText) sendBtnText.textContent = 'Code senden';
    }
  }

  async function verifyCode() {
    const email = emailInput!.value.trim();
    const code  = codeInput?.value.trim() ?? '';
    if (!code) { codeInput?.focus(); return; }

    clearFeedback();
    if (verifyBtnText) verifyBtnText.textContent = 'Prüfe…';
    verifyBtn!.setAttribute('disabled', 'true');

    try {
      const res  = await fetch('/api/verify-email', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code }),
      });
      const data = await res.json();

      if (res.ok && data.verified) {
        localStorage.setItem(VERIFIED_EMAIL_KEY, email);
        const links = { whatsappInvite: data.whatsappInvite, discordInvite: data.discordInvite };
        localStorage.setItem(INVITE_LINKS_KEY, JSON.stringify(links));
        applyInviteLinks(links);
        checkItem('email-verified');
        if (successEmail) successEmail.textContent = email;
        successBox?.classList.remove('hidden');
        verifySection?.classList.add('hidden');
        infoBox?.classList.add('hidden');
      } else {
        showError(data.message || 'Falscher Code.');
        verifyBtn!.removeAttribute('disabled');
      }
    } catch {
      showError('Netzwerkfehler. Bitte überprüfe deine Internetverbindung.');
      verifyBtn!.removeAttribute('disabled');
    } finally {
      if (verifyBtnText) verifyBtnText.textContent = 'Bestätigen';
    }
  }

  sendBtn.addEventListener('click', sendCode);
  emailInput.addEventListener('keydown', e => { if (e.key === 'Enter') sendCode(); });
  verifyBtn?.addEventListener('click', verifyCode);
  codeInput?.addEventListener('keydown', e => { if (e.key === 'Enter') verifyCode(); });

  resendBtn?.addEventListener('click', () => {
    // Unlock email, reset state
    emailInput!.readOnly = false;
    sendBtn!.removeAttribute('disabled');
    sendSection?.classList.remove('opacity-50');
    verifySection?.classList.add('hidden');
    codeInput && (codeInput.value = '');
    clearFeedback();
    emailInput!.focus();
  });
}

// ─── GitHub OAuth ─────────────────────────────────────────────────────────────

function initGitHubOAuth(): void {
  const connectDiv  = document.getElementById('github-oauth-connect');
  const connectedDiv = document.getElementById('github-oauth-connected');
  const usernameSpan = document.getElementById('github-oauth-username');
  const errorBox    = document.getElementById('github-oauth-error-box');
  const inviteBtn   = document.getElementById('github-invite-btn') as HTMLButtonElement | null;

  if (!connectDiv || !connectedDiv) return;

  function showConnected(login: string): void {
    connectDiv!.classList.add('hidden');
    connectedDiv!.classList.remove('hidden');
    if (usernameSpan) usernameSpan.textContent = `@${login}`;
    errorBox?.classList.add('hidden');
    if (inviteBtn) inviteBtn.disabled = false;
  }

  function showDisconnected(): void {
    connectDiv!.classList.remove('hidden');
    connectedDiv!.classList.add('hidden');
    if (inviteBtn) inviteBtn.disabled = true;
  }

  async function checkGitHubConnection(): Promise<void> {
    try {
      const res  = await fetch('/api/github-me');
      const data = await res.json();
      if (data.login) showConnected(data.login);
      else            showDisconnected();
    } catch {
      showDisconnected();
    }
  }

  // Handle OAuth redirect result from URL params
  const params = new URLSearchParams(window.location.search);
  const ghParam = params.get('github');
  if (ghParam === 'error') errorBox?.classList.remove('hidden');
  if (ghParam) {
    // Clean up URL without reload
    params.delete('github');
    params.delete('reason');
    const clean = params.toString() ? `?${params}` : window.location.pathname;
    history.replaceState(null, '', clean);
  }

  checkGitHubConnection();
}

// ─── GitHub Invite ────────────────────────────────────────────────────────────

function initGitHubInvite(): void {
  const btn         = document.getElementById('github-invite-btn');
  const nameInput   = document.getElementById('full-name')  as HTMLInputElement | null;
  const zentInput   = document.getElementById('zenturie')   as HTMLInputElement | null;
  const emailInput  = document.getElementById('nak-email')  as HTMLInputElement | null;
  const successBox  = document.getElementById('github-success');
  const errorBox    = document.getElementById('github-error');
  const successText = document.getElementById('github-success-text');
  const errorText   = document.getElementById('github-error-text');
  const btnText     = document.getElementById('github-btn-text');
  const btnIcon     = document.getElementById('github-btn-icon');
  const lanPartyBox = document.getElementById('lan-party-invite');

  if (!btn) return;

  // Pre-fill verified email (readonly field in Step5Profil)
  const verifiedEmail = localStorage.getItem(VERIFIED_EMAIL_KEY);
  if (emailInput && verifiedEmail) emailInput.value = verifiedEmail;

  async function submitInvite(): Promise<void> {
    const fullName = nameInput?.value.trim() ?? '';
    const zenturie = zentInput?.value.trim() ?? '';
    const email    = emailInput?.value.trim() ?? '';

    if (!fullName) { nameInput?.focus(); return; }
    if (!zenturie) { zentInput?.focus(); return; }
    if (!email)    { emailInput?.focus(); return; }

    const heardFrom = document.querySelector<HTMLInputElement>('input[name="heard-from"]:checked')?.value ?? '';
    const interests = Array.from(
      document.querySelectorAll<HTMLInputElement>('input[name="interests"]:checked')
    ).map(cb => cb.value);

    successBox?.classList.add('hidden');
    errorBox?.classList.add('hidden');
    lanPartyBox?.classList.add('hidden');

    if (btnText) btnText.textContent = 'Wird gesendet…';
    if (btnIcon) btnIcon.innerHTML = `<circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2" fill="none" stroke-dasharray="60" stroke-dashoffset="20"/>`;
    btn!.setAttribute('disabled', 'true');

    try {
      const res  = await fetch(TEST_MODE ? '/api/invite?mode=test' : '/api/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // username is not sent – the server reads it from the gh_user cookie
        body: JSON.stringify({ fullName, zenturie, email, heardFrom, interests }),
      });
      const data = await res.json();

      if (res.ok) {
        if (successText) successText.textContent = data.message;
        successBox?.classList.remove('hidden');
        if (data.lanPartyInvite && lanPartyBox) {
          const lanLink = document.getElementById('lan-party-discord-link') as HTMLAnchorElement | null;
          if (lanLink) lanLink.href = data.lanPartyInvite;
          lanPartyBox.classList.remove('hidden');
        }
        checkItem('github'); // auto-check on success
      } else {
        if (errorText) errorText.textContent = data.message || 'Ein unbekannter Fehler ist aufgetreten.';
        errorBox?.classList.remove('hidden');
        btn!.removeAttribute('disabled');
      }
    } catch {
      if (errorText) errorText.textContent = 'Netzwerkfehler. Bitte überprüfe deine Internetverbindung.';
      errorBox?.classList.remove('hidden');
      btn!.removeAttribute('disabled');
    } finally {
      if (btnText) btnText.textContent = 'Absenden & GitHub-Zugang beantragen';
      if (btnIcon) btnIcon.innerHTML = `<path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"/>`;
    }
  }

  btn.addEventListener('click', submitInvite);
}

// ─── Name Validation ──────────────────────────────────────────────────────────

function initNameValidation(): void {
  const input   = document.getElementById('full-name')          as HTMLInputElement | null;
  const icon    = document.getElementById('name-validation-icon');
  const msg     = document.getElementById('name-validation-msg');
  if (!input || !icon || !msg) return;

  const SPINNER = `<svg class="w-4 h-4 text-fsinf-navy/50 dark:text-fsinf-cyan/50 animate-spin" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2.5" stroke-dasharray="40" stroke-dashoffset="15"/></svg>`;
  const CHECK   = `<svg class="w-4 h-4 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg>`;
  const CROSS   = `<svg class="w-4 h-4 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>`;

  function reset() {
    icon.classList.add('hidden');
    icon.innerHTML = '';
    msg.classList.add('hidden');
    msg.textContent = '';
    input.classList.remove('border-green-400', 'border-red-400');
    input.classList.add('border-fsinf-navy/30', 'dark:border-fsinf-cyan/30');
  }

  function setValid() {
    icon.innerHTML = CHECK;
    icon.classList.remove('hidden');
    msg.classList.add('hidden');
    input.classList.remove('border-fsinf-navy/30', 'border-red-400');
    input.classList.add('border-green-400');
  }

  function setInvalid() {
    icon.innerHTML = CROSS;
    icon.classList.remove('hidden');
    msg.textContent = 'Das sieht nicht wie ein echter Name aus. Memes sind eher das Metier von SchaberNAK – schau mal vorbei: dasistschoen.de';
    msg.className   = 'text-sm mt-1.5 text-red-600 dark:text-red-400';
    msg.classList.remove('hidden');
    input.classList.remove('border-fsinf-navy/30', 'border-green-400');
    input.classList.add('border-red-400');
  }

  input.addEventListener('blur', async () => {
    const name = input.value.trim();
    if (!name) { reset(); return; }

    icon.innerHTML = SPINNER;
    icon.classList.remove('hidden');
    msg.classList.add('hidden');

    try {
      const res  = await fetch('/api/validate-name', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      data.valid ? setValid() : setInvalid();
    } catch {
      reset(); // fail open on network error
    }
  });

  // Reset styling when user starts typing again
  input.addEventListener('input', () => {
    if (msg.textContent) reset();
  });
}

// ─── Test Mode ────────────────────────────────────────────────────────────────

const TEST_BACKDOOR_SKEY = 'fsinf-test-backdoor';

function getTestBackdoor(): string {
  return (document.getElementById('test-backdoor-input') as HTMLInputElement | null)?.value.trim() ?? '';
}

function initTestMode(): void {
  document.getElementById('test-mode-banner')?.classList.remove('hidden');

  const backdoorInput = document.getElementById('test-backdoor-input') as HTMLInputElement | null;
  if (backdoorInput) {
    backdoorInput.value = sessionStorage.getItem(TEST_BACKDOOR_SKEY) ?? '';
    backdoorInput.addEventListener('input', () => {
      sessionStorage.setItem(TEST_BACKDOOR_SKEY, backdoorInput.value);
    });
  }

  const toggle = document.getElementById('test-panel-toggle');
  const panel = document.getElementById('test-panel');
  const chevron = document.getElementById('test-panel-chevron');
  let panelOpen = false;
  toggle?.addEventListener('click', () => {
    panelOpen = !panelOpen;
    panel?.classList.toggle('hidden', !panelOpen);
    chevron?.classList.toggle('rotate-180', panelOpen);
  });

  document.getElementById('test-run-checks-btn')?.addEventListener('click', runHealthChecks);

  document.getElementById('test-reset-progress-btn')?.addEventListener('click', () => {
    [CHECKLIST_KEY, INTRO_DONE_KEY, MAX_STEP_KEY, VERIFIED_EMAIL_KEY, INVITE_LINKS_KEY]
      .forEach(k => localStorage.removeItem(k));
    window.location.reload();
  });

  injectTestSkipButtons();
}

async function runHealthChecks(): Promise<void> {
  const resultsEl = document.getElementById('test-check-results');
  const listEl    = document.getElementById('test-check-results-list');
  if (!listEl || !resultsEl) return;

  resultsEl.classList.remove('hidden');
  listEl.innerHTML = '';

  const backdoor = getTestBackdoor();

  type CheckResult = { ok: boolean; detail?: string };
  const checks: Array<{ label: string; run: () => Promise<CheckResult> }> = [
    {
      label: 'Hauptseite erreichbar',
      run: async () => {
        const t0  = Date.now();
        const res = await fetch('/', { redirect: 'follow' });
        return { ok: res.ok, detail: `HTTP ${res.status} (${Date.now() - t0}ms)` };
      },
    },
    {
      label: 'SMTP-Verbindung (Mailserver)',
      run: async () => {
        if (!backdoor) return { ok: false, detail: 'Kein Backdoor-Key eingetragen' };
        const res = await fetch(`/api/test-smtp?backdoor=${encodeURIComponent(backdoor)}`);
        const d   = await res.json().catch(() => ({})) as { ok?: boolean; user?: string; host?: string; error?: string };
        if (d.ok) return { ok: true, detail: `${d.user} → ${d.host}` };
        return { ok: false, detail: d.error ?? `HTTP ${res.status}` };
      },
    },
    {
      label: 'GitHub OAuth Redirect',
      run: async () => {
        const res = await fetch('/api/github-auth', { redirect: 'manual' });
        const ok  = res.status === 302 || res.status === 301;
        return { ok, detail: `HTTP ${res.status}${ok ? ' ✓' : ' — kein Redirect erwartet'}` };
      },
    },
    {
      label: 'E-Mail-Verify API (Validierung)',
      run: async () => {
        const res = await fetch('/api/verify-email', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ email: 'kein-nak-email@gmail.com' }),
        });
        const ok = res.status === 422 || res.status === 400;
        return { ok, detail: `Erwartet 4xx, erhalten: ${res.status}` };
      },
    },
    {
      label: 'Invite API (Auth-Prüfung)',
      run: async () => {
        const res = await fetch('/api/invite', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ fullName: 'Test', zenturie: 'I25', email: 'test@nordakademie.de' }),
        });
        return { ok: res.status === 403, detail: `Erwartet 403, erhalten: ${res.status}` };
      },
    },
    {
      label: 'Test-Setup Backdoor',
      run: async () => {
        if (!backdoor) return { ok: false, detail: 'Kein Backdoor-Key eingetragen' };
        const res = await fetch('/api/test-setup', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ backdoor, email: 'health-check@nordakademie.de', ghUser: 'health-check' }),
        });
        return { ok: res.ok, detail: `HTTP ${res.status}` };
      },
    },
    {
      label: 'Antwortzeit < 1500ms',
      run: async () => {
        const t0 = Date.now();
        await fetch('/api/github-me');
        const ms = Date.now() - t0;
        return { ok: ms < 1500, detail: `${ms}ms` };
      },
    },
  ];

  const SPINNER_SVG = `<svg class="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2.5" stroke-dasharray="40" stroke-dashoffset="15" opacity="0.4"/><path d="M12 2a10 10 0 0110 10" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/></svg>`;
  const CHECK_SVG   = `<svg class="w-4 h-4 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg>`;
  const CROSS_SVG   = `<svg class="w-4 h-4 text-red-500"   fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>`;

  for (const check of checks) {
    const row = document.createElement('div');
    row.className = 'flex items-center gap-2 text-xs px-2.5 py-1.5 rounded-lg bg-amber-50/80';
    row.innerHTML = `<span class="w-4 h-4 flex items-center justify-center shrink-0 text-amber-500">${SPINNER_SVG}</span><span class="font-medium text-amber-900 flex-1">${check.label}</span><span class="text-amber-700/60 tabular-nums shrink-0"></span>`;
    listEl.appendChild(row);

    try {
      const result  = await check.run();
      const iconEl  = row.children[0] as HTMLElement;
      const detailEl = row.children[2] as HTMLElement;
      iconEl.innerHTML   = result.ok ? CHECK_SVG : CROSS_SVG;
      detailEl.textContent = result.detail ?? '';
      row.className = `flex items-center gap-2 text-xs px-2.5 py-1.5 rounded-lg border ${result.ok ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`;
    } catch (err) {
      const iconEl   = row.children[0] as HTMLElement;
      const detailEl = row.children[2] as HTMLElement;
      iconEl.innerHTML     = CROSS_SVG;
      detailEl.textContent = String(err);
      row.className = 'flex items-center gap-2 text-xs px-2.5 py-1.5 rounded-lg border bg-red-50 border-red-200';
    }
  }
}

function injectTestSkipButtons(): void {
  const emailStep      = document.querySelector<HTMLElement>('[data-step="email-verify"]');
  const emailContainer = emailStep?.querySelector<HTMLElement>('.w-full.max-w-sm');
  if (emailContainer) {
    const btn = document.createElement('button');
    btn.type      = 'button';
    btn.id        = 'test-skip-email-btn';
    btn.className = 'w-full mt-2 inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-medium text-amber-800 bg-amber-100 border border-amber-300 rounded-xl hover:bg-amber-200 transition-colors';
    btn.innerHTML = `<svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M13 5l7 7-7 7M5 5l7 7-7 7"/></svg>E-Mail-Verifizierung überspringen (Testmodus)`;
    btn.addEventListener('click', skipEmailVerification);
    emailContainer.appendChild(btn);
  }

  const githubConnect = document.getElementById('github-oauth-connect');
  if (githubConnect) {
    const wrap = document.createElement('div');
    wrap.id        = 'test-skip-github-wrap';
    wrap.className = 'mt-3 p-3 bg-amber-50 border border-amber-200 rounded-xl space-y-2';
    wrap.innerHTML = `
      <p class="text-xs font-semibold text-amber-800">⚡ Testmodus: GitHub OAuth überspringen</p>
      <div class="flex gap-2">
        <input id="test-skip-github-input" type="text" placeholder="GitHub-Nutzername (z.B. octocat)"
               class="flex-1 px-2.5 py-1.5 text-sm rounded-lg border border-amber-300 bg-white focus:outline-none focus:border-amber-500" />
        <button id="test-skip-github-btn" type="button"
                class="px-3 py-1.5 text-xs font-semibold text-amber-800 bg-amber-200 border border-amber-300 rounded-lg hover:bg-amber-300 transition-colors whitespace-nowrap">
          Überspringen
        </button>
      </div>`;
    githubConnect.appendChild(wrap);
    document.getElementById('test-skip-github-btn')?.addEventListener('click', skipGitHubOAuth);
  }
}

async function skipEmailVerification(): Promise<void> {
  const emailInput = document.getElementById('verify-email-input') as HTMLInputElement | null;
  const email      = emailInput?.value.trim() || 'test@nordakademie.de';
  const backdoor   = getTestBackdoor();

  if (backdoor) {
    try {
      await fetch('/api/test-setup', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ backdoor, email, ghUser: 'skip-placeholder' }),
      });
    } catch { /* best-effort */ }
  }

  localStorage.setItem(VERIFIED_EMAIL_KEY, email);
  localStorage.setItem(INVITE_LINKS_KEY, JSON.stringify({}));
  checkItem('email-verified');

  if (emailInput) { emailInput.value = email; emailInput.readOnly = true; }
  document.getElementById('email-send-section')?.classList.add('opacity-50');
  document.getElementById('email-verify-section')?.classList.add('hidden');
  document.getElementById('email-verify-info')?.classList.add('hidden');
  document.getElementById('email-verify-error')?.classList.add('hidden');
  const successEmail = document.getElementById('email-verify-success-email');
  if (successEmail) successEmail.textContent = email;
  document.getElementById('email-verify-success')?.classList.remove('hidden');
  document.getElementById('test-skip-email-btn')?.remove();
}

async function skipGitHubOAuth(): Promise<void> {
  const ghInput = document.getElementById('test-skip-github-input') as HTMLInputElement | null;
  const ghUser  = ghInput?.value.trim() ?? '';
  if (!ghUser) { ghInput?.focus(); return; }

  const email    = localStorage.getItem(VERIFIED_EMAIL_KEY) ?? 'test@nordakademie.de';
  const backdoor = getTestBackdoor();

  if (backdoor) {
    try {
      await fetch('/api/test-setup', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ backdoor, email, ghUser }),
      });
    } catch { /* best-effort */ }
  }

  document.getElementById('github-oauth-connect')?.classList.add('hidden');
  const connected = document.getElementById('github-oauth-connected');
  connected?.classList.remove('hidden');
  const usernameSpan = document.getElementById('github-oauth-username');
  if (usernameSpan) usernameSpan.textContent = `@${ghUser}`;

  const inviteBtn = document.getElementById('github-invite-btn') as HTMLButtonElement | null;
  if (inviteBtn) inviteBtn.disabled = false;

  document.getElementById('test-skip-github-wrap')?.remove();
}

// ─── Init ─────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  initChecklist();
  initNavigation();
  initEmailVerify();
  loadAndApplyInviteLinks();
  initGitHubOAuth();
  initGitHubInvite();
  initNameValidation();

  if (TEST_MODE) initTestMode();

  const savedMax = parseInt(localStorage.getItem(MAX_STEP_KEY) ?? '0', 10);
  maxReachedStep = Math.max(0, savedMax);
  goToStep(Math.min(maxReachedStep, TOTAL_STEPS - 1));
});
