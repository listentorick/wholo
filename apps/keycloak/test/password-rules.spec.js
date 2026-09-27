import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  evaluate,
  matchState,
  attach,
} from '../themes/wholo/login/resources/js/password-rules.js';

const one = (rule, password, extra = {}) => evaluate(password, [{ rule, ...extra }])[0];

describe('evaluate', () => {
  it('meets nothing for an empty password', () => {
    expect(
      evaluate('', [
        { rule: 'length', min: 0 },
        { rule: 'maxLength', max: 10 },
        { rule: 'notEmail', against: 'a@b.com' },
      ]),
    ).toEqual([false, false, false]);
  });

  it('never reports an unknown rule as met', () => {
    expect(one('passwordHistory', 'Anything1!')).toBe(false);
  });

  describe('length / maxLength', () => {
    it('meets length exactly at the boundary', () => {
      expect(one('length', 'a'.repeat(11), { min: 12 })).toBe(false);
      expect(one('length', 'a'.repeat(12), { min: 12 })).toBe(true);
    });

    it('meets maxLength up to and including the boundary', () => {
      expect(one('maxLength', 'a'.repeat(8), { max: 8 })).toBe(true);
      expect(one('maxLength', 'a'.repeat(9), { max: 8 })).toBe(false);
    });

    it('counts UTF-16 code units like Java String.length()', () => {
      expect(one('length', '😀😀', { min: 4 })).toBe(true);
    });
  });

  describe('character classes', () => {
    it('counts upper case letters, including non-ASCII', () => {
      expect(one('upperCase', 'abc', { min: 1 })).toBe(false);
      expect(one('upperCase', 'abÉ', { min: 1 })).toBe(true);
      expect(one('upperCase', 'Abc', { min: 2 })).toBe(false);
      expect(one('upperCase', 'ABc', { min: 2 })).toBe(true);
    });

    it('counts lower case letters, including non-ASCII', () => {
      expect(one('lowerCase', 'ABC', { min: 1 })).toBe(false);
      expect(one('lowerCase', 'ABß', { min: 1 })).toBe(true);
    });

    it('counts decimal digits', () => {
      expect(one('digits', 'abc', { min: 1 })).toBe(false);
      expect(one('digits', 'ab1', { min: 1 })).toBe(true);
      expect(one('digits', 'a1b2', { min: 2 })).toBe(true);
    });

    it('treats anything that is not a letter or digit as special, space included', () => {
      expect(one('specialChars', 'abc123', { min: 1 })).toBe(false);
      expect(one('specialChars', 'abc 123', { min: 1 })).toBe(true);
      expect(one('specialChars', 'abc!', { min: 1 })).toBe(true);
      expect(one('specialChars', 'é1', { min: 1 })).toBe(false);
    });

    it('counts an astral character as two special chars, like Java chars', () => {
      expect(one('specialChars', 'abc😀', { min: 2 })).toBe(true);
    });
  });

  describe('notEmail / notUsername', () => {
    it('fails when the password equals the email, ignoring case and surrounding space', () => {
      expect(one('notEmail', 'Sam@Example.com', { against: ' sam@example.com ' })).toBe(false);
      expect(one('notUsername', 'SAM', { against: 'sam' })).toBe(false);
    });

    it('passes when the password differs', () => {
      expect(one('notEmail', 'sam@example.com!', { against: 'sam@example.com' })).toBe(true);
    });

    it('passes when there is nothing to compare against', () => {
      expect(one('notEmail', 'whatever', { against: '' })).toBe(true);
      expect(one('notEmail', 'whatever', {})).toBe(true);
    });
  });
});

describe('matchState', () => {
  it('is none until the confirm field is used', () => {
    expect(matchState('Secret', '', false)).toBe('none');
  });

  it('is todo while typing a non-matching confirmation', () => {
    expect(matchState('Secret', 'Sec', false)).toBe('todo');
  });

  it('is met when both are equal and non-empty', () => {
    expect(matchState('Secret', 'Secret', false)).toBe('met');
    expect(matchState('Secret', 'Secret', true)).toBe('met');
  });

  it('is an error after a submit attempt with a mismatch or empty confirm', () => {
    expect(matchState('Secret', 'Sec', true)).toBe('error');
    expect(matchState('Secret', '', true)).toBe('error');
  });

  it('stays none after a submit attempt with both fields empty', () => {
    expect(matchState('', '', true)).toBe('none');
  });
});

// Mirrors the markup password-policy.ftl renders into register.ftl.
function renderRegister() {
  const icons = '<span class="wh-rule-icon" aria-hidden="true"></span>';
  const rule = (name, attrs, label) =>
    `<li class="wh-rule" data-rule="${name}" ${attrs}>${icons}<span class="wh-sr wh-rule-status"></span>${label}</li>`;
  document.body.innerHTML = `
    <form id="kc-register-form">
      <input type="email" id="email" name="email" />
      <div class="wh-field">
        <div class="wh-pw-wrap">
          <input type="password" id="password" name="password" />
          <button type="button" class="wh-eye" aria-label="Show password" aria-pressed="false" data-label="password" hidden></button>
        </div>
        <div class="wh-pw-progress" hidden><span class="wh-pw-progress-fill"></span></div>
        <ul class="wh-field-hint" id="kc-password-policy-list" data-password-field="password" data-confirm-field="password-confirm">
          ${rule('length', 'data-min="12"', 'At least 12 characters')}
          ${rule('upperCase', 'data-min="1"', 'At least 1 upper case letter')}
          ${rule('digits', 'data-min="1"', 'At least 1 number')}
          ${rule('notEmail', 'data-against="#email"', 'Must not be your email address')}
        </ul>
        <p class="wh-sr" id="pw-live" aria-live="polite"></p>
      </div>
      <div class="wh-field">
        <div class="wh-pw-wrap">
          <input type="password" id="password-confirm" name="password-confirm" />
          <button type="button" class="wh-eye" aria-label="Show confirm password" aria-pressed="false" data-label="confirm password" hidden></button>
        </div>
        <p class="wh-match" id="pw-match" hidden>${icons}<span class="wh-match-text"></span></p>
      </div>
      <button type="submit">Create Account</button>
    </form>`;
  return document.getElementById('kc-password-policy-list');
}

function type(id, value) {
  const el = document.getElementById(id);
  el.value = value;
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

function submit() {
  const event = new Event('submit', { bubbles: true, cancelable: true });
  document.getElementById('kc-register-form').dispatchEvent(event);
  return event;
}

const ruleEl = (name) => document.querySelector(`[data-rule="${name}"]`);

describe('attach', () => {
  let list;

  beforeEach(() => {
    list = renderRegister();
    attach(list);
  });

  it('upgrades the static list: live styling, visible progress and eye toggle', () => {
    expect(list.classList.contains('wh-live')).toBe(true);
    expect(document.querySelector('.wh-pw-progress').hidden).toBe(false);
    document.querySelectorAll('.wh-eye').forEach((eye) => expect(eye.hidden).toBe(false));
  });

  it('ticks rules off as the password satisfies them', () => {
    type('password', 'abc1');
    expect(ruleEl('digits').classList.contains('is-met')).toBe(true);
    expect(ruleEl('upperCase').classList.contains('is-met')).toBe(false);
    expect(ruleEl('length').classList.contains('is-met')).toBe(false);
    expect(ruleEl('digits').querySelector('.wh-rule-status').textContent).toBe('Met: ');
    expect(ruleEl('length').querySelector('.wh-rule-status').textContent).toBe('Not yet met: ');
  });

  it('never marks rules as errors while typing', () => {
    type('password', 'abc');
    expect(document.querySelectorAll('.wh-rule.is-error')).toHaveLength(0);
  });

  it('fills the progress bar and turns it complete when every rule is met', () => {
    const fill = document.querySelector('.wh-pw-progress-fill');
    type('password', 'abc1');
    expect(fill.style.width).toBe('50%');
    expect(fill.classList.contains('is-complete')).toBe(false);
    type('password', 'Harbourwines1');
    expect(fill.style.width).toBe('100%');
    expect(fill.classList.contains('is-complete')).toBe(true);
  });

  it('re-checks the email rule when the email field changes', () => {
    type('password', 'Sam@example1.com');
    expect(ruleEl('notEmail').classList.contains('is-met')).toBe(true);
    type('email', 'sam@EXAMPLE1.com');
    expect(ruleEl('notEmail').classList.contains('is-met')).toBe(false);
  });

  it('blocks submit with unmet rules and marks only those as errors', () => {
    type('password', 'abc1');
    const event = submit();
    expect(event.defaultPrevented).toBe(true);
    expect(ruleEl('length').classList.contains('is-error')).toBe(true);
    expect(ruleEl('digits').classList.contains('is-error')).toBe(false);
    expect(document.getElementById('pw-live').textContent).toBe('2 password requirements not met');
    expect(document.activeElement.id).toBe('password');
  });

  it('clears a rule error once the rule is met after a failed submit', () => {
    type('password', 'abc1');
    submit();
    type('password', 'Abc1');
    expect(ruleEl('upperCase').classList.contains('is-error')).toBe(false);
    expect(ruleEl('length').classList.contains('is-error')).toBe(true);
  });

  it('blocks submit when the confirmation does not match', () => {
    type('password', 'Harbourwines1');
    type('password-confirm', 'Harbourwines');
    const event = submit();
    expect(event.defaultPrevented).toBe(true);
    expect(document.getElementById('pw-match').classList.contains('is-error')).toBe(true);
    expect(document.activeElement.id).toBe('password-confirm');
  });

  it('lets a valid, matching password submit', () => {
    type('password', 'Harbourwines1');
    type('password-confirm', 'Harbourwines1');
    expect(submit().defaultPrevented).toBe(false);
  });

  it('shows the match line only once the confirm field is used', () => {
    const match = document.getElementById('pw-match');
    type('password', 'Harbourwines1');
    expect(match.hidden).toBe(true);
    type('password-confirm', 'Harbour');
    expect(match.hidden).toBe(false);
    expect(match.textContent).toBe('Passwords don’t match yet');
    type('password-confirm', 'Harbourwines1');
    expect(match.classList.contains('is-met')).toBe(true);
    expect(match.textContent).toBe('Passwords match');
  });

  it('toggles each password field independently with its own eye', () => {
    const [pwEye, confirmEye] = document.querySelectorAll('.wh-eye');
    pwEye.click();
    expect(document.getElementById('password').type).toBe('text');
    expect(document.getElementById('password-confirm').type).toBe('password');
    expect(pwEye.getAttribute('aria-pressed')).toBe('true');
    expect(pwEye.getAttribute('aria-label')).toBe('Hide password');

    confirmEye.click();
    expect(document.getElementById('password-confirm').type).toBe('text');
    expect(confirmEye.getAttribute('aria-label')).toBe('Hide confirm password');

    pwEye.click();
    expect(document.getElementById('password').type).toBe('password');
    expect(document.getElementById('password-confirm').type).toBe('text');
    expect(pwEye.getAttribute('aria-label')).toBe('Show password');
  });

  it('announces progress to screen readers after typing pauses', () => {
    vi.useFakeTimers();
    try {
      type('password', 'abc1');
      expect(document.getElementById('pw-live').textContent).toBe('');
      vi.advanceTimersByTime(1000);
      expect(document.getElementById('pw-live').textContent).toBe(
        '2 of 4 password requirements met',
      );
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('attach without a matching password field', () => {
  it('does nothing', () => {
    document.body.innerHTML =
      '<ul id="kc-password-policy-list" data-password-field="missing"></ul>';
    expect(attach(document.getElementById('kc-password-policy-list'))).toBeNull();
  });
});
