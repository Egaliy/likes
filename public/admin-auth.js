let loginHandlerAttached = false;

function getOverlay() {
  let overlay = document.getElementById('login-overlay');

  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'login-overlay';
    overlay.className = 'login-overlay';
    overlay.innerHTML = `
      <form id="login-form" class="login-form">
        <input
          id="login-password"
          class="name-input login-password"
          type="password"
          placeholder="password"
          autocomplete="current-password"
        />
        <button class="intro-btn" type="submit">→</button>
      </form>
    `;
    document.body.appendChild(overlay);
  }

  return overlay;
}

function showLogin(onSuccess) {
  const overlay = getOverlay();
  overlay.hidden = false;

  if (loginHandlerAttached) return;
  loginHandlerAttached = true;

  const form = document.getElementById('login-form');
  const input = document.getElementById('login-password');

  form.addEventListener('submit', async (event) => {
    event.preventDefault();

    const password = input.value;
    const res = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });

    if (!res.ok) {
      input.classList.add('name-input--error');
      return;
    }

    input.classList.remove('name-input--error');
    input.value = '';
    overlay.hidden = true;

    if (typeof onSuccess === 'function') {
      onSuccess();
    }
  });
}

async function requireAdmin(onReady) {
  const res = await fetch('/api/admin/me');
  const data = await res.json();

  if (data.ok) {
    getOverlay().hidden = true;
    onReady();
    return;
  }

  showLogin(onReady);
}

window.requireAdmin = requireAdmin;
