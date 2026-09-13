export {};

type ComfortState = {
  active: boolean;
  paused: boolean;
  trackId: string;
  trackLabel: string;
};

const MENU_WRAPPER_ID = 'twinly-header-menu-wrapper';
const MENU_ID = 'twinly-header-menu';
const PLAYER_ID = 'twinly-mini-player';
const STYLE_ID = 'twinly-header-menu-style-v3';
const HINT_TEXT = 'ダブルクリック／長押しで音声入力';

let comfortState: ComfortState = { active: false, paused: false, trackId: '', trackLabel: '' };
let observer: MutationObserver | null = null;
let renderQueued = false;

const icon = (body: string) => `
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

const icons = {
  more: icon('<circle cx="12" cy="5" r="1" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="12" cy="19" r="1" fill="currentColor" stroke="none"/>'),
  music: icon('<path d="M9 18V5l10-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="16" cy="16" r="3"/>'),
  help: icon('<circle cx="12" cy="12" r="10"/><path d="M9.1 9a3 3 0 1 1 5.2 2c-1.3 1-2.3 1.6-2.3 3"/><path d="M12 17h.01"/>'),
  settings: icon('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3A1.7 1.7 0 0 0 10 3V2.8h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1z"/>'),
  pause: icon('<path d="M8 5v14M16 5v14"/>'),
};

const ensureStyle = () => {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    #${MENU_WRAPPER_ID} { position: relative; display: flex; align-items: center; }
    #${MENU_WRAPPER_ID} > .twinly-menu-trigger { width:2.5rem;height:2.5rem;display:grid;place-items:center;flex:0 0 2.5rem;border:0;border-radius:.375rem;background:transparent;color:inherit;cursor:pointer;transition:background-color 160ms ease,color 160ms ease;-webkit-tap-highlight-color:transparent; }
    #${MENU_WRAPPER_ID} > .twinly-menu-trigger:hover,#${MENU_WRAPPER_ID} > .twinly-menu-trigger[aria-expanded='true'] { background:hsl(var(--accent));color:hsl(var(--accent-foreground)); }
    #${MENU_WRAPPER_ID} > .twinly-menu-trigger svg { width:1rem;height:1rem; }
    #${MENU_ID} { position:absolute;top:calc(100% + .35rem);right:0;z-index:85;width:11.5rem;padding:.35rem;border:1px solid hsl(var(--border));border-radius:.8rem;background:hsl(var(--card) / .98);color:hsl(var(--card-foreground));box-shadow:0 12px 32px rgb(0 0 0 / .24);backdrop-filter:blur(14px);opacity:0;transform:translateY(-5px) scale(.94);transform-origin:top right;pointer-events:none;transition:opacity 150ms ease,transform 180ms cubic-bezier(.2,.9,.2,1.12); }
    #${MENU_ID}[data-open='true'] { opacity:1;transform:translateY(0) scale(1);pointer-events:auto; }
    #${MENU_ID} .twinly-menu-item { width:100%;min-height:2.5rem;display:flex;align-items:center;gap:.7rem;border:0;border-radius:.6rem;padding:.5rem .65rem;background:transparent;color:inherit;font:600 13px/1.2 'DM Sans','Noto Sans JP',sans-serif;text-align:left;cursor:pointer;transition:background-color 120ms ease; }
    #${MENU_ID} .twinly-menu-item:hover { background:hsl(var(--accent)); }
    #${MENU_ID} .twinly-menu-item svg { width:1.05rem;height:1.05rem;flex:0 0 auto; }
    [data-twinly-voice-hint][hidden],#${PLAYER_ID}[hidden] { display:none !important; }
    #${PLAYER_ID} { height:1.15rem;min-height:1.15rem;width:min(100%,29rem);margin-left:auto;margin-right:auto;display:flex;align-items:center;gap:.3rem;padding:0 .25rem 0 .5rem;border:1px solid hsl(var(--border));border-radius:9999px;background:hsl(var(--card) / .82);color:hsl(var(--card-foreground));box-shadow:0 1px 4px rgb(0 0 0 / .07);overflow:hidden; }
    #${PLAYER_ID} .twinly-player-track { min-width:0;flex:1;display:flex;align-items:center;gap:.3rem;font:600 10px/1 'DM Sans','Noto Sans JP',sans-serif;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;border:0;background:transparent;color:inherit;text-align:left;cursor:pointer; }
    #${PLAYER_ID} .twinly-player-track svg { width:.72rem;height:.72rem;flex:0 0 auto; }
    #${PLAYER_ID} .twinly-player-toggle { width:2.6rem;height:.9rem;flex:0 0 2.6rem;display:grid;place-items:center;border:0;border-radius:9999px;background:hsl(var(--primary));color:hsl(var(--primary-foreground));cursor:pointer;transition:transform 120ms ease,filter 120ms ease; }
    #${PLAYER_ID} .twinly-player-toggle:hover { filter:brightness(.97); }
    #${PLAYER_ID} .twinly-player-toggle:active { transform:scale(.96); }
    #${PLAYER_ID} .twinly-player-toggle svg { width:.52rem;height:.52rem; }
    @media (prefers-reduced-motion:reduce) { #${MENU_ID},#${MENU_WRAPPER_ID} > .twinly-menu-trigger { transition-duration:0ms; } }
  `;
  document.head.appendChild(style);
};

const stopHeaderGesture = (event: Event) => event.stopPropagation();

const setMenuOpen = (open: boolean) => {
  const menu = document.getElementById(MENU_ID);
  const trigger = document.querySelector<HTMLButtonElement>(`#${MENU_WRAPPER_ID} > .twinly-menu-trigger`);
  if (!menu || !trigger) return;
  const next = String(open);
  if (menu.dataset.open !== next) menu.dataset.open = next;
  if (trigger.getAttribute('aria-expanded') !== next) trigger.setAttribute('aria-expanded', next);
};

const createMenuItem = (label: string, iconMarkup: string, onClick: () => void) => {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'twinly-menu-item';
  button.innerHTML = `${iconMarkup}<span>${label}</span>`;
  button.addEventListener('pointerdown', stopHeaderGesture);
  button.addEventListener('click', (event) => { event.stopPropagation(); setMenuOpen(false); onClick(); });
  return button;
};

const findHint = (header: HTMLElement) => {
  const container = header.parentElement;
  if (!container) return null;
  return [...container.querySelectorAll('p')].find((node) => node.textContent?.trim() === HINT_TEXT) as HTMLParagraphElement | undefined;
};

const ensurePlayer = (header: HTMLElement) => {
  const hint = findHint(header);
  if (!hint) return null;
  if (hint.dataset.twinlyVoiceHint !== 'true') hint.dataset.twinlyVoiceHint = 'true';

  let player = document.getElementById(PLAYER_ID);
  if (!player) {
    player = document.createElement('div');
    player.id = PLAYER_ID;
    player.hidden = true;
    player.innerHTML = `<button type="button" class="twinly-player-track" aria-label="おやすみ音楽を開く">${icons.music}<span></span></button><button type="button" class="twinly-player-toggle" data-action="pause" aria-label="一時停止">${icons.pause}</button>`;
    hint.before(player);
    player.addEventListener('pointerdown', stopHeaderGesture);
    player.addEventListener('dblclick', stopHeaderGesture);
    player.querySelector('.twinly-player-track')?.addEventListener('click', () => window.dispatchEvent(new Event('twinly-comfort-open')));
    player.querySelector('[data-action="pause"]')?.addEventListener('click', () => {
      window.dispatchEvent(new Event('twinly-comfort-toggle-pause'));
      comfortState = { ...comfortState, paused: true };
      renderSafely();
    });
  }
  return { hint, player };
};

const updatePlayer = () => {
  const header = document.querySelector<HTMLElement>('header[data-tutorial="header"]');
  if (!header) return;
  const elements = ensurePlayer(header);
  if (!elements) return;
  const { hint, player } = elements;
  const showPlayer = comfortState.active && !comfortState.paused;
  if (hint.hidden === showPlayer) hint.hidden = !showPlayer;
  if (player.hidden !== !showPlayer) player.hidden = !showPlayer;
  if (!showPlayer) return;

  const nextLabel = comfortState.trackLabel || 'おやすみ音楽';
  const label = player.querySelector<HTMLElement>('.twinly-player-track span');
  if (label) {
    if (label.textContent !== nextLabel) label.textContent = nextLabel;
    if (label.title !== nextLabel) label.title = nextLabel;
  }
};

const mount = () => {
  ensureStyle();
  const header = document.querySelector<HTMLElement>('header[data-tutorial="header"]');
  if (!header) return;
  const controls = header.lastElementChild;
  if (!(controls instanceof HTMLElement)) return;

  const music = controls.querySelector<HTMLButtonElement>('button[aria-label="おやすみ音楽"]');
  const help = controls.querySelector<HTMLButtonElement>('button[aria-label="help"]');
  const settings = controls.querySelector<HTMLButtonElement>('button[aria-label="settings"]');
  const account = controls.querySelector<HTMLButtonElement>('button[aria-label="アカウントと家族を開く"]');
  if (!music || !help || !settings || !account) return;

  if (music.style.display !== 'none') music.style.display = 'none';
  if (help.style.display !== 'none') help.style.display = 'none';
  if (settings.style.display !== 'none') settings.style.display = 'none';

  if (!document.getElementById(MENU_WRAPPER_ID)) {
    const wrapper = document.createElement('div');
    wrapper.id = MENU_WRAPPER_ID;
    ['pointerdown','pointerup','dblclick','contextmenu'].forEach((type) => wrapper.addEventListener(type, stopHeaderGesture));

    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'twinly-menu-trigger';
    trigger.setAttribute('aria-label', 'メニュー');
    trigger.setAttribute('aria-haspopup', 'menu');
    trigger.setAttribute('aria-expanded', 'false');
    trigger.title = 'メニュー';
    trigger.innerHTML = icons.more;

    const menu = document.createElement('div');
    menu.id = MENU_ID;
    menu.setAttribute('role', 'menu');
    menu.dataset.open = 'false';
    menu.append(
      createMenuItem('おやすみ音楽', icons.music, () => window.dispatchEvent(new Event('twinly-comfort-open'))),
      createMenuItem('ヘルプ', icons.help, () => help.click()),
      createMenuItem('設定', icons.settings, () => settings.click()),
    );

    trigger.addEventListener('click', (event) => { event.stopPropagation(); setMenuOpen(menu.dataset.open !== 'true'); });
    wrapper.append(trigger, menu);
    account.before(wrapper);
  }

  updatePlayer();
};

const renderSafely = () => {
  if (renderQueued) return;
  renderQueued = true;
  queueMicrotask(() => {
    renderQueued = false;
    observer?.disconnect();
    try { mount(); updatePlayer(); }
    finally { observer?.observe(document.documentElement, { childList: true, subtree: true }); }
  });
};

window.addEventListener('twinly-comfort-state', (event) => {
  comfortState = (event as CustomEvent<ComfortState>).detail ?? comfortState;
  renderSafely();
});

document.addEventListener('pointerdown', (event) => {
  const wrapper = document.getElementById(MENU_WRAPPER_ID);
  if (wrapper && !wrapper.contains(event.target as Node)) setMenuOpen(false);
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') setMenuOpen(false);
});

observer = new MutationObserver(renderSafely);
observer.observe(document.documentElement, { childList: true, subtree: true });
renderSafely();
window.setTimeout(() => window.dispatchEvent(new Event('twinly-comfort-state-request')), 100);
