const createBtn = document.getElementById('create');
const slugInput = document.getElementById('slug-input');
const latestLink = document.getElementById('latest-link');
const projectsWrap = document.getElementById('projects');

createBtn.addEventListener('click', () => {
  slugInput.hidden = false;
  slugInput.value = '';
  slugInput.focus();
});

slugInput.addEventListener('keydown', async (event) => {
  if (event.key !== 'Enter') return;

  const slug = slugInput.value.trim();
  if (!slug) return;

  const res = await fetch('/api/sessions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ slug }),
  });

  if (!res.ok) {
    slugInput.classList.add('slug-input--error');
    return;
  }

  slugInput.classList.remove('slug-input--error');
  slugInput.hidden = true;

  const session = await res.json();
  const fullUrl = `${location.origin}${session.url}`;
  latestLink.hidden = false;
  latestLink.textContent = fullUrl;
  latestLink.href = session.url;
  await navigator.clipboard.writeText(fullUrl);
  await loadProjects();
});

function formatSessionMeta(session) {
  const parts = [];

  if (session.completed) {
    parts.push(`${session.completed} done`);
  }

  if (session.incomplete) {
    parts.push(`${session.incomplete} open`);
  }

  return parts.length ? parts.join(' · ') : '—';
}

async function deleteProject(slug) {
  const res = await fetch(`/api/sessions/${slug}`, { method: 'DELETE' });
  if (!res.ok) return;

  if (latestLink.textContent.includes(`/v/${slug}`)) {
    latestLink.hidden = true;
    latestLink.textContent = '';
    latestLink.href = '#';
  }

  await loadProjects();
}

async function loadProjects() {
  const res = await fetch('/api/sessions');
  const data = await res.json();

  if (!data.sessions.length) {
    projectsWrap.innerHTML = '<div class="empty">—</div>';
    return;
  }

  projectsWrap.innerHTML = '';

  for (const session of data.sessions) {
    const row = document.createElement('div');
    row.className = 'project-item';

    const link = document.createElement('a');
    link.className = 'project-item__link';
    link.href = session.admin_url;
    link.innerHTML = `
      <span class="project-item__name">${session.slug}</span>
      <span class="project-item__meta">${formatSessionMeta(session)}</span>
    `;

    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'icon-btn icon-btn--small project-item__delete';
    deleteBtn.textContent = '×';
    deleteBtn.addEventListener('click', (event) => {
      event.preventDefault();
      deleteProject(session.slug);
    });

    row.appendChild(link);
    row.appendChild(deleteBtn);
    projectsWrap.appendChild(row);
  }
}

loadProjects();
