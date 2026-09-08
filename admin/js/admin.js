// ============================================================
// Yao Xie Content Studio — admin.js
//
// This is a pure client-side static CMS: there is no server. "Publish"
// means this JS calls GitHub's REST API directly from the browser, using
// a personal access token Yao pastes in once (stored in this browser's
// localStorage only — it is never sent anywhere except api.github.com).
// That token is equivalent to a password for this repo: anyone with it
// can write to the site. Don't use this panel on a shared/public computer,
// and revoke the token from GitHub's settings if a device is ever lost.
//
// Structure is code (this file + the templates under /news/_template etc.)
// Content is data (content/*.json) — this file's whole job is reading and
// writing that data through the GitHub API. It never touches page layout.
// ============================================================

const GH_API = 'https://api.github.com';
const CONTENT_KINDS = {
  news:         { path: 'content/news.json',         label: 'News',         hasPage: true,  pageDir: 'news' },
  projects:     { path: 'content/projects.json',      label: 'Projects',     hasPage: true,  pageDir: 'projects' },
  initiatives:  { path: 'content/initiatives.json',    label: 'Initiatives',  hasPage: true,  pageDir: 'initiatives' },
  publications: { path: 'content/publications.json',   label: 'Publications', hasPage: false, pageDir: null },
};

// ---------- Config / auth ----------
function cfg(key, fallback) { return localStorage.getItem('cms_' + key) || fallback; }
function setCfg(key, val) { localStorage.setItem('cms_' + key, val); }
function isConfigured() { return !!cfg('token', ''); }
function repoOwner() { return cfg('owner', 'toyaoxie'); }
function repoName() { return cfg('repo', 'toyaoxie.github.io'); }
function repoBranch() { return cfg('branch', 'main'); }

// ---------- GitHub API ----------
async function ghRequest(path, options = {}) {
  const token = cfg('token', '');
  const res = await fetch(`${GH_API}${path}`, {
    ...options,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github+json',
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    let detail = '';
    try { detail = (await res.json()).message; } catch (e) {}
    const err = new Error(detail || `GitHub API error ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return res.status === 204 ? null : res.json();
}

function utf8ToBase64(str) { return btoa(unescape(encodeURIComponent(str))); }
function base64ToUtf8(str) { return decodeURIComponent(escape(atob(str.replace(/\n/g, '')))); }

// Returns { content, sha } or null if the file doesn't exist yet.
async function getFile(path) {
  try {
    const data = await ghRequest(`/repos/${repoOwner()}/${repoName()}/contents/${path}?ref=${repoBranch()}`);
    return { content: base64ToUtf8(data.content), sha: data.sha, raw: data };
  } catch (e) {
    if (e.status === 404) return null;
    throw e;
  }
}

// path -> array of {name, path, type} for a directory, or null if it doesn't exist.
async function listDir(path) {
  try {
    return await ghRequest(`/repos/${repoOwner()}/${repoName()}/contents/${path}?ref=${repoBranch()}`);
  } catch (e) {
    if (e.status === 404) return [];
    throw e;
  }
}

// Text content, base64-encoded automatically.
async function putFile(path, textContent, message, sha) {
  const body = { message, content: utf8ToBase64(textContent), branch: repoBranch() };
  if (sha) body.sha = sha;
  return ghRequest(`/repos/${repoOwner()}/${repoName()}/contents/${path}`, { method: 'PUT', body: JSON.stringify(body) });
}

// Already-base64 binary content (images).
async function putFileRaw(path, base64Content, message, sha) {
  const body = { message, content: base64Content, branch: repoBranch() };
  if (sha) body.sha = sha;
  return ghRequest(`/repos/${repoOwner()}/${repoName()}/contents/${path}`, { method: 'PUT', body: JSON.stringify(body) });
}

// ---------- Content read/write helpers ----------
async function getJSON(path) {
  const file = await getFile(path);
  if (!file) return { items: [], sha: null };
  return { items: JSON.parse(file.content), sha: file.sha };
}

async function saveJSON(path, items, message, sha) {
  return putFile(path, JSON.stringify(items, null, 2), message, sha);
}

// Creates the live page for a slug from its kind's _template, if it doesn't already exist.
// Every page of a given kind is byte-identical (content comes from JSON at runtime),
// so this never needs to "regenerate" anything after the first publish.
async function ensurePage(kind) {
  const meta = CONTENT_KINDS[kind];
  if (!meta.hasPage) return;
  return async function (slug) {
    const targetPath = `${meta.pageDir}/${slug}/index.html`;
    const existing = await getFile(targetPath);
    if (existing) return;
    const template = await getFile(`${meta.pageDir}/_template/index.html`);
    if (!template) throw new Error(`Template missing for ${kind}`);
    await putFile(targetPath, template.content, `Create ${kind} page: ${slug}`);
  };
}

function slugify(title) {
  return title.toLowerCase().trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function uniqueSlug(base, existingItems) {
  let slug = base, n = 2;
  const taken = new Set(existingItems.map(i => i.slug));
  while (taken.has(slug)) { slug = `${base}-${n}`; n++; }
  return slug;
}

function todayISO() { return new Date().toISOString().slice(0, 10); }

// ---------- Image handling ----------
// Resizes/compresses the image and returns both:
//  - base64: what actually gets committed to GitHub
//  - blob: kept locally so the preview can show instantly, without waiting
//    on GitHub Pages to redeploy (that can take anywhere from a few seconds
//    to a couple of minutes — the live /media/... URL isn't reliable right
//    after a commit, so the UI must never depend on it for immediate feedback).
function resizeImage(file, maxWidth = 1200, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxWidth / img.width);
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        canvas.toBlob((blob) => {
          if (!blob) { reject(new Error('Could not process this image — try a different file.')); return; }
          const r2 = new FileReader();
          r2.onload = () => resolve({ base64: r2.result.split(',')[1], blob });
          r2.onerror = () => reject(new Error('Could not read the resized image.'));
          r2.readAsDataURL(blob);
        }, 'image/jpeg', quality);
      };
      img.onerror = () => reject(new Error('That file doesn\'t look like a valid image.'));
      img.src = e.target.result;
    };
    reader.onerror = () => reject(new Error('Could not read the selected file.'));
    reader.readAsDataURL(file);
  });
}

// Caches local object URLs for images uploaded during this session, keyed by
// live path (e.g. "/media/foo.jpg"), so any view showing that image — even
// one rendered moments later, like the Media Library grid — doesn't depend
// on GitHub Pages having redeployed yet.
const sessionImageCache = {};

// Returns { path, previewUrl }. `path` is the eventual live URL (for storing
// in content JSON); `previewUrl` is a local object URL that works immediately,
// before GitHub Pages has finished redeploying the new commit.
async function uploadImage(file, suggestedName) {
  const { base64, blob } = await resizeImage(file);
  const filename = `${suggestedName || slugify(file.name.replace(/\.[^.]+$/, ''))}.jpg`;
  const path = `media/${filename}`;
  await putFileRaw(path, base64, `Upload image: ${filename}`);
  const previewUrl = URL.createObjectURL(blob);
  sessionImageCache[`/${path}`] = previewUrl;
  return { path: `/${path}`, previewUrl };
}

// ============================================================
// Router
// ============================================================
window.addEventListener('hashchange', route);
window.addEventListener('DOMContentLoaded', route);

function route() {
  const hash = location.hash.slice(1) || '/';
  const pathOnly = hash.split('?')[0];
  const parts = pathOnly.split('/').filter(Boolean);

  if (!isConfigured() && parts[0] !== 'settings') {
    renderFirstRun();
    return;
  }

  if (parts.length === 0) return renderDashboard();
  if (parts[0] === 'settings') return renderSettings();
  if (parts[0] === 'media') return renderMedia();
  if (parts[0] === 'homepage') return renderHomepageEditor();

  const kind = parts[0];
  if (!CONTENT_KINDS[kind]) return renderDashboard();

  if (parts[1] === 'new') return renderForm(kind, null);
  if (parts[1] === 'edit' && parts[2]) return renderForm(kind, parts[2]);
  return renderList(kind);
}

function app() { return document.getElementById('app'); }
function nav(hash) { location.hash = hash; }

function showBanner(container, type, message) {
  const el = document.createElement('div');
  el.className = `admin-banner ${type}`;
  el.textContent = message;
  container.prepend(el);
}

// ============================================================
// First-run setup
// ============================================================
function renderFirstRun() {
  app().innerHTML = `
    <h1 class="admin-h1">Welcome to your Content Studio</h1>
    <p class="admin-sub">This page updates your site directly through GitHub — there's no separate server. One-time setup:</p>
    <div class="admin-card">
      <div class="admin-banner warn">
        You'll need a GitHub <strong>fine-grained personal access token</strong> scoped to just this one repository,
        with <strong>Contents: Read and write</strong> permission. Create one at
        <a href="https://github.com/settings/personal-access-tokens/new" target="_blank">github.com/settings/personal-access-tokens/new</a>.
        Treat it like a password — it's stored only in this browser, and grants write access to your site.
      </div>
      <div class="admin-field">
        <label>GitHub username</label>
        <input type="text" id="setupOwner" value="toyaoxie">
      </div>
      <div class="admin-field">
        <label>Repository name</label>
        <input type="text" id="setupRepo" value="toyaoxie.github.io">
      </div>
      <div class="admin-field">
        <label>Branch</label>
        <input type="text" id="setupBranch" value="main">
      </div>
      <div class="admin-field">
        <label>Personal access token</label>
        <input type="text" id="setupToken" placeholder="github_pat_...">
      </div>
      <div class="admin-form-actions">
        <button class="btn btn-primary" id="setupSaveBtn">Connect</button>
      </div>
    </div>
  `;
  document.getElementById('setupSaveBtn').addEventListener('click', async () => {
    setCfg('owner', document.getElementById('setupOwner').value.trim());
    setCfg('repo', document.getElementById('setupRepo').value.trim());
    setCfg('branch', document.getElementById('setupBranch').value.trim() || 'main');
    setCfg('token', document.getElementById('setupToken').value.trim());
    try {
      await ghRequest(`/repos/${repoOwner()}/${repoName()}`);
      nav('#/');
    } catch (e) {
      showBanner(app(), 'error', `Couldn't connect: ${e.message}. Check the token and repo name.`);
    }
  });
}

function renderSettings() {
  app().innerHTML = `
    <h1 class="admin-h1">Developer settings</h1>
    <p class="admin-sub">You shouldn't need this for everyday updates — it's here for reconnecting or troubleshooting.</p>
    <div class="admin-card">
      <div class="admin-field">
        <label>GitHub username</label>
        <input type="text" id="setupOwner" value="${repoOwner()}">
      </div>
      <div class="admin-field">
        <label>Repository name</label>
        <input type="text" id="setupRepo" value="${repoName()}">
      </div>
      <div class="admin-field">
        <label>Branch</label>
        <input type="text" id="setupBranch" value="${repoBranch()}">
      </div>
      <div class="admin-field">
        <label>Personal access token</label>
        <input type="text" id="setupToken" value="${cfg('token','')}">
      </div>
      <div class="admin-form-actions">
        <button class="btn btn-primary" id="setupSaveBtn">Save</button>
        <button class="btn btn-outline" id="setupForgetBtn">Disconnect this browser</button>
      </div>
    </div>
  `;
  document.getElementById('setupSaveBtn').addEventListener('click', () => {
    setCfg('owner', document.getElementById('setupOwner').value.trim());
    setCfg('repo', document.getElementById('setupRepo').value.trim());
    setCfg('branch', document.getElementById('setupBranch').value.trim() || 'main');
    setCfg('token', document.getElementById('setupToken').value.trim());
    nav('#/');
  });
  document.getElementById('setupForgetBtn').addEventListener('click', () => {
    localStorage.removeItem('cms_token');
    nav('#/');
  });
}

// ============================================================
// Dashboard
// ============================================================
async function renderDashboard() {
  app().innerHTML = `<p class="admin-sub">Loading…</p>`;
  try {
    const [news, projects, initiatives, publications] = await Promise.all(
      Object.keys(CONTENT_KINDS).map(k => getJSON(CONTENT_KINDS[k].path).then(r => r.items))
    );
    const counts = { news, projects, initiatives, publications };
    const recent = [...news].sort((a, b) => (b.date||'').localeCompare(a.date||'')).slice(0, 5);

    app().innerHTML = `
      <h1 class="admin-h1">Good to see you, Yao.</h1>
      <p class="admin-sub">What would you like to update?</p>

      <button class="admin-big-btn" id="quickAddToggle"><i class="fa-solid fa-plus"></i> Add something</button>
      <div id="quickAddPanel" style="display:none; margin-top:-1.5rem;">
        <div class="quick-add-grid">
          <button class="quick-add-btn" data-action="news:Speaking">🎤 I gave a talk</button>
          <button class="quick-add-btn" data-action="publications:">📚 I published a paper</button>
          <button class="quick-add-btn" data-action="news:Academic Leadership">🌐 I joined something</button>
          <button class="quick-add-btn" data-action="projects:">🚀 I launched something</button>
          <button class="quick-add-btn" data-action="news:Recognition">🏆 I received recognition</button>
          <button class="quick-add-btn" data-action="projects:edit">✍️ I updated a project</button>
        </div>
      </div>

      <div class="admin-section-title">Content</div>
      <div class="admin-stats-grid">
        <a href="#/news" class="admin-stat"><div class="n">${news.length}</div><div class="label">News</div></a>
        <a href="#/projects" class="admin-stat"><div class="n">${projects.length}</div><div class="label">Projects</div></a>
        <a href="#/initiatives" class="admin-stat"><div class="n">${initiatives.length}</div><div class="label">Initiatives</div></a>
        <a href="#/publications" class="admin-stat"><div class="n">${publications.length}</div><div class="label">Publications</div></a>
      </div>

      <div class="admin-section-title">Recent activity</div>
      <div class="admin-card">
        ${recent.map(item => `
          <div class="admin-list-row">
            <div class="admin-list-main">
              <div>
                <div class="admin-list-title">${item.title}</div>
                <div class="admin-list-meta">${item.date || ''}</div>
              </div>
            </div>
            <span class="status-pill status-${item.status}">${item.status}</span>
          </div>
        `).join('') || '<p style="color:var(--ink-soft); font-size:14px;">Nothing yet.</p>'}
      </div>

      <div class="admin-section-title">Site</div>
      <div class="admin-card">
        <div class="admin-list-row"><span>Homepage (hero, featured content)</span><a href="#/homepage">Edit →</a></div>
        <div class="admin-list-row"><span>Media library</span><a href="#/media">Open →</a></div>
      </div>
    `;

    document.getElementById('quickAddToggle').addEventListener('click', () => {
      const panel = document.getElementById('quickAddPanel');
      panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
    });
    document.querySelectorAll('.quick-add-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const [kind, presetOrMode] = btn.dataset.action.split(':');
        if (presetOrMode === 'edit') { nav(`#/${kind}`); return; }
        nav(`#/${kind}/new${presetOrMode ? `?category=${encodeURIComponent(presetOrMode)}` : ''}`);
      });
    });
  } catch (e) {
    app().innerHTML = `<div class="admin-banner error">Couldn't load content: ${e.message}</div>`;
  }
}

// ============================================================
// List view (per kind)
// ============================================================
// Which field on an item actually holds draft/published/archived — differs by kind,
// because projects/initiatives also use `status` for their own real-world label
// ("Building", "Researching"), so publish state lives in `publishStatus` instead.
function publishField(kind) { return (kind === 'projects' || kind === 'initiatives') ? 'publishStatus' : 'status'; }

async function renderList(kind) {
  const meta = CONTENT_KINDS[kind];
  const pubField = publishField(kind);
  app().innerHTML = `<p class="admin-sub">Loading ${meta.label}…</p>`;
  const { items } = await getJSON(meta.path);

  const grouped = { published: [], draft: [], archived: [] };
  items.forEach(i => (grouped[i[pubField]] || grouped.draft).push(i));

  function rowHTML(item) {
    const editHash = `#/${kind}/edit/${item.slug}`;
    const liveLink = (item[pubField] === 'published' && meta.hasPage)
      ? `<a href="/${meta.pageDir}/${item.slug}/" target="_blank">View</a>` : '';
    const metaBits = [item.date, item.year, item.category, (kind === 'projects' || kind === 'initiatives') ? item.status : null]
      .filter(Boolean).join(' · ');
    return `
      <div class="admin-list-row">
        <div class="admin-list-main">
          <img src="${item.image || '/yao-xie.png'}" alt="">
          <div>
            <div class="admin-list-title">${item.title}</div>
            <div class="admin-list-meta">${metaBits}</div>
          </div>
        </div>
        <div class="admin-list-actions">
          <span class="status-pill status-${item[pubField]}">${item[pubField]}</span>
          <a href="${editHash}">Edit</a>
          ${liveLink}
          <button data-duplicate="${item.slug}">Duplicate</button>
          <button data-archive="${item.slug}">${item[pubField] === 'archived' ? 'Restore' : 'Archive'}</button>
        </div>
      </div>`;
  }

  app().innerHTML = `
    <h1 class="admin-h1">${meta.label}</h1>
    <a href="#/${kind}/new" class="btn btn-primary" style="display:inline-block; margin-bottom:2rem;">+ Add ${meta.label.replace(/s$/, '')}</a>

    <div class="admin-section-title">Published</div>
    <div class="admin-card">${grouped.published.map(rowHTML).join('') || '<p style="color:var(--ink-soft); font-size:14px;">None yet.</p>'}</div>

    <div class="admin-section-title">Draft</div>
    <div class="admin-card">${grouped.draft.map(rowHTML).join('') || '<p style="color:var(--ink-soft); font-size:14px;">None.</p>'}</div>

    ${grouped.archived.length ? `
    <div class="admin-section-title">Archived</div>
    <div class="admin-card">${grouped.archived.map(rowHTML).join('')}</div>` : ''}
  `;

  app().querySelectorAll('[data-archive]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const slug = btn.dataset.archive;
      const { items, sha } = await getJSON(meta.path);
      const it = items.find(i => i.slug === slug);
      it[pubField] = it[pubField] === 'archived' ? 'draft' : 'archived';
      btn.disabled = true; btn.textContent = '…';
      try {
        await saveJSON(meta.path, items, `${it[pubField] === 'archived' ? 'Archive' : 'Restore'}: ${it.title}`, sha);
        renderList(kind);
      } catch (e) { alert('Failed: ' + e.message); }
    });
  });

  app().querySelectorAll('[data-duplicate]').forEach(btn => {
    btn.addEventListener('click', () => {
      sessionStorage.setItem('duplicateFrom', btn.dataset.duplicate);
      nav(`#/${kind}/new`);
    });
  });
}

// ============================================================
// Form (create / edit) per kind
// ============================================================
const FIELD_CONFIGS = {
  news: {
    categories: ['Speaking', 'Publication', 'Recognition', 'Academic Leadership', 'Research', 'ContextWell'],
  },
  projects: {
    statuses: ['Exploring', 'Researching', 'Building', 'Testing', 'Launched'],
  },
  initiatives: {
    statuses: ['Founded', 'Building', 'Active', 'Paused'],
  },
  publications: {
    types: ['Journal article', 'Conference paper', 'Protocol', 'Preprint', 'Other'],
  },
};

async function renderForm(kind, slug) {
  const meta = CONTENT_KINDS[kind];
  app().innerHTML = `<p class="admin-sub">Loading…</p>`;
  const { items, sha } = await getJSON(meta.path);
  let item = slug ? items.find(i => i.slug === slug) : null;

  // Duplicate flow: prefill from another item, but as a new (unsaved) slug.
  const dupFrom = sessionStorage.getItem('duplicateFrom');
  if (!item && dupFrom) {
    sessionStorage.removeItem('duplicateFrom');
    const src = items.find(i => i.slug === dupFrom);
    if (src) { item = { ...src, slug: '', title: src.title + ' (copy)', status: 'draft' }; }
  }

  const params = new URLSearchParams(location.hash.split('?')[1] || '');
  const presetCategory = params.get('category');

  const isEdit = !!slug;
  const d = item || {};

  let bodyHTML = '';
  if (kind === 'news') {
    bodyHTML = newsFormHTML(d, presetCategory);
  } else if (kind === 'projects') {
    bodyHTML = projectFormHTML(d);
  } else if (kind === 'initiatives') {
    bodyHTML = initiativeFormHTML(d);
  } else if (kind === 'publications') {
    bodyHTML = publicationFormHTML(d);
  }

  app().innerHTML = `
    <h1 class="admin-h1">${isEdit ? 'Edit' : 'Create'} ${meta.label.replace(/s$/, '')}</h1>
    <div class="admin-card">
      <form id="contentForm">${bodyHTML}</form>
      <div class="admin-form-actions">
        <button class="btn btn-outline" id="saveDraftBtn">Save Draft</button>
        <button class="btn btn-primary" id="publishBtn">Publish</button>
        ${meta.hasPage ? '<button class="btn btn-outline" id="previewBtn" type="button">Preview</button>' : ''}
        <a href="#/${kind}" class="btn btn-outline" style="margin-left:auto;">Cancel</a>
      </div>
    </div>
  `;

  wireImageField('imageUpload', 'imagePreview', 'imagePath', d.image);
  wireImagePicker('mediaPickerGrid', 'imagePreview', 'imagePath', d.image);

  const titleInput = document.getElementById('f_title');
  const slugPreview = document.getElementById('slugPreview');
  if (titleInput && slugPreview && !isEdit) {
    titleInput.addEventListener('input', () => {
      slugPreview.textContent = `/${meta.pageDir || kind}/${slugify(titleInput.value) || '…'}/`;
    });
  }

  function collectFormData() {
    const form = document.getElementById('contentForm');
    const data = {};
    form.querySelectorAll('[name]').forEach(el => {
      if (el.type === 'checkbox') data[el.name] = el.checked;
      else data[el.name] = el.value.trim();
    });
    return data;
  }

  function buildItem(status) {
    const raw = collectFormData();
    const existingSlug = isEdit ? item.slug : uniqueSlug(slugify(raw.title || 'untitled'), items);
    if (kind === 'news') {
      return {
        slug: existingSlug, title: raw.title, summary: raw.summary, body: raw.body || raw.summary,
        date: raw.date || todayISO(), category: raw.category, image: document.getElementById('imagePath').value || '/yao-xie.png',
        status, featured: !!raw.featured,
        source: raw.sourceName ? { name: raw.sourceName, url: raw.sourceUrl } : null,
        related: { project: raw.relatedProject || null, initiative: raw.relatedInitiative || null, publication: raw.relatedPublication || null },
      };
    }
    if (kind === 'projects') {
      return {
        slug: existingSlug, title: raw.title, summary: raw.summary, status: raw.projectStatus,
        image: document.getElementById('imagePath').value || '/yao-xie.png',
        problem: raw.problem, idea: raw.idea, building: raw.building, stage: raw.stage,
        publishStatus: status,
        related: { initiative: raw.relatedInitiative || null, publication: raw.relatedPublication || null },
      };
    }
    if (kind === 'initiatives') {
      return {
        slug: existingSlug, title: raw.title, summary: raw.summary, status: raw.initiativeStatus,
        image: document.getElementById('imagePath').value || '/yao-xie.png',
        overview: raw.overview || raw.summary, what: raw.what, role: raw.role, website: raw.website || null,
        featured: !!raw.featured, publishStatus: status,
      };
    }
    if (kind === 'publications') {
      return {
        slug: existingSlug, title: raw.title, authors: raw.authors, venue: raw.venue,
        year: parseInt(raw.year, 10) || new Date().getFullYear(), type: raw.type, url: raw.url || null,
        abstract: raw.abstract || null, featured: !!raw.featured, status,
      };
    }
  }

  async function save(status) {
    const newItem = buildItem(status);
    if (!newItem.title) { alert('Title is required.'); return; }

    const publishBtn = document.getElementById('publishBtn');
    const draftBtn = document.getElementById('saveDraftBtn');
    publishBtn.disabled = true; draftBtn.disabled = true;
    const clickedBtn = status === 'published' ? publishBtn : draftBtn;
    const originalText = clickedBtn.textContent;
    clickedBtn.innerHTML = `<span class="spinner-inline"></span> Saving…`;

    try {
      const { items: freshItems, sha: freshSha } = await getJSON(meta.path);
      const idx = freshItems.findIndex(i => i.slug === newItem.slug);
      if (idx >= 0) freshItems[idx] = newItem; else freshItems.unshift(newItem);
      await saveJSON(meta.path, freshItems, `${isEdit ? 'Update' : 'Add'} ${kind}: ${newItem.title}`, freshSha);

      if (status === 'published' && meta.hasPage) {
        const ensure = await ensurePage(kind);
        await ensure(newItem.slug);
      }

      showPublishSuccess(kind, newItem, status);
    } catch (e) {
      publishBtn.disabled = false; draftBtn.disabled = false;
      clickedBtn.textContent = originalText;
      alert('Failed to save: ' + e.message);
    }
  }

  document.getElementById('saveDraftBtn').addEventListener('click', (e) => { e.preventDefault(); save('draft'); });
  document.getElementById('publishBtn').addEventListener('click', (e) => { e.preventDefault(); save('published'); });

  const previewBtn = document.getElementById('previewBtn');
  if (previewBtn) {
    previewBtn.addEventListener('click', () => {
      const previewItem = buildItem('published');
      sessionStorage.setItem('previewItem', JSON.stringify(previewItem));
      window.open(`/${meta.pageDir}/_template/?preview=1`, '_blank');
    });
  }
}

function showPublishSuccess(kind, item, status) {
  const meta = CONTENT_KINDS[kind];
  const liveUrl = meta.hasPage ? `/${meta.pageDir}/${item.slug}/` : null;
  app().innerHTML = `
    <div class="admin-modal-overlay">
      <div class="admin-modal">
        <h2 style="font-family:'Playfair Display',serif; font-size:22px; margin-bottom:0.5rem;">
          ${status === 'published' ? '✓ Published' : '✓ Draft saved'}
        </h2>
        <p style="color:var(--ink-mid); font-size:14px; margin-bottom:1.5rem;">
          ${status === 'published' ? 'Your update is now live.' : 'Saved as a draft — not visible on the site yet.'}
        </p>
        <div class="admin-form-actions" style="border-top:none; padding-top:0;">
          ${liveUrl && status === 'published' ? `<a href="${liveUrl}" target="_blank" class="btn btn-primary">View on website</a>` : ''}
          <a href="#/${kind}" class="btn btn-outline">Back to ${meta.label}</a>
        </div>
      </div>
    </div>`;
}

// ---------- Field partials ----------
function textField(name, label, value = '', opts = {}) {
  return `<div class="admin-field"><label>${label}${opts.hint ? `<span class="hint">${opts.hint}</span>` : ''}</label>
    <input type="${opts.type || 'text'}" name="${name}" id="${opts.id || ''}" value="${(value || '').toString().replace(/"/g, '&quot;')}" ${opts.placeholder ? `placeholder="${opts.placeholder}"` : ''}></div>`;
}
function textareaField(name, label, value = '', opts = {}) {
  return `<div class="admin-field"><label>${label}${opts.hint ? `<span class="hint">${opts.hint}</span>` : ''}</label>
    <textarea name="${name}">${value || ''}</textarea></div>`;
}
function selectField(name, label, options, value = '') {
  return `<div class="admin-field"><label>${label}</label><select name="${name}">
    ${options.map(o => `<option value="${o}" ${o === value ? 'selected' : ''}>${o}</option>`).join('')}
  </select></div>`;
}
function checkboxField(name, label, checked = false) {
  return `<div class="admin-field"><label><input type="checkbox" name="${name}" ${checked ? 'checked' : ''} style="width:auto; margin-right:0.5rem;">${label}</label></div>`;
}
function imageFieldHTML(currentImage) {
  return `
    <div class="admin-field">
      <label>Image</label>
      <div class="admin-image-field" style="align-items:flex-start; flex-direction:column;">
        <div style="display:flex; align-items:center; gap:1rem; margin-bottom:0.75rem;">
          <img id="imagePreview" class="admin-image-preview" src="${currentImage || '/yao-xie.png'}" alt="">
          <span id="imagePathLabel" style="font-size:12px; color:var(--ink-soft);">${currentImage || 'No image selected'}</span>
        </div>
        <input type="text" id="mediaSearch" placeholder="Search media…" style="width:100%; padding:8px 12px; border:1px solid var(--rule); border-radius:4px; font-size:13px; margin-bottom:0.75rem;">
        <div class="media-picker-grid" id="mediaPickerGrid"><p style="color:var(--ink-soft); font-size:13px;">Loading media library…</p></div>
        <label class="admin-upload-btn" style="margin-top:0.75rem;">Or upload a new image<input type="file" id="imageUpload" accept="image/*" style="display:none;"></label>
      </div>
      <input type="hidden" id="imagePath" value="${currentImage || ''}">
    </div>`;
}

// Populates the media picker grid from whatever is actually in the repo's
// /media/ folder right now, and highlights the current image if it's in there.
// This is the reliable path: uploading a file to /media/ directly through
// GitHub's own web UI has none of the deploy-timing issues the in-panel
// uploader can hit, so picking from what's already there sidesteps that.
async function wireImagePicker(gridId, previewId, hiddenId, currentImage) {
  const grid = document.getElementById(gridId);
  const searchInput = document.getElementById('mediaSearch');
  if (!grid) return;

  let files = [];
  try {
    files = (await listDir('media')).filter(f => f.type === 'file');
  } catch (e) {
    grid.innerHTML = `<p style="color:#a13527; font-size:13px;">Couldn't load the media library: ${e.message}</p>`;
    return;
  }

  if (files.length === 0) {
    grid.innerHTML = `<p style="color:var(--ink-soft); font-size:13px; max-width:340px;">
      No images in <code>/media/</code> yet. Upload photos directly on GitHub
      (drag files into the <code>media</code> folder → Commit), then reopen this page.
    </p>`;
    return;
  }

  function selectFile(path) {
    document.getElementById(hiddenId).value = path;
    document.getElementById(previewId).src = sessionImageCache[path] || path;
    document.getElementById('imagePathLabel').textContent = path;
    grid.querySelectorAll('.media-picker-tile').forEach(t => t.classList.toggle('selected', t.dataset.path === path));
  }

  function renderGrid(filterText) {
    const filtered = filterText
      ? files.filter(f => f.name.toLowerCase().includes(filterText.toLowerCase()))
      : files;
    if (filtered.length === 0) {
      grid.innerHTML = `<p style="color:var(--ink-soft); font-size:13px;">No matches.</p>`;
      return;
    }
    grid.innerHTML = filtered.map(f => {
      const path = `/${f.path}`;
      const isSelected = path === currentImage;
      return `
        <button type="button" class="media-picker-tile${isSelected ? ' selected' : ''}" data-path="${path}" title="${f.name}">
          <img src="${sessionImageCache[path] || path}" alt="${f.name}">
          <span>${f.name}</span>
        </button>`;
    }).join('');
    grid.querySelectorAll('.media-picker-tile').forEach(tile => {
      tile.addEventListener('click', () => selectFile(tile.dataset.path));
    });
  }

  renderGrid('');
  if (searchInput) searchInput.addEventListener('input', () => renderGrid(searchInput.value));
}
function wireImageField(uploadId, previewId, hiddenId, current) {
  const uploadEl = document.getElementById(uploadId);
  if (!uploadEl) return;
  uploadEl.addEventListener('change', async () => {
    const file = uploadEl.files[0];
    if (!file) return;
    const preview = document.getElementById(previewId);
    const wrapper = preview.closest('.admin-image-field');
    let statusEl = wrapper.querySelector('.upload-status');
    if (!statusEl) {
      statusEl = document.createElement('span');
      statusEl.className = 'upload-status';
      statusEl.style.cssText = 'font-size:12px; color:var(--ink-soft);';
      wrapper.appendChild(statusEl);
    }
    preview.style.opacity = '0.5';
    statusEl.textContent = 'Uploading…';
    try {
      const slugHint = (document.getElementById('f_title')?.value || 'image').toLowerCase().replace(/[^a-z0-9]+/g, '-');
      const { path, previewUrl } = await uploadImage(file, `${slugHint}-${Date.now()}`);
      document.getElementById(hiddenId).value = path;
      // Show the local copy immediately — the live GitHub Pages URL can take
      // a minute or two to go live after this commit, so it isn't reliable yet.
      preview.src = previewUrl;
      statusEl.textContent = '✓ Uploaded — may take a minute to appear on the live site';
    } catch (e) {
      statusEl.textContent = '';
      alert('Image upload failed: ' + e.message);
    } finally {
      preview.style.opacity = '1';
    }
  });
}

function newsFormHTML(d, presetCategory) {
  const cfgOpts = FIELD_CONFIGS.news.categories;
  return `
    ${textField('title', 'Title', d.title, { id: 'f_title' })}
    <div class="admin-field"><span class="slug-preview" id="slugPreview">${d.slug ? `/news/${d.slug}/` : ''}</span></div>
    ${textareaField('summary', "What happened?", d.summary)}
    <div class="admin-field-row">
      ${textField('date', 'Date', d.date || todayISO(), { type: 'date' })}
      ${selectField('category', 'Category', cfgOpts, d.category || presetCategory || cfgOpts[0])}
    </div>
    ${imageFieldHTML(d.image)}
    ${textField('link', 'Link (optional)', d.link || '', { placeholder: 'https://…' })}
    <details class="admin-more">
      <summary>More details</summary>
      ${textareaField('body', 'Full story', d.body)}
      ${textField('sourceName', 'External source name', d.source?.name)}
      ${textField('sourceUrl', 'External source URL', d.source?.url)}
      ${textField('relatedProject', 'Related project slug', d.related?.project)}
      ${textField('relatedInitiative', 'Related initiative slug', d.related?.initiative)}
      ${textField('relatedPublication', 'Related publication slug', d.related?.publication)}
    </details>
    ${checkboxField('featured', 'Feature this on the homepage', d.featured)}
  `;
}

function projectFormHTML(d) {
  return `
    ${textField('title', 'Project name', d.title, { id: 'f_title' })}
    <div class="admin-field"><span class="slug-preview" id="slugPreview">${d.slug ? `/projects/${d.slug}/` : ''}</span></div>
    ${textareaField('summary', 'One-line description', d.summary)}
    ${selectField('projectStatus', 'Status', FIELD_CONFIGS.projects.statuses, d.status || 'Exploring')}
    ${imageFieldHTML(d.image)}
    ${textareaField('building', "What are you building?", d.building)}
    <details class="admin-more">
      <summary>More details</summary>
      ${textareaField('problem', 'The problem', d.problem)}
      ${textareaField('idea', 'The idea', d.idea)}
      ${textareaField('stage', 'Current stage', d.stage)}
      ${textField('relatedInitiative', 'Related initiative slug', d.related?.initiative)}
      ${textField('relatedPublication', 'Related publication slug', d.related?.publication)}
    </details>
  `;
}

function initiativeFormHTML(d) {
  return `
    ${textField('title', 'Initiative name', d.title, { id: 'f_title' })}
    <div class="admin-field"><span class="slug-preview" id="slugPreview">${d.slug ? `/initiatives/${d.slug}/` : ''}</span></div>
    ${textareaField('summary', 'Short description', d.summary)}
    ${selectField('initiativeStatus', 'Status', FIELD_CONFIGS.initiatives.statuses, d.status || 'Building')}
    ${textField('website', 'Website (optional)', d.website)}
    ${imageFieldHTML(d.image)}
    ${textareaField('overview', 'Description', d.overview)}
    <details class="admin-more">
      <summary>More details</summary>
      ${textareaField('what', 'What it does', d.what)}
      ${textareaField('role', 'My role', d.role)}
    </details>
    ${checkboxField('featured', 'Flagship initiative (shown first in Build)', d.featured)}
  `;
}

function publicationFormHTML(d) {
  return `
    ${textField('title', 'Title', d.title, { id: 'f_title' })}
    ${textField('authors', 'Authors', d.authors || 'Yao Xie')}
    ${textField('venue', 'Journal / Venue', d.venue)}
    <div class="admin-field-row">
      ${textField('year', 'Year', d.year || new Date().getFullYear(), { type: 'number' })}
      ${selectField('type', 'Type', FIELD_CONFIGS.publications.types, d.type || 'Journal article')}
    </div>
    ${textField('url', 'DOI / URL', d.url, { placeholder: 'https://…' })}
    <details class="admin-more">
      <summary>More details</summary>
      ${textareaField('abstract', 'Abstract (optional)', d.abstract)}
    </details>
    ${checkboxField('featured', 'Feature on homepage', d.featured)}
  `;
}

// ============================================================
// Media library
// ============================================================
async function renderMedia() {
  app().innerHTML = `<p class="admin-sub">Loading media…</p>`;
  const files = (await listDir('media')).filter(f => f.type === 'file');
  app().innerHTML = `
    <h1 class="admin-h1">Media library</h1>
    <p class="admin-sub">The most reliable way to add photos: upload them straight to the <code>media</code> folder on GitHub.com (drag and drop works there), then pick them from the dropdown in any News/Project/Initiative form. You can also upload directly from here if you prefer — same result, just a second path.</p>
    <label class="admin-upload-btn" style="display:inline-block; margin-bottom:2rem;">+ Upload image<input type="file" id="mediaUpload" accept="image/*" style="display:none;"></label>
    <div class="media-grid" id="mediaGrid">
      ${files.map(f => `
        <div class="media-item">
          <img src="${sessionImageCache['/' + f.path] || '/' + f.path}" alt="">
          <div class="path">/${f.path}</div>
        </div>
      `).join('') || '<p style="color:var(--ink-soft); font-size:14px;">No images uploaded yet.</p>'}
    </div>
  `;
  document.getElementById('mediaUpload').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      await uploadImage(file, slugify(file.name.replace(/\.[^.]+$/, '')) + '-' + Date.now());
      renderMedia();
    } catch (err) { alert('Upload failed: ' + err.message); }
  });
}

// ============================================================
// Homepage editor
// ============================================================
async function renderHomepageEditor() {
  app().innerHTML = `<p class="admin-sub">Loading…</p>`;
  const [{ items: projects }, { items: initiatives }, { items: publications }, homepageFile] = await Promise.all([
    getJSON(CONTENT_KINDS.projects.path),
    getJSON(CONTENT_KINDS.initiatives.path),
    getJSON(CONTENT_KINDS.publications.path),
    getFile('content/homepage.json'),
  ]);
  const hp = homepageFile ? JSON.parse(homepageFile.content) : {};
  const hpSha = homepageFile ? homepageFile.sha : null;

  const projectOpts = projects.map(p => `<option value="${p.slug}" ${(hp.featuredProjects||[]).includes(p.slug) ? 'selected' : ''}>${p.title}</option>`).join('');
  const initiativeOpts = initiatives.map(i => `<option value="${i.slug}" ${hp.featuredInitiative === i.slug ? 'selected' : ''}>${i.title}</option>`).join('');
  const pubOpts = publications.map(p => `<option value="${p.slug}" ${(hp.featuredPublications||[]).includes(p.slug) ? 'selected' : ''}>${p.title}</option>`).join('');

  app().innerHTML = `
    <h1 class="admin-h1">Homepage</h1>
    <p class="admin-sub">Controls the hero and the featured teasers. Latest News always shows automatically — nothing to manage there.</p>
    <div class="admin-card">
      <div class="admin-section-title" style="margin-top:0;">Hero</div>
      ${textField('heroHeadline', 'Headline (HTML allowed for emphasis, e.g. <em>context</em>)', hp.heroHeadline)}
      ${textareaField('heroDescription', 'Description', hp.heroDescription)}
      <div class="admin-field-row">
        ${textField('heroButtonLabel', 'Primary button text', hp.heroButtonLabel)}
        ${textField('heroButtonLink', 'Primary button link', hp.heroButtonLink)}
      </div>
      ${textField('territoryLine', 'Territory line (the italic band under the hero)', hp.territoryLine)}

      <div class="admin-section-title">Featured initiative</div>
      <div class="admin-field"><select name="featuredInitiative">${initiativeOpts}</select></div>

      <div class="admin-section-title">Featured projects <span style="font-weight:400; color:var(--ink-soft);">(cmd/ctrl-click for multiple)</span></div>
      <div class="admin-field"><select name="featuredProjects" multiple size="4">${projectOpts}</select></div>

      <div class="admin-section-title">Featured writing <span style="font-weight:400; color:var(--ink-soft);">(cmd/ctrl-click for multiple)</span></div>
      <div class="admin-field"><select name="featuredPublications" multiple size="4">${pubOpts}</select></div>

      <div class="admin-form-actions">
        <button class="btn btn-primary" id="saveHomepageBtn">Save changes</button>
      </div>
    </div>
  `;

  document.getElementById('saveHomepageBtn').addEventListener('click', async () => {
    const form = app().querySelector('.admin-card');
    const newHp = {
      heroHeadline: form.querySelector('[name=heroHeadline]').value,
      heroDescription: form.querySelector('[name=heroDescription]').value,
      heroButtonLabel: form.querySelector('[name=heroButtonLabel]').value,
      heroButtonLink: form.querySelector('[name=heroButtonLink]').value,
      territoryLine: form.querySelector('[name=territoryLine]').value,
      featuredInitiative: form.querySelector('[name=featuredInitiative]').value,
      featuredProjects: Array.from(form.querySelector('[name=featuredProjects]').selectedOptions).map(o => o.value),
      featuredPublications: Array.from(form.querySelector('[name=featuredPublications]').selectedOptions).map(o => o.value),
    };
    const btn = document.getElementById('saveHomepageBtn');
    btn.disabled = true; btn.textContent = 'Saving…';
    try {
      await saveJSON('content/homepage.json', newHp, 'Update homepage content', hpSha);
      showBanner(app(), 'success', 'Homepage updated.');
      btn.disabled = false; btn.textContent = 'Save changes';
    } catch (e) {
      showBanner(app(), 'error', 'Failed: ' + e.message);
      btn.disabled = false; btn.textContent = 'Save changes';
    }
  });
}
