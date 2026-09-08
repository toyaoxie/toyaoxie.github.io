// ============================================================
// site.js — shared front-end logic. All content is fetched from
// /content/*.json at runtime; this file only knows how to render it.
// The admin panel (/admin/) writes those JSON files via the GitHub API —
// this file has no knowledge of the admin and never writes anything.
// ============================================================

document.addEventListener('DOMContentLoaded', () => {
  const navToggle = document.getElementById('navToggle');
  const navLinks = document.getElementById('navLinks');
  if (navToggle && navLinks) {
    navToggle.addEventListener('click', () => navLinks.classList.toggle('open'));
    navLinks.querySelectorAll('a').forEach(a => a.addEventListener('click', () => navLinks.classList.remove('open')));
  }
});

async function fetchJSON(path) {
  const res = await fetch(path, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Failed to load ${path}: ${res.status}`);
  return res.json();
}

function publishedOnly(items) {
  return items.filter(i => (i.status || i.publishStatus) === 'published');
}

function sortByDateDesc(items) {
  return [...items].sort((a, b) => (b.date || `${b.year}-01-01`).localeCompare(a.date || `${a.year}-01-01`));
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const [y, m] = dateStr.split('-');
  const months = ['','Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return m ? `${months[parseInt(m,10)]} ${y}` : y;
}

// ---------- Homepage ----------
async function renderHomepage() {
  try {
    const [homepage, news, projects, publications] = await Promise.all([
      fetchJSON('/content/homepage.json'),
      fetchJSON('/content/news.json'),
      fetchJSON('/content/projects.json').catch(() => []),
      fetchJSON('/content/publications.json').catch(() => [])
    ]);

    const headlineEl = document.getElementById('heroHeadline');
    if (headlineEl) headlineEl.innerHTML = homepage.heroHeadline;
    const descEl = document.getElementById('heroDescription');
    if (descEl) descEl.textContent = homepage.heroDescription;
    const btnEl = document.getElementById('heroButton');
    if (btnEl) { btnEl.textContent = homepage.heroButtonLabel + ' →'; btnEl.href = homepage.heroButtonLink; }
    const territoryEl = document.getElementById('territoryLine');
    if (territoryEl) territoryEl.textContent = homepage.territoryLine;

    const currentlyEl = document.getElementById('currentlyList');
    if (currentlyEl && homepage.currently) {
      homepage.currently.forEach(item => {
        const li = document.createElement('li');
        li.innerHTML = `${item.title} <span>— ${item.meta}</span>`;
        currentlyEl.appendChild(li);
      });
    }

    // Featured initiative (flagship, shown first in the homepage "Build" teaser)
    const featProjEl = document.getElementById('homeFeaturedProjects');
    if (featProjEl && homepage.featuredInitiative) {
      const initiatives = await fetchJSON('/content/initiatives.json').catch(() => []);
      const flagship = initiatives.find(i => i.slug === homepage.featuredInitiative);
      if (flagship) {
        const a = document.createElement('a');
        a.href = `/initiatives/${flagship.slug}/`;
        a.className = 'mini-card';
        a.innerHTML = `<span class="tag">Flagship initiative</span><h4>${flagship.title}</h4><p>${flagship.summary}</p>`;
        featProjEl.appendChild(a);
      }
    }

    // Featured projects (homepage "Selected work" teaser)
    if (featProjEl && homepage.featuredProjects) {
      homepage.featuredProjects.forEach(slug => {
        const p = projects.find(x => x.slug === slug);
        if (!p) return;
        const a = document.createElement('a');
        a.href = `/projects/${p.slug}/`;
        a.className = 'mini-card';
        a.innerHTML = `<span class="tag">${p.status}</span><h4>${p.title}</h4><p>${p.summary}</p>`;
        featProjEl.appendChild(a);
      });
    }

    // Featured publications (homepage "Selected writing" teaser)
    const featPubEl = document.getElementById('homeFeaturedPublications');
    if (featPubEl && homepage.featuredPublications) {
      homepage.featuredPublications.forEach(slug => {
        const p = publications.find(x => x.slug === slug);
        if (!p) return;
        const li = document.createElement('li');
        li.innerHTML = `<div><strong>${p.title}</strong><span class="meta"><em>${p.venue}</em></span></div><span class="year">${p.year}</span>`;
        featPubEl.appendChild(li);
      });
    }

    const newsTeaser = document.getElementById('homeNewsList');
    if (newsTeaser) {
      const published = sortByDateDesc(publishedOnly(news));
      published.slice(0, 3).forEach(item => {
        const a = document.createElement('a');
        a.className = 'mini-news-item';
        a.href = `/news/${item.slug}/`;
        a.innerHTML = `<div class="news-meta">${formatDate(item.date)}</div><h4>${item.title}</h4>`;
        newsTeaser.appendChild(a);
      });
    }
  } catch (e) {
    console.error('Homepage render failed:', e);
  }
}

// ---------- Archive grids (News / Projects / Initiatives) ----------
// News no longer uses photos — each category gets an on-brand colored card
// instead, so there's nothing to upload for a News item at all.
const NEWS_CATEGORY_STYLE = {
  'Speaking':             { cls: 'cat-speaking',    icon: 'fa-microphone-lines' },
  'Publication':          { cls: 'cat-publication', icon: 'fa-book-open' },
  'Recognition':          { cls: 'cat-recognition', icon: 'fa-award' },
  'Academic Leadership':  { cls: 'cat-academic',    icon: 'fa-graduation-cap' },
  'Research':             { cls: 'cat-research',    icon: 'fa-flask' },
  'ContextWell':          { cls: 'cat-contextwell', icon: 'fa-microchip' },
};
function newsVisualHTML(category, extraClass) {
  const style = NEWS_CATEGORY_STYLE[category] || { cls: 'cat-default', icon: 'fa-star' };
  return `<div class="news-visual ${style.cls}${extraClass ? ' ' + extraClass : ''}"><i class="fa-solid ${style.icon}"></i><span>${category || 'News'}</span></div>`;
}

function tileFor(item, basePath) {
  const a = document.createElement('a');
  a.className = 'content-tile';
  a.href = `${basePath}${item.slug}/`;
  const isNews = basePath === '/news/';
  const metaLine = item.status && !isNews
    ? `<span class="status">${item.status}</span>`
    : `<div class="news-meta">${formatDate(item.date)}${item.category ? ` <span class="cat"> · ${item.category}</span>` : ''}</div>`;
  const visual = isNews ? newsVisualHTML(item.category) : `<img class="thumb" src="${item.image}" alt="${item.title}">`;
  a.innerHTML = `
    ${visual}
    ${metaLine}
    <h3>${item.title}</h3>
    <p>${item.summary}</p>`;
  return a;
}

async function renderNewsArchive() {
  const container = document.getElementById('newsGrid');
  if (!container) return;
  try {
    const news = sortByDateDesc(publishedOnly(await fetchJSON('/content/news.json')));
    news.forEach(item => container.appendChild(tileFor(item, '/news/')));
  } catch (e) { console.error(e); }
}

async function renderProjectArchive() {
  const container = document.getElementById('projectsGrid');
  if (!container) return;
  try {
    const items = (await fetchJSON('/content/projects.json')).filter(i => i.publishStatus === 'published');
    items.forEach(item => container.appendChild(tileFor(item, '/projects/')));
  } catch (e) { console.error(e); }
}

async function renderInitiativeArchive() {
  const featuredContainer = document.getElementById('initiativesFeatured');
  const gridContainer = document.getElementById('initiativesGrid');
  try {
    const items = (await fetchJSON('/content/initiatives.json')).filter(i => i.publishStatus === 'published');
    const featured = items.filter(i => i.featured);
    const rest = items.filter(i => !i.featured);

    if (featuredContainer) {
      featured.forEach(item => {
        const a = document.createElement('a');
        a.href = `/initiatives/${item.slug}/`;
        a.className = 'project-card flagship';
        a.style.cssText = 'max-width:760px;display:block;text-decoration:none;color:var(--ink);';
        a.innerHTML = `<span class="status">${item.status}</span><h4 style="font-size:22px;">${item.title}</h4><p>${item.summary}</p>`;
        featuredContainer.appendChild(a);
      });
    }
    if (gridContainer) rest.forEach(item => gridContainer.appendChild(tileFor(item, '/initiatives/')));
  } catch (e) { console.error(e); }
}

// ---------- Publications (Write page) ----------
async function renderPublications() {
  const container = document.getElementById('pubList');
  if (!container) return;
  try {
    const pubs = (await fetchJSON('/content/publications.json'))
      .filter(p => p.status === 'published')
      .sort((a, b) => b.year - a.year);
    pubs.forEach(p => {
      const li = document.createElement('li');
      li.innerHTML = `
        <div><strong>${p.title}</strong><span class="meta"><em>${p.venue}</em></span></div>
        <span class="year">${p.year}</span>`;
      if (p.url) {
        const a = document.createElement('a');
        a.href = p.url; a.target = '_blank'; a.style.cssText = 'text-decoration:none;color:inherit;display:contents;';
        a.appendChild(li);
        container.appendChild(a);
      } else {
        container.appendChild(li);
      }
    });
  } catch (e) { console.error(e); }
}

// ---------- Generic detail-page renderer ----------
// Used identically by every /news/<slug>/, /projects/<slug>/, /initiatives/<slug>/ page.
// `kind` is "news" | "projects" | "initiatives".
// If the page was opened from the admin's Preview button, sessionStorage holds
// an unsaved draft under "previewItem" — that takes priority over fetching JSON,
// so Preview always uses the exact same template real published pages use.
async function renderDetailPage(kind) {
  const root = document.getElementById('postRoot');
  if (!root) return;

  const params = new URLSearchParams(location.search);
  let item;

  if (params.get('preview') === '1') {
    const raw = sessionStorage.getItem('previewItem');
    if (raw) item = JSON.parse(raw);
  }

  if (!item) {
    const slug = location.pathname.split('/').filter(Boolean).slice(-1)[0];
    const data = await fetchJSON(`/content/${kind}.json`);
    item = data.find(i => i.slug === slug);
  }

  if (!item) {
    root.innerHTML = `<p style="color: var(--ink-mid);">This ${kind.slice(0,-1)} isn't available.</p>`;
    return;
  }

  document.title = `${item.title} — Yao Xie`;

  let html = kind === 'news'
    ? newsVisualHTML(item.category, 'hero')
    : `<img class="post-hero" src="${item.image}" alt="${item.title}">`;

  if (kind === 'news') {
    html += `<div class="post-meta">${formatDate(item.date)} <span class="cat"> · ${item.category}</span></div>`;
    html += `<h1 style="margin-bottom: 1.5rem;">${item.title}</h1>`;
    html += `<div class="post-body"><p>${item.body || item.summary}</p></div>`;
    if (item.source && item.source.url) {
      html += `<p class="source-link">Coverage: <a href="${item.source.url}" target="_blank">${item.source.name} →</a></p>`;
    }
  } else if (kind === 'projects') {
    html += `<span class="status">${item.status}</span>`;
    html += `<h1 style="margin: 1rem 0 1.5rem;">${item.title}</h1>`;
    html += `<div class="post-body">`;
    if (item.problem) html += `<h3 class="subhead" style="margin-top:0;">The problem</h3><p>${item.problem}</p>`;
    if (item.idea) html += `<h3 class="subhead">The idea</h3><p>${item.idea}</p>`;
    if (item.building) html += `<h3 class="subhead">What I'm building</h3><p>${item.building}</p>`;
    if (item.stage) html += `<h3 class="subhead">Current stage</h3><p>${item.stage}</p>`;
    html += `</div>`;
  } else if (kind === 'initiatives') {
    html += `<span class="status">${item.status}</span>`;
    html += `<h1 style="margin: 1rem 0 1.5rem;">${item.title}</h1>`;
    html += `<div class="post-body"><p>${item.overview}</p>`;
    if (item.what) html += `<h3 class="subhead">What it does</h3><p>${item.what}</p>`;
    if (item.role) html += `<h3 class="subhead">My role</h3><p>${item.role}</p>`;
    html += `</div>`;
    if (item.website) html += `<p class="source-link"><a href="${item.website}" target="_blank">Visit →</a></p>`;
  }

  html += `<h3 class="subhead">Related</h3><div class="related-row">`;
  const rel = item.related || {};
  if (rel.project) html += `<a href="/projects/${rel.project}/" class="btn btn-outline btn-sm">Related project →</a>`;
  if (rel.initiative) html += `<a href="/initiatives/${rel.initiative}/" class="btn btn-outline btn-sm">Related initiative →</a>`;
  if (rel.publication) html += `<a href="/write.html" class="btn btn-outline btn-sm">Related publication →</a>`;
  if (!rel.project && !rel.initiative && !rel.publication) {
    html += `<a href="/build.html" class="btn btn-outline btn-sm">Build →</a><a href="/write.html" class="btn btn-outline btn-sm">Write →</a><a href="/news.html" class="btn btn-outline btn-sm">News →</a>`;
  }
  html += `</div>`;

  root.innerHTML = html;
}
