const slug = location.pathname.split('/').pop();
const projectName = document.getElementById('project-name');
const aggregatedWrap = document.getElementById('aggregated');
const votersWrap = document.getElementById('voters');
const voterDetail = document.getElementById('voter-detail');
const voterDetailName = document.getElementById('voter-detail-name');
const likedWrap = document.getElementById('liked');
const dislikedWrap = document.getElementById('disliked');
const lightbox = document.getElementById('lightbox');
const lightboxImg = document.getElementById('lightbox-img');
const lightboxClose = document.getElementById('lightbox-close');

let selectedVoterToken = null;

lightboxClose.addEventListener('click', closeLightbox);
lightbox.addEventListener('click', (event) => {
  if (event.target === lightbox) closeLightbox();
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') closeLightbox();
});

function openLightbox(url) {
  lightboxImg.src = url;
  lightbox.hidden = false;
}

function closeLightbox() {
  lightbox.hidden = true;
  lightboxImg.src = '';
}

function renderGallery(container, images, withCount) {
  container.innerHTML = '';

  if (!images.length) {
    container.innerHTML = '<div class="empty">—</div>';
    return;
  }

  for (const image of images) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'gallery-item';

    const img = document.createElement('img');
    img.src = image.url;
    img.alt = '';
    img.loading = 'lazy';
    button.appendChild(img);

    if (withCount) {
      const count = document.createElement('span');
      count.className = 'gallery-item__count';
      count.textContent = String(image.likes);
      button.appendChild(count);
    }

    button.addEventListener('click', () => openLightbox(image.url));
    container.appendChild(button);
  }
}

function renderVoters(voters) {
  votersWrap.innerHTML = '';

  if (!voters.length) {
    votersWrap.innerHTML = '<div class="empty">—</div>';
    voterDetail.hidden = true;
    return;
  }

  for (const voter of voters) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'voter-chip';
    button.textContent = voter.name;
    button.dataset.token = voter.token;

    if (voter.token === selectedVoterToken) {
      button.classList.add('voter-chip--active');
    }

    button.addEventListener('click', () => selectVoter(voter));
    votersWrap.appendChild(button);
  }
}

function selectVoter(voter) {
  selectedVoterToken = voter.token;
  voterDetail.hidden = false;
  voterDetailName.textContent = voter.name;
  renderGallery(likedWrap, voter.liked, false);
  renderGallery(dislikedWrap, voter.disliked, false);

  document.querySelectorAll('.voter-chip').forEach((chip) => {
    chip.classList.toggle('voter-chip--active', chip.dataset.token === voter.token);
  });
}

async function loadProject() {
  const res = await fetch(`/api/sessions/${slug}/detail`);

  if (!res.ok) {
    aggregatedWrap.innerHTML = '<div class="empty">—</div>';
    votersWrap.innerHTML = '<div class="empty">—</div>';
    return;
  }

  const data = await res.json();
  projectName.textContent = data.slug;
  renderGallery(aggregatedWrap, data.aggregated, true);
  renderVoters(data.voters);

  if (data.voters.length) {
    selectVoter(data.voters[0]);
  }
}

requireAdmin(loadProject);
