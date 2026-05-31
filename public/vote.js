const slug = location.pathname.split('/').pop();
const storageKey = `voter:${slug}`;

const introForm = document.getElementById('intro-form');
const projectError = document.getElementById('project-error');
const nameInput = document.getElementById('name-input');
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

introForm.addEventListener('submit', (event) => {
  event.preventDefault();
  startVoting();
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

  if (!res.ok) {
    if (res.status === 404) {
      showProjectMissing();
      return;
    }
    nameInput.classList.add('name-input--error');
    return;
  }

  const voter = await res.json();
  voterToken = voter.token;
  sessionStorage.setItem(storageKey, voterToken);
  applyVotes(voter.votes);
  showVoteUi();
  await showCurrent();
}

function applyVotes(votesMap) {
  votes.clear();
  for (const [imageId, vote] of Object.entries(votesMap || {})) {
    votes.set(imageId, vote);
  }
}

async function syncVotesFromServer() {
  if (!voterToken) return false;

  const res = await fetch(`/api/sessions/${slug}/voters/${voterToken}`);
  if (!res.ok) {
    sessionStorage.removeItem(storageKey);
    voterToken = null;
    votes.clear();
    showIntro();
    return false;
  }

  const voter = await res.json();
  applyVotes(voter.votes);
  return true;
}

function clearStageMessages() {
  stage.querySelector('.done')?.remove();
  stage.querySelector('.empty')?.remove();
}

async function load() {
  const imagesRes = await fetch('/api/images');
  images = await imagesRes.json();

  const sessionRes = await fetch(`/api/sessions/${slug}`);
  if (!sessionRes.ok) {
    sessionStorage.removeItem(storageKey);
    voterToken = null;
    showProjectMissing();
    return;
  }

  if (!voterToken) {
    showIntro();
    return;
  }

  if (!(await syncVotesFromServer())) {
    return;
  }

  showVoteUi();
  await showCurrent();
}

function showProjectMissing() {
  clearStageMessages();
  introForm.hidden = true;
  voteUi.hidden = true;
  projectError.hidden = false;
}

function showIntro() {
  clearStageMessages();
  card.hidden = false;
  cardImg.removeAttribute('src');
  projectError.hidden = true;
  introForm.hidden = false;
  voteUi.hidden = true;
  nameInput.classList.remove('name-input--error');
  nameInput.focus();
}

function showVoteUi() {
  introForm.hidden = true;
  voteUi.hidden = false;
  projectError.hidden = true;
}

function currentImage() {
  return images.find((image) => !votes.has(image.id));
}

function updateProgress() {
  const total = images.length;
  const voted = votes.size;

  if (!total || voted >= total) {
    progress.hidden = true;
    return;
  }

  progress.hidden = false;
  progress.textContent = `${voted + 1} / ${total}`;
}

function showDone() {
  clearStageMessages();
  card.hidden = true;

  let done = stage.querySelector('.done');
  if (!done) {
    done = document.createElement('div');
    done.className = 'done';
    done.innerHTML = `
      <p>Thank you.</p>
      <p>Please wait for our response.</p>
      <button id="another" class="intro-btn intro-btn--inline" type="button">→</button>
    `;
    stage.appendChild(done);
    done.querySelector('#another').addEventListener('click', () => {
      sessionStorage.removeItem(storageKey);
      voterToken = null;
      votes.clear();
      nameInput.value = '';
      done.remove();
      showIntro();
    });
  }

  actions.hidden = true;
  progress.hidden = true;
}

function loadCardImage(url) {
  return new Promise((resolve) => {
    const onDone = (ok) => {
      cardImg.onload = null;
      cardImg.onerror = null;
      resolve(ok);
    };

    cardImg.onload = () => onDone(true);
    cardImg.onerror = () => onDone(false);
    cardImg.src = url;

    if (cardImg.complete && cardImg.naturalWidth > 0) {
      onDone(true);
    }
  });
}

async function showCurrent() {
  clearStageMessages();

  if (!images.length) {
    card.hidden = true;
    actions.hidden = true;
    progress.hidden = false;
    progress.textContent = '—';
    return;
  }

  const image = currentImage();
  if (!image) {
    showDone();
    return;
  }

  actions.hidden = false;
  card.hidden = false;
  card.className = 'swipe-card';
  updateProgress();

  const loaded = await loadCardImage(image.url);
  if (!loaded) {
    cardImg.src = image.url;
  }
}

async function submitVote(type) {
  if (busy || !voterToken) return;

  const image = currentImage();
  if (!image) return;

  busy = true;
  btnDislike.disabled = true;
  btnLike.disabled = true;
  card.classList.add(type === 'like' ? 'fly-right' : 'fly-left');

  try {
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
    } else {
      await syncVotesFromServer();
    }
  } catch {
    await syncVotesFromServer();
  } finally {
    card.classList.remove('fly-right', 'fly-left');
    busy = false;
    btnDislike.disabled = false;
    btnLike.disabled = false;
    await showCurrent();
  }
}

load();
