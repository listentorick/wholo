// Live password-policy checklist for the Stocdup Keycloak login theme.
//
// Upgrades the static policy list rendered by password-policy.ftl: each rule is
// ticked as the typed password satisfies it, unmet rules turn red only after a
// submit attempt, and a match line sits under the confirm field. Keycloak's
// server-side policy remains the authority — this is guidance only (a repeated
// submit is never blocked), and the page works unchanged without JS.
//
// The checks mirror Keycloak 26.2's PasswordPolicyProvider implementations
// (server-spi-private/.../policy/*PasswordPolicyProvider.java): they count per
// UTF-16 code unit (Java `char`) with Character.isUpperCase / isLowerCase /
// isDigit / !isLetterOrDigit, and compare username/email with equalsIgnoreCase.

const UPPER = /\p{Uppercase}/u; // Character.isUpperCase: Lu + Other_Uppercase
const LOWER = /\p{Lowercase}/u; // Character.isLowerCase: Ll + Other_Lowercase
const DIGIT = /\p{Nd}/u; // Character.isDigit
const SPECIAL = /[^\p{L}\p{Nd}]/u; // !Character.isLetterOrDigit

function countUnits(password, re) {
  let n = 0;
  for (let i = 0; i < password.length; i++) {
    if (re.test(password[i])) n++;
  }
  return n;
}

function notSameAs(password, other) {
  const value = (other || '').trim();
  return value === '' || password.toLowerCase() !== value.toLowerCase();
}

const CHECKS = {
  length: (pw, r) => pw.length >= r.min,
  maxLength: (pw, r) => pw.length <= r.max,
  upperCase: (pw, r) => countUnits(pw, UPPER) >= r.min,
  lowerCase: (pw, r) => countUnits(pw, LOWER) >= r.min,
  digits: (pw, r) => countUnits(pw, DIGIT) >= r.min,
  specialChars: (pw, r) => countUnits(pw, SPECIAL) >= r.min,
  notUsername: (pw, r) => notSameAs(pw, r.against),
  notEmail: (pw, r) => notSameAs(pw, r.against),
};

/**
 * Evaluate a password against rules of shape { rule, min?, max?, against? }.
 * Returns a boolean per rule, in order. An empty password meets nothing, and an
 * unknown rule is never reported as met.
 */
export function evaluate(password, rules) {
  return rules.map((r) => {
    const check = CHECKS[r.rule];
    return password.length > 0 && !!check && check(password, r);
  });
}

/** Confirm-field state: 'none' | 'todo' | 'met' | 'error'. */
export function matchState(password, confirm, attempted) {
  if (confirm.length > 0 && confirm === password) return 'met';
  if (attempted && (confirm.length > 0 || password.length > 0)) return 'error';
  return confirm.length > 0 ? 'todo' : 'none';
}

const MATCH_TEXT = {
  met: 'Passwords match',
  todo: 'Passwords don’t match yet',
  error: 'Passwords don’t match',
};

const LIVE_DELAY_MS = 700;

const IDENTITY_RULES = new Set(['notUsername', 'notEmail']);

// An identity rule can only be checked here if the page holds the value to
// compare with: an input the user fills in (register's email), or a hidden one
// the server populated. With neither (e.g. update-password reached from a reset
// email) it stays neutral, uncounted and never holds a submit back — the server
// still enforces it.
function isCheckable(rule, againstEl) {
  if (!IDENTITY_RULES.has(rule)) return true;
  return !!againstEl && (againstEl.type !== 'hidden' || againstEl.value.trim() !== '');
}

/** Wire the live checklist onto a rendered #kc-password-policy-list. */
export function attach(list) {
  const doc = list.ownerDocument;
  const password = doc.getElementById(list.dataset.passwordField);
  if (!password) return null;
  const confirm = doc.getElementById(list.dataset.confirmField);
  const form = password.form;
  const field = password.closest('.wh-field');
  const wrap = password.closest('.wh-pw-wrap');
  const progress = field && field.querySelector('.wh-pw-progress');
  const fill = progress && progress.querySelector('.wh-pw-progress-fill');
  const match = doc.getElementById('pw-match');
  const live = doc.getElementById('pw-live');

  const items = Array.from(list.querySelectorAll('.wh-rule')).map((el) => ({
    el,
    status: el.querySelector('.wh-rule-status'),
    rule: el.dataset.rule,
    min: Number(el.dataset.min),
    max: Number(el.dataset.max),
    againstEl: el.dataset.against ? doc.querySelector(el.dataset.against) : null,
  })).map((item) => ({ ...item, checkable: isCheckable(item.rule, item.againstEl) }));
  const total = items.filter((i) => i.checkable).length;

  let attempted = false;
  let liveTimer = null;

  list.classList.add('wh-live');
  if (wrap) wrap.classList.add('wh-live');
  if (progress) progress.hidden = false;

  function announce(text, immediate) {
    if (!live) return;
    clearTimeout(liveTimer);
    if (immediate) {
      live.textContent = text;
      return;
    }
    liveTimer = setTimeout(() => {
      live.textContent = text;
    }, LIVE_DELAY_MS);
  }

  function update() {
    const pw = password.value;
    const results = evaluate(
      pw,
      items.map((i) => ({
        rule: i.rule,
        min: i.min,
        max: i.max,
        against: i.againstEl ? i.againstEl.value : '',
      })),
    );
    let metCount = 0;
    items.forEach((item, idx) => {
      if (!item.checkable) {
        if (item.status) item.status.textContent = 'Checked when you submit: ';
        return;
      }
      const met = results[idx];
      if (met) metCount++;
      item.el.classList.toggle('is-met', met);
      item.el.classList.toggle('is-error', !met && attempted);
      if (item.status) item.status.textContent = met ? 'Met: ' : 'Not yet met: ';
    });

    const allMet = metCount === total;
    if (fill) {
      fill.style.width = total ? `${Math.round((metCount / total) * 100)}%` : '0%';
      fill.classList.toggle('is-complete', allMet);
    }

    const state = confirm ? matchState(pw, confirm.value, attempted) : 'none';
    if (match && confirm) {
      match.hidden = state === 'none';
      match.classList.toggle('is-met', state === 'met');
      match.classList.toggle('is-error', state === 'error');
      match.querySelector('.wh-match-text').textContent = MATCH_TEXT[state] || '';
    }

    return { metCount, allMet, matched: state === 'met' || !confirm };
  }

  function onInput() {
    const { metCount } = update();
    announce(password.value ? `${metCount} of ${total} password requirements met` : '', false);
  }

  [password, confirm, ...items.map((i) => i.againstEl)].forEach((el) => {
    if (!el) return;
    // `change` too: password managers can fill without firing `input`.
    el.addEventListener('input', onInput);
    el.addEventListener('change', onInput);
  });

  const toggles = [];
  [password, confirm].forEach((input) => {
    const eye = input && input.closest('.wh-pw-wrap')?.querySelector('.wh-eye');
    if (!eye) return;
    const label = eye.dataset.label || 'password';
    const setShown = (show) => {
      input.type = show ? 'text' : 'password';
      eye.setAttribute('aria-pressed', String(show));
      eye.setAttribute('aria-label', `${show ? 'Hide' : 'Show'} ${label}`);
    };
    eye.hidden = false;
    eye.addEventListener('click', () => setShown(input.type === 'password'));
    toggles.push(setShown);
  });

  // Never let a revealed password leave the page as a text field: browsers may
  // keep text-field values in autofill history, and bfcache would restore it shown.
  const hideAll = () => toggles.forEach((setShown) => setShown(false));
  doc.defaultView?.addEventListener('pagehide', hideAll);

  if (form) {
    // The checks are advisory: the first failing submit is held back so the user
    // sees what is missing without losing both password fields to a server round
    // trip, but submitting the same values again goes through and the server
    // decides. A client check can never lock anyone out.
    let heldBack = null;
    form.addEventListener('submit', (event) => {
      attempted = true;
      const { metCount, allMet, matched } = update();
      const values = `${password.value}\u0000${confirm ? confirm.value : ''}`;
      if ((allMet && matched) || values === heldBack) {
        hideAll();
        return;
      }
      heldBack = values;
      event.preventDefault();
      const unmet = total - metCount;
      announce(
        unmet > 0
          ? `${unmet} password requirement${unmet === 1 ? '' : 's'} not met`
          : 'Passwords don\u2019t match',
        true,
      );
      (unmet > 0 || !confirm ? password : confirm).focus();
    });
  }

  update();
  return { update };
}

const list = typeof document !== 'undefined' && document.getElementById('kc-password-policy-list');
if (list) attach(list);
