import styles from './styles/login.css?raw';
import { setToken, setUser } from '../../core/auth.store';

type LoginResponse =
  | { data?: { token?: string; user?: any }; dataHeader?: { token?: string; user?: any }; errorCode?: string | null; message?: string | null }
  | { token?: string; user?: any; errorCode?: string | null; message?: string | null }; // in case API returns flattened

export class PageLogin extends HTMLElement {
  private root!: ShadowRoot;

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
            <div class="logo">🔐</div>
            <h1>Welcome back</h1>
            <p>Sign in to manage datasets, training and models</p>
          </div>

          <form class="form" novalidate>
            <div class="field">
              <label>Username</label>
              <input class="input" name="username" type="text" placeholder="username" autocomplete="username" />
              <div class="error"></div>
            </div>

            <div class="field">
              <label>Password</label>
              <div class="input-wrap">
                <input class="input" name="password" type="password" placeholder="********" autocomplete="current-password" />
                <button class="toggle" type="button" title="Show/Hide password" aria-label="Show or hide password">👁️</button>
              </div>
              <div class="error"></div>
            </div>

            <div class="row">
              <label class="check">
                <input type="checkbox" name="remember" />
                Remember me
              </label>
              <a href="#" id="forgot">Forgot password?</a>
            </div>

            <button class="btn" type="submit" id="loginBtn">
              <span class="label">Sign in</span>
              <span class="spinner" aria-hidden="true"></span>
            </button>

            <p class="switch">
              Don't have an account?
              <a href="#" id="toRegister">Create one</a>
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
    const loginBtn = this.q<HTMLButtonElement>('#loginBtn');
    const forgot = this.q<HTMLAnchorElement>('#forgot');

    toggle.addEventListener('click', () => {
      pwd.type = pwd.type === 'password' ? 'text' : 'password';
    });

    this.q<HTMLAnchorElement>('#toRegister').addEventListener('click', (e) => {
      e.preventDefault();
      (window as any).navigate ? (window as any).navigate('register') : (location.hash = '#/register');
    });

    forgot.addEventListener('click', (e) => this.onForgot(e, forgot));

    form.addEventListener('submit', (e) => this.onSubmit(e, loginBtn));
  }

  private async onForgot(e: Event, link: HTMLAnchorElement) {
    e.preventDefault();

    const email = prompt('Enter your account email to reset password:')?.trim();
    if (!email) {
      return;
    }

    const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!EMAIL_RE.test(email)) {
      this.toast('Please enter a valid email address', false);
      return;
    }

    link.dataset.loading = 'true';
    link.setAttribute('aria-busy', 'true');

    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      const raw = await res.text();
      let message = raw || '';
      try {
        if (raw) {
          const json = JSON.parse(raw);
          message = json?.message || json?.data?.message || message;
        }
      } catch { /* ignore non-JSON */ }

      const normalized = message?.toLowerCase?.() ?? '';
      const alreadyRequested = !res.ok && normalized.includes('already been requested');

      if (res.ok || alreadyRequested) {
        const info = message || (alreadyRequested
          ? 'A password reset has already been requested. Please check your email.'
          : 'If the email exists, a reset link was sent.');
        this.toast(info, true);
      } else {
        // Handle unauthorized or validation errors gracefully
        const fallback = res.status === 401 || res.status === 403
          ? 'Not authorized to request reset.'
          : 'Password reset request failed';
        this.toast(message || fallback, false);
      }
    } catch (err: any) {
      this.toast(err?.message ?? 'Network error', false);
    } finally {
      delete link.dataset.loading;
      link.removeAttribute('aria-busy');
    }
  }

  private async onSubmit(e: Event, loginBtn: HTMLButtonElement) {
    e.preventDefault();
    this.clearErrors();

    const username = this.val('username');
    const password = this.val('password');

    if (!username) this.setFieldError('username', 'Username is required');
    if (!password) this.setFieldError('password', 'Password is required');
    if (!username || !password) return;

    loginBtn.disabled = true;
    loginBtn.dataset.loading = 'true';

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      const raw = await res.text();
      let json: LoginResponse | null = null;
      if (raw) {
        try { json = JSON.parse(raw); } catch { /* not JSON */ }
      }

      if (!res.ok) {
        const msg = (json && ('message' in json) && json?.message) || raw || 'Login failed';
        // If backend sends INVALID_CREDENTIALS
        if ((json as any)?.errorCode === 'INVALID_CREDENTIALS') {
          this.setFieldError('password', 'Invalid username or password');
        }
        this.toast(String(msg), false);
        return;
      }

      // Accept multiple token shapes & fall back to headers
      const token = this.resolveToken(res, json, raw);
      const user  = this.resolveUser(json);

      if (!token) {
        console.error('Login response missing token', { raw, json });
        this.toast('Missing token in response', false);
        return;
      }

      // Store credentials
      setToken(token);
      if (user) setUser(user);

      this.toast('Authentication successful', true);

      // Navigate to app home or dashboard
      setTimeout(() => {
        (window as any).navigate ? (window as any).navigate('home') : (location.hash = '#/');
      }, 600);

    } catch (err: any) {
      this.toast(err?.message ?? 'Network error', false);
    } finally {
      loginBtn.disabled = false;
      delete loginBtn.dataset.loading;
    }
  }

  private resolveToken(res: Response, payload: LoginResponse | null, raw: string | null): string | null {
    const variants = this.collectPayloadVariants(payload);
    const keys = ['token', 'jwt', 'accessToken', 'access_token'];

    for (const variant of variants) {
      for (const key of keys) {
        const candidate = (variant as any)?.[key];
        if (typeof candidate === 'string' && candidate.trim()) {
          const cleaned = candidate.trim().replace(/^Bearer\s+/i, '').trim();
          if (cleaned) {
            return cleaned;
          }
        }
      }
    }

    const header = res.headers.get('Authorization') ?? res.headers.get('authorization');
    if (header) {
      const match = header.match(/^Bearer\s+(.+)$/i);
      return (match ? match[1] : header).trim();
    }

    if (raw) {
      const trimmed = raw.trim();
      if (trimmed) {
        const bearer = trimmed.match(/^Bearer\s+(.+)$/i);
        if (bearer && bearer[1]) {
          return bearer[1].trim();
        }
        const looksLikeJwt = trimmed.split('.').length === 3;
        if (looksLikeJwt) {
          return trimmed;
        }
      }
    }

    return null;
  }

  private resolveUser(payload: LoginResponse | null) {
    const variants = this.collectPayloadVariants(payload);
    for (const variant of variants) {
      const candidate = (variant as any)?.user;
      if (candidate != null) {
        return candidate;
      }
    }
    return null;
  }

  private collectPayloadVariants(payload: LoginResponse | null): any[] {
    if (!payload || typeof payload !== 'object') {
      return [];
    }

    const variants: any[] = [];
    const push = (candidate: unknown) => {
      if (!candidate || typeof candidate !== 'object') return;
      if (!variants.includes(candidate)) {
        variants.push(candidate);
      }
      if (Array.isArray(candidate)) {
        candidate.forEach(push);
      }
    };

    push(payload as any);
    const header = (payload as any)?.dataHeader;
    const data = (payload as any)?.data;
    push(header);
    push(data);
    push((header as any)?.data);
    push((data as any)?.data);

    return variants;
  }

  // helpers
  private q<T extends HTMLElement>(sel: string) { return this.root.querySelector<T>(sel)!; }
  private val(name: string) { return (this.root.querySelector(`[name="${name}"]`) as HTMLInputElement)?.value.trim(); }

  private setFieldError(name: string, message: string) {
    const field = this.root.querySelector(`[name="${name}"]`)?.closest('.field') as HTMLElement | null;
    if (!field) return;
    field.classList.add('has-error');
    const err = field.querySelector('.error') as HTMLElement | null;
    if (err) err.textContent = message;
  }

  private clearErrors() {
    this.root.querySelectorAll('.field').forEach(f => {
      f.classList.remove('has-error');
      const err = f.querySelector('.error') as HTMLElement | null;
      if (err) err.textContent = '';
    });
  }

  private toast(message: string, ok: boolean) {
    const t = this.q<HTMLDivElement>('.toast');
    t.textContent = message;
    t.classList.add('show');
    t.classList.toggle('ok', ok);
    t.classList.toggle('err', !ok);
    setTimeout(() => t.classList.remove('show'), 2500);
  }
}

customElements.define('page-login', PageLogin);
