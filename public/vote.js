const slug = location.pathname.split('/').pop();
const storageKey = `voter:${slug}`;

const intro = document.getElementById('intro');
const nameInput = document.getElementById('name-input');
const nameSubmit = document.getElementById('name-submit');
const voteUi = document.getElementById('vote-ui');
const progress = document.getElementById('progress');
const stage = document.getElementById('stage');
const card = document.getElementById('card');
const cardImg = document.getElementById('card-img');
const actions = document.getElementById('actions');
const btnDislike = document.getElementById('dislike');
const btnLike = document.getElementById('like');

let images = [];
let voterToken = sessionStorage.getItem(storageKey);
const votes = new Map();
let busy = false;

nameSubmit.addEventListener('click', startVoting);
nameInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') startVoting();
});

btnDislike.addEventListener('click', () => submitVote('dislike'));
btnLike.addEventListener('click', () => submitVote('like'));

async function startVoting() {
  const name = nameInput.value.trim();
  if (!name) {
    nameInput.classList.add('name-input--error');
    return;
  }

  nameInput.classList.remove('name-input--error');

  const res = await fetch(`/api/sessions/${slug}/voters`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });

  if (!res.ok) return;

  const voter = await res.json();
  voterToken = voter.token;
  sessionStorage.setItem(storageKey, voterToken);
  applyVotes(voter.votes);
  showVoteUi();
  showCurrent();
}

function applyVotes(votesMap) {
  votes.clear();
  for (const [imageId, vote] of Object.entries(votesMap || {})) {
    votes.set(imageId, vote);
  }
}

async function load() {
  const sessionRes = await fetch(`/api/sessions/${slug}`);
  if (!sessionRes.ok) {
    showError();
    return;
  }

  const imagesRes = await fetch('/api/images');
  images = await imagesRes.json();

  if (!voterToken) {
    showIntro();
    return;
  }

  const voterRes = await fetch(`/api/sessions/${slug}/voters/${voterToken}`);
  if (!voterRes.ok) {
    sessionStorage.removeItem(storageKey);
    voterToken = null;
    showIntro();
    return;
  }

  const voter = await voterRes.json();
  applyVotes(voter.votes);
  showVoteUi();
  showCurrent();
}

function showIntro() {
  intro.hidden = false;
  voteUi.hidden = true;
  nameInput.focus();
}

function showVoteUi() {
  intro.hidden = true;
  voteUi.hidden = false;
}

function showError() {
  intro.hidden = true;
  voteUi.hidden = false;
  stage.innerHTML = '<div class="empty">—</div>';
  actions.hidden = true;
  progress.hidden = true;
}

function currentImage() {
  return images.find((image) => !votes.has(image.id));
}

function updateProgress() {
  const total = images.length;
  const voted = votes.size;

  if (voted >= total) {
    progress.hidden = true;
    return;
  }

  progress.hidden = false;
  progress.textContent = `${voted + 1} / ${total}`;
}

function showDone() {
  stage.innerHTML = `
    <div class="done">
      <p>Thank you.</p>
      <p>Please wait for our response.</p>
      <button id="another" class="intro-btn intro-btn--inline" type="button">→</button>
    </div>
  `;
  actions.hidden = true;
  progress.hidden = true;

  document.getElementById('another').addEventListener('click', () => {
    sessionStorage.removeItem(storageKey);
    voterToken = null;
    votes.clear();
    nameInput.value = '';
    showIntro();
  });
}

function showCurrent() {
  const image = currentImage();

  if (!image) {
    showDone();
    return;
  }

  actions.hidden = false;
  updateProgress();
  card.className = 'swipe-card';
  cardImg.src = image.url;
  stage.innerHTML = '';
  stage.appendChild(card);
}

async function submitVote(type) {
  if (busy || !voterToken) return;

  const image = currentImage();
  if (!image) return;

  busy = true;
  btnDislike.disabled = true;
  btnLike.disabled = true;

  card.classList.add(type === 'like' ? 'fly-right' : 'fly-left');

  const res = await fetch(`/api/sessions/${slug}/voters/${voterToken}/vote`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      imageId: image.id,
      liked: type === 'like',
    }),
  });

  await new Promise((resolve) => setTimeout(resolve, 220));

  if (res.ok) {
    votes.set(image.id, type);
  }

  card.classList.remove('fly-right', 'fly-left');
  busy = false;
  btnDislike.disabled = false;
  btnLike.disabled = false;
  showCurrent();
}

load();
