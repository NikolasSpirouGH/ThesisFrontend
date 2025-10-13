import styles from './styles/admin-categories.css?raw';
import { getToken, getUser } from '../../core/auth.store';
import { handleNetworkError } from '../../core/http';

type CategoryRequest = {
  id: number;
  name: string;
  description?: string;
  requestedByUsername: string;
  processedByUsername?: string;
  status: string;
  requestedAt: string;
  processedAt?: string;
  parentCategoryIds?: number[];
};

type StoredUser = {
  roles?: unknown;
};

export class PageAdminCategories extends HTMLElement {
  private root!: ShadowRoot;
  private requests: CategoryRequest[] = [];
  private filteredRequests: CategoryRequest[] = [];
  private statusFilter: string = 'PENDING';
  private selectedRequest: CategoryRequest | null = null;

  async connectedCallback() {
    this.root = this.shadowRoot ?? this.attachShadow({ mode: 'open' });

    const token = getToken();
    const currentUser = getUser<StoredUser | null>();

    if (!token || !this.isAdmin(currentUser)) {
      window.location.hash = '#/';
      return;
    }

    this.render();
    await this.loadRequests();
  }

  private isAdmin(user: StoredUser | null): boolean {
    if (!user || !user.roles) return false;
    const roles = Array.isArray(user.roles) ? user.roles : [user.roles];
    return roles.some((role: any) => {
      const roleStr = String(role).toUpperCase();
      return roleStr === 'ADMIN' || roleStr === 'CATEGORY_MANAGER';
    });
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
                <h1>Category Management</h1>
                <p class="subtitle">Review and approve category proposals</p>
              </div>
            </div>
          </header>

          <div class="stats">
            <div class="stat-card">
              <div class="stat-value" id="pendingCount">0</div>
              <div class="stat-label">Pending</div>
            </div>
            <div class="stat-card">
              <div class="stat-value" id="approvedCount">0</div>
              <div class="stat-label">Approved</div>
            </div>
            <div class="stat-card">
              <div class="stat-value" id="rejectedCount">0</div>
              <div class="stat-label">Rejected</div>
            </div>
          </div>

          <div class="filters">
            <div class="filter-group">
              <label>Status:</label>
              <select class="filter-select" id="statusFilter">
                <option value="PENDING">Pending</option>
                <option value="APPROVED">Approved</option>
                <option value="REJECTED">Rejected</option>
                <option value="ALL">All</option>
              </select>
            </div>
          </div>

          <div class="content">
            <div class="requests-list" id="requestsList">
              <div class="loading">
                <div class="spinner"></div>
                <p>Loading category requests...</p>
              </div>
            </div>
          </div>
        </div>

        <div class="modal" id="requestModal">
          <div class="modal-overlay" id="modalOverlay"></div>
          <div class="modal-content">
            <div class="modal-header">
              <h2>Category Request Details</h2>
              <button class="modal-close" id="modalClose">✕</button>
            </div>
            <div class="modal-body" id="modalBody">
              <!-- Request details will be injected here -->
            </div>
          </div>
        </div>
      </main>
    `;

    this.bind();
  }

  private bind() {
    const backBtn = this.q<HTMLButtonElement>('#backBtn');
    const statusFilter = this.q<HTMLSelectElement>('#statusFilter');

    backBtn?.addEventListener('click', () => {
      window.location.hash = '#/';
    });

    statusFilter?.addEventListener('change', (e) => {
      this.statusFilter = (e.target as HTMLSelectElement).value;
      this.filterRequests();
    });
  }

  private async loadRequests() {
    const token = getToken();
    if (!token) return;

    try {
      const res = await fetch('/api/categories/requests/all', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (res.ok) {
        const response = await res.json();
        this.requests = response.data || [];
        this.updateStats();
        this.filterRequests();
      } else {
        this.showError('Failed to load category requests');
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

  private updateStats() {
    const pending = this.requests.filter(r => r.status === 'PENDING').length;
    const approved = this.requests.filter(r => r.status === 'APPROVED').length;
    const rejected = this.requests.filter(r => r.status === 'REJECTED').length;

    const pendingCount = this.q<HTMLDivElement>('#pendingCount');
    const approvedCount = this.q<HTMLDivElement>('#approvedCount');
    const rejectedCount = this.q<HTMLDivElement>('#rejectedCount');

    if (pendingCount) pendingCount.textContent = String(pending);
    if (approvedCount) approvedCount.textContent = String(approved);
    if (rejectedCount) rejectedCount.textContent = String(rejected);
  }

  private filterRequests() {
    if (this.statusFilter === 'ALL') {
      this.filteredRequests = [...this.requests];
    } else {
      this.filteredRequests = this.requests.filter(r => r.status === this.statusFilter);
    }

    this.renderRequests();
  }

  private renderRequests() {
    const list = this.q<HTMLDivElement>('#requestsList');
    if (!list) return;

    if (this.filteredRequests.length === 0) {
      list.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">📋</div>
          <h3>No requests found</h3>
          <p>No category requests match the selected filter</p>
        </div>
      `;
      return;
    }

    list.innerHTML = this.filteredRequests.map(request => this.renderRequestCard(request)).join('');

    // Bind click events
    this.qa('.request-card').forEach((card, index) => {
      card.addEventListener('click', () => {
        this.showRequestDetails(this.filteredRequests[index]);
      });
    });
  }

  private renderRequestCard(request: CategoryRequest): string {
    const statusClass = request.status.toLowerCase();
    const date = new Date(request.requestedAt).toLocaleDateString();
    const icon = request.status === 'PENDING' ? '⏳' :
                 request.status === 'APPROVED' ? '✅' : '❌';

    return `
      <div class="request-card request-${statusClass}">
        <div class="request-icon">${icon}</div>
        <div class="request-info">
          <h3>${this.escapeHtml(request.name)}</h3>
          <p class="request-description">${this.escapeHtml(request.description || 'No description provided')}</p>
          <div class="request-meta">
            <span class="meta-item">👤 ${this.escapeHtml(request.requestedByUsername)}</span>
            <span class="meta-item">📅 ${date}</span>
          </div>
        </div>
        <span class="badge badge-${statusClass}">${request.status}</span>
      </div>
    `;
  }

  private showRequestDetails(request: CategoryRequest) {
    this.selectedRequest = request;
    const modal = this.q<HTMLDivElement>('#requestModal');
    const modalBody = this.q<HTMLDivElement>('#modalBody');

    if (!modal || !modalBody) return;

    const requestedDate = new Date(request.requestedAt).toLocaleString();
    const processedDate = request.processedAt ? new Date(request.processedAt).toLocaleString() : 'N/A';
    const isPending = request.status === 'PENDING';

    modalBody.innerHTML = `
      <div class="detail-section">
        <h3>${this.escapeHtml(request.name)}</h3>
        <span class="badge badge-${request.status.toLowerCase()}">${request.status}</span>
      </div>

      <div class="detail-section">
        <h4>Description</h4>
        <p>${this.escapeHtml(request.description || 'No description provided')}</p>
      </div>

      <div class="detail-section">
        <h4>Request Information</h4>
        <div class="detail-grid">
          <div class="detail-item">
            <label>Requested By</label>
            <span>${this.escapeHtml(request.requestedByUsername)}</span>
          </div>
          <div class="detail-item">
            <label>Requested At</label>
            <span>${requestedDate}</span>
          </div>
          ${!isPending ? `
            <div class="detail-item">
              <label>Processed By</label>
              <span>${this.escapeHtml(request.processedByUsername || 'N/A')}</span>
            </div>
            <div class="detail-item">
              <label>Processed At</label>
              <span>${processedDate}</span>
            </div>
          ` : ''}
        </div>
      </div>

      ${isPending ? `
        <div class="detail-actions">
          <button class="btn success" id="approveBtn">✓ Approve</button>
          <button class="btn danger" id="rejectBtn">✕ Reject</button>
        </div>
      ` : ''}
    `;

    modal.classList.add('show');
    this.bindModalActions(isPending);
  }

  private bindModalActions(isPending: boolean) {
    const modalClose = this.q<HTMLButtonElement>('#modalClose');
    const modalOverlay = this.q<HTMLDivElement>('#modalOverlay');

    modalClose?.addEventListener('click', () => this.closeModal());
    modalOverlay?.addEventListener('click', () => this.closeModal());

    if (isPending) {
      const approveBtn = this.q<HTMLButtonElement>('#approveBtn');
      const rejectBtn = this.q<HTMLButtonElement>('#rejectBtn');

      approveBtn?.addEventListener('click', () => {
        if (this.selectedRequest) {
          this.approveRequest(this.selectedRequest.id);
        }
      });

      rejectBtn?.addEventListener('click', () => {
        if (this.selectedRequest) {
          this.rejectRequest(this.selectedRequest.id);
        }
      });
    }
  }

  private closeModal() {
    const modal = this.q<HTMLDivElement>('#requestModal');
    modal?.classList.remove('show');
    this.selectedRequest = null;
  }

  private async approveRequest(requestId: number) {
    const confirm = window.confirm('Are you sure you want to approve this category request?');
    if (!confirm) return;

    const token = getToken();
    if (!token) return;

    try {
      const res = await fetch(`/api/categories/${requestId}/approve`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (res.ok) {
        alert('Category request approved successfully!');
        this.closeModal();
        await this.loadRequests();
      } else {
        const text = await res.text();
        alert(`Failed to approve request: ${text}`);
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

  private async rejectRequest(requestId: number) {
    const reason = prompt('Please provide a reason for rejecting this category request:');
    if (!reason || !reason.trim()) return;

    const token = getToken();
    if (!token) return;

    try {
      const res = await fetch(`/api/categories/${requestId}/reject`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ rejectionReason: reason.trim() })
      });

      if (res.ok) {
        alert('Category request rejected successfully!');
        this.closeModal();
        await this.loadRequests();
      } else {
        const text = await res.text();
        alert(`Failed to reject request: ${text}`);
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
    const list = this.q<HTMLDivElement>('#requestsList');
    if (!list) return;

    list.innerHTML = `
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

customElements.define('page-admin-categories', PageAdminCategories);
