import { getToken, getUser } from "../../core/auth.store";
import { UnauthorizedError } from "../../core/http";
import { fetchDatasets, uploadDataset, deleteDataset, downloadDataset } from "./api";
import type { DatasetDTO, DatasetUploadRequest } from "./api";
import styles from "./styles/datasets.css?raw";

type BusyAction = "delete" | "download" | "upload";

declare global {
  interface HTMLElementTagNameMap {
    "page-datasets": PageDatasets;
  }
}

class PageDatasets extends HTMLElement {
  private root!: ShadowRoot;
  private datasets: DatasetDTO[] = [];
  private loading = false;
  private error: string | null = null;
  private busy = new Map<number, BusyAction>();
  private showUploadDialog = false;
  private uploadFormData: Partial<DatasetUploadRequest> = {
    accessibility: "PRIVATE",
    functionalType: "TRAIN"
  };
  private currentPage = 1;
  private itemsPerPage = 10;

  connectedCallback() {
    this.root = this.shadowRoot ?? this.attachShadow({ mode: "open" });
    this.render();
    void this.loadDatasets();
  }

  private get paginatedDatasets(): DatasetDTO[] {
    const start = (this.currentPage - 1) * this.itemsPerPage;
    const end = start + this.itemsPerPage;
    return this.datasets.slice(start, end);
  }

  private get totalPages(): number {
    return Math.ceil(this.datasets.length / this.itemsPerPage);
  }

  private render() {
    this.root.innerHTML = `
      <style>${styles}</style>
      <div class="page">
        <header class="hero">
          <div class="hero__content">
            <h1>Datasets</h1>
            <p>Upload, manage, and organize your training datasets. Track usage across models and share with your team.</p>
          </div>
          <div class="hero__actions">
            <button class="btn primary" type="button" data-action="upload">Upload Dataset</button>
            <button class="btn ghost" type="button" data-action="refresh" ${this.loading ? "disabled" : ""}>${this.loading ? "Refreshing…" : "Refresh"}</button>
          </div>
        </header>
        ${this.renderUploadDialog()}
        ${this.renderBody()}
      </div>
    `;

    this.bindEvents();
  }

  private renderUploadDialog(): string {
    if (!this.showUploadDialog) {
      return "";
    }

    return `
      <div class="dialog" role="dialog" aria-modal="true">
        <div class="dialog__overlay" data-action="close-dialog"></div>
        <section class="dialog__panel">
          <header>
            <h2>Upload Dataset</h2>
            <p class="intro">Upload a dataset file (CSV, Excel, etc.) to use for training your models.</p>
          </header>
          <form class="dialog__form" data-form="upload-dataset">
            <div class="form-group">
              <label for="dataset-file">Dataset File *</label>
              <input
                type="file"
                id="dataset-file"
                name="file"
                required
                accept=".csv,.xlsx,.xls,.arff"
              />
            </div>
            <div class="form-group">
              <label for="dataset-description">Description</label>
              <textarea
                id="dataset-description"
                name="description"
                rows="3"
                placeholder="Brief description of the dataset..."
              >${this.uploadFormData.description ?? ""}</textarea>
            </div>
            <div class="form-group">
              <label for="dataset-accessibility">Accessibility *</label>
              <select
                id="dataset-accessibility"
                name="accessibility"
                required
              >
                <option value="PRIVATE" ${this.uploadFormData.accessibility === "PRIVATE" ? "selected" : ""}>Private</option>
                <option value="PUBLIC" ${this.uploadFormData.accessibility === "PUBLIC" ? "selected" : ""}>Public</option>
                <option value="SHARED" ${this.uploadFormData.accessibility === "SHARED" ? "selected" : ""}>Shared</option>
              </select>
            </div>
            <div class="form-group">
              <label for="dataset-functional-type">Functional Type *</label>
              <select
                id="dataset-functional-type"
                name="functionalType"
                required
              >
                <option value="TRAIN" ${this.uploadFormData.functionalType === "TRAIN" ? "selected" : ""}>Training</option>
                <option value="TEST" ${this.uploadFormData.functionalType === "TEST" ? "selected" : ""}>Testing</option>
                <option value="VALIDATION" ${this.uploadFormData.functionalType === "VALIDATION" ? "selected" : ""}>Validation</option>
              </select>
            </div>
            <div class="form-actions">
              <button class="btn primary" type="submit">Upload</button>
              <button class="btn ghost" type="button" data-action="close-dialog">Cancel</button>
            </div>
          </form>
        </section>
      </div>
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
        <button class="btn small ghost" type="button" data-page="prev" ${this.currentPage === 1 ? "disabled" : ""}>← Previous</button>
        <div class="pagination-pages">
          ${pages.map(page => `
            <button class="btn small ${page === this.currentPage ? "primary" : "ghost"}" type="button" data-page="${page}" ${page === this.currentPage ? "disabled" : ""}>${page}</button>
          `).join("")}
        </div>
        <button class="btn small ghost" type="button" data-page="next" ${this.currentPage === this.totalPages ? "disabled" : ""}>Next →</button>
      </div>
    `;
  }

  private renderBody(): string {
    if (this.loading && this.datasets.length === 0 && !this.error) {
      return `
        <section class="panel state">
          <p>Loading datasets…</p>
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

    if (this.datasets.length === 0) {
      return `
        <section class="panel state empty">
          <h2>No Datasets Yet</h2>
          <p>Upload your first dataset to start training machine learning models.</p>
        </section>
      `;
    }

    return `
      <section class="panel">
        <div class="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Filename</th>
                <th>Size</th>
                <th>Type</th>
                <th>Status</th>
                <th>Owner</th>
                <th>Uploaded</th>
                <th>Trainings</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              ${this.paginatedDatasets.map((item) => this.renderRow(item)).join("")}
            </tbody>
          </table>
        </div>
        ${this.renderPagination()}
      </section>
    `;
  }

  private renderRow(dataset: DatasetDTO): string {
    const busyState = this.busy.get(dataset.id);
    const isDeleting = busyState === "delete";
    const isDownloading = busyState === "download";

    // Check if current user is the owner
    const currentUser = getUser<{ username?: string }>();
    const isOwner = currentUser?.username === dataset.ownerUsername;

    return `
      <tr>
        <td>
          <div class="meta">
            <span class="dataset-name">${dataset.originalFileName}</span>
            ${dataset.description ? `<span class="dataset-desc">${dataset.description}</span>` : ""}
          </div>
        </td>
        <td>${this.formatFileSize(dataset.fileSize)}</td>
        <td class="content-type">${dataset.contentType}</td>
        <td>
          <span class="status status--${this.statusModifier(dataset.status)}">${dataset.status}</span>
        </td>
        <td>${dataset.ownerUsername || 'Unknown'}</td>
        <td>${this.formatDate(dataset.uploadDate)}</td>
        <td>
          <div class="training-stats">
            <span class="stat-success">${dataset.completeTrainingCount} ✓</span>
            ${dataset.failedTrainingCount > 0 ? `<span class="stat-failed">${dataset.failedTrainingCount} ✗</span>` : ""}
          </div>
        </td>
        <td>
          <div class="actions-dropdown">
            <button
              class="btn small ghost"
              type="button"
              data-toggle-actions="${dataset.id}"
              ${this.loading ? "disabled" : ""}
            >Actions ▼</button>
            <div class="dropdown-menu" data-actions-menu="${dataset.id}">
              <button
                class="dropdown-item"
                type="button"
                data-dataset-download="${dataset.id}"
                ${isDownloading ? "disabled" : ""}
              >${isDownloading ? "Downloading…" : "Download"}</button>
              ${isOwner ? `
                <button
                  class="dropdown-item dropdown-item--danger"
                  type="button"
                  data-dataset-delete="${dataset.id}"
                  ${isDeleting ? "disabled" : ""}
                >${isDeleting ? "Deleting…" : "Delete"}</button>
              ` : ""}
            </div>
          </div>
        </td>
      </tr>
    `;
  }

  private bindEvents() {
    this.root.querySelector<HTMLButtonElement>("[data-action='upload']")?.addEventListener("click", () => {
      this.showUploadDialog = true;
      this.uploadFormData = {
        accessibility: "PRIVATE",
        functionalType: "TRAIN"
      };
      this.render();
    });

    this.root.querySelectorAll<HTMLButtonElement>("[data-action='refresh']").forEach((btn) => {
      btn.addEventListener("click", () => {
        void this.loadDatasets(true);
      });
    });

    this.root.querySelectorAll<HTMLElement>("[data-action='close-dialog']").forEach((el) => {
      el.addEventListener("click", () => {
        this.showUploadDialog = false;
        this.uploadFormData = {};
        this.render();
      });
    });

    this.root.querySelector<HTMLFormElement>("[data-form='upload-dataset']")?.addEventListener("submit", (e) => {
      e.preventDefault();
      const formData = new FormData(e.target as HTMLFormElement);
      const file = formData.get("file") as File;
      const description = formData.get("description") as string;
      const accessibility = formData.get("accessibility") as "PUBLIC" | "PRIVATE" | "SHARED";
      const functionalType = formData.get("functionalType") as "TRAIN" | "TEST" | "VALIDATION";

      if (file) {
        void this.handleUpload({
          file,
          description: description || undefined,
          accessibility,
          functionalType
        });
      }
    });

    this.root.querySelectorAll<HTMLButtonElement>("[data-dataset-download]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const value = btn.dataset.datasetDownload;
        const id = value ? Number.parseInt(value, 10) : NaN;
        if (!Number.isFinite(id)) {
          return;
        }
        void this.handleDownload(id);
      });
    });

    this.root.querySelectorAll<HTMLButtonElement>("[data-dataset-delete]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const value = btn.dataset.datasetDelete;
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

  private async loadDatasets(force = false) {
    if (this.loading && !force) {
      return;
    }
    this.loading = true;
    this.error = null;
    this.currentPage = 1;
    this.render();

    try {
      const token = getToken() ?? undefined;
      const items = await fetchDatasets(token);
      this.datasets = items.sort((a, b) =>
        new Date(b.uploadDate).getTime() - new Date(a.uploadDate).getTime()
      );
    } catch (err) {
      if (err instanceof UnauthorizedError) {
        return;
      }
      const message = err instanceof Error ? err.message : "Failed to load datasets";
      this.error = message;
    } finally {
      this.loading = false;
      this.render();
    }
  }

  private async handleUpload(request: DatasetUploadRequest) {
    this.loading = true;
    this.render();

    try {
      const token = getToken() ?? undefined;
      await uploadDataset(request, token);
      this.showUploadDialog = false;
      this.uploadFormData = {};
      window.alert("Dataset uploaded successfully");
      void this.loadDatasets(true);
    } catch (err) {
      if (err instanceof UnauthorizedError) {
        return;
      }
      const message = err instanceof Error ? err.message : "Failed to upload dataset";
      window.alert(message);
    } finally {
      this.loading = false;
      this.render();
    }
  }

  private async handleDownload(id: number) {
    this.busy.set(id, "download");
    this.render();

    try {
      const token = getToken() ?? undefined;
      const { blob, filename } = await downloadDataset(id, token);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(url), 0);
    } catch (err) {
      if (err instanceof UnauthorizedError) {
        return;
      }
      const message = err instanceof Error ? err.message : "Failed to download dataset";
      window.alert(message);
    } finally {
      this.busy.delete(id);
      this.render();
    }
  }

  private async handleDelete(id: number) {
    const dataset = this.datasets.find(d => d.id === id);
    if (!dataset) {
      return;
    }

    if (!window.confirm(`Delete dataset "${dataset.originalFileName}"? This action cannot be undone.`)) {
      return;
    }

    this.busy.set(id, "delete");
    this.render();

    try {
      const token = getToken() ?? undefined;
      await deleteDataset(id, token);
      this.datasets = this.datasets.filter((item) => item.id !== id);
      window.alert("Dataset deleted successfully");
    } catch (err) {
      if (err instanceof UnauthorizedError) {
        return;
      }
      const message = err instanceof Error ? err.message : "Failed to delete dataset";
      window.alert(message);
    } finally {
      this.busy.delete(id);
      this.render();
    }
  }

  private formatFileSize(bytes: number): string {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
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
    switch (status.toUpperCase()) {
      case "PUBLIC":
        return "public";
      case "PRIVATE":
        return "private";
      case "SHARED":
        return "shared";
      default:
        return "default";
    }
  }
}

customElements.define("page-datasets", PageDatasets);
