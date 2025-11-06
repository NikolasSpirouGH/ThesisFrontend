import { getToken, getUser } from "../../core/auth.store";
import { UnauthorizedError } from "../../core/http";
import { fetchModels, fetchCategories, finalizeModel, getModelById, updateModel, deleteModel, searchModels } from "./api";
import type { ModelItem, CategoryItem, FinalizeModelRequest, UpdateModelRequest, SearchModelRequest } from "./api";
import styles from "./styles/models.css?raw";

type BusyAction = "finalize" | "update" | "delete";

declare global {
  interface HTMLElementTagNameMap {
    "page-models": PageModels;
  }
}

class PageModels extends HTMLElement {
  private root!: ShadowRoot;
  private models: ModelItem[] = [];
  private filteredModels: ModelItem[] = [];
  private categories: CategoryItem[] = [];
  private loading = false;
  private error: string | null = null;
  private busy = new Map<number, BusyAction>();
  private showFinalizeModal = false;
  private showViewModal = false;
  private showEditModal = false;
  private showDeleteModal = false;
  private showSearchPanel = false;
  private searchMode: "simple" | "advanced" = "simple";
  private selectedModelId: number | null = null;
  private selectedModel: ModelItem | null = null;
  private formData = {
    name: "",
    description: "",
    dataDescription: "",
    categoryId: "",
    keywords: "",
    isPublic: false
  };
  private searchData: SearchModelRequest = {
    simpleSearchInput: "",
    searchMode: "OR"
  };

  connectedCallback() {
    this.root = this.shadowRoot ?? this.attachShadow({ mode: "open" });
    this.render();
    void this.loadData();
  }

  private render() {
    this.root.innerHTML = `
      <style>${styles}</style>
      <div class="page">
        <header class="hero">
          <div class="hero__content">
            <h1>Models</h1>
            <p>View your trained models and public models from other users. Finalize models to add metadata and categorization.</p>
          </div>
          <div class="hero__actions">
            <button class="btn ghost" type="button" data-action="toggle-search">${this.showSearchPanel ? "Hide Search" : "Show Search"}</button>
            <button class="btn ghost" type="button" data-action="refresh" ${this.loading ? "disabled" : ""}>${this.loading ? "Refreshing…" : "Refresh"}</button>
          </div>
        </header>
        ${this.renderSearchPanel()}
        ${this.renderBody()}
        ${this.renderFinalizeModal()}
        ${this.renderViewModal()}
        ${this.renderEditModal()}
        ${this.renderDeleteModal()}
      </div>
    `;

    this.bindEvents();
  }

  private renderBody(): string {
    // Determine if a search is active
    const isSearchActive = this.filteredModels.length > 0 || this.hasSearchCriteria();
    const displayModels = isSearchActive ? this.filteredModels : this.models;

    if (this.loading && this.models.length === 0 && !this.error) {
      return `
        <section class="panel state">
          <p>Loading models…</p>
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

    if (this.models.length === 0) {
      return `
        <section class="panel state empty">
          <h2>No models yet</h2>
          <p>Train a model to see it appear in this list.</p>
        </section>
      `;
    }

    // Only show "no search results" if a search is actually active
    if (isSearchActive && this.filteredModels.length === 0 && this.models.length > 0) {
      return `
        <section class="panel state empty">
          <h2>No models match your search</h2>
          <p>Try adjusting your search criteria.</p>
        </section>
      `;
    }

    return `
      <section class="panel">
        <div class="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Model Name</th>
                <th>Description</th>
                <th>Algorithm</th>
                <th>Dataset</th>
                <th>Type</th>
                <th>Category</th>
                <th>Status</th>
                <th>Access</th>
                <th>Created Date</th>
                <th>Owner</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              ${displayModels.map((item) => this.renderRow(item)).join("")}
            </tbody>
          </table>
        </div>
      </section>
    `;
  }

  private hasSearchCriteria(): boolean {
    return !!(
      this.searchData.simpleSearchInput ||
      this.searchData.name ||
      this.searchData.description ||
      (this.searchData.keywords && this.searchData.keywords.length > 0) ||
      this.searchData.category ||
      this.searchData.accessibility ||
      this.searchData.modelType ||
      this.searchData.createdAtFrom ||
      this.searchData.createdAtTo
    );
  }

  private renderRow(model: ModelItem): string {
    const status = (model.status ?? "").toLowerCase();
    const busyState = this.busy.get(model.id);
    const isFinalizing = busyState === "finalize";
    const isUpdating = busyState === "update";
    const isDeleting = busyState === "delete";
    const canFinalize = !model.finalized && (status === "finished" || status === "in_progress");
    const isOwner = this.isModelOwner(model);
    const canView = isOwner || model.accessibility === "PUBLIC";

    return `
      <tr>
        <td>
          <div class="meta">
            <span>${model.name || "Unnamed Model"}</span>
            ${model.finalized ? '<span>Finalized</span>' : '<span>Not finalized</span>'}
          </div>
        </td>
        <td class="description">${this.truncateText(model.description || "—", 50)}</td>
        <td>${model.algorithmName ?? "—"}</td>
        <td class="dataset">${model.datasetName ?? "—"}</td>
        <td>
          <span class="badge badge--${status === "finished" ? "public" : "private"}">${model.modelType ?? "—"}</span>
        </td>
        <td>${model.categoryName ?? "—"}</td>
        <td>
          <span class="status status--${this.statusModifier(status)}">${this.prettyStatus(model.status)}</span>
        </td>
        <td>
          <span class="badge badge--${model.accessibility?.toLowerCase()}">${this.prettyStatus(model.accessibility)}</span>
        </td>
        <td class="date">${this.formatDate(model.createdAt || model.finalizationDate)}</td>
        <td>${model.ownerUsername ?? "—"}</td>
        <td>
          <div class="actions-dropdown">
            <button
              class="btn small ghost"
              type="button"
              data-toggle-actions="${model.id}"
              ${this.loading ? "disabled" : ""}
            >Actions ▼</button>
            <div class="dropdown-menu" data-actions-menu="${model.id}">
              ${canView ? `
                <button
                  class="dropdown-item"
                  type="button"
                  data-model-view="${model.id}"
                >View</button>
              ` : ''}
              ${isOwner && model.finalized ? `
                <button
                  class="dropdown-item"
                  type="button"
                  data-model-edit="${model.id}"
                  ${isUpdating ? "disabled" : ""}
                >${isUpdating ? "Updating…" : "Edit"}</button>
              ` : ''}
              ${isOwner && canFinalize ? `
                <button
                  class="dropdown-item"
                  type="button"
                  data-model-finalize="${model.id}"
                  ${isFinalizing ? "disabled" : ""}
                >${isFinalizing ? "Processing…" : "Finalize"}</button>
              ` : ''}
              ${isOwner ? `
                <button
                  class="dropdown-item dropdown-item--danger"
                  type="button"
                  data-model-delete="${model.id}"
                  ${isDeleting ? "disabled" : ""}
                >${isDeleting ? "Deleting…" : "Delete"}</button>
              ` : ''}
            </div>
          </div>
        </td>
      </tr>
    `;
  }

  private renderFinalizeModal(): string {
    if (!this.showFinalizeModal) {
      return "";
    }

    const selectedModel = this.models.find(m => m.id === this.selectedModelId);
    if (!selectedModel) {
      return "";
    }

    return `
      <div class="modal" role="dialog" aria-modal="true">
        <div class="modal__overlay" data-action="close-modal"></div>
        <section class="modal__panel">
          <header class="modal__header">
            <h2>Finalize Model</h2>
            <p>Add metadata and categorization to your model. This will make it searchable and discoverable.</p>
          </header>

          <form id="finalizeForm">
            <div class="form-group">
              <label for="modelName">Model Name *</label>
              <input
                type="text"
                id="modelName"
                name="name"
                required
                placeholder="Enter model name"
                value="${this.formData.name}"
              />
            </div>

            <div class="form-group">
              <label for="description">Description *</label>
              <textarea
                id="description"
                name="description"
                required
                placeholder="Describe your model..."
                maxlength="500"
              >${this.formData.description}</textarea>
              <small>Maximum 500 characters</small>
            </div>

            <div class="form-group">
              <label for="dataDescription">Data Description *</label>
              <textarea
                id="dataDescription"
                name="dataDescription"
                required
                placeholder="Describe the data used for training..."
                maxlength="500"
              >${this.formData.dataDescription}</textarea>
              <small>Maximum 500 characters</small>
            </div>

            <div class="form-group">
              <label for="category">Category *</label>
              <select id="category" name="categoryId" required>
                <option value="">Select a category</option>
                ${this.categories.map(cat => `
                  <option value="${cat.id}" ${this.formData.categoryId === String(cat.id) ? "selected" : ""}>
                    ${cat.name}
                  </option>
                `).join("")}
              </select>
            </div>

            <div class="form-group">
              <label for="keywords">Keywords</label>
              <input
                type="text"
                id="keywords"
                name="keywords"
                placeholder="machine learning, classification, neural network"
                value="${this.formData.keywords}"
              />
              <small>Comma-separated keywords (max 25 chars each)</small>
            </div>

            <div class="form-group">
              <div class="checkbox-group">
                <input
                  type="checkbox"
                  id="isPublic"
                  name="isPublic"
                  ${this.formData.isPublic ? "checked" : ""}
                />
                <label for="isPublic">Make this model public</label>
              </div>
              <small>Public models can be viewed and used by other users</small>
            </div>
          </form>

          <div class="modal__actions">
            <button class="btn ghost" type="button" data-action="close-modal">Cancel</button>
            <button class="btn primary" type="button" data-action="submit-finalize">Finalize Model</button>
          </div>
        </section>
      </div>
    `;
  }

  private renderSearchPanel(): string {
    if (!this.showSearchPanel) {
      return "";
    }

    return `
      <section class="panel">
        <h2>Search Models</h2>
        <div class="form-group">
          <label>
            <input type="radio" name="searchMode" value="simple" ${this.searchMode === "simple" ? "checked" : ""} data-search-mode="simple" />
            Simple Search
          </label>
          <label style="margin-left: 1rem;">
            <input type="radio" name="searchMode" value="advanced" ${this.searchMode === "advanced" ? "checked" : ""} data-search-mode="advanced" />
            Advanced Search
          </label>
        </div>

        ${this.searchMode === "simple" ? `
          <div class="form-group">
            <label for="search-keyword">Keyword</label>
            <input
              type="text"
              id="search-keyword"
              name="simpleSearchInput"
              placeholder="Search in name, description, keywords..."
              value="${this.searchData.simpleSearchInput || ""}"
            />
            <small>Search across all model metadata</small>
          </div>
        ` : `
          <div class="form-group">
            <label for="search-name">Model Name</label>
            <input type="text" id="search-name" name="name" placeholder="Model name" value="${this.searchData.name || ""}" />
          </div>
          <div class="form-group">
            <label for="search-description">Description</label>
            <input type="text" id="search-description" name="description" placeholder="Description" value="${this.searchData.description || ""}" />
          </div>
          <div class="form-group">
            <label for="search-keywords">Keywords</label>
            <input type="text" id="search-keywords" name="keywords" placeholder="comma, separated, keywords" value="${this.searchData.keywords?.join(", ") || ""}" />
            <small>Comma-separated keywords</small>
          </div>
          <div class="form-group">
            <label for="search-category">Category</label>
            <input type="text" id="search-category" name="category" placeholder="Category name" value="${this.searchData.category || ""}" />
          </div>
          <div class="form-group">
            <label for="search-accessibility">Accessibility</label>
            <select id="search-accessibility" name="accessibility">
              <option value="">All</option>
              <option value="PUBLIC" ${this.searchData.accessibility === "PUBLIC" ? "selected" : ""}>Public</option>
              <option value="PRIVATE" ${this.searchData.accessibility === "PRIVATE" ? "selected" : ""}>Private</option>
            </select>
          </div>
          <div class="form-group">
            <label for="search-model-type">Model Type</label>
            <select id="search-model-type" name="modelType">
              <option value="">All</option>
              <option value="CLASSIFICATION" ${this.searchData.modelType === "CLASSIFICATION" ? "selected" : ""}>Classification</option>
              <option value="REGRESSION" ${this.searchData.modelType === "REGRESSION" ? "selected" : ""}>Regression</option>
              <option value="CLUSTERING" ${this.searchData.modelType === "CLUSTERING" ? "selected" : ""}>Clustering</option>
            </select>
          </div>
          <div class="form-group">
            <label for="search-created-from">Created From</label>
            <input type="date" id="search-created-from" name="createdAtFrom" value="${this.searchData.createdAtFrom || ""}" />
          </div>
          <div class="form-group">
            <label for="search-created-to">Created To</label>
            <input type="date" id="search-created-to" name="createdAtTo" value="${this.searchData.createdAtTo || ""}" />
          </div>
          <div class="form-group">
            <label for="search-mode-toggle">Search Mode</label>
            <select id="search-mode-toggle" name="searchModeLogic">
              <option value="AND" ${this.searchData.searchMode === "AND" ? "selected" : ""}>Match ALL criteria (AND)</option>
              <option value="OR" ${this.searchData.searchMode === "OR" ? "selected" : ""}>Match ANY criteria (OR)</option>
            </select>
          </div>
        `}

        <div class="form-group" style="display: flex; gap: 0.5rem;">
          <button class="btn primary" type="button" data-action="execute-search">Search</button>
          <button class="btn ghost" type="button" data-action="clear-search">Clear</button>
        </div>
      </section>
    `;
  }

  private renderViewModal(): string {
    if (!this.showViewModal || !this.selectedModel) {
      return "";
    }

    return `
      <div class="modal" role="dialog" aria-modal="true">
        <div class="modal__overlay" data-action="close-view-modal"></div>
        <section class="modal__panel">
          <header class="modal__header">
            <h2>${this.selectedModel.name || "Model Details"}</h2>
          </header>
          <div class="modal__body">
            <p><strong>Description:</strong> ${this.selectedModel.description || "N/A"}</p>
            <p><strong>Data Description:</strong> ${this.selectedModel.dataDescription || "N/A"}</p>
            <p><strong>Algorithm:</strong> ${this.selectedModel.algorithmName || "N/A"}</p>
            <p><strong>Dataset:</strong> ${this.selectedModel.datasetName || "N/A"}</p>
            <p><strong>Type:</strong> ${this.selectedModel.modelType || "N/A"}</p>
            <p><strong>Category:</strong> ${this.selectedModel.categoryName || "N/A"}</p>
            <p><strong>Access:</strong> ${this.selectedModel.accessibility || "N/A"}</p>
            <p><strong>Keywords:</strong> ${this.selectedModel.keywords?.join(", ") || "None"}</p>
            <p><strong>Owner:</strong> ${this.selectedModel.ownerUsername}</p>
            <p><strong>Created:</strong> ${this.selectedModel.finalizationDate ? new Date(this.selectedModel.finalizationDate).toLocaleString() : "N/A"}</p>
          </div>
          <div class="modal__actions">
            <button class="btn ghost" type="button" data-action="close-view-modal">Close</button>
          </div>
        </section>
      </div>
    `;
  }

  private renderEditModal(): string {
    if (!this.showEditModal || !this.selectedModel) {
      return "";
    }

    return `
      <div class="modal" role="dialog" aria-modal="true">
        <div class="modal__overlay" data-action="close-edit-modal"></div>
        <section class="modal__panel">
          <header class="modal__header">
            <h2>Edit Model</h2>
          </header>
          <form id="editForm">
            <div class="form-group">
              <label for="edit-name">Model Name *</label>
              <input type="text" id="edit-name" name="name" required value="${this.formData.name}" />
            </div>
            <div class="form-group">
              <label for="edit-description">Description *</label>
              <textarea id="edit-description" name="description" required maxlength="500">${this.formData.description}</textarea>
            </div>
            <div class="form-group">
              <label for="edit-dataDescription">Data Description *</label>
              <textarea id="edit-dataDescription" name="dataDescription" required maxlength="500">${this.formData.dataDescription}</textarea>
            </div>
            <div class="form-group">
              <label for="edit-category">Category *</label>
              <select id="edit-category" name="categoryId" required>
                ${this.categories.map(cat => `
                  <option value="${cat.id}" ${this.formData.categoryId === String(cat.id) ? "selected" : ""}>${cat.name}</option>
                `).join("")}
              </select>
            </div>
            <div class="form-group">
              <label for="edit-keywords">Keywords</label>
              <input type="text" id="edit-keywords" name="keywords" value="${this.formData.keywords}" />
            </div>
            <div class="form-group">
              <label>
                <input type="checkbox" id="edit-isPublic" name="isPublic" ${this.formData.isPublic ? "checked" : ""} />
                Make this model public
              </label>
            </div>
          </form>
          <div class="modal__actions">
            <button class="btn ghost" type="button" data-action="close-edit-modal">Cancel</button>
            <button class="btn primary" type="button" data-action="submit-edit">Save Changes</button>
          </div>
        </section>
      </div>
    `;
  }

  private renderDeleteModal(): string {
    if (!this.showDeleteModal || !this.selectedModel) {
      return "";
    }

    return `
      <div class="modal" role="dialog" aria-modal="true">
        <div class="modal__overlay" data-action="close-delete-modal"></div>
        <section class="modal__panel">
          <header class="modal__header">
            <h2>Delete Model</h2>
          </header>
          <div class="modal__body">
            <p>Are you sure you want to delete the model <strong>"${this.selectedModel.name || "Unnamed Model"}"</strong>?</p>
            <p>This action cannot be undone.</p>
          </div>
          <div class="modal__actions">
            <button class="btn ghost" type="button" data-action="close-delete-modal">Cancel</button>
            <button class="btn primary" type="button" data-action="confirm-delete">Delete</button>
          </div>
        </section>
      </div>
    `;
  }

  private bindEvents() {
    this.root.querySelectorAll<HTMLButtonElement>("[data-action='refresh']").forEach((btn) => {
      btn.addEventListener("click", () => {
        void this.loadData(true);
      });
    });

    this.root.querySelectorAll<HTMLButtonElement>("[data-model-finalize]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const value = btn.dataset.modelFinalize;
        const id = value ? Number.parseInt(value, 10) : NaN;
        if (!Number.isFinite(id)) {
          return;
        }
        this.openFinalizeModal(id);
      });
    });

    this.root.querySelectorAll<HTMLElement>("[data-action='close-modal']").forEach((el) => {
      el.addEventListener("click", () => {
        this.closeFinalizeModal();
      });
    });

    this.root.querySelector<HTMLButtonElement>("[data-action='submit-finalize']")?.addEventListener("click", () => {
      void this.handleFinalize();
    });

    // Bind form inputs
    const form = this.root.querySelector<HTMLFormElement>("#finalizeForm");
    if (form) {
      // Handle text inputs, textareas, and selects
      form.addEventListener("input", (e) => {
        const target = e.target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
        const name = target.name as keyof typeof this.formData;
        if (name && name in this.formData && name !== "isPublic") {
          (this.formData as any)[name] = target.value;
        }
      });

      // Handle checkbox separately with change event
      form.addEventListener("change", (e) => {
        const target = e.target as HTMLInputElement;
        if (target.name === "isPublic" && target.type === "checkbox") {
          this.formData.isPublic = target.checked;
          console.log("Checkbox changed:", target.checked, "formData.isPublic:", this.formData.isPublic);
        }
      });

      form.addEventListener("submit", (e) => {
        e.preventDefault();
        void this.handleFinalize();
      });
    }

    // Search toggle
    this.root.querySelector<HTMLButtonElement>("[data-action='toggle-search']")?.addEventListener("click", () => {
      this.showSearchPanel = !this.showSearchPanel;
      this.render();
    });

    // Search mode toggle (simple/advanced)
    this.root.querySelectorAll<HTMLInputElement>("[data-search-mode]").forEach((radio) => {
      radio.addEventListener("change", (e) => {
        const target = e.target as HTMLInputElement;
        if (target.checked) {
          this.searchMode = target.value as "simple" | "advanced";
          this.render();
        }
      });
    });

    // Search input bindings
    this.root.querySelector<HTMLInputElement>("#search-keyword")?.addEventListener("input", (e) => {
      this.searchData.simpleSearchInput = (e.target as HTMLInputElement).value;
    });

    this.root.querySelector<HTMLInputElement>("#search-name")?.addEventListener("input", (e) => {
      this.searchData.name = (e.target as HTMLInputElement).value;
    });

    this.root.querySelector<HTMLInputElement>("#search-description")?.addEventListener("input", (e) => {
      this.searchData.description = (e.target as HTMLInputElement).value;
    });

    this.root.querySelector<HTMLInputElement>("#search-keywords")?.addEventListener("input", (e) => {
      const value = (e.target as HTMLInputElement).value;
      this.searchData.keywords = value ? value.split(",").map(k => k.trim()).filter(k => k) : undefined;
    });

    this.root.querySelector<HTMLInputElement>("#search-category")?.addEventListener("input", (e) => {
      this.searchData.category = (e.target as HTMLInputElement).value;
    });

    this.root.querySelector<HTMLSelectElement>("#search-accessibility")?.addEventListener("change", (e) => {
      const value = (e.target as HTMLSelectElement).value;
      this.searchData.accessibility = value || undefined;
    });

    this.root.querySelector<HTMLSelectElement>("#search-model-type")?.addEventListener("change", (e) => {
      const value = (e.target as HTMLSelectElement).value;
      this.searchData.modelType = value || undefined;
    });

    this.root.querySelector<HTMLInputElement>("#search-created-from")?.addEventListener("change", (e) => {
      this.searchData.createdAtFrom = (e.target as HTMLInputElement).value;
    });

    this.root.querySelector<HTMLInputElement>("#search-created-to")?.addEventListener("change", (e) => {
      this.searchData.createdAtTo = (e.target as HTMLInputElement).value;
    });

    this.root.querySelector<HTMLSelectElement>("#search-mode-toggle")?.addEventListener("change", (e) => {
      this.searchData.searchMode = (e.target as HTMLSelectElement).value as "AND" | "OR";
    });

    // Execute search
    this.root.querySelector<HTMLButtonElement>("[data-action='execute-search']")?.addEventListener("click", () => {
      void this.handleSearch();
    });

    // Clear search
    this.root.querySelector<HTMLButtonElement>("[data-action='clear-search']")?.addEventListener("click", () => {
      this.searchData = { simpleSearchInput: "", searchMode: "OR" };
      this.filteredModels = [];
      this.render();
    });

    // View model button
    this.root.querySelectorAll<HTMLButtonElement>("[data-model-view]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const value = btn.dataset.modelView;
        const id = value ? Number.parseInt(value, 10) : NaN;
        if (!Number.isFinite(id)) {
          return;
        }
        void this.openViewModal(id);
      });
    });

    // Edit model button
    this.root.querySelectorAll<HTMLButtonElement>("[data-model-edit]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const value = btn.dataset.modelEdit;
        const id = value ? Number.parseInt(value, 10) : NaN;
        if (!Number.isFinite(id)) {
          return;
        }
        this.openEditModal(id);
      });
    });

    // Delete model button
    this.root.querySelectorAll<HTMLButtonElement>("[data-model-delete]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const value = btn.dataset.modelDelete;
        const id = value ? Number.parseInt(value, 10) : NaN;
        if (!Number.isFinite(id)) {
          return;
        }
        this.openDeleteModal(id);
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

    // Edit modal bindings
    this.root.querySelectorAll<HTMLElement>("[data-action='close-edit-modal']").forEach((el) => {
      el.addEventListener("click", () => {
        this.closeEditModal();
      });
    });

    this.root.querySelector<HTMLButtonElement>("[data-action='submit-edit']")?.addEventListener("click", () => {
      void this.handleEdit();
    });

    const editForm = this.root.querySelector<HTMLFormElement>("#editForm");
    if (editForm) {
      editForm.addEventListener("input", (e) => {
        const target = e.target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
        const name = target.name as keyof typeof this.formData;
        if (name && name in this.formData && name !== "isPublic") {
          (this.formData as any)[name] = target.value;
        }
      });

      editForm.addEventListener("change", (e) => {
        const target = e.target as HTMLInputElement;
        if (target.name === "isPublic" && target.type === "checkbox") {
          this.formData.isPublic = target.checked;
        }
      });
    }

    // Delete modal bindings
    this.root.querySelectorAll<HTMLElement>("[data-action='close-delete-modal']").forEach((el) => {
      el.addEventListener("click", () => {
        this.closeDeleteModal();
      });
    });

    this.root.querySelector<HTMLButtonElement>("[data-action='confirm-delete']")?.addEventListener("click", () => {
      void this.handleDelete();
    });
  }

  private async loadData(force = false) {
    if (this.loading && !force) {
      return;
    }
    this.loading = true;
    this.error = null;
    this.render();

    try {
      const token = getToken() ?? undefined;
      const [models, categories] = await Promise.all([
        fetchModels(token),
        fetchCategories(token)
      ]);

      this.models = [...models].sort((a, b) =>
        this.dateValue(b.createdAt) - this.dateValue(a.createdAt)
      );
      this.categories = categories;
    } catch (err) {
      if (err instanceof UnauthorizedError) {
        return;
      }
      const message = err instanceof Error ? err.message : "Failed to load data";
      this.error = message;
    } finally {
      this.loading = false;
      this.render();
    }
  }

  private openFinalizeModal(modelId: number) {
    const model = this.models.find(m => m.id === modelId);
    if (!model) {
      return;
    }

    this.selectedModelId = modelId;
    this.formData = {
      name: model.name || "",
      description: model.description || "",
      dataDescription: model.dataDescription || "",
      categoryId: model.categoryId ? String(model.categoryId) : "",
      keywords: model.keywords ? model.keywords.join(", ") : "",
      isPublic: model.accessibility === "PUBLIC"
    };
    this.showFinalizeModal = true;
    this.render();
  }

  private closeFinalizeModal() {
    this.showFinalizeModal = false;
    this.selectedModelId = null;
    this.formData = {
      name: "",
      description: "",
      dataDescription: "",
      categoryId: "",
      keywords: "",
      isPublic: false
    };
    this.render();
  }

  private async handleFinalize() {
    if (!this.selectedModelId) {
      return;
    }

    const form = this.root.querySelector<HTMLFormElement>("#finalizeForm");
    if (!form || !form.checkValidity()) {
      form?.reportValidity();
      return;
    }

    this.busy.set(this.selectedModelId, "finalize");
    this.render();

    try {
      const token = getToken() ?? undefined;

      const keywords = this.formData.keywords
        .split(",")
        .map(k => k.trim())
        .filter(k => k.length > 0 && k.length <= 25);

      const request: FinalizeModelRequest = {
        name: this.formData.name,
        description: this.formData.description,
        dataDescription: this.formData.dataDescription,
        categoryId: Number.parseInt(this.formData.categoryId, 10),
        keywords,
        isPublic: this.formData.isPublic
      };

      console.log("Finalizing model with request:", request);
      await finalizeModel(this.selectedModelId, request, token);

      window.alert("Model finalized successfully!");
      this.closeFinalizeModal();
      await this.loadData(true);
    } catch (err) {
      if (err instanceof UnauthorizedError) {
        return;
      }
      const message = err instanceof Error ? err.message : "Failed to finalize model";
      window.alert(message);
    } finally {
      this.busy.delete(this.selectedModelId);
      this.render();
    }
  }

  private async openViewModal(modelId: number) {
    try {
      const token = getToken() ?? undefined;
      this.selectedModel = await getModelById(modelId, token);
      this.showViewModal = true;
      this.render();
    } catch (err) {
      if (err instanceof UnauthorizedError) {
        return;
      }
      const message = err instanceof Error ? err.message : "Failed to load model";
      window.alert(message);
    }
  }

  private closeViewModal() {
    this.showViewModal = false;
    this.selectedModel = null;
    this.render();
  }

  private openEditModal(modelId: number) {
    const model = this.models.find(m => m.id === modelId);
    if (!model) {
      return;
    }

    this.selectedModelId = modelId;
    this.selectedModel = model;
    this.formData = {
      name: model.name || "",
      description: model.description || "",
      dataDescription: model.dataDescription || "",
      categoryId: model.categoryId ? String(model.categoryId) : "",
      keywords: model.keywords ? model.keywords.join(", ") : "",
      isPublic: model.accessibility === "PUBLIC"
    };
    this.showEditModal = true;
    this.render();
  }

  private closeEditModal() {
    this.showEditModal = false;
    this.selectedModelId = null;
    this.selectedModel = null;
    this.formData = {
      name: "",
      description: "",
      dataDescription: "",
      categoryId: "",
      keywords: "",
      isPublic: false
    };
    this.render();
  }

  private async handleEdit() {
    if (!this.selectedModelId) {
      return;
    }

    // Save modelId before it gets cleared by closeEditModal
    const modelId = this.selectedModelId;

    const form = this.root.querySelector<HTMLFormElement>("#editForm");
    if (!form || !form.checkValidity()) {
      form?.reportValidity();
      return;
    }

    this.busy.set(modelId, "update");
    this.render();

    try {
      const token = getToken() ?? undefined;

      const keywords = this.formData.keywords
        .split(",")
        .map(k => k.trim())
        .filter(k => k.length > 0 && k.length <= 25);

      const request: UpdateModelRequest = {
        name: this.formData.name,
        description: this.formData.description,
        dataDescription: this.formData.dataDescription,
        categoryId: Number.parseInt(this.formData.categoryId, 10),
        keywords,
        isPublic: this.formData.isPublic
      };

      await updateModel(modelId, request, token);

      window.alert("Model updated successfully!");
      this.closeEditModal();
      await this.loadData(true);
    } catch (err) {
      if (err instanceof UnauthorizedError) {
        return;
      }
      const message = err instanceof Error ? err.message : "Failed to update model";
      window.alert(message);
    } finally {
      this.busy.delete(modelId);
      this.render();
    }
  }

  private openDeleteModal(modelId: number) {
    const model = this.models.find(m => m.id === modelId);
    if (!model) {
      return;
    }

    this.selectedModelId = modelId;
    this.selectedModel = model;
    this.showDeleteModal = true;
    this.render();
  }

  private closeDeleteModal() {
    this.showDeleteModal = false;
    this.selectedModelId = null;
    this.selectedModel = null;
    this.render();
  }

  private async handleDelete() {
    if (!this.selectedModelId) {
      return;
    }

    // Save modelId before it gets cleared by closeDeleteModal
    const modelId = this.selectedModelId;

    this.busy.set(modelId, "delete");
    this.render();

    try {
      const token = getToken() ?? undefined;
      await deleteModel(modelId, token);

      window.alert("Model deleted successfully!");
      this.closeDeleteModal();
      await this.loadData(true);
    } catch (err) {
      if (err instanceof UnauthorizedError) {
        return;
      }
      const message = err instanceof Error ? err.message : "Failed to delete model";
      window.alert(message);
    } finally {
      this.busy.delete(modelId);
      this.render();
    }
  }

  private async handleSearch() {
    try {
      const token = getToken() ?? undefined;
      this.filteredModels = await searchModels(this.searchData, token);
      this.render();
    } catch (err) {
      if (err instanceof UnauthorizedError) {
        return;
      }
      const message = err instanceof Error ? err.message : "Failed to search models";
      window.alert(message);
    }
  }

  private isModelOwner(model: ModelItem): boolean {
    const user = getUser<{ username?: string }>();
    if (!user || !user.username) {
      return false;
    }
    return model.ownerUsername === user.username;
  }

  private dateValue(value: string | null): number {
    if (!value) {
      return 0;
    }
    const timestamp = Date.parse(value);
    return Number.isNaN(timestamp) ? 0 : timestamp;
  }

  private statusModifier(status: string): string {
    switch (status) {
      case "finished":
        return "finished";
      case "in_progress":
        return "in_progress";
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

  private formatDate(dateString: string | null): string {
    if (!dateString) return "—";
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });
    } catch {
      return "—";
    }
  }

  private truncateText(text: string, maxLength: number): string {
    if (text === "—" || !text) return text;
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + "...";
  }
}

customElements.define("page-models", PageModels);
