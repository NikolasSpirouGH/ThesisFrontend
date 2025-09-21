import styles from './styles/register.css?raw';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASS_RE  = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).{8,}$/;

type RegisterData = {
  firstName: string;
  lastName: string;
  username: string;
  email: string;
  password: string;
  confirmPassword: string;
  age: number | null;
  profession?: string;
  country?: string;
};

export class PageRegister extends HTMLElement {
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
            <div class="logo">☁️</div>
            <h1>Create your account</h1>
            <p>Build & run ML models in the cloud</p>
          </div>

          <form class="form" novalidate>
            <div class="grid">
              <div class="field">
                <label>First name</label>
                <input class="input" name="firstName" type="text" placeholder="Ada" autocomplete="given-name" />
                <div class="error"></div>
              </div>
              <div class="field">
                <label>Last name</label>
                <input class="input" name="lastName" type="text" placeholder="Lovelace" autocomplete="family-name" />
                <div class="error"></div>
              </div>
            </div>

            <div class="field">
              <label>Username</label>
              <input class="input" name="username" type="text" placeholder="adalovelace" autocomplete="username" />
              <div class="error"></div>
            </div>

            <div class="field">
              <label>Email</label>
              <input class="input" name="email" type="email" placeholder="you@example.com" autocomplete="email" />
              <div class="error"></div>
            </div>

            <div class="grid password-grid">
              <div class="field">
                <label>Password</label>
                <input class="input" name="password" type="password" placeholder="********" autocomplete="new-password" />
                <div class="error"></div>
              </div>
              <div class="field">
                <label>Confirm password</label>
                <input class="input" name="confirmPassword" type="password" placeholder="********" autocomplete="new-password" />
                <div class="error"></div>
              </div>
              <p class="hint password-hint">8+ chars, uppercase, lowercase, digit, special</p>
            </div>

            <div class="grid">
              <div class="field">
                <label>Age (optional)</label>
                <input class="input" name="age" type="number" min="0" placeholder="18" />
                <div class="error"></div>
              </div>
              <div class="field">
                <label>Profession (optional)</label>
                <input class="input" name="profession" type="text" placeholder="Data Scientist" />
                <div class="error"></div>
              </div>
            </div>

            <div class="field">
              <label>Country (optional)</label>
              <input class="input" name="country" type="text" placeholder="Greece" />
              <div class="error"></div>
            </div>

            <button class="btn" type="submit" id="submitBtn">
              <span class="label">Create account</span>
              <span class="spinner" aria-hidden="true"></span>
            </button>

            <p class="switch">
              Already have an account?
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
    const toLogin = this.q<HTMLAnchorElement>('#toLogin');
    const submitBtn = this.q<HTMLButtonElement>('#submitBtn');
    const toast = this.q<HTMLDivElement>('.toast');

    toLogin.addEventListener('click', (e) => {
      e.preventDefault();
      (window as any).navigate ? (window as any).navigate('login') : (location.hash = '#/login');
    });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      this.clearErrors();

      const data: RegisterData = {
        firstName: this.val('firstName'),
        lastName: this.val('lastName'),
        username: this.val('username'),
        email: this.val('email'),
        password: this.val('password'),
        confirmPassword: this.val('confirmPassword'),
        age: (() => { const v = this.val('age'); return v ? Number(v) : null; })(),
        profession: this.val('profession') || undefined,
        country: this.val('country') || undefined,
      };

      if (!this.validate(data)) return;

      submitBtn.disabled = true;
      submitBtn.dataset.loading = 'true';
      const endpoint = '/api/auth/register';

      try {
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        });

        if (res.ok) {
          this.showToast('Registration successful!', true);
          setTimeout(() => {
            (window as any).navigate ? (window as any).navigate('login') : (location.hash = '#/login');
          }, 900);
        } else {
          // Προσπάθησε να χαρτογραφήσεις server-side errors (αν επιστρέφεις JSON per-field)
          let msg = await res.text();
          this.showToast(msg || 'Registration failed', false);
        }
      } catch (err: any) {
        this.showToast(err?.message ?? 'Network error', false);
      } finally {
        submitBtn.disabled = false;
        delete submitBtn.dataset.loading;
      }
    });
  }

  // Helpers
  private q<T extends HTMLElement>(sel: string) { return this.root.querySelector<T>(sel)!; }
  private qa(sel: string) { return Array.from(this.root.querySelectorAll(sel)); }
  private val(name: string) { return (this.root.querySelector(`[name="${name}"]`) as HTMLInputElement)?.value.trim(); }

  private setFieldError(name: string, message: string) {
    const field = this.root.querySelector(`[name="${name}"]`)?.closest('.field') as HTMLElement | null;
    if (!field) return;
    field.classList.toggle('has-error', !!message);
    const err = field.querySelector('.error') as HTMLElement | null;
    if (err) err.textContent = message;
  }

  private clearErrors() {
    this.qa('.field').forEach(f => {
      f.classList.remove('has-error');
      const err = f.querySelector('.error') as HTMLElement | null;
      if (err) err.textContent = '';
    });
  }

  private validate(d: RegisterData): boolean {
    let ok = true;
    const req: Array<[keyof RegisterData, string]> = [
      ['firstName', 'First name is required'],
      ['lastName', 'Last name is required'],
      ['username', 'Username is required'],
      ['email', 'Email is required'],
      ['password', 'Password is required'],
      ['confirmPassword', 'Confirm password is required'],
    ];
    req.forEach(([k, msg]) => {
      const v = d[k];
      if (!v || (typeof v === 'string' && !v.trim())) { this.setFieldError(String(k), msg); ok = false; }
    });

    if (d.email && !EMAIL_RE.test(d.email)) { this.setFieldError('email', 'Email is not valid'); ok = false; }
    if (d.password && !PASS_RE.test(d.password)) {
      this.setFieldError('password', 'Must be 8+ chars incl. uppercase, lowercase, digit & special');
      ok = false;
    }
    if (d.password && d.confirmPassword && d.password !== d.confirmPassword) {
      this.setFieldError('confirmPassword', 'Passwords do not match'); ok = false;
    }
    if (d.age !== null && Number.isFinite(d.age) && (d.age as number) < 13) {
      this.setFieldError('age', 'You must be at least 13 years old'); ok = false;
    }
    return ok;
  }

  private showToast(message: string, success: boolean) {
    const toast = this.q<HTMLDivElement>('.toast');
    toast.textContent = message;
    toast.classList.add('show');
    toast.classList.toggle('ok', success);
    toast.classList.toggle('err', !success);
    setTimeout(() => toast.classList.remove('show'), 2500);
  }
}

customElements.define('page-register', PageRegister);
