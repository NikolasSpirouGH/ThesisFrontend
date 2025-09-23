import styles from './styles/reset-pass.css?raw';
import { handleNetworkError } from '../../core/http';

const PASS_RE = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).{8,}$/;

export class PageResetPass extends HTMLElement {
  private root!: ShadowRoot;
  private token: string | null = null;

  connectedCallback() {
    this.root = this.shadowRoot ?? this.attachShadow({ mode: 'open' });
    this.render();
    this.bind();
  }

  private render() {
    this.root.innerHTML = `
      <style>${styles}</style>
      <main class="main">
        <section class="card">
          <div class="brand">
            <div class="logo">🔑</div>
            <h1>Reset your password</h1>
            <p>Create a strong password to secure your account</p>
          </div>

          <form class="form" novalidate>
            <div class="field">
              <label>New password</label>
              <div class="input-wrap">
                <input class="input" name="password" type="password" placeholder="********" autocomplete="new-password" />
                <button class="toggle" type="button" aria-label="Show or hide password">👁️</button>
              </div>
              <p class="hint">8+ chars with uppercase, lowercase, number & special</p>
              <div class="error"></div>
            </div>

            <div class="field">
              <label>Confirm password</label>
              <input class="input" name="confirmPassword" type="password" placeholder="********" autocomplete="new-password" />
              <div class="error"></div>
            </div>

            <button class="btn" type="submit" id="resetBtn">
              <span class="label">Update password</span>
              <span class="spinner" aria-hidden="true"></span>
            </button>

            <p class="switch">
              Remembered your credentials?
              <a href="#" id="toLogin">Sign in</a>
            </p>

            <div class="toast" role="status" aria-live="polite" aria-atomic="true"></div>
          </form>
        </section>
      </main>
    `;
  }

  private bind() {
    const form = this.q<HTMLFormElement>('.form');
    const toggle = this.q<HTMLButtonElement>('.toggle');
    const pwd = this.q<HTMLInputElement>('input[name="password"]');
    const confirm = this.q<HTMLInputElement>('input[name="confirmPassword"]');
    const toLogin = this.q<HTMLAnchorElement>('#toLogin');
    const resetBtn = this.q<HTMLButtonElement>('#resetBtn');

    this.token = this.resolveToken();
    if (!this.token) {
      resetBtn.disabled = true;
      this.toast('Reset link is missing or expired. Request a new email.', false);
    }

    toggle.addEventListener('click', () => {
      const nextType = pwd.type === 'password' ? 'text' : 'password';
      pwd.type = nextType;
      confirm.type = nextType;
    });

    toLogin.addEventListener('click', (e) => {
      e.preventDefault();
      (window as any).navigate ? (window as any).navigate('login') : (location.hash = '#/login');
    });

    form.addEventListener('submit', (e) => this.onSubmit(e, resetBtn));
  }

  private async onSubmit(e: Event, btn: HTMLButtonElement) {
    e.preventDefault();
    this.clearErrors();

    if (!this.token) {
      this.toast('Missing reset token. Request a new email.', false);
      return;
    }

    const password = this.val('password');
    const confirmPassword = this.val('confirmPassword');

    let ok = true;
    if (!password) {
      this.setFieldError('password', 'Password is required');
      ok = false;
    }
    if (!confirmPassword) {
      this.setFieldError('confirmPassword', 'Confirm password is required');
      ok = false;
    }
    if (!ok) return;

    if (!PASS_RE.test(password)) {
      this.setFieldError('password', 'Must be 8+ chars incl. uppercase, lowercase, digit & special');
      ok = false;
    }

    if (password !== confirmPassword) {
      this.setFieldError('confirmPassword', 'Passwords do not match');
      ok = false;
    }

    if (!ok) return;

    btn.disabled = true;
    btn.dataset.loading = 'true';

    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: this.token, newPassword: password }),
      });

      const raw = await res.text();
      let message = raw || '';
      if (raw) {
        try {
          const json = JSON.parse(raw);
          message = json?.message || json?.data?.message || message;
        } catch { /* ignore non-JSON */ }
      }

      if (res.ok) {
        this.toast(message || 'Password updated successfully. You can now sign in.', true);
        setTimeout(() => {
          (window as any).navigate ? (window as any).navigate('login') : (location.hash = '#/login');
        }, 900);
      } else {
        const fallback = res.status === 400
          ? 'Reset link is invalid or expired. Request a new email.'
          : 'Failed to update password';
        this.toast(message || fallback, false);
      }
    } catch (err: any) {
      try {
        handleNetworkError(err);
      } catch (networkErr) {
        // Network error detected and handled, no need to show toast as user is redirected
        return;
      }
      this.toast(err?.message ?? 'Network error', false);
    } finally {
      btn.disabled = false;
      delete btn.dataset.loading;
    }
  }

  private resolveToken(): string | null {
    const href = location.href;
    try {
      const url = new URL(href);
      const fromQuery = url.searchParams.get('token');
      if (fromQuery) return fromQuery;
    } catch { /* ignore malformed URL */ }

    const hash = location.hash ?? '';
    const parts = hash.split('?');
    if (parts.length > 1) {
      const params = new URLSearchParams(parts[1]);
      const token = params.get('token');
      if (token) return token;
    }

    return null;
  }

  private q<T extends HTMLElement>(sel: string) { return this.root.querySelector<T>(sel)!; }
  private val(name: string) { return (this.root.querySelector(`[name="${name}"]`) as HTMLInputElement)?.value.trim(); }

  private setFieldError(name: string, message: string) {
    const field = this.root.querySelector(`[name="${name}"]`)?.closest('.field') as HTMLElement | null;
    if (!field) return;
    field.classList.toggle('has-error', !!message);
    const err = field.querySelector('.error') as HTMLElement | null;
    if (err) err.textContent = message;
  }

  private clearErrors() {
    this.root.querySelectorAll('.field').forEach((field) => {
      field.classList.remove('has-error');
      const err = field.querySelector('.error') as HTMLElement | null;
      if (err) err.textContent = '';
    });
  }

  private toast(message: string, ok: boolean) {
    const t = this.q<HTMLDivElement>('.toast');
    t.textContent = message;
    t.classList.add('show');
    t.classList.toggle('ok', ok);
    t.classList.toggle('err', !ok);
    setTimeout(() => t.classList.remove('show'), 2600);
  }
}

customElements.define('page-reset-pass', PageResetPass);
