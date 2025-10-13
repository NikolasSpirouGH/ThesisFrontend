import styles from './styles/admin-users.css?raw';
import { getToken, getUser } from '../../core/auth.store';
import { handleNetworkError } from '../../core/http';

type User = {
  id: string;
  username: string;
  firstName?: string;
  lastName?: string;
  email: string;
  age?: number;
  profession?: string;
  country?: string;
  status: string;
  roles: string[];
};

type StoredUser = {
  roles?: unknown;
};

export class PageAdminUsers extends HTMLElement {
  private root!: ShadowRoot;
  private users: User[] = [];
  private filteredUsers: User[] = [];
  private selectedUser: User | null = null;
  private searchQuery: string = '';
  private statusFilter: string = 'all';
  private roleFilter: string = 'all';

  async connectedCallback() {
    this.root = this.shadowRoot ?? this.attachShadow({ mode: 'open' });

    const token = getToken();
    const currentUser = getUser<StoredUser | null>();

    if (!token || !this.isAdmin(currentUser)) {
      window.location.hash = '#/';
      return;
    }

    this.render();
    await this.loadUsers();
  }

  private isAdmin(user: StoredUser | null): boolean {
    if (!user || !user.roles) return false;
    const roles = Array.isArray(user.roles) ? user.roles : [user.roles];
    return roles.some((role: any) => String(role).toUpperCase() === 'ADMIN');
  }

  private render() {
    this.root.innerHTML = `
      <style>${styles}</style>
      <main class="main">
        <div class="container">
          <header class="header">
            <div class="header-content">
              <button class="back-btn" id="backBtn">← Back</button>
              <div>
                <h1>User Management</h1>
                <p class="subtitle">Manage all registered users</p>
              </div>
            </div>
          </header>

          <div class="filters">
            <div class="search-box">
              <span class="search-icon">🔍</span>
              <input
                type="text"
                class="search-input"
                placeholder="Search by username, name, or email..."
                id="searchInput"
              />
            </div>

            <div class="filter-group">
              <label>Status:</label>
              <select class="filter-select" id="statusFilter">
                <option value="all">All Status</option>
                <option value="ACTIVE">Active</option>
                <option value="INACTIVE">Inactive</option>
                <option value="BANNED">Banned</option>
              </select>
            </div>

            <div class="filter-group">
              <label>Role:</label>
              <select class="filter-select" id="roleFilter">
                <option value="all">All Roles</option>
                <option value="USER">User</option>
                <option value="ADMIN">Admin</option>
              </select>
            </div>
          </div>

          <div class="content">
            <div class="users-grid" id="usersGrid">
              <div class="loading">
                <div class="spinner"></div>
                <p>Loading users...</p>
              </div>
            </div>
          </div>
        </div>

        <div class="modal" id="userModal">
          <div class="modal-overlay" id="modalOverlay"></div>
          <div class="modal-content">
            <div class="modal-header">
              <h2>User Details</h2>
              <button class="modal-close" id="modalClose">✕</button>
            </div>
            <div class="modal-body" id="modalBody">
              <!-- User details will be injected here -->
            </div>
          </div>
        </div>
      </main>
    `;

    this.bind();
  }

  private bind() {
    const backBtn = this.q<HTMLButtonElement>('#backBtn');
    const searchInput = this.q<HTMLInputElement>('#searchInput');
    const statusFilter = this.q<HTMLSelectElement>('#statusFilter');
    const roleFilter = this.q<HTMLSelectElement>('#roleFilter');

    backBtn?.addEventListener('click', () => {
      window.location.hash = '#/';
    });

    searchInput?.addEventListener('input', (e) => {
      this.searchQuery = (e.target as HTMLInputElement).value.toLowerCase();
      this.filterUsers();
    });

    statusFilter?.addEventListener('change', (e) => {
      this.statusFilter = (e.target as HTMLSelectElement).value;
      this.filterUsers();
    });

    roleFilter?.addEventListener('change', (e) => {
      this.roleFilter = (e.target as HTMLSelectElement).value;
      this.filterUsers();
    });
  }

  private async loadUsers() {
    const token = getToken();
    if (!token) return;

    try {
      const res = await fetch('/api/users/all', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (res.ok) {
        const response = await res.json();
        this.users = response.data || [];
        this.filteredUsers = [...this.users];
        this.renderUsers();
      } else {
        this.showError('Failed to load users');
      }
    } catch (err: any) {
      try {
        handleNetworkError(err);
      } catch (networkErr) {
        return;
      }
      this.showError(err?.message ?? 'Network error');
    }
  }

  private filterUsers() {
    this.filteredUsers = this.users.filter(user => {
      // Search filter
      const matchesSearch = !this.searchQuery ||
        user.username.toLowerCase().includes(this.searchQuery) ||
        user.email.toLowerCase().includes(this.searchQuery) ||
        (user.firstName && user.firstName.toLowerCase().includes(this.searchQuery)) ||
        (user.lastName && user.lastName.toLowerCase().includes(this.searchQuery));

      // Status filter
      const matchesStatus = this.statusFilter === 'all' || user.status === this.statusFilter;

      // Role filter
      const matchesRole = this.roleFilter === 'all' || user.roles.includes(this.roleFilter);

      return matchesSearch && matchesStatus && matchesRole;
    });

    this.renderUsers();
  }

  private renderUsers() {
    const grid = this.q<HTMLDivElement>('#usersGrid');
    if (!grid) return;

    if (this.filteredUsers.length === 0) {
      grid.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">👥</div>
          <h3>No users found</h3>
          <p>Try adjusting your search or filters</p>
        </div>
      `;
      return;
    }

    grid.innerHTML = this.filteredUsers.map(user => this.renderUserCard(user)).join('');

    // Bind click events to user cards
    this.qa('.user-card').forEach((card, index) => {
      card.addEventListener('click', () => {
        this.showUserDetails(this.filteredUsers[index]);
      });
    });
  }

  private renderUserCard(user: User): string {
    const fullName = [user.firstName, user.lastName].filter(Boolean).join(' ') || user.username;
    const initials = this.getInitials(user);
    const statusClass = user.status.toLowerCase();
    const isAdmin = user.roles.includes('ADMIN');

    return `
      <div class="user-card">
        <div class="user-avatar">${initials}</div>
        <div class="user-info">
          <h3>${this.escapeHtml(fullName)}</h3>
          <p class="user-username">@${this.escapeHtml(user.username)}</p>
          <p class="user-email">${this.escapeHtml(user.email)}</p>
        </div>
        <div class="user-meta">
          <span class="badge badge-${statusClass}">${user.status}</span>
          ${isAdmin ? '<span class="badge badge-admin">ADMIN</span>' : '<span class="badge badge-user">USER</span>'}
        </div>
      </div>
    `;
  }

  private getInitials(user: User): string {
    const first = (user.firstName || '').charAt(0).toUpperCase();
    const last = (user.lastName || '').charAt(0).toUpperCase();
    if (first && last) return first + last;
    if (first) return first;
    if (last) return last;
    return (user.username || 'U').charAt(0).toUpperCase();
  }

  private showUserDetails(user: User) {
    this.selectedUser = user;
    const modal = this.q<HTMLDivElement>('#userModal');
    const modalBody = this.q<HTMLDivElement>('#modalBody');

    if (!modal || !modalBody) return;

    const fullName = [user.firstName, user.lastName].filter(Boolean).join(' ') || user.username;

    modalBody.innerHTML = `
      <div class="detail-section">
        <div class="detail-avatar">${this.getInitials(user)}</div>
        <h3>${this.escapeHtml(fullName)}</h3>
        <p class="detail-username">@${this.escapeHtml(user.username)}</p>
      </div>

      <div class="detail-section">
        <h4>Personal Information</h4>
        <div class="detail-grid">
          <div class="detail-item">
            <label>Email</label>
            <span>${this.escapeHtml(user.email)}</span>
          </div>
          <div class="detail-item">
            <label>Age</label>
            <span>${user.age || 'Not provided'}</span>
          </div>
          <div class="detail-item">
            <label>Profession</label>
            <span>${this.escapeHtml(user.profession || 'Not provided')}</span>
          </div>
          <div class="detail-item">
            <label>Country</label>
            <span>${this.escapeHtml(user.country || 'Not provided')}</span>
          </div>
        </div>
      </div>

      <div class="detail-section">
        <h4>Account Information</h4>
        <div class="detail-grid">
          <div class="detail-item">
            <label>Status</label>
            <span class="badge badge-${user.status.toLowerCase()}">${user.status}</span>
          </div>
          <div class="detail-item">
            <label>Roles</label>
            <div class="role-tags">
              ${user.roles.map(role => `<span class="badge badge-role">${role}</span>`).join('')}
            </div>
          </div>
        </div>
      </div>

      <div class="detail-actions">
        <button class="btn secondary" id="editUserBtn">Edit User</button>
        <button class="btn danger" id="deleteUserBtn">Delete User</button>
      </div>
    `;

    modal.classList.add('show');

    // Bind modal actions
    this.bindModalActions();
  }

  private bindModalActions() {
    const modalClose = this.q<HTMLButtonElement>('#modalClose');
    const modalOverlay = this.q<HTMLDivElement>('#modalOverlay');
    const editBtn = this.q<HTMLButtonElement>('#editUserBtn');
    const deleteBtn = this.q<HTMLButtonElement>('#deleteUserBtn');

    modalClose?.addEventListener('click', () => this.closeModal());
    modalOverlay?.addEventListener('click', () => this.closeModal());

    editBtn?.addEventListener('click', () => {
      if (this.selectedUser) {
        window.location.hash = `#/admin/users/edit/${this.selectedUser.username}`;
      }
    });

    deleteBtn?.addEventListener('click', () => {
      if (this.selectedUser) {
        this.confirmDeleteUser(this.selectedUser);
      }
    });
  }

  private closeModal() {
    const modal = this.q<HTMLDivElement>('#userModal');
    modal?.classList.remove('show');
    this.selectedUser = null;
  }

  private async confirmDeleteUser(user: User) {
    const reason = prompt(`Are you sure you want to delete user "${user.username}"?\n\nPlease provide a reason:`);
    if (!reason || !reason.trim()) return;

    const token = getToken();
    if (!token) return;

    try {
      const res = await fetch(`/api/users/delete/${user.username}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ reason: reason.trim() })
      });

      if (res.ok) {
        alert(`User "${user.username}" deleted successfully`);
        this.closeModal();
        await this.loadUsers();
      } else {
        const text = await res.text();
        alert(`Failed to delete user: ${text}`);
      }
    } catch (err: any) {
      try {
        handleNetworkError(err);
      } catch (networkErr) {
        return;
      }
      alert(err?.message ?? 'Network error');
    }
  }

  private showError(message: string) {
    const grid = this.q<HTMLDivElement>('#usersGrid');
    if (!grid) return;

    grid.innerHTML = `
      <div class="error-state">
        <div class="error-icon">⚠️</div>
        <h3>Error</h3>
        <p>${this.escapeHtml(message)}</p>
        <button class="btn" onclick="location.reload()">Retry</button>
      </div>
    `;
  }

  private escapeHtml(str: string): string {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  private q<T extends HTMLElement>(sel: string) { return this.root.querySelector<T>(sel); }
  private qa(sel: string) { return Array.from(this.root.querySelectorAll(sel)); }
}

customElements.define('page-admin-users', PageAdminUsers);
