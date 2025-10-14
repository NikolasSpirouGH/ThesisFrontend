import styles from './styles/edit-profile.css?raw';
import { getToken, getUser, setUser } from '../../core/auth.store';
import { handleNetworkError } from '../../core/http';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type UserData = {
  firstName: string;
  lastName: string;
  email: string;
  age: number | null;
  profession?: string;
  country?: string;
};

type StoredUser = {
  firstName?: string;
  lastName?: string;
  username?: string;
  email?: string;
  age?: number;
  profession?: string;
  country?: string;
  roles?: unknown;
  status?: string;
};

export class PageEditProfile extends HTMLElement {
  private root!: ShadowRoot;
  private currentUser: StoredUser | null = null;

  async connectedCallback() {
    this.root = this.shadowRoot ?? this.attachShadow({ mode: 'open' });
    const token = getToken();

    if (!token) {
      window.location.hash = '#/login';
      return;
    }

    // First, use cached user data to render immediately
    this.currentUser = getUser<StoredUser | null>();

    if (!this.currentUser) {
      window.location.hash = '#/login';
      return;
    }

    // Render with cached data first for better UX
    this.render();
    this.bind();

    // Then fetch fresh user data from backend in the background
    try {
      const res = await fetch('/api/users/me', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (res.ok) {
        const response = await res.json();
        const freshUser = response.data;

        // Only re-render if data changed
        if (JSON.stringify(freshUser) !== JSON.stringify(this.currentUser)) {
          this.currentUser = freshUser;
          setUser(this.currentUser);
          this.render();
          this.bind();
        }
      } else if (res.status === 401) {
        window.location.hash = '#/login';
        return;
      }
      // Silently ignore other errors - cached data is fine
    } catch (err) {
      // Silently ignore network errors - cached data is fine
      console.debug('Could not fetch fresh user profile, using cached data', err);
    }
  }

  private render() {
    const user = this.currentUser!;

    this.root.innerHTML = `
      <style>${styles}</style>
      <main class="main">
        <section class="card">
          <div class="brand">
            <div class="logo">👤</div>
            <h1>Edit Profile</h1>
            <p>Manage your personal information</p>
          </div>

          <!-- Profile Overview Section -->
          <div class="profile-overview">
            <div class="profile-header">
              <div class="avatar">${this.getInitials(user)}</div>
              <div class="profile-info">
                <h2>${this.escapeHtml(user.firstName || '')} ${this.escapeHtml(user.lastName || '')}</h2>
                <p class="username">@${this.escapeHtml(user.username || '')}</p>
                <div class="badges">
                  ${this.renderBadges(user)}
                </div>
              </div>
            </div>
          </div>

          <form class="form" novalidate>
            <!-- Personal Information Section -->
            <div class="section">
              <h3 class="section-title">Personal Information</h3>

              <div class="grid">
                <div class="field">
                  <label>First name <span class="required">*</span></label>
                  <input class="input" name="firstName" type="text" placeholder="John" autocomplete="given-name" value="${this.escapeHtml(user.firstName || '')}" />
                  <div class="error"></div>
                </div>
                <div class="field">
                  <label>Last name <span class="required">*</span></label>
                  <input class="input" name="lastName" type="text" placeholder="Doe" autocomplete="family-name" value="${this.escapeHtml(user.lastName || '')}" />
                  <div class="error"></div>
                </div>
              </div>

              <div class="field">
                <label>Email address <span class="required">*</span></label>
                <input class="input" name="email" type="email" placeholder="you@example.com" autocomplete="email" value="${this.escapeHtml(user.email || '')}" />
                <div class="error"></div>
              </div>
            </div>

            <!-- Professional Information Section -->
            <div class="section">
              <h3 class="section-title">Professional Information</h3>

              <div class="grid">
                <div class="field">
                  <label>Profession</label>
                  <input class="input" name="profession" type="text" placeholder="Data Scientist" value="${this.escapeHtml(user.profession || '')}" />
                  <p class="hint">Your current job title or role</p>
                  <div class="error"></div>
                </div>
                <div class="field">
                  <label>Country</label>
                  <input class="input" name="country" type="text" placeholder="Greece" value="${this.escapeHtml(user.country || '')}" />
                  <p class="hint">Where you're based</p>
                  <div class="error"></div>
                </div>
              </div>

              <div class="field">
                <label>Age</label>
                <input class="input" name="age" type="number" min="13" max="120" placeholder="25" value="${user.age || ''}" />
                <p class="hint">Must be at least 13 years old</p>
                <div class="error"></div>
              </div>
            </div>

            <!-- Account Information (Read-only) -->
            <div class="section">
              <h3 class="section-title">Account Information</h3>

              <div class="field">
                <label>Username</label>
                <input class="input readonly" type="text" value="${this.escapeHtml(user.username || '')}" disabled readonly />
                <p class="hint">🔒 Username cannot be changed</p>
              </div>
            </div>

            <div class="actions">
              <button class="btn secondary" type="button" id="cancelBtn">Cancel</button>
              <button class="btn" type="submit" id="submitBtn">
                <span class="label">💾 Save Changes</span>
                <span class="spinner" aria-hidden="true"></span>
              </button>
            </div>

            <div class="toast" role="status" aria-live="polite" aria-atomic="true"></div>
          </form>
        </section>
      </main>
    `;
  }

  private getInitials(user: StoredUser): string {
    const first = (user.firstName || '').charAt(0).toUpperCase();
    const last = (user.lastName || '').charAt(0).toUpperCase();
    if (first && last) return first + last;
    if (first) return first;
    if (last) return last;
    return (user.username || 'U').charAt(0).toUpperCase();
  }

  private renderBadges(user: StoredUser): string {
    const badges = [];

    if (user.status) {
      badges.push(`<span class="badge status">${this.escapeHtml(user.status)}</span>`);
    }

    if (user.roles && Array.isArray(user.roles)) {
      user.roles.forEach((role: any) => {
        badges.push(`<span class="badge role">${this.escapeHtml(String(role))}</span>`);
      });
    }

    return badges.join('');
  }

  private bind() {
    const form = this.q<HTMLFormElement>('.form');
    const cancelBtn = this.q<HTMLButtonElement>('#cancelBtn');
    const submitBtn = this.q<HTMLButtonElement>('#submitBtn');

    cancelBtn.addEventListener('click', () => {
      window.location.hash = '#/';
    });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      this.clearErrors();

      const data: UserData = {
        firstName: this.val('firstName'),
        lastName: this.val('lastName'),
        email: this.val('email'),
        age: (() => { const v = this.val('age'); return v ? Number(v) : null; })(),
        profession: this.val('profession') || undefined,
        country: this.val('country') || undefined,
      };

      if (!this.validate(data)) return;

      submitBtn.disabled = true;
      submitBtn.dataset.loading = 'true';
      const endpoint = '/api/users/update';
      const token = getToken();

      try {
        const res = await fetch(endpoint, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify(data),
        });

        if (res.ok) {
          const response = await res.json();
          // Update stored user data
          if (response.data) {
            setUser(response.data);
          }
          this.showToast('Profile updated successfully!', true);
          setTimeout(() => {
            window.location.hash = '#/';
          }, 900);
        } else {
          let msg = await res.text();
          this.showToast(msg || 'Update failed', false);
        }
      } catch (err: any) {
        try {
          handleNetworkError(err);
        } catch (networkErr) {
          return;
        }
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

  private escapeHtml(str: string): string {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

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

  private validate(d: UserData): boolean {
    let ok = true;
    const req: Array<[keyof UserData, string]> = [
      ['firstName', 'First name is required'],
      ['lastName', 'Last name is required'],
      ['email', 'Email is required'],
    ];
    req.forEach(([k, msg]) => {
      const v = d[k];
      if (!v || (typeof v === 'string' && !v.trim())) { this.setFieldError(String(k), msg); ok = false; }
    });

    if (d.email && !EMAIL_RE.test(d.email)) { this.setFieldError('email', 'Email is not valid'); ok = false; }
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

customElements.define('page-edit-profile', PageEditProfile);
