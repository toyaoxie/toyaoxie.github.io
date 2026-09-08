// Mobile nav toggle — include on every page after the nav markup.
document.addEventListener('DOMContentLoaded', () => {
  const navToggle = document.getElementById('navToggle');
  const navLinks = document.getElementById('navLinks');
  if (navToggle && navLinks) {
    navToggle.addEventListener('click', () => navLinks.classList.toggle('open'));
    navLinks.querySelectorAll('a').forEach(a => a.addEventListener('click', () => navLinks.classList.remove('open')));
  }
});

// Renders up to `count` items from newsItems into a "mini" homepage teaser list.
// Expects a container with id="homeNewsList" and `newsItems` (from news-data.js) already loaded.
function renderHomeNewsTeaser(count = 3) {
  const container = document.getElementById('homeNewsList');
  if (!container || typeof newsItems === 'undefined') return;
  newsItems.slice(0, count).forEach(item => {
    const a = document.createElement('a');
    a.className = 'mini-news-item';
    a.href = `/news/${item.slug}/`;
    a.innerHTML = `<div class="news-meta">${item.date}</div><h4>${item.title}</h4>`;
    container.appendChild(a);
  });
}

// Renders the full News archive grid (all items) into id="newsGrid".
function renderNewsArchive() {
  const container = document.getElementById('newsGrid');
  if (!container || typeof newsItems === 'undefined') return;
  newsItems.forEach(item => {
    const a = document.createElement('a');
    a.className = 'news-tile';
    a.href = `/news/${item.slug}/`;
    a.innerHTML = `
      <img class="thumb" src="${item.image}" alt="${item.title}">
      <div class="news-meta">${item.date}<span class="cat"> · ${item.category}</span></div>
      <h3>${item.title}</h3>
      <p>${item.summary}</p>`;
    container.appendChild(a);
  });
}
