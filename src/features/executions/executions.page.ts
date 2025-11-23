import { getToken, getUser } from "../../core/auth.store";
import { UnauthorizedError } from "../../core/http";
import { getExecutions, downloadExecutionResult, deleteExecution, getExecutionDetails } from "./api";
import type { ModelExecutionDTO, ExecutionSearchParams } from "./api";
import styles from "./styles/executions.css?raw";

type BusyAction = "download" | "delete";

declare global {
  interface HTMLElementTagNameMap {
    "page-executions": PageExecutions;
  }
}

class PageExecutions extends HTMLElement {
  private root!: ShadowRoot;
  private executions: ModelExecutionDTO[] = [];
  private loading = false;
  private error: string | null = null;
  private busy = new Map<number, BusyAction>();
  private showSearchPanel = false;
  private showViewModal = false;
  private selectedExecution: ModelExecutionDTO | null = null;
  private searchParams: ExecutionSearchParams = {};
  private currentPage = 1;
  private itemsPerPage = 10;

  connectedCallback() {
    this.root = this.shadowRoot ?? this.attachShadow({ mode: "open" });
    this.render();
    void this.loadExecutions();
  }

  private render() {
    this.root.innerHTML = `
      <style>${styles}</style>
      <div class="page">
        <header class="hero">
          <div class="hero__content">
            <h1>Model Executions</h1>
            <p>View and manage your model execution results. Download prediction outputs from both Weka and Custom models.</p>
          </div>
          <div class="hero__actions">
            <button class="btn ghost" type="button" data-action="toggle-search">${this.showSearchPanel ? "Hide Filter" : "Show Filter"}</button>
            <button class="btn primary" type="button" data-action="execute">Start Execution</button>
            <button class="btn ghost" type="button" data-action="refresh" ${this.loading ? "disabled" : ""}>${this.loading ? "Refreshing…" : "Refresh"}</button>
          </div>
        </header>
        ${this.renderSearchPanel()}
        ${this.renderBody()}
        ${this.renderViewModal()}
      </div>
    `;

    this.bindEvents();
  }

  private renderSearchPanel(): string {
    if (!this.showSearchPanel) {
      return "";
    }

    return `
      <section class="panel">
        <h2>Filter by Date</h2>
        <div class="form-group">
          <label for="search-fromDate">From Date</label>
          <input
            type="date"
            id="search-fromDate"
            name="executedAtFrom"
            value="${this.searchParams.executedAtFrom || ""}"
          />
        </div>
        <div class="form-group">
          <label for="search-toDate">To Date</label>
          <input
            type="date"
            id="search-toDate"
            name="executedAtTo"
            value="${this.searchParams.executedAtTo || ""}"
          />
        </div>

        <div class="form-group" style="display: flex; gap: 0.5rem;">
          <button class="btn primary" type="button" data-action="execute-search">Filter</button>
          <button class="btn ghost" type="button" data-action="clear-search">Clear</button>
        </div>
      </section>
    `;
  }

  private get paginatedExecutions(): ModelExecutionDTO[] {
    const start = (this.currentPage - 1) * this.itemsPerPage;
    const end = start + this.itemsPerPage;
    return this.executions.slice(start, end);
  }

  private get totalPages(): number {
    return Math.ceil(this.executions.length / this.itemsPerPage);
  }

  private renderBody(): string {
    if (this.loading && this.executions.length === 0 && !this.error) {
      return `
        <section class="panel state">
          <p>Loading executions…</p>
        </section>
      `;
    }

    if (this.error) {
      return `
        <section class="panel state">
          <p>${this.error}</p>
          <button class="btn ghost" type="button" data-action="refresh" ${this.loading ? "disabled" : ""}>Try again</button>
        </section>
      `;
    }

    if (this.executions.length === 0) {
      return `
        <section class="panel state empty">
          <h2>No Executions Yet</h2>
          <p>Start by executing a trained model to see results here.</p>
        </section>
      `;
    }

    return `
      <section class="panel">
        <div class="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Model</th>
                <th>Algorithm</th>
                <th>Dataset</th>
                <th>Type</th>
                <th>Owner</th>
                <th>Status</th>
                <th>Access</th>
                <th>Executed</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              ${this.paginatedExecutions.map((item) => this.renderRow(item)).join("")}
            </tbody>
          </table>
        </div>
        ${this.renderPagination()}
      </section>
    `;
  }

  private renderPagination(): string {
    if (this.totalPages <= 1) {
      return "";
    }

    const pages = [];
    for (let i = 1; i <= this.totalPages; i++) {
      pages.push(i);
    }

    return `
      <div class="pagination">
        <button
          class="btn small ghost"
          type="button"
          data-page="prev"
          ${this.currentPage === 1 ? "disabled" : ""}
        >← Previous</button>
        <div class="pagination-pages">
          ${pages.map(page => `
            <button
              class="btn small ${page === this.currentPage ? "primary" : "ghost"}"
              type="button"
              data-page="${page}"
              ${page === this.currentPage ? "disabled" : ""}
            >${page}</button>
          `).join("")}
        </div>
        <button
          class="btn small ghost"
          type="button"
          data-page="next"
          ${this.currentPage === this.totalPages ? "disabled" : ""}
        >Next →</button>
      </div>
    `;
  }

  private renderRow(execution: ModelExecutionDTO): string {
    const status = (execution.status ?? "").toLowerCase();
    const busyState = this.busy.get(execution.id);
    const isDownloading = busyState === "download";
    const isDeleting = busyState === "delete";
    const canDownload = (status === "completed" || status === "finished") && execution.hasResultFile;
    const cannotDelete = status === "in_progress" || status === "running";
    const isOwner = this.isExecutionOwner(execution);

    return `
      <tr>
        <td>
          <div class="meta">
            <span>${execution.modelName ?? "—"}</span>
          </div>
        </td>
        <td>${execution.algorithmName ?? "—"}</td>
        <td class="dataset">${execution.datasetName ?? "—"}</td>
        <td>
          <span class="badge badge--${status === "completed" || status === "finished" ? "public" : "private"}">${execution.modelType ?? "—"}</span>
        </td>
        <td>${execution.ownerUsername ?? "—"}</td>
        <td>
          <span class="status status--${this.statusModifier(status)}">${this.prettyStatus(execution.status)}</span>
        </td>
        <td>
          <span class="badge badge--${execution.accessibility?.toLowerCase() || "private"}">${this.prettyStatus(execution.accessibility || "PRIVATE")}</span>
        </td>
        <td>${this.formatDate(execution.executedAt)}</td>
        <td>
          <div class="actions-dropdown">
            <button
              class="btn small ghost"
              type="button"
              data-toggle-actions="${execution.id}"
              ${this.loading ? "disabled" : ""}
            >Actions ▼</button>
            <div class="dropdown-menu" data-actions-menu="${execution.id}">
              <button
                class="dropdown-item"
                type="button"
                data-execution-view="${execution.id}"
              >View</button>
              ${canDownload ? `
                <button
                  class="dropdown-item"
                  type="button"
                  data-execution-download="${execution.id}"
                  ${isDownloading ? "disabled" : ""}
                >${isDownloading ? "Downloading…" : "Download Results"}</button>
              ` : ''}
              ${isOwner ? `
                <button
                  class="dropdown-item dropdown-item--danger"
                  type="button"
                  data-execution-delete="${execution.id}"
                  ${isDeleting || cannotDelete ? "disabled" : ""}
                >${isDeleting ? "Deleting…" : "Delete"}</button>
              ` : ''}
            </div>
          </div>
        </td>
      </tr>
    `;
  }

  private renderViewModal(): string {
    if (!this.showViewModal || !this.selectedExecution) {
      return "";
    }

    return `
      <div class="modal" role="dialog" aria-modal="true">
        <div class="modal__overlay" data-action="close-view-modal"></div>
        <section class="modal__panel">
          <header class="modal__header">
            <h2>${this.selectedExecution.modelName || "Execution Details"}</h2>
          </header>
          <div class="modal__body">
            <p><strong>Model:</strong> ${this.selectedExecution.modelName || "N/A"}</p>
            <p><strong>Model ID:</strong> ${this.selectedExecution.modelId || "N/A"}</p>
            <p><strong>Algorithm:</strong> ${this.selectedExecution.algorithmName || "N/A"}</p>
            <p><strong>Dataset:</strong> ${this.selectedExecution.datasetName || "N/A"}</p>
            <p><strong>Dataset ID:</strong> ${this.selectedExecution.datasetId || "N/A"}</p>
            <p><strong>Model Type:</strong> ${this.selectedExecution.modelType || "N/A"}</p>
            <p><strong>Status:</strong> ${this.prettyStatus(this.selectedExecution.status)}</p>
            <p><strong>Access:</strong> ${this.prettyStatus(this.selectedExecution.accessibility || "PRIVATE")}</p>
            <p><strong>Owner:</strong> ${this.selectedExecution.ownerUsername || "Unknown"}</p>
            <p><strong>Executed At:</strong> ${this.selectedExecution.executedAt ? new Date(this.selectedExecution.executedAt).toLocaleString() : "N/A"}</p>
            <p><strong>Has Result File:</strong> ${this.selectedExecution.hasResultFile ? "Yes" : "No"}</p>
            ${this.selectedExecution.predictionResult ? `<p><strong>Result Path:</strong> ${this.selectedExecution.predictionResult}</p>` : ''}
          </div>
          <div class="modal__actions">
            <button class="btn ghost" type="button" data-action="close-view-modal">Close</button>
          </div>
        </section>
      </div>
    `;
  }

  private bindEvents() {
    this.root.querySelector<HTMLButtonElement>("[data-action='execute']")?.addEventListener("click", () => {
      window.location.hash = "#/execute";
    });

    this.root.querySelectorAll<HTMLButtonElement>("[data-action='refresh']").forEach((btn) => {
      btn.addEventListener("click", () => {
        void this.loadExecutions(true);
      });
    });

    // Filter toggle
    this.root.querySelector<HTMLButtonElement>("[data-action='toggle-search']")?.addEventListener("click", () => {
      this.showSearchPanel = !this.showSearchPanel;
      this.render();
    });

    // Date filter input bindings
    this.root.querySelector<HTMLInputElement>("#search-fromDate")?.addEventListener("input", (e) => {
      const dateValue = (e.target as HTMLInputElement).value;
      // Convert date to datetime at start of day (00:00:00)
      this.searchParams.executedAtFrom = dateValue ? `${dateValue}T00:00:00` : undefined;
    });

    this.root.querySelector<HTMLInputElement>("#search-toDate")?.addEventListener("input", (e) => {
      const dateValue = (e.target as HTMLInputElement).value;
      // Convert date to datetime at end of day (23:59:59)
      this.searchParams.executedAtTo = dateValue ? `${dateValue}T23:59:59` : undefined;
    });

    // Execute filter
    this.root.querySelector<HTMLButtonElement>("[data-action='execute-search']")?.addEventListener("click", () => {
      void this.loadExecutions(true);
    });

    // Clear filter
    this.root.querySelector<HTMLButtonElement>("[data-action='clear-search']")?.addEventListener("click", () => {
      this.searchParams = {};
      void this.loadExecutions(true);
      this.render();
    });

    // View execution
    this.root.querySelectorAll<HTMLButtonElement>("[data-execution-view]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const value = btn.dataset.executionView;
        const id = value ? Number.parseInt(value, 10) : NaN;
        if (!Number.isFinite(id)) {
          return;
        }
        void this.openViewModal(id);
      });
    });

    // Download button
    this.root.querySelectorAll<HTMLButtonElement>("[data-execution-download]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const value = btn.dataset.executionDownload;
        const id = value ? Number.parseInt(value, 10) : NaN;
        if (!Number.isFinite(id)) {
          return;
        }
        void this.handleDownload(id);
      });
    });

    // Delete button
    this.root.querySelectorAll<HTMLButtonElement>("[data-execution-delete]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const value = btn.dataset.executionDelete;
        const id = value ? Number.parseInt(value, 10) : NaN;
        if (!Number.isFinite(id)) {
          return;
        }
        void this.handleDelete(id);
      });
    });

    // Actions dropdown toggle
    this.root.querySelectorAll<HTMLButtonElement>("[data-toggle-actions]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const value = btn.dataset.toggleActions;
        if (!value) return;

        const dropdown = this.root.querySelector<HTMLElement>(`[data-actions-menu="${value}"]`);
        if (!dropdown) return;

        // Close all other dropdowns
        this.root.querySelectorAll<HTMLElement>(".dropdown-menu").forEach((menu) => {
          if (menu !== dropdown) {
            menu.classList.remove("show");
          }
        });

        // Toggle current dropdown
        dropdown.classList.toggle("show");
      });
    });

    // Close dropdowns when clicking outside
    document.addEventListener("click", () => {
      this.root.querySelectorAll<HTMLElement>(".dropdown-menu.show").forEach((menu) => {
        menu.classList.remove("show");
      });
    });

    // View modal close
    this.root.querySelectorAll<HTMLElement>("[data-action='close-view-modal']").forEach((el) => {
      el.addEventListener("click", () => {
        this.closeViewModal();
      });
    });

    // Pagination
    this.root.querySelectorAll<HTMLButtonElement>("[data-page]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const page = btn.dataset.page;
        if (page === "prev" && this.currentPage > 1) {
          this.currentPage--;
        } else if (page === "next" && this.currentPage < this.totalPages) {
          this.currentPage++;
        } else if (page && page !== "prev" && page !== "next") {
          this.currentPage = Number.parseInt(page, 10);
        }
        this.render();
        this.root.querySelector(".panel")?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    });
  }

  private async loadExecutions(force = false) {
    if (this.loading && !force) {
      return;
    }
    this.loading = true;
    this.error = null;
    this.render();

    try {
      const token = getToken() ?? undefined;
      if (!token) {
        throw new UnauthorizedError();
      }
      const response = await getExecutions(token, this.searchParams);
      this.executions = response.sort((a, b) =>
        this.dateValue(b.executedAt) - this.dateValue(a.executedAt)
      );
      this.currentPage = 1; // Reset to first page on new data
    } catch (err) {
      if (err instanceof UnauthorizedError) {
        return;
      }
      const message = err instanceof Error ? err.message : "Failed to load executions";
      this.error = message;
    } finally {
      this.loading = false;
      this.render();
    }
  }

  private async openViewModal(executionId: number) {
    try {
      const token = getToken() ?? undefined;
      this.selectedExecution = await getExecutionDetails(executionId, token);
      this.showViewModal = true;
      this.render();
    } catch (err) {
      if (err instanceof UnauthorizedError) {
        return;
      }
      const message = err instanceof Error ? err.message : "Failed to load execution details";
      window.alert(message);
    }
  }

  private closeViewModal() {
    this.showViewModal = false;
    this.selectedExecution = null;
    this.render();
  }

  private async handleDownload(id: number) {
    this.busy.set(id, "download");
    this.render();

    try {
      const token = getToken();
      if (!token) {
        throw new UnauthorizedError();
      }

      const blob = await downloadExecutionResult(id, token);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `execution-${id}-results.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(url), 0);
    } catch (err) {
      if (err instanceof UnauthorizedError) {
        return;
      }
      const message = err instanceof Error ? err.message : "Failed to download results";
      window.alert(message);
    } finally {
      this.busy.delete(id);
      this.render();
    }
  }

  private async handleDelete(id: number) {
    if (!window.confirm("Delete this execution? The prediction result will be removed.")) {
      return;
    }

    this.busy.set(id, "delete");
    this.render();

    try {
      const token = getToken() ?? undefined;
      await deleteExecution(id, token);
      this.executions = this.executions.filter((item) => item.id !== id);
      window.alert("Execution deleted");
    } catch (err) {
      if (err instanceof UnauthorizedError) {
        return;
      }
      const message = err instanceof Error ? err.message : "Failed to delete execution";
      window.alert(message);
    } finally {
      this.busy.delete(id);
      this.render();
    }
  }

  private isExecutionOwner(execution: ModelExecutionDTO): boolean {
    const user = getUser<{ username?: string }>();
    if (!user || !user.username) {
      return false;
    }
    return execution.ownerUsername === user.username;
  }

  private dateValue(value: string | null): number {
    if (!value) {
      return 0;
    }
    const timestamp = Date.parse(value);
    return Number.isNaN(timestamp) ? 0 : timestamp;
  }

  private formatDate(value: string | null): string {
    if (!value) {
      return "—";
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return "—";
    }
    try {
      return new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeStyle: "short"
      }).format(date);
    } catch {
      return date.toLocaleString();
    }
  }

  private statusModifier(status: string): string {
    const normalized = status.toLowerCase();
    switch (normalized) {
      case "completed":
      case "finished":
        return "completed";
      case "failed":
        return "failed";
      case "in_progress":
      case "running":
        return "running";
      default:
        return "default";
    }
  }

  private prettyStatus(status: string): string {
    if (!status) {
      return "Unknown";
    }
    return status
      .toLowerCase()
      .split(/[_\s]+/)
      .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
      .join(" ");
  }
}

customElements.define("page-executions", PageExecutions);
