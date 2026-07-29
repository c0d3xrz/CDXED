// ==========================================================================
// CDXED — Public site logic
// Reads content from Firestore (config/profile, certificates, projects) and
// renders it dynamically. Falls back to sensible defaults if Firestore is
// empty or unreachable, so the site never looks broken to a visitor.
// ==========================================================================
import { db } from './firebase-config.js';
import { doc, getDoc, collection, getDocs } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";
import { ICON } from './icons.js';
import { parseVideoLink, resolveThumbnail, isPdfUrl, sanitizeSvgIcon, safeContactUrl } from './link-utils.js';

const DEFAULT_PROFILE = {
  name: 'Michel Rezini',
  role: 'Editor de Vídeo — Motion & Storytelling',
  bio: 'Estudo em tempo integral no Instituto Federal Catarinense (IFC), cursando o Ensino Médio integrado ao Técnico em Informática. Foi entre scripts e projetos de tecnologia que entendi o real papel da edição: não é sobre efeito, é sobre decisão — o que entra, o que sai, e o que faz quem assiste continuar assistindo.\n\nUso Shotcut, Photoshop, Clipchamp e Inteligência Artificial como extensão do processo criativo, sempre em busca do corte certo, no tempo certo, para a história certa.',
  location: 'Santa Catarina, Brasil',
  education: '2º ano · Téc. em Informática — IFC',
  birthdate: '2009-09-17',
  available: true,
  availableText: 'Disponível para novos projetos',
  photoURL: '',
  skills: [
    { name: 'Shotcut', level: 90 },
    { name: 'Adobe Photoshop', level: 80 },
    { name: 'Clipchamp', level: 85 },
    { name: 'Inteligência Artificial', level: 75 },
  ],
};

// Fallback shown until the admin adds real contacts in the panel (or if
// Firestore is unreachable) — mirrors what this section used to have
// hardcoded: e-mail (opens a pre-filled draft) and Discord (copies the tag).
const DEFAULT_CONTACTS = [
  {
    name: 'E-mail',
    icon: ICON.mail,
    type: 'link',
    value: 'mailto:c0d3xed@gmail.com?subject=Novo%20projeto%20de%20edi%C3%A7%C3%A3o&body=Ol%C3%A1%20Michel%2C%0D%0A%0D%0AQuero%20conversar%20sobre%20um%20projeto.%0D%0A%0D%0AObjetivo%3A%20%0D%0APrazo%3A%20%0D%0AMaterial%20bruto%20dispon%C3%ADvel%3A%20',
  },
  { name: 'Discord', icon: ICON.discord, type: 'copy', value: '@c0d3xx' },
];

const TOOL_ICON_MAP = {
  'shotcut': ICON.scissors,
  'adobe photoshop': ICON.layers,
  'photoshop': ICON.layers,
  'clipchamp': ICON.clapper,
  'inteligência artificial': ICON.spark,
  'inteligencia artificial': ICON.spark,
  'ia': ICON.spark,
};
function iconForTool(name) {
  return TOOL_ICON_MAP[(name || '').toLowerCase().trim()] || ICON.badge;
}

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[ch]));
}
function safeUrl(url) {
  try {
    const u = new URL(url);
    if (u.protocol === 'http:' || u.protocol === 'https:') return u.href;
  } catch (_) {}
  return '';
}
function truncate(str, n) {
  str = str || '';
  return str.length > n ? str.slice(0, n - 1).trim() + '…' : str;
}
function formatDate(d) {
  if (!d) return '—';
  const date = new Date(d.length === 10 ? d + 'T00:00:00' : d);
  if (isNaN(date)) return d;
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
}
function calcAge(birthdateStr) {
  const today = new Date();
  const bd = new Date(birthdateStr + 'T00:00:00');
  let age = today.getFullYear() - bd.getFullYear();
  const m = today.getMonth() - bd.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < bd.getDate())) age--;
  return age;
}

/* ---------------- Reveal on scroll (shared observer) ---------------- */
let revealObserver;
function observeReveal(el) {
  el.classList.add('reveal');
  if (!revealObserver) {
    revealObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          revealObserver.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12 });
  }
  revealObserver.observe(el);
}
function initReveal() {
  document.querySelectorAll('.reveal').forEach((el) => observeReveal(el));
}

/* ---------------- Count-up stat numbers ---------------- */
function animateCount(el, target) {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduced || !target) { el.firstChild.nodeValue = String(target || 0); return; }
  const duration = 1100;
  const t0 = performance.now();
  function tick(now) {
    const p = Math.min(1, (now - t0) / duration);
    const eased = 1 - Math.pow(1 - p, 3);
    el.firstChild.nodeValue = String(Math.round(target * eased));
    if (p < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

/* ---------------- Nav ---------------- */
function initNav() {
  const nav = document.getElementById('siteNav');
  const onScroll = () => nav.classList.toggle('scrolled', window.scrollY > 30);
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });

  const burger = document.getElementById('burgerBtn');
  const closeBtn = document.getElementById('burgerClose');
  const menu = document.getElementById('mobileMenu');
  burger.addEventListener('click', () => menu.classList.add('open'));
  closeBtn.addEventListener('click', () => menu.classList.remove('open'));
  menu.querySelectorAll('a').forEach((a) => a.addEventListener('click', () => menu.classList.remove('open')));
}

/* ---------------- Hero ring ticks ---------------- */
function buildRingTicks() {
  const g = document.getElementById('tickGroup');
  if (!g) return;
  const total = 60, cx = 200, cy = 200, rOuter = 196, rInner = 182;
  let html = '';
  for (let i = 0; i < total; i++) {
    const angle = (i / total) * Math.PI * 2 - Math.PI / 2;
    const accent = i % 5 === 0;
    const rI = accent ? rInner - 8 : rInner;
    const x1 = (cx + Math.cos(angle) * rOuter).toFixed(1);
    const y1 = (cy + Math.sin(angle) * rOuter).toFixed(1);
    const x2 = (cx + Math.cos(angle) * rI).toFixed(1);
    const y2 = (cy + Math.sin(angle) * rI).toFixed(1);
    html += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" class="ring-tick${accent ? ' accent' : ''}" stroke-width="${accent ? 2 : 1}"/>`;
  }
  g.innerHTML = html;
}

/* ---------------- REC timer ---------------- */
function initRecTimer() {
  const el = document.getElementById('recTimer');
  if (!el) return;
  let seconds = 0;
  const fmt = (s) => {
    const h = String(Math.floor(s / 3600)).padStart(2, '0');
    const m = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
    const sec = String(s % 60).padStart(2, '0');
    return `${h}:${m}:${sec}`;
  };
  setInterval(() => { seconds++; el.textContent = fmt(seconds); }, 1000);
}

/* ---------------- Toast ---------------- */
function showToast(msg, type = 'ok') {
  const toast = document.getElementById('toast');
  document.getElementById('toastMsg').textContent = msg;
  toast.className = `toast show ${type}`;
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => toast.classList.remove('show'), 2600);
}

function renderContactButtons(list) {
  const wrap = document.getElementById('contactActions');
  if (!wrap) return;
  if (!list.length) { wrap.innerHTML = ''; return; }
  wrap.innerHTML = list.map((c, i) => {
    const cls = `btn ${i === 0 ? 'btn-primary' : 'btn-ghost'} contact-btn`;
    const icon = sanitizeSvgIcon(c.icon) || ICON.link;
    const name = escapeHtml(c.name || '');
    if (c.type === 'copy') {
      return `<button type="button" class="${cls}" data-copy="${escapeHtml(c.value || '')}">${icon}${name}</button>`;
    }
    const href = safeContactUrl(c.value);
    if (!href) return `<span class="${cls}" style="opacity:.55;">${icon}${name}</span>`;
    const external = /^https?:/i.test(href);
    return `<a class="${cls}" href="${href}"${external ? ' target="_blank" rel="noopener"' : ''}>${icon}${name}</a>`;
  }).join('');
}

// Click handling is delegated on the wrapper since the buttons are
// re-rendered from Firestore data after this listener is attached once.
function initContactActions() {
  const wrap = document.getElementById('contactActions');
  if (!wrap) return;
  wrap.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-copy]');
    if (!btn) return;
    const text = btn.dataset.copy;
    if (!text) return;
    try { await navigator.clipboard.writeText(text); showToast(`Copiado: ${text}`); }
    catch (_) { showToast('Não foi possível copiar automaticamente', 'err'); }
  });
}

async function loadContacts() {
  try {
    const snap = await getDocs(collection(db, 'contacts'));
    const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    if (!list.length) return DEFAULT_CONTACTS;
    list.sort((a, b) => (a.order ?? a.createdAt ?? 0) - (b.order ?? b.createdAt ?? 0));
    return list;
  } catch (e) { console.warn('Contatos indisponíveis, usando dados padrão.', e); return DEFAULT_CONTACTS; }
}

/* ---------------- Data loading ---------------- */
async function loadProfile() {
  let profile = { ...DEFAULT_PROFILE };
  try {
    const snap = await getDoc(doc(db, 'config', 'profile'));
    if (snap.exists()) {
      const data = snap.data();
      profile = { ...profile, ...data };
      if (Array.isArray(data.skills) && data.skills.length) profile.skills = data.skills;
    }
  } catch (e) { console.warn('Perfil indisponível, usando dados padrão.', e); }
  return profile;
}
async function loadCollection(name, sortField) {
  try {
    const snap = await getDocs(collection(db, name));
    const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    list.sort((a, b) => new Date(b[sortField] || b.createdAt || 0) - new Date(a[sortField] || a.createdAt || 0));
    return list;
  } catch (e) { console.warn(`Coleção "${name}" indisponível.`, e); return []; }
}

/* ---------------- Render: hero + about ---------------- */
function renderHero(profile) {
  document.getElementById('heroName').textContent = profile.name;
  document.getElementById('heroRole').textContent = profile.role;
  document.getElementById('chipAvailable').textContent =
    profile.availableText || (profile.available === false ? 'Agenda fechada no momento' : 'Disponível para novos projetos');
  const pulse = document.querySelector('.pulse-dot');
  if (pulse) pulse.style.background = profile.available === false ? 'var(--ink-faint)' : '';

  const age = calcAge(profile.birthdate);
  document.getElementById('chipAge').textContent = `${age} anos`;
  document.getElementById('metaAge').textContent = `${age} anos`;
  document.getElementById('chipLocation').textContent = profile.location;
  document.getElementById('metaLocation').textContent = profile.location;
  document.getElementById('chipEdu').textContent = profile.education;
  document.getElementById('metaEdu').textContent = profile.education;

  if (profile.photoURL) {
    const img = document.getElementById('profilePhoto');
    img.addEventListener('error', () => {
      img.style.display = 'none';
      document.getElementById('avatarFallback').style.display = '';
    }, { once: true });
    img.src = profile.photoURL;
    img.style.display = 'block';
    document.getElementById('avatarFallback').style.display = 'none';
  }
}

function renderBio(profile) {
  if (!profile.bio || !profile.bio.trim()) return;
  const wrap = document.getElementById('bioText');
  wrap.innerHTML = '';
  profile.bio.split(/\n{2,}/).forEach((par) => {
    const p = document.createElement('p');
    p.textContent = par.trim();
    wrap.appendChild(p);
  });
}

function renderTools(profile) {
  const row = document.getElementById('toolsRow');
  row.innerHTML = (profile.skills || []).map((s) =>
    `<span class="tool-pill">${iconForTool(s.name)} ${escapeHtml(s.name)}</span>`
  ).join('');
}

function renderSkillsPanel(profile) {
  const list = document.getElementById('skillsList');
  list.innerHTML = (profile.skills || []).map((s) => `
    <div class="skill-item">
      <div class="skill-top"><span>${escapeHtml(s.name)}</span><span>${Number(s.level) || 0}%</span></div>
      <div class="skill-track"><div class="skill-fill" data-level="${Number(s.level) || 0}"></div></div>
    </div>
  `).join('');

  const panel = document.querySelector('.skills-panel');
  const io = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        panel.querySelectorAll('.skill-fill').forEach((f) => { f.style.width = f.dataset.level + '%'; });
        io.disconnect();
      }
    });
  }, { threshold: 0.3 });
  io.observe(panel);
}

/* ---------------- Render: projects ---------------- */
// Effective cover for a project card: whatever the admin pasted as
// coverURL, falling back to the video link's own default thumbnail
// (instant for YouTube; a quick oEmbed lookup for Vimeo).
async function getProjectCover(p) {
  const explicit = safeUrl(p.coverURL);
  if (explicit) return explicit;
  const thumb = await resolveThumbnail(parseVideoLink(p.videoLink));
  return thumb || '';
}

async function renderProjects(list) {
  const grid = document.getElementById('projectsGrid');
  if (!list.length) {
    grid.innerHTML = `<div class="empty-state">${ICON.folderEmpty}<p style="margin:0;">Os primeiros cortes estão a caminho.<br>Em breve, os primeiros projetos aparecem aqui.</p></div>`;
    return;
  }
  const covers = await Promise.all(list.map(getProjectCover));
  grid.innerHTML = '';
  list.forEach((p, i) => {
    const card = document.createElement('article');
    card.style.setProperty('--i', i % 6);
    card.className = 'project-card';
    card.innerHTML = `
      <div class="project-thumb">
        ${covers[i] ? `<img src="${covers[i]}" alt="" onerror="this.remove()">` : ''}
        <span class="play-glyph">${ICON.play}</span>
      </div>
      <div class="project-body">
        <span class="project-client">${escapeHtml(p.client || 'Cliente')}</span>
        <h3>${escapeHtml(p.title || 'Projeto sem título')}</h3>
        <p class="project-desc">${escapeHtml(truncate(p.description, 110))}</p>
        <div class="project-dates">
          <span>Recebido: <b>${formatDate(p.dateReceived)}</b></span>
          <span>Entregue: <b>${formatDate(p.dateDelivered)}</b></span>
        </div>
      </div>
    `;
    card.addEventListener('click', () => openProjectModal(p));
    grid.appendChild(card);
    observeReveal(card);
  });
}

const PLATFORM_LABEL = { youtube: 'Ver no YouTube', vimeo: 'Ver no Vimeo', other: 'Ver publicação original' };

function openProjectModal(p) {
  const overlay = document.getElementById('projectModal');
  const videoWrap = document.getElementById('modalVideoWrap');
  const content = document.getElementById('modalContent');
  const parsed = parseVideoLink(p.videoLink);

  if (parsed && parsed.embedUrl) {
    videoWrap.innerHTML = `<iframe src="${parsed.embedUrl}" title="${escapeHtml(p.title || 'Vídeo')}" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen></iframe>`;
  } else if (parsed && parsed.watchUrl) {
    videoWrap.innerHTML = `<a class="modal-video-external" href="${safeUrl(parsed.watchUrl)}" target="_blank" rel="noopener noreferrer">${ICON.play}<span>Assistir vídeo</span></a>`;
  } else {
    videoWrap.innerHTML = `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:var(--ink-faint);font-family:var(--font-ui);font-size:13px;">Vídeo ainda não anexado</div>`;
  }

  const link = parsed ? safeUrl(parsed.watchUrl) : '';
  const linkLabel = parsed ? (PLATFORM_LABEL[parsed.platform] || PLATFORM_LABEL.other) : '';
  content.innerHTML = `
    <div class="modal-head">
      <div>
        <span class="project-client">${escapeHtml(p.client || 'Cliente')}</span>
        <h3 style="margin:6px 0 0;">${escapeHtml(p.title || '')}</h3>
      </div>
    </div>
    <p>${escapeHtml(p.description || '')}</p>
    <div class="project-dates">
      <span>Recebido: <b>${formatDate(p.dateReceived)}</b></span>
      <span>Entregue: <b>${formatDate(p.dateDelivered)}</b></span>
    </div>
    ${link ? `<a class="modal-link" href="${link}" target="_blank" rel="noopener noreferrer">${ICON.externalLink} ${linkLabel}</a>` : ''}
  `;
  overlay.classList.add('open');
  document.body.style.overflow = 'hidden';
}
function closeProjectModal() {
  document.getElementById('projectModal').classList.remove('open');
  document.body.style.overflow = '';
  document.getElementById('modalVideoWrap').innerHTML = '';
}

/* ---------------- Render: certificates ---------------- */
function renderCertificates(list) {
  const wrap = document.getElementById('certTimeline');
  if (!list.length) {
    wrap.innerHTML = `<div class="empty-state">${ICON.badge}<p style="margin:0;">Novos certificados entram aqui assim que forem concluídos.</p></div>`;
    return;
  }
  wrap.innerHTML = '';
  list.forEach((c, i) => {
    const badgeUrl = safeUrl(c.badgeURL);
    let badgeHtml = '';
    if (badgeUrl && isPdfUrl(c.badgeURL)) {
      badgeHtml = `<a class="tl-badge tl-badge-pdf" href="${badgeUrl}" target="_blank" rel="noopener noreferrer" title="Ver certificado (PDF)">${ICON.fileText}</a>`;
    } else if (badgeUrl) {
      badgeHtml = `<img class="tl-badge" src="${badgeUrl}" alt="" onerror="this.remove()">`;
    }

    const item = document.createElement('div');
    item.style.setProperty('--i', i);
    item.className = 'tl-item';
    item.innerHTML = `
      <div class="tl-dot"></div>
      <div class="tl-card">
        <div class="tl-card-head">
          <div>
            <h3 style="margin:0 0 4px;">${escapeHtml(c.title || '')}</h3>
            <p class="tl-teaches">${escapeHtml(c.teaches || '')}</p>
          </div>
          ${badgeHtml}
        </div>
        <span class="tl-dates">${formatDate(c.startDate)} — ${c.endDate ? formatDate(c.endDate) : 'em andamento'}</span>
        <p style="margin-top:10px;">${escapeHtml(c.description || '')}</p>
      </div>
    `;
    wrap.appendChild(item);
    observeReveal(item);
  });
}

/* ---------------- Stats ---------------- */
function initStatCounters(profile, certs, projects) {
  const io = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        animateCount(document.getElementById('statProjects'), projects.length);
        animateCount(document.getElementById('statCerts'), certs.length);
        animateCount(document.getElementById('statSkills'), (profile.skills || []).length);
        io.disconnect();
      }
    });
  }, { threshold: 0.4 });
  io.observe(document.getElementById('statsRow'));
}

/* ---------------- Init ---------------- */
async function init() {
  initNav();
  buildRingTicks();
  initRecTimer();
  initContactActions();
  initReveal();

  document.getElementById('modalCloseBtn').addEventListener('click', closeProjectModal);
  document.getElementById('projectModal').addEventListener('click', (e) => {
    if (e.target.id === 'projectModal') closeProjectModal();
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeProjectModal(); });
  document.getElementById('footerCopy').textContent =
    `© ${new Date().getFullYear()} CDXED — Michel Rezini. Todos os cortes reservados.`;

  const profile = await loadProfile();
  renderHero(profile);
  renderBio(profile);
  renderTools(profile);
  renderSkillsPanel(profile);

  const [certs, projects, contacts] = await Promise.all([
    loadCollection('certificates', 'startDate'),
    loadCollection('projects', 'dateDelivered'),
    loadContacts(),
  ]);
  renderCertificates(certs);
  renderProjects(projects);
  renderContactButtons(contacts);
  initStatCounters(profile, certs, projects);
}

document.addEventListener('DOMContentLoaded', init);
