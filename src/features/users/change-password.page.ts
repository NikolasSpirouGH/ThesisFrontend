import styles from './styles/change-password.css?raw';
import { getToken, clearAuth } from '../../core/auth.store';
import { handleNetworkError } from '../../core/http';

const PASS_RE = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).{8,}$/;

export class PageChangePassword extends HTMLElement {
  private root!: ShadowRoot;

  connectedCallback() {
    this.root = this.shadowRoot ?? this.attachShadow({ mode: 'open' });
    
    if (!getToken()) {
      window.location.hash = '#/login';
      return;
    }

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
            <h1>Change Password</h1>
            <p>Update your account password</p>
          </div>

          <form class="form" novalidate>
            <div class="field">
              <label>Current password</label>
              <input class="input" name="oldPassword" type="password" placeholder="********" autocomplete="current-password" />
              <div class="error"></div>
            </div>

            <div class="field">
              <label>New password</label>
              <input class="input" name="newPassword" type="password" placeholder="********" autocomplete="new-password" />
              <p class="hint">8+ chars with uppercase, lowercase, number & special</p>
              <div class="error"></div>
            </div>

            <div class="field">
              <label>Confirm new password</label>
              <input class="input" name="confirmNewPassword" type="password" placeholder="********" autocomplete="new-password" />
              <div class="error"></div>
            </div>

            <div class="actions">
              <button class="btn secondary" type="button" id="cancelBtn">Cancel</button>
              <button class="btn" type="submit" id="submitBtn">
                <span class="label">Change Password</span>
                <span class="spinner" aria-hidden="true"></span>
              </button>
            </div>

            <div class="toast" role="status" aria-live="polite" aria-atomic="true"></div>
          </form>
        </section>
      </main>
    `;
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

      const oldPassword = this.val('oldPassword');
      const newPassword = this.val('newPassword');
      const confirmNewPassword = this.val('confirmNewPassword');

      if (!this.validate(oldPassword, newPassword, confirmNewPassword)) return;

      submitBtn.disabled = true;
      submitBtn.dataset.loading = 'true';
      const token = getToken();

      try {
        const res = await fetch('/api/auth/change-password', {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({ oldPassword, newPassword, confirmNewPassword }),
        });

        if (res.ok) {
          this.showToast('Password changed successfully! Please login again.', true);
          setTimeout(() => {
            clearAuth();
            window.location.hash = '#/login';
          }, 1500);
        } else {
          const text = await res.text();
          let msg = text;
          try {
            const json = JSON.parse(text);
            msg = json.message || json.errorMessage || text;
          } catch {}
          this.showToast(msg || 'Failed to change password', false);
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

  private validate(old: string, newPwd: string, confirm: string): boolean {
    let ok = true;

    if (!old) {
      this.setFieldError('oldPassword', 'Current password is required');
      ok = false;
    }

    if (!newPwd) {
      this.setFieldError('newPassword', 'New password is required');
      ok = false;
    } else if (!PASS_RE.test(newPwd)) {
      this.setFieldError('newPassword', 'Must be 8+ chars incl. uppercase, lowercase, digit & special');
      ok = false;
    }

    if (!confirm) {
      this.setFieldError('confirmNewPassword', 'Please confirm new password');
      ok = false;
    } else if (newPwd !== confirm) {
      this.setFieldError('confirmNewPassword', 'Passwords do not match');
      ok = false;
    }

    return ok;
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
    this.root.querySelectorAll('.field').forEach(f => {
      f.classList.remove('has-error');
      const err = f.querySelector('.error') as HTMLElement | null;
      if (err) err.textContent = '';
    });
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

customElements.define('page-change-password', PageChangePassword);
