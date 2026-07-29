// ==========================================================================
// CDXED — Admin panel logic
//
// SECURITY NOTE: the password is never stored or checked in this file.
// The <input type="password"> value is sent straight to Firebase
// Authentication (signInWithEmailAndPassword), which validates it on
// Google's servers. This file only reacts to the auth RESULT
// (onAuthStateChanged). Real protection also depends on firestore.rules
// requiring request.auth != null for writes — see that file.
//
// NO FIREBASE STORAGE: profile photo, certificate badge and project
// video/cover are all just links the admin pastes in — nothing is
// uploaded anywhere, so there's no Storage bucket (and no Blaze plan
// requirement) to worry about. See js/link-utils.js for how a pasted
// video link becomes an embeddable player + a default thumbnail.
// ==========================================================================
import { auth, db } from './firebase-config.js';
import {
  signInWithEmailAndPassword, onAuthStateChanged, signOut,
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js";
import {
  doc, getDoc, setDoc, collection, getDocs, addDoc, updateDoc, deleteDoc,
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";
import { ICON } from './icons.js';
import { parseVideoLink, resolveThumbnail, isPdfUrl } from './link-utils.js';

// The Firebase Auth account used to sign in to this panel. Create this user
// (Authentication → Users → Add user) in the Firebase console — see README.
const ADMIN_EMAIL = 'c0d3xed@gmail.com';

const DEFAULT_PROFILE = {
  name: 'Michel Rezini',
  role: 'Editor de Vídeo — Motion & Storytelling',
  bio: 'Estudo em tempo integral no Instituto Federal Catarinense (IFC), cursando o Ensino Médio integrado ao Técnico em Informática.\n\nUso Shotcut, Photoshop, Clipchamp e Inteligência Artificial como extensão do processo criativo.',
  location: 'Santa Catarina, Brasil',
  education: '2º ano · Téc. em Informática — IFC',
  birthdate: '2009-09-17',
  available: true,
  availableText: '',
  photoURL: '',
  skills: [
    { name: 'Shotcut', level: 90 },
    { name: 'Adobe Photoshop', level: 80 },
    { name: 'Clipchamp', level: 85 },
    { name: 'Inteligência Artificial', level: 75 },
  ],
};

/* ---------------- Helpers ---------------- */
function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[ch]));
}
function formatDate(d) {
  if (!d) return '—';
  const date = new Date(d.length === 10 ? d + 'T00:00:00' : d);
  if (isNaN(date)) return d;
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
}
function showToast(msg, type = 'ok') {
  const toast = document.getElementById('toast');
  document.getElementById('toastMsg').textContent = msg;
  toast.className = `toast show ${type}`;
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => toast.classList.remove('show'), 2800);
}

/* ---------------- Link preview helpers ---------------- */
// Swaps an element's content for an <img>, falling back to the element's
// ORIGINAL markup (captured once, up front) if the link is empty or the
// image fails to load. Used for the photo/badge/cover previews.
function makeImagePreview(el) {
  const fallback = el.innerHTML;
  return (url) => {
    const clean = (url || '').trim();
    if (!clean) { el.innerHTML = fallback; return; }
    const img = document.createElement('img');
    img.alt = '';
    img.addEventListener('error', () => { el.innerHTML = fallback; }, { once: true });
    img.src = clean;
    el.innerHTML = '';
    el.appendChild(img);
  };
}

/* ================= AUTH ================= */
const loginScreen = document.getElementById('loginScreen');
const dashboard = document.getElementById('dashboard');
const loginForm = document.getElementById('loginForm');
const pwInput = document.getElementById('pwInput');
const loginError = document.getElementById('loginError');
const loginErrorMsg = document.getElementById('loginErrorMsg');
const loginSubmitBtn = document.getElementById('loginSubmitBtn');
const loginBtnLabel = document.getElementById('loginBtnLabel');

function friendlyAuthError(code) {
  if (code === 'auth/too-many-requests') return 'Muitas tentativas seguidas. Aguarde alguns minutos e tente de novo.';
  if (code === 'auth/network-request-failed') return 'Falha de conexão. Verifique sua internet.';
  return 'Senha incorreta.';
}

onAuthStateChanged(auth, (user) => {
  if (user) {
    loginScreen.style.display = 'none';
    dashboard.classList.add('active');
    initDashboardData();
  } else {
    loginScreen.style.display = 'flex';
    dashboard.classList.remove('active');
  }
});

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  loginError.classList.remove('show');
  loginSubmitBtn.disabled = true;
  loginBtnLabel.innerHTML = '<span class="spinner"></span>';
  try {
    await signInWithEmailAndPassword(auth, ADMIN_EMAIL, pwInput.value);
    pwInput.value = '';
  } catch (err) {
    loginErrorMsg.textContent = friendlyAuthError(err.code);
    loginError.classList.add('show');
  } finally {
    loginSubmitBtn.disabled = false;
    loginBtnLabel.textContent = 'Entrar';
  }
});

document.getElementById('togglePw').addEventListener('click', () => {
  pwInput.type = pwInput.type === 'password' ? 'text' : 'password';
});
document.getElementById('logoutBtn').addEventListener('click', () => signOut(auth));

/* ================= TABS ================= */
document.querySelectorAll('.tab-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach((p) => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('panel-' + btn.dataset.tab).classList.add('active');
  });
});

async function initDashboardData() {
  await Promise.all([loadProfileIntoForm(), loadCertificates(), loadProjects()]);
}

/* ================= PROFILE ================= */
const updatePhotoPreview = makeImagePreview(document.getElementById('photoPreview'));

async function loadProfileIntoForm() {
  let profile = { ...DEFAULT_PROFILE };
  try {
    const snap = await getDoc(doc(db, 'config', 'profile'));
    if (snap.exists()) profile = { ...profile, ...snap.data() };
  } catch (err) { console.warn('Não foi possível carregar o perfil.', err); }
  fillProfileForm(profile);
}

function fillProfileForm(p) {
  document.getElementById('fName').value = p.name || '';
  document.getElementById('fRole').value = p.role || '';
  document.getElementById('fBio').value = p.bio || '';
  document.getElementById('fLocation').value = p.location || '';
  document.getElementById('fBirthdate').value = p.birthdate || '';
  document.getElementById('fEducation').value = p.education || '';
  document.getElementById('fAvailable').value = String(p.available !== false);
  document.getElementById('fAvailableText').value = p.availableText || '';
  document.getElementById('fPhotoURL').value = p.photoURL || '';
  renderSkillsEditor(p.skills && p.skills.length ? p.skills : DEFAULT_PROFILE.skills);
  updatePhotoPreview(p.photoURL);
}

function renderSkillsEditor(skills) {
  const wrap = document.getElementById('skillsEditor');
  wrap.innerHTML = '';
  skills.forEach((s) => addSkillRow(s.name, s.level));
}
function addSkillRow(name = '', level = 50) {
  const wrap = document.getElementById('skillsEditor');
  const row = document.createElement('div');
  row.className = 'skill-row';
  row.innerHTML = `
    <input type="text" placeholder="Nome da ferramenta" class="skill-name" value="${escapeHtml(name)}">
    <div>
      <input type="range" min="0" max="100" value="${level}" class="skill-level">
      <div class="level-label"><span class="level-val">${level}</span>%</div>
    </div>
    <button type="button" class="icon-btn skill-remove">${ICON.trash}</button>
  `;
  const range = row.querySelector('.skill-level');
  const label = row.querySelector('.level-val');
  range.addEventListener('input', () => { label.textContent = range.value; });
  row.querySelector('.skill-remove').addEventListener('click', () => row.remove());
  wrap.appendChild(row);
}
document.getElementById('addSkillBtn').addEventListener('click', () => addSkillRow());

document.getElementById('fPhotoURL').addEventListener('input', (e) => {
  updatePhotoPreview(e.target.value);
});

document.getElementById('profileForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = document.getElementById('saveProfileBtn');
  btn.disabled = true;
  const original = btn.textContent;
  btn.innerHTML = '<span class="spinner"></span>';
  try {
    const skills = [...document.querySelectorAll('#skillsEditor .skill-row')].map((row) => ({
      name: row.querySelector('.skill-name').value.trim(),
      level: Number(row.querySelector('.skill-level').value),
    })).filter((s) => s.name);

    const payload = {
      name: document.getElementById('fName').value.trim(),
      role: document.getElementById('fRole').value.trim(),
      bio: document.getElementById('fBio').value.trim(),
      location: document.getElementById('fLocation').value.trim(),
      birthdate: document.getElementById('fBirthdate').value,
      education: document.getElementById('fEducation').value.trim(),
      available: document.getElementById('fAvailable').value === 'true',
      availableText: document.getElementById('fAvailableText').value.trim(),
      photoURL: document.getElementById('fPhotoURL').value.trim(),
      skills,
      updatedAt: Date.now(),
    };

    await setDoc(doc(db, 'config', 'profile'), payload, { merge: true });
    showToast('Perfil salvo com sucesso!');
  } catch (err) {
    console.error(err);
    showToast('Erro ao salvar perfil. Tente novamente.', 'err');
  } finally {
    btn.disabled = false;
    btn.textContent = original;
  }
});

/* ================= CERTIFICATES ================= */
let certsCache = [];
let editingCertId = null;
const updateCertBadgePreview = makeCertBadgePreview(document.getElementById('certBadgePreview'));

function makeCertBadgePreview(el) {
  const fallback = el.innerHTML;
  return (url) => {
    const clean = (url || '').trim();
    if (!clean) { el.innerHTML = fallback; return; }
    if (isPdfUrl(clean)) {
      el.innerHTML = `<div class="link-preview-icon">${ICON.fileText}</div><div class="link-preview-text">PDF anexado — abre em uma nova aba no site.</div>`;
      return;
    }
    const img = document.createElement('img');
    img.alt = '';
    img.addEventListener('error', () => {
      el.innerHTML = `<div class="link-preview-icon">${ICON.alert}</div><div class="link-preview-text err">Não consegui carregar essa imagem. Confira o link.</div>`;
    }, { once: true });
    img.addEventListener('load', () => {
      el.innerHTML = '';
      const iconWrap = document.createElement('div');
      iconWrap.className = 'link-preview-icon';
      iconWrap.appendChild(img);
      el.appendChild(iconWrap);
      const text = document.createElement('div');
      text.className = 'link-preview-text';
      text.textContent = 'Imagem carregada com sucesso.';
      el.appendChild(text);
    }, { once: true });
    img.src = clean;
  };
}

async function loadCertificates() {
  try {
    const snap = await getDocs(collection(db, 'certificates'));
    certsCache = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    certsCache.sort((a, b) => new Date(b.startDate || 0) - new Date(a.startDate || 0));
  } catch (err) { console.warn('Não foi possível carregar certificados.', err); certsCache = []; }
  renderCertList();
}

function renderCertList() {
  const wrap = document.getElementById('certList');
  if (!certsCache.length) { wrap.innerHTML = `<div class="empty-note">Nenhum certificado cadastrado ainda.</div>`; return; }
  wrap.innerHTML = certsCache.map((c) => {
    let thumb = ICON.badge;
    if (c.badgeURL && isPdfUrl(c.badgeURL)) thumb = ICON.fileText;
    else if (c.badgeURL) thumb = `<img src="${escapeHtml(c.badgeURL)}" alt="" data-fallback-icon>`;
    return `
    <div class="item-row">
      <div class="item-thumb">${thumb}</div>
      <div class="item-info">
        <h4>${escapeHtml(c.title || '')}</h4>
        <span>${escapeHtml(c.teaches || '')} · ${formatDate(c.startDate)} — ${c.endDate ? formatDate(c.endDate) : 'em andamento'}</span>
      </div>
      <div class="item-actions">
        <button class="icon-btn cert-edit" data-id="${c.id}">${ICON.edit}</button>
        <button class="icon-btn cert-del" data-id="${c.id}">${ICON.trash}</button>
      </div>
    </div>
  `;
  }).join('');
  wrap.querySelectorAll('.item-thumb img[data-fallback-icon]').forEach((img) => {
    img.addEventListener('error', () => { img.parentElement.innerHTML = ICON.badge; }, { once: true });
  });
  wrap.querySelectorAll('.cert-edit').forEach((b) => b.addEventListener('click', () => openCertDrawer(b.dataset.id)));
  wrap.querySelectorAll('.cert-del').forEach((b) => b.addEventListener('click', () => {
    if (confirm('Excluir este certificado? Essa ação não pode ser desfeita.')) deleteCert(b.dataset.id);
  }));
}

function openCertDrawer(id) {
  editingCertId = id || null;
  document.getElementById('certForm').reset();
  document.getElementById('certDeleteBtn').style.display = id ? 'inline-flex' : 'none';
  document.getElementById('certDrawerTitle').textContent = id ? 'Editar certificado' : 'Novo certificado';
  document.getElementById('certId').value = id || '';

  let badgeURL = '';
  if (id) {
    const c = certsCache.find((x) => x.id === id);
    document.getElementById('certTitle').value = c.title || '';
    document.getElementById('certTeaches').value = c.teaches || '';
    document.getElementById('certDescription').value = c.description || '';
    document.getElementById('certStart').value = c.startDate || '';
    document.getElementById('certEnd').value = c.endDate || '';
    badgeURL = c.badgeURL || '';
  }
  document.getElementById('certBadgeURL').value = badgeURL;
  updateCertBadgePreview(badgeURL);
  document.getElementById('certDrawer').classList.add('open');
}
function closeCertDrawer() { document.getElementById('certDrawer').classList.remove('open'); }

document.getElementById('newCertBtn').addEventListener('click', () => openCertDrawer(null));
document.getElementById('certDrawerClose').addEventListener('click', closeCertDrawer);
document.getElementById('certDrawer').addEventListener('click', (e) => { if (e.target.id === 'certDrawer') closeCertDrawer(); });
document.getElementById('certBadgeURL').addEventListener('input', (e) => {
  updateCertBadgePreview(e.target.value);
});

document.getElementById('certForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = document.getElementById('certSaveBtn');
  btn.disabled = true;
  const original = btn.textContent;
  btn.innerHTML = '<span class="spinner"></span>';
  try {
    const payload = {
      title: document.getElementById('certTitle').value.trim(),
      teaches: document.getElementById('certTeaches').value.trim(),
      description: document.getElementById('certDescription').value.trim(),
      startDate: document.getElementById('certStart').value,
      endDate: document.getElementById('certEnd').value || '',
      badgeURL: document.getElementById('certBadgeURL').value.trim(),
    };
    if (editingCertId) {
      await updateDoc(doc(db, 'certificates', editingCertId), payload);
    } else {
      payload.createdAt = Date.now();
      await addDoc(collection(db, 'certificates'), payload);
    }
    showToast('Certificado salvo!');
    closeCertDrawer();
    await loadCertificates();
  } catch (err) {
    console.error(err);
    showToast('Erro ao salvar certificado.', 'err');
  } finally {
    btn.disabled = false;
    btn.textContent = original;
  }
});

document.getElementById('certDeleteBtn').addEventListener('click', () => {
  if (editingCertId && confirm('Excluir este certificado? Essa ação não pode ser desfeita.')) {
    deleteCert(editingCertId);
    closeCertDrawer();
  }
});

async function deleteCert(id) {
  try {
    await deleteDoc(doc(db, 'certificates', id));
    showToast('Certificado excluído.');
    await loadCertificates();
  } catch (err) { console.error(err); showToast('Erro ao excluir certificado.', 'err'); }
}

/* ================= PROJECTS ================= */
let projectsCache = [];
let editingProjectId = null;

function updateProjectPreview() {
  const el = document.getElementById('projVideoPreview');
  const link = document.getElementById('projLink').value.trim();
  const coverURL = document.getElementById('projCoverURL').value.trim();
  const parsed = parseVideoLink(link);

  if (!parsed) {
    el.querySelector('.link-preview-text').textContent = link
      ? 'Link inválido — confira se começa com http:// ou https://.'
      : 'Cole o link do vídeo para ver a prévia aqui.';
    el.querySelector('.link-preview-text').classList.toggle('err', !!link);
    el.querySelector('.link-preview-icon').innerHTML = ICON.video;
    return;
  }

  const platformLabel = { youtube: 'YouTube', vimeo: 'Vimeo', other: 'link externo' }[parsed.platform];
  el.querySelector('.link-preview-text').classList.remove('err');
  el.querySelector('.link-preview-text').textContent = coverURL
    ? `Vídeo do ${platformLabel} — usando a capa que você colou.`
    : `Vídeo do ${platformLabel} — buscando a miniatura padrão...`;
  el.querySelector('.link-preview-icon').innerHTML = ICON.video;

  const effectiveCover = coverURL || null;
  if (effectiveCover) {
    const img = document.createElement('img');
    img.alt = '';
    img.src = effectiveCover;
    img.addEventListener('load', () => { el.querySelector('.link-preview-icon').innerHTML = ''; el.querySelector('.link-preview-icon').appendChild(img); }, { once: true });
    img.addEventListener('error', () => {
      el.querySelector('.link-preview-text').textContent = 'Não consegui carregar essa capa. Confira o link.';
      el.querySelector('.link-preview-text').classList.add('err');
    }, { once: true });
    return;
  }

  resolveThumbnail(parsed).then((thumb) => {
    // Only apply if the link hasn't changed since we started resolving.
    if (document.getElementById('projLink').value.trim() !== link) return;
    if (thumb) {
      const img = document.createElement('img');
      img.alt = '';
      img.src = thumb;
      img.addEventListener('load', () => { el.querySelector('.link-preview-icon').innerHTML = ''; el.querySelector('.link-preview-icon').appendChild(img); }, { once: true });
      el.querySelector('.link-preview-text').textContent = `Vídeo do ${platformLabel} — usando a miniatura padrão dele.`;
    } else {
      el.querySelector('.link-preview-text').textContent = `Vídeo do ${platformLabel} — sem miniatura automática; adicione uma capa se quiser.`;
    }
  });
}

async function loadProjects() {
  try {
    const snap = await getDocs(collection(db, 'projects'));
    projectsCache = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    projectsCache.sort((a, b) => new Date(b.dateDelivered || b.createdAt || 0) - new Date(a.dateDelivered || a.createdAt || 0));
  } catch (err) { console.warn('Não foi possível carregar projetos.', err); projectsCache = []; }
  renderProjectList();
}

function renderProjectList() {
  const wrap = document.getElementById('projectList');
  if (!projectsCache.length) { wrap.innerHTML = `<div class="empty-note">Nenhum projeto cadastrado ainda.</div>`; return; }
  wrap.innerHTML = projectsCache.map((p) => {
    const cover = p.coverURL || (parseVideoLink(p.videoLink) || {}).thumbnailUrl || '';
    const thumb = cover
      ? `<img src="${escapeHtml(cover)}" alt="" data-fallback-icon>`
      : ICON.video;
    return `
    <div class="item-row">
      <div class="item-thumb">${thumb}</div>
      <div class="item-info">
        <h4>${escapeHtml(p.title || '')}</h4>
        <span>${escapeHtml(p.client || '')} · entregue em ${formatDate(p.dateDelivered)}</span>
      </div>
      <div class="item-actions">
        <button class="icon-btn proj-edit" data-id="${p.id}">${ICON.edit}</button>
        <button class="icon-btn proj-del" data-id="${p.id}">${ICON.trash}</button>
      </div>
    </div>
  `;
  }).join('');
  wrap.querySelectorAll('.item-thumb img[data-fallback-icon]').forEach((img) => {
    img.addEventListener('error', () => { img.parentElement.innerHTML = ICON.video; }, { once: true });
  });
  wrap.querySelectorAll('.proj-edit').forEach((b) => b.addEventListener('click', () => openProjectDrawer(b.dataset.id)));
  wrap.querySelectorAll('.proj-del').forEach((b) => b.addEventListener('click', () => {
    if (confirm('Excluir este projeto? Essa ação não pode ser desfeita.')) deleteProject(b.dataset.id);
  }));
}

function openProjectDrawer(id) {
  editingProjectId = id || null;
  document.getElementById('projectForm').reset();
  document.getElementById('projectDeleteBtn').style.display = id ? 'inline-flex' : 'none';
  document.getElementById('projectDrawerTitle').textContent = id ? 'Editar projeto' : 'Novo projeto';
  document.getElementById('projectId').value = id || '';

  if (id) {
    const p = projectsCache.find((x) => x.id === id);
    document.getElementById('projTitle').value = p.title || '';
    document.getElementById('projClient').value = p.client || '';
    document.getElementById('projDescription').value = p.description || '';
    document.getElementById('projLink').value = p.videoLink || '';
    document.getElementById('projCoverURL').value = p.coverURL || '';
    document.getElementById('projReceived').value = p.dateReceived || '';
    document.getElementById('projDelivered').value = p.dateDelivered || '';
  }
  updateProjectPreview();
  document.getElementById('projectDrawer').classList.add('open');
}
function closeProjectDrawer() { document.getElementById('projectDrawer').classList.remove('open'); }

document.getElementById('newProjectBtn').addEventListener('click', () => openProjectDrawer(null));
document.getElementById('projectDrawerClose').addEventListener('click', closeProjectDrawer);
document.getElementById('projectDrawer').addEventListener('click', (e) => { if (e.target.id === 'projectDrawer') closeProjectDrawer(); });
document.getElementById('projLink').addEventListener('input', updateProjectPreview);
document.getElementById('projCoverURL').addEventListener('input', updateProjectPreview);

document.getElementById('projectForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = document.getElementById('projectSaveBtn');
  btn.disabled = true;
  const original = btn.textContent;
  btn.innerHTML = '<span class="spinner"></span>';
  try {
    const payload = {
      title: document.getElementById('projTitle').value.trim(),
      client: document.getElementById('projClient').value.trim(),
      description: document.getElementById('projDescription').value.trim(),
      videoLink: document.getElementById('projLink').value.trim(),
      coverURL: document.getElementById('projCoverURL').value.trim(),
      dateReceived: document.getElementById('projReceived').value,
      dateDelivered: document.getElementById('projDelivered').value,
    };
    if (editingProjectId) {
      await updateDoc(doc(db, 'projects', editingProjectId), payload);
    } else {
      payload.createdAt = Date.now();
      await addDoc(collection(db, 'projects'), payload);
    }
    showToast('Projeto salvo!');
    closeProjectDrawer();
    await loadProjects();
  } catch (err) {
    console.error(err);
    showToast('Erro ao salvar projeto.', 'err');
  } finally {
    btn.disabled = false;
    btn.textContent = original;
  }
});

document.getElementById('projectDeleteBtn').addEventListener('click', () => {
  if (editingProjectId && confirm('Excluir este projeto? Essa ação não pode ser desfeita.')) {
    deleteProject(editingProjectId);
    closeProjectDrawer();
  }
});

async function deleteProject(id) {
  try {
    await deleteDoc(doc(db, 'projects', id));
    showToast('Projeto excluído.');
    await loadProjects();
  } catch (err) { console.error(err); showToast('Erro ao excluir projeto.', 'err'); }
}

/* ================= Global escape key for drawers ================= */
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { closeCertDrawer(); closeProjectDrawer(); }
});
