/* ============================================================
   SEN PARENT COMPANION — App Logic
   Screen-based navigation, Supabase auth + data persistence
   ============================================================ */

// --- Screen titles mapping ---
const SCREEN_TITLES = {
  'home': 'Home',
  'ehcp': 'EHCP Tracker',
  'evidence-vault': 'Evidence Vault',
  'evidence-form': 'Add Evidence',
  'provision-map': 'Provision Map',
  'timeline': 'Review Timeline',
  'therapy': 'Therapy Profile',
  'sensory-profile': 'Sensory Assessment',
  'ot-log': 'OT Log',
  'ot-log-form': 'New OT Session',
  'salt-log': 'SALT Log',
  'salt-log-form': 'New SALT Session',
  'grants': 'Grant Library',
  'grant-checker': 'Eligibility Checker',
  'grant-catalog': 'Grant Catalogue',
  'journal-entry': "Today's Journal",
  'analytics': 'Pattern Analytics',
  'export': 'Export & Share',
  'shop': 'Recommended Shops'
};

// --- Tab-to-screen mapping ---
const TAB_SCREENS = {
  'home': ['home'],
  'ehcp': ['ehcp', 'evidence-vault', 'evidence-form', 'provision-map', 'timeline'],
  'therapy': ['therapy', 'sensory-profile', 'ot-log', 'ot-log-form', 'salt-log', 'salt-log-form'],
  'grants': ['grants', 'grant-checker', 'grant-catalog'],
  'journal': ['journal-entry', 'analytics']
};

// --- Navigation stack ---
let navStack = ['home'];
let currentScreen = 'home';

// --- App state (replaces hardcoded demo data) ---
let currentUser = null;
let currentChild = null;
let evidenceData = [];
let otSessions = [];
let saltSessions = [];

const AREA_LABELS = { 'ci': 'C&I', 'cl': 'C&L', 'semh': 'SEMH', 'sp': 'S&P' };
const AREA_COLORS = {
  'ci': 'var(--area-ci)', 'cl': 'var(--area-cl)',
  'semh': 'var(--area-semh)', 'sp': 'var(--area-sp)'
};
const ICON_SVG = {
  speech: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
  letter: '<path d="M4 4h16v16H4z M4 4l8 8 8-8"/>',
  therapy: '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4l-6.3 6.3a2 2 0 0 0 2.8 2.8l6.3-6.3a4 4 0 0 0 5.4-5.4l-2.1 2.1a2 2 0 0 1-2.8-2.8z"/>',
  school: '<path d="M22 10L12 5 2 10l10 5 10-5z M6 12v5c0 1 3 3 6 3s6-2 6-3v-5"/>',
  journal: '<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>',
  document: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6"/>'
};

function iconForDocType(type) {
  const map = {
    'Professional report': 'therapy',
    'School report': 'school',
    'Medical letter': 'document',
    'Correspondence with LA': 'letter',
    'Parent observation': 'journal',
    'Provision record': 'document'
  };
  return map[type] || 'document';
}

/* ============================================================
   AUTH
   ============================================================ */
let authMode = 'signin'; // or 'signup'

function setAuthError(msg) {
  const el = document.getElementById('authError');
  if (msg) {
    el.textContent = msg;
    el.hidden = false;
  } else {
    el.hidden = true;
  }
}

document.getElementById('authToggle').addEventListener('click', () => {
  authMode = authMode === 'signin' ? 'signup' : 'signin';
  document.getElementById('authSub').textContent =
    authMode === 'signin' ? 'Sign in to your account' : 'Create your account';
  document.getElementById('authSubmitBtn').textContent =
    authMode === 'signin' ? 'Sign in' : 'Sign up';
  document.getElementById('authToggle').textContent =
    authMode === 'signin' ? "Don't have an account? Sign up" : 'Already have an account? Sign in';
  setAuthError(null);
});

document.getElementById('authForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  setAuthError(null);
  const email = document.getElementById('authEmail').value.trim();
  const password = document.getElementById('authPassword').value;
  const btn = document.getElementById('authSubmitBtn');
  btn.disabled = true;

  try {
    if (authMode === 'signup') {
      const { error } = await supabaseClient.auth.signUp({ email, password });
      if (error) throw error;
      setAuthError('Account created — check your email if confirmation is required, then sign in.');
    } else {
      const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
      if (error) throw error;
      // onAuthStateChange below handles the transition to the app
    }
  } catch (err) {
    setAuthError(err.message || 'Something went wrong. Please try again.');
  } finally {
    btn.disabled = false;
  }
});

document.getElementById('signOutBtn').addEventListener('click', async () => {
  await supabaseClient.auth.signOut();
});

document.getElementById('signOutBtnBar').addEventListener('click', async () => {
  await supabaseClient.auth.signOut();
});

supabaseClient.auth.onAuthStateChange((_event, session) => {
  if (session && session.user) {
    currentUser = session.user;
    enterApp();
  } else {
    currentUser = null;
    currentChild = null;
    showAuthScreen();
  }
});

function showAuthScreen() {
  document.getElementById('authScreen').hidden = false;
  document.getElementById('appRoot').hidden = true;
}

async function enterApp() {
  document.getElementById('authScreen').hidden = true;
  document.getElementById('appRoot').hidden = false;
  await ensureChildProfile();
  await Promise.all([loadEvidence(), loadOtSessions(), loadSaltSessions()]);
  navigate('home');
}

/* ============================================================
   CHILD PROFILE
   ============================================================ */
async function ensureChildProfile() {
  const { data, error } = await supabaseClient
    .from('children')
    .select('*')
    .eq('parent_id', currentUser.id)
    .order('created_at', { ascending: true })
    .limit(1);

  if (error) {
    console.error('Failed to load child profile:', error);
    return;
  }

  if (data && data.length > 0) {
    currentChild = data[0];
  } else {
    // First login — create a placeholder profile the parent can edit
    const { data: created, error: insertError } = await supabaseClient
      .from('children')
      .insert({ parent_id: currentUser.id, name: 'My Child' })
      .select()
      .single();
    if (insertError) {
      console.error('Failed to create child profile:', insertError);
      return;
    }
    currentChild = created;
  }
  renderChildBanner();
}

function renderChildBanner() {
  if (!currentChild) return;
  document.getElementById('childAvatar').textContent = (currentChild.name || '?').charAt(0).toUpperCase();
  document.getElementById('childName').textContent = currentChild.name || 'Unnamed';
  const metaParts = [];
  if (currentChild.age) metaParts.push(`Age ${currentChild.age}`);
  if (currentChild.school_stage) metaParts.push(currentChild.school_stage);
  metaParts.push(currentChild.ehcp_ref ? 'EHCP in place' : 'No EHCP on file');
  document.getElementById('childMeta').textContent = metaParts.join(' · ');
}

document.getElementById('childEditBtn').addEventListener('click', openChildEditModal);

function openChildEditModal() {
  const modal = document.getElementById('modalOverlay');
  document.getElementById('modalTitle').textContent = 'Edit Child Profile';
  const c = currentChild || {};
  document.getElementById('modalBody').innerHTML = `
    <form class="app-form" id="childEditForm">
      <div class="form-group">
        <label class="form-label" for="ceName">Child's name</label>
        <input type="text" class="form-input" id="ceName" value="${escapeAttr(c.name || '')}" required />
      </div>
      <div class="form-group">
        <label class="form-label" for="ceAge">Age</label>
        <input type="number" class="form-input" id="ceAge" value="${c.age || ''}" min="0" max="25" />
      </div>
      <div class="form-group">
        <label class="form-label" for="ceStage">School stage</label>
        <input type="text" class="form-input" id="ceStage" value="${escapeAttr(c.school_stage || '')}" placeholder="e.g. Primary" />
      </div>
      <div class="form-group">
        <label class="form-label" for="ceRef">EHCP reference</label>
        <input type="text" class="form-input" id="ceRef" value="${escapeAttr(c.ehcp_ref || '')}" />
      </div>
      <div class="form-group">
        <label class="form-label" for="ceReview">Next review date</label>
        <input type="date" class="form-input" id="ceReview" value="${c.ehcp_review_date || ''}" />
      </div>
      <div class="form-group">
        <label class="form-label" for="ceLA">Local authority</label>
        <input type="text" class="form-input" id="ceLA" value="${escapeAttr(c.local_authority || '')}" />
      </div>
      <button type="submit" class="btn-primary">Save Profile</button>
    </form>
  `;
  modal.classList.add('open');

  document.getElementById('childEditForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const updates = {
      name: document.getElementById('ceName').value.trim(),
      age: parseInt(document.getElementById('ceAge').value, 10) || null,
      school_stage: document.getElementById('ceStage').value.trim() || null,
      ehcp_ref: document.getElementById('ceRef').value.trim() || null,
      ehcp_review_date: document.getElementById('ceReview').value || null,
      local_authority: document.getElementById('ceLA').value.trim() || null
    };
    const { data, error } = await supabaseClient
      .from('children')
      .update(updates)
      .eq('id', currentChild.id)
      .select()
      .single();
    if (error) {
      showToast('Could not save profile: ' + error.message);
      return;
    }
    currentChild = data;
    renderChildBanner();
    closeModal();
    showToast('Profile updated');
  });
}

function escapeAttr(str) {
  return String(str).replace(/"/g, '&quot;');
}

/* ============================================================
   EVIDENCE
   ============================================================ */
async function loadEvidence() {
  if (!currentChild) return;
  const { data, error } = await supabaseClient
    .from('evidence')
    .select('*')
    .eq('child_id', currentChild.id)
    .order('doc_date', { ascending: false });
  if (error) {
    console.error('Failed to load evidence:', error);
    return;
  }
  evidenceData = data.map(row => ({
    id: row.id,
    title: row.title,
    date: formatDate(row.doc_date),
    type: row.doc_type,
    author: row.author,
    areas: row.areas || [],
    action: row.action_required,
    icon: iconForDocType(row.doc_type)
  }));
  renderEvidenceList();
}

function formatDate(isoDate) {
  if (!isoDate) return '';
  const d = new Date(isoDate + 'T00:00:00');
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function renderEvidenceList(filter = 'all') {
  const container = document.getElementById('evidenceList');
  if (!container) return;

  const filtered = filter === 'all'
    ? evidenceData
    : evidenceData.filter(e => e.areas.includes(filter));

  if (filtered.length === 0) {
    container.innerHTML = '<p class="section-sub" style="padding:24px 0;text-align:center;">No evidence yet — tap "Add Evidence" to log your first document.</p>';
    return;
  }

  container.innerHTML = filtered.map(item => `
    <div class="evidence-item">
      <div class="evidence-icon" style="--sen-color: ${AREA_COLORS[item.areas[0]] || 'var(--color-primary)'}">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          ${ICON_SVG[item.icon] || ICON_SVG.document}
        </svg>
      </div>
      <div class="evidence-body">
        <p class="evidence-title">${item.title}</p>
        <p class="evidence-meta">${item.date} · ${item.type || ''} · ${item.author || ''}</p>
        <div class="evidence-tags">
          ${item.areas.map(a => `<span class="evidence-tag" style="--sen-color: ${AREA_COLORS[a]}">${AREA_LABELS[a]}</span>`).join('')}
        </div>
        ${item.action ? '<p class="evidence-action">⚠ Action required</p>' : ''}
      </div>
    </div>
  `).join('');
}

/* ============================================================
   OT / SALT SESSION LOGS
   ============================================================ */
async function loadOtSessions() {
  if (!currentChild) return;
  const { data, error } = await supabaseClient
    .from('ot_sessions')
    .select('*')
    .eq('child_id', currentChild.id)
    .order('session_date', { ascending: false });
  if (error) { console.error('Failed to load OT sessions:', error); return; }
  otSessions = data;
  renderSessionLog(otSessions, 'otLogList', 'otSummaryCount', 'otSummaryTime', 'otSummaryTherapist');
}

async function loadSaltSessions() {
  if (!currentChild) return;
  const { data, error } = await supabaseClient
    .from('salt_sessions')
    .select('*')
    .eq('child_id', currentChild.id)
    .order('session_date', { ascending: false });
  if (error) { console.error('Failed to load SALT sessions:', error); return; }
  saltSessions = data;
  renderSessionLog(saltSessions, 'saltLogList', 'saltSummaryCount', 'saltSummaryTime', 'saltSummaryTherapist', true);
}

function renderSessionLog(sessions, listId, countId, timeId, therapistId, noDuration) {
  const list = document.getElementById(listId);
  document.getElementById(countId).textContent = sessions.length;

  if (!noDuration) {
    const totalMin = sessions.reduce((sum, s) => sum + (s.duration_minutes || 0), 0);
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    document.getElementById(timeId).textContent = h > 0 ? `${h}h ${m}m` : `${m}m`;
  } else {
    document.getElementById(timeId).textContent = '—';
  }
  document.getElementById(therapistId).textContent = sessions[0] ? (sessions[0].therapist || '—') : '—';

  if (sessions.length === 0) {
    list.innerHTML = '<p class="section-sub" style="padding:24px 0;text-align:center;">No sessions logged yet.</p>';
    return;
  }

  list.innerHTML = sessions.map(s => {
    const d = new Date(s.session_date + 'T00:00:00');
    const day = d.getDate();
    const month = d.toLocaleDateString('en-GB', { month: 'short' });
    const metaParts = [s.setting, s.duration_minutes ? `${s.duration_minutes} min` : null,
      (s.focus && s.focus.length) ? `Focus: ${s.focus.join(', ')}` : null].filter(Boolean);
    return `
      <div class="log-entry">
        <div class="log-entry-date">
          <p class="log-entry-day">${day}</p>
          <p class="log-entry-month">${month}</p>
        </div>
        <div class="log-entry-body">
          <p class="log-entry-title">${s.therapist ? 'Session — ' + s.therapist : 'Session'}</p>
          <p class="log-entry-meta">${metaParts.join(' · ')}</p>
          ${s.recommendations ? `<p class="log-entry-notes">${s.recommendations}</p>` : ''}
        </div>
      </div>
    `;
  }).join('');
}

/* ============================================================
   NAVIGATION
   ============================================================ */
function navigate(screenId) {
  const screens = document.querySelectorAll('.screen');
  screens.forEach(s => s.classList.remove('active'));

  const target = document.querySelector(`[data-screen="${screenId}"]`);
  if (!target) {
    console.warn('Screen not found:', screenId);
    return;
  }

  target.classList.add('active');
  currentScreen = screenId;

  document.getElementById('appBarTitle').textContent = SCREEN_TITLES[screenId] || 'SEN Companion';

  const backBtn = document.getElementById('backBtn');
  const isRoot = screenId === 'home' || isTabRoot(screenId);
  backBtn.hidden = isRoot;

  if (navStack[navStack.length - 1] !== screenId) {
    if (isTabRoot(screenId)) {
      navStack = [screenId];
    } else {
      navStack.push(screenId);
    }
  }

  updateTabBar(screenId);
  document.getElementById('screenContainer').scrollTop = 0;
}

function navigateBack() {
  if (navStack.length > 1) {
    navStack.pop();
    const prev = navStack[navStack.length - 1];
    navigate(prev);
  } else {
    navigate('home');
  }
}

function isTabRoot(screenId) {
  for (const tab in TAB_SCREENS) {
    if (TAB_SCREENS[tab][0] === screenId) return true;
  }
  return false;
}

function updateTabBar(screenId) {
  document.querySelectorAll('.tab-item').forEach(tab => {
    const tabName = tab.dataset.tab;
    const screens = TAB_SCREENS[tabName] || [];
    tab.classList.toggle('active', screens.includes(screenId));
  });
}

function navigateToArea(area) {
  navigate('evidence-vault');
  setTimeout(() => filterEvidence(area), 100);
}

document.getElementById('backBtn').addEventListener('click', navigateBack);

/* ============================================================
   THEME TOGGLE
   ============================================================ */
(function () {
  const toggle = document.getElementById('themeToggle');
  const root = document.documentElement;
  let dark = matchMedia('(prefers-color-scheme:dark)').matches;
  root.setAttribute('data-theme', dark ? 'dark' : 'light');

  function updateIcon() {
    toggle.innerHTML = dark
      ? '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>'
      : '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';
    toggle.setAttribute('aria-label', 'Switch to ' + (dark ? 'light' : 'dark') + ' mode');
  }

  updateIcon();
  toggle.addEventListener('click', () => {
    dark = !dark;
    root.setAttribute('data-theme', dark ? 'dark' : 'light');
    updateIcon();
  });
})();

/* ============================================================
   STATUS BAR CLOCK
   ============================================================ */
function updateClock() {
  const now = new Date();
  const h = now.getHours();
  const m = now.getMinutes().toString().padStart(2, '0');
  document.getElementById('statusTime').textContent = `${h}:${m}`;
}
updateClock();
setInterval(updateClock, 1000);

/* ============================================================
   FILTER CHIPS (Evidence Vault)
   ============================================================ */
document.querySelectorAll('.filter-chip').forEach(chip => {
  chip.addEventListener('click', () => {
    document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    filterEvidence(chip.dataset.filter);
  });
});

function filterEvidence(area) {
  document.querySelectorAll('.filter-chip').forEach(c => {
    c.classList.toggle('active', c.dataset.filter === area);
  });
  renderEvidenceList(area);
}

/* ============================================================
   GENERIC CHIP / PILL / EMOJI TOGGLES (unchanged UI behaviour)
   ============================================================ */
document.querySelectorAll('.chip-group').forEach(group => {
  group.querySelectorAll('.chip').forEach(chip => {
    chip.addEventListener('click', () => chip.classList.toggle('active'));
  });
});

document.querySelectorAll('.severity-pills').forEach(group => {
  group.querySelectorAll('.severity-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      group.querySelectorAll('.severity-pill').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
    });
  });
});

document.querySelectorAll('.emoji-row').forEach(row => {
  row.querySelectorAll('.emoji-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      row.querySelectorAll('.emoji-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });
});

document.querySelectorAll('.wizard-option').forEach(opt => {
  opt.addEventListener('click', () => {
    const parent = opt.closest('.wizard-options');
    parent.querySelectorAll('.wizard-option').forEach(o => o.classList.remove('active'));
    opt.classList.add('active');
  });
});

document.querySelectorAll('.format-option').forEach(opt => {
  opt.addEventListener('click', () => {
    document.querySelectorAll('.format-option').forEach(o => o.classList.remove('active'));
    opt.classList.add('active');
  });
});

document.getElementById('evAction').addEventListener('change', (e) => {
  document.getElementById('evActionDateGroup').hidden = !e.target.checked;
});

/* ============================================================
   FORM SUBMISSIONS — now writing to Supabase
   ============================================================ */
function getActiveChipValues(container) {
  return Array.from(container.querySelectorAll('.chip.active')).map(c => c.textContent.trim());
}

document.getElementById('evidenceForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!currentChild) return;

  const areas = Array.from(document.querySelectorAll('#evAreaChips .chip.active')).map(c => c.dataset.area);
  const payload = {
    child_id: currentChild.id,
    parent_id: currentUser.id,
    title: document.getElementById('evTitle').value.trim(),
    doc_date: document.getElementById('evDate').value || null,
    doc_type: document.getElementById('evType').value || null,
    author: document.getElementById('evAuthor').value.trim() || null,
    summary: document.getElementById('evSummary').value.trim() || null,
    areas,
    action_required: document.getElementById('evAction').checked,
    action_due_date: document.getElementById('evActionDate').value || null
  };

  if (!payload.title || !payload.doc_date || areas.length === 0) {
    showToast('Please fill in title, date and at least one SEN area');
    return;
  }

  const { error } = await supabaseClient.from('evidence').insert(payload);
  if (error) {
    showToast('Could not save: ' + error.message);
    return;
  }

  showToast('Evidence saved to vault');
  e.target.reset();
  document.querySelectorAll('#evAreaChips .chip').forEach(c => c.classList.remove('active'));
  await loadEvidence();
  navigate('evidence-vault');
});

document.getElementById('otLogForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!currentChild) return;

  const chipGroups = e.target.querySelectorAll('.chip-group');
  const focus = getActiveChipValues(chipGroups[0]);
  const areas = Array.from(chipGroups[1].querySelectorAll('.chip.active')).map(c => c.dataset.area || c.textContent.trim());

  const payload = {
    child_id: currentChild.id,
    parent_id: currentUser.id,
    session_date: document.getElementById('otDate').value || null,
    therapist: document.getElementById('otTherapist').value.trim() || null,
    setting: document.getElementById('otSetting').value || null,
    duration_minutes: parseInt(document.getElementById('otDuration').value, 10) || null,
    focus,
    areas,
    observations: document.getElementById('otObs').value.trim() || null,
    recommendations: document.getElementById('otRec').value.trim() || null,
    equipment: document.getElementById('otEquip').value.trim() || null
  };

  if (!payload.session_date || !payload.recommendations) {
    showToast('Please fill in date and recommendations');
    return;
  }

  const { error } = await supabaseClient.from('ot_sessions').insert(payload);
  if (error) { showToast('Could not save: ' + error.message); return; }

  showToast('OT session saved');
  e.target.reset();
  e.target.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
  await loadOtSessions();
  navigateBack();
});

document.getElementById('saltLogForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!currentChild) return;

  const chipGroup = e.target.querySelector('.chip-group');
  const focus = getActiveChipValues(chipGroup);

  const payload = {
    child_id: currentChild.id,
    parent_id: currentUser.id,
    session_date: document.getElementById('saltDate').value || null,
    therapist: document.getElementById('saltTherapist').value.trim() || null,
    focus,
    assessment_tool: document.getElementById('saltAssess').value.trim() || null,
    observations: document.getElementById('saltObs').value.trim() || null,
    recommendations: document.getElementById('saltRec').value.trim() || null,
    aac: document.getElementById('saltAac').value.trim() || null
  };

  if (!payload.session_date || !payload.recommendations) {
    showToast('Please fill in date and recommendations');
    return;
  }

  const { error } = await supabaseClient.from('salt_sessions').insert(payload);
  if (error) { showToast('Could not save: ' + error.message); return; }

  showToast('SALT session saved');
  e.target.reset();
  e.target.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
  await loadSaltSessions();
  navigateBack();
});

document.getElementById('journalForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!currentChild) return;

  const chipGroups = e.target.querySelectorAll('.chip-group');
  const areas = Array.from(chipGroups[1].querySelectorAll('.chip.active')).map(c => c.dataset.area || c.textContent.trim())
    .filter(a => ['ci', 'cl', 'semh', 'sp'].includes(a));

  const moodRows = e.target.querySelectorAll('.emoji-row');
  const moodAfter = moodRows[1] ? moodRows[1].querySelector('.emoji-btn.active') : null;

  const payload = {
    child_id: currentChild.id,
    parent_id: currentUser.id,
    entry_date: new Date().toISOString().split('T')[0],
    mood: moodAfter ? moodAfter.textContent.trim() : null,
    areas,
    trigger: document.getElementById('jrTriggers').value.trim() || null,
    notes: [
      document.getElementById('jrWell').value.trim() ? 'What went well: ' + document.getElementById('jrWell').value.trim() : '',
      document.getElementById('jrChallenges').value.trim() ? 'Challenges: ' + document.getElementById('jrChallenges').value.trim() : '',
      document.getElementById('jrStrategies').value.trim() ? 'Strategies used: ' + document.getElementById('jrStrategies').value.trim() : ''
    ].filter(Boolean).join('\n')
  };

  const { error } = await supabaseClient.from('journal_entries').insert(payload);
  if (error) { showToast('Could not save: ' + error.message); return; }

  showToast('Entry saved successfully');
  e.target.reset();
  e.target.querySelectorAll('.chip, .emoji-btn').forEach(c => c.classList.remove('active'));
  navigateBack();
});

/* ============================================================
   QUICK CAPTURE DRAWER
   ============================================================ */
function openDrawer() {
  document.getElementById('quickCaptureDrawer').classList.add('open');
  document.getElementById('drawerOverlay').classList.add('open');
}
function closeDrawer() {
  document.getElementById('quickCaptureDrawer').classList.remove('open');
  document.getElementById('drawerOverlay').classList.remove('open');
}
document.getElementById('drawerOverlay').addEventListener('click', closeDrawer);

function saveQuickNote() {
  const note = document.getElementById('quickNote').value.trim();
  if (note) {
    showToast('Quick note saved');
    document.getElementById('quickNote').value = '';
  }
  closeDrawer();
}

/* ============================================================
   TOAST
   ============================================================ */
let toastTimer;
function showToast(message) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2500);
}

/* ============================================================
   EXPORT PREVIEW MODAL (still a preview — see SETUP.md for
   what's needed to generate real PDFs/CSVs)
   ============================================================ */
function showExportPreview(title) {
  const modal = document.getElementById('modalOverlay');
  document.getElementById('modalTitle').textContent = title;
  document.getElementById('modalBody').innerHTML = `
    <div style="display:flex;flex-direction:column;gap:12px;">
      <div style="background:var(--color-surface-offset);border-radius:12px;padding:16px;">
        <p style="font-size:13px;font-weight:600;color:var(--color-text-muted);margin-bottom:8px;">Bundle Contents</p>
        <div style="display:flex;flex-direction:column;gap:6px;font-size:13px;">
          <div style="display:flex;align-items:center;gap:8px;">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-success)" stroke-width="2"><path d="M9 12l2 2 4-4"/><circle cx="12" cy="12" r="10"/></svg>
            <span>${evidenceData.length} documents organised by SEN area</span>
          </div>
          <div style="display:flex;align-items:center;gap:8px;">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-success)" stroke-width="2"><path d="M9 12l2 2 4-4"/><circle cx="12" cy="12" r="10"/></svg>
            <span>Cover sheet with child initials & date</span>
          </div>
          <div style="display:flex;align-items:center;gap:8px;">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-success)" stroke-width="2"><path d="M9 12l2 2 4-4"/><circle cx="12" cy="12" r="10"/></svg>
            <span>Table of contents by broad area</span>
          </div>
        </div>
      </div>
      <p style="font-size:12px;color:var(--color-text-faint);text-align:center;">Real PDF/CSV generation isn't wired up yet — see SETUP.md.</p>
    </div>
  `;
  modal.classList.add('open');
}

function closeModal() {
  document.getElementById('modalOverlay').classList.remove('open');
}
document.getElementById('modalOverlay').addEventListener('click', (e) => {
  if (e.target === document.getElementById('modalOverlay')) closeModal();
});

/* ============================================================
   INIT
   ============================================================ */
const today = new Date().toISOString().split('T')[0];
document.querySelectorAll('input[type="date"]').forEach(input => {
  if (!input.value) input.value = today;
});

// Start by checking whether a session already exists (page refresh case)
supabaseClient.auth.getSession().then(({ data: { session } }) => {
  if (session && session.user) {
    currentUser = session.user;
    enterApp();
  } else {
    showAuthScreen();
  }
});
