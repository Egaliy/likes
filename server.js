const express = require('express');
const fs = require('fs');
const path = require('path');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;
const IMAGES_DIR = path.join(__dirname, 'images');
const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.svg']);

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/images', express.static(IMAGES_DIR));

function listImages() {
  if (!fs.existsSync(IMAGES_DIR)) {
    fs.mkdirSync(IMAGES_DIR, { recursive: true });
  }

  return fs
    .readdirSync(IMAGES_DIR)
    .filter((file) => IMAGE_EXTENSIONS.has(path.extname(file).toLowerCase()))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    .map((filename) => ({
      id: filename,
      url: `/images/${encodeURIComponent(filename)}`,
    }));
}

function slugify(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}

function buildVotesMap(votes) {
  return Object.fromEntries(
    votes.map((vote) => [vote.image_id, vote.liked ? 'like' : 'dislike'])
  );
}

function splitImagesByVotes(images, votesMap) {
  return {
    liked: images.filter((image) => votesMap[image.id] === 'like'),
    disliked: images.filter((image) => votesMap[image.id] === 'dislike'),
  };
}

function buildVoterPayload(voter, images) {
  const votes = db.getVotesForVoter(voter.id);
  const votesMap = buildVotesMap(votes);
  const split = splitImagesByVotes(images, votesMap);

  return {
    token: voter.token,
    name: voter.name,
    created_at: voter.created_at,
    votes: votesMap,
    voted: votes.length,
    total: images.length,
    complete: votes.length >= images.length,
    liked: split.liked,
    disliked: split.disliked,
  };
}

function buildAggregated(images, sessionId) {
  const voters = db.getVotersForSession(sessionId);
  const allVotes = db.getVotesForSession(sessionId);

  const stats = new Map(
    images.map((image) => [
      image.id,
      { likes: 0, dislikes: 0, image },
    ])
  );

  for (const vote of allVotes) {
    const entry = stats.get(vote.image_id);
    if (!entry) continue;
    if (vote.liked) {
      entry.likes += 1;
    } else {
      entry.dislikes += 1;
    }
  }

  return [...stats.values()]
    .map((entry) => ({
      ...entry.image,
      likes: entry.likes,
      dislikes: entry.dislikes,
      voters: voters.length,
    }))
    .sort((a, b) => {
      if (b.likes !== a.likes) return b.likes - a.likes;
      if (a.dislikes !== b.dislikes) return a.dislikes - b.dislikes;
      return a.id.localeCompare(b.id, undefined, { numeric: true });
    });
}

function buildSessionDetail(session, images) {
  const voters = db.getVotersForSession(session.id).map((voter) =>
    buildVoterPayload(voter, images)
  );

  return {
    slug: session.token,
    url: `/v/${session.token}`,
    created_at: session.created_at,
    total: images.length,
    voters_count: voters.length,
    aggregated: buildAggregated(images, session.id),
    voters,
  };
}

function getVoterInSession(slug, voterToken) {
  const session = db.getSessionByToken(slug);
  if (!session) return null;

  const voter = db.getVoterByToken(voterToken);
  if (!voter || voter.session_id !== session.id) return null;

  return { session, voter };
}

app.get('/api/images', (_req, res) => {
  res.json(listImages());
});

app.get('/api/sessions', (_req, res) => {
  const images = listImages();

  const sessions = db.getAllSessions().map((session) => {
    const stats = db.getVoterSessionStats(session.id, images.length);

    return {
      slug: session.token,
      url: `/v/${session.token}`,
      admin_url: `/p/${session.token}`,
      created_at: session.created_at,
      completed: stats.completed,
      incomplete: stats.incomplete,
      total: images.length,
    };
  });

  res.json({ sessions, total_images: images.length });
});

app.post('/api/sessions', (req, res) => {
  const slug = slugify(req.body.slug || req.body.name);

  if (!slug || !/^[a-z0-9-]{2,64}$/.test(slug)) {
    return res.status(400).json({ error: 'invalid_slug' });
  }

  const session = db.createSession(slug);
  if (!session) {
    return res.status(409).json({ error: 'slug_taken' });
  }

  res.json({
    ...session,
    slug: session.token,
    url: `/v/${session.token}`,
    admin_url: `/p/${session.token}`,
  });
});

app.delete('/api/sessions/:slug', (req, res) => {
  const deleted = db.deleteSessionByToken(req.params.slug);
  if (!deleted) {
    return res.status(404).json({ error: 'not_found' });
  }

  res.json({ ok: true });
});

app.get('/api/sessions/:slug', (req, res) => {
  const session = db.getSessionByToken(req.params.slug);
  if (!session) {
    return res.status(404).json({ error: 'not_found' });
  }

  const images = listImages();

  res.json({
    slug: session.token,
    created_at: session.created_at,
    total: images.length,
    voters_count: db.getVoterCount(session.id),
  });
});

app.get('/api/sessions/:slug/detail', (req, res) => {
  const session = db.getSessionByToken(req.params.slug);
  if (!session) {
    return res.status(404).json({ error: 'not_found' });
  }

  res.json(buildSessionDetail(session, listImages()));
});

app.post('/api/sessions/:slug/voters', (req, res) => {
  const session = db.getSessionByToken(req.params.slug);
  if (!session) {
    return res.status(404).json({ error: 'not_found' });
  }

  const name = String(req.body.name || '').trim();
  if (!name || name.length > 80) {
    return res.status(400).json({ error: 'invalid_name' });
  }

  const voter = db.createVoter(session.id, name);
  res.json(buildVoterPayload(voter, listImages()));
});

app.get('/api/sessions/:slug/voters/:voterToken', (req, res) => {
  const match = getVoterInSession(req.params.slug, req.params.voterToken);
  if (!match) {
    return res.status(404).json({ error: 'not_found' });
  }

  res.json(buildVoterPayload(match.voter, listImages()));
});

app.post('/api/sessions/:slug/voters/:voterToken/vote', (req, res) => {
  const match = getVoterInSession(req.params.slug, req.params.voterToken);
  if (!match) {
    return res.status(404).json({ error: 'not_found' });
  }

  const { imageId, liked } = req.body;
  if (!imageId || typeof liked !== 'boolean') {
    return res.status(400).json({ error: 'invalid_body' });
  }

  const images = listImages();
  if (!images.some((image) => image.id === imageId)) {
    return res.status(400).json({ error: 'invalid_image' });
  }

  db.setVote(match.voter.id, imageId, liked);

  const votes = db.getVotesForVoter(match.voter.id);
  res.json({ votes: buildVotesMap(votes) });
});

app.get('/v/:slug', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'vote.html'));
});

app.get('/p/:slug', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'project.html'));
});

app.get('/', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

module.exports = app;

if (require.main === module) {
  app.listen(PORT, () => {
    const images = listImages();
    console.log(`http://localhost:${PORT}`);
    console.log(`images: ${images.length}`);
  });
}
