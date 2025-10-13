import styles from './styles/delete-account.css?raw';
import { getToken, getUser, clearAuth } from '../../core/auth.store';
import { handleNetworkError } from '../../core/http';

type StoredUser = {
  username?: string;
  roles?: unknown;
};

export class PageDeleteAccount extends HTMLElement {
  private root!: ShadowRoot;
  private currentUser: StoredUser | null = null;

  connectedCallback() {
    this.root = this.shadowRoot ?? this.attachShadow({ mode: 'open' });
    this.currentUser = getUser<StoredUser | null>();
    
    if (!getToken() || !this.currentUser) {
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
        <section class="card danger">
          <div class="brand">
            <div class="logo">⚠️</div>
            <h1>Delete Account</h1>
            <p>This action cannot be undone</p>
          </div>

          <div class="warning-box">
            <strong>Warning:</strong> Deleting your account will permanently remove:
            <ul>
              <li>Your profile and personal information</li>
              <li>All your datasets and configurations</li>
              <li>All your trained models</li>
              <li>All your trainings and executions</li>
              <li>All your custom algorithms</li>
            </ul>
          </div>

          <form class="form" novalidate>
            <div class="field">
              <label>Reason for deletion (required)</label>
              <textarea class="input textarea" name="reason" rows="4" placeholder="Please tell us why you're leaving..." required></textarea>
              <div class="error"></div>
            </div>

            <div class="field">
              <label class="checkbox-label">
                <input type="checkbox" name="confirm" class="checkbox" />
                <span>I understand this action is permanent and cannot be undone</span>
              </label>
              <div class="error"></div>
            </div>

            <div class="actions">
              <button class="btn secondary" type="button" id="cancelBtn">Cancel</button>
              <button class="btn danger" type="submit" id="submitBtn">
                <span class="label">Delete My Account</span>
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

      const reason = this.val('reason');
      const confirmed = (this.root.querySelector('[name="confirm"]') as HTMLInputElement)?.checked;

      if (!this.validate(reason, confirmed)) return;

      // Double confirmation
      const doubleCheck = window.confirm(
        `Are you absolutely sure you want to delete your account "${this.currentUser?.username}"?\n\nThis action CANNOT be undone!`
      );
      
      if (!doubleCheck) return;

      submitBtn.disabled = true;
      submitBtn.dataset.loading = 'true';
      const token = getToken();

      try {
        const res = await fetch('/api/users/delete', {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({ reason }),
        });

        if (res.ok) {
          this.showToast('Account deleted successfully. Goodbye!', true);
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
          this.showToast(msg || 'Failed to delete account', false);
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

  private validate(reason: string, confirmed: boolean): boolean {
    let ok = true;

    if (!reason || reason.length < 10) {
      this.setFieldError('reason', 'Please provide a reason (at least 10 characters)');
      ok = false;
    }

    if (!confirmed) {
      const field = this.root.querySelector('.checkbox-label')?.closest('.field') as HTMLElement | null;
      if (field) {
        const err = field.querySelector('.error') as HTMLElement | null;
        if (err) err.textContent = 'You must confirm you understand this action';
      }
      ok = false;
    }

    return ok;
  }

  private q<T extends HTMLElement>(sel: string) { return this.root.querySelector<T>(sel)!; }
  private val(name: string) { return (this.root.querySelector(`[name="${name}"]`) as HTMLInputElement | HTMLTextAreaElement)?.value.trim(); }

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

customElements.define('page-delete-account', PageDeleteAccount);
