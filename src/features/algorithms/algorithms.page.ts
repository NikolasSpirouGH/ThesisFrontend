import type { AlgorithmWeka, CustomAlgorithm, SearchCustomAlgorithmRequest, SearchAlgorithmRequest, UpdateCustomAlgorithmPayload } from "./api";
import { fetchAlgorithms, fetchCustomAlgorithms, searchAlgorithms, searchCustomAlgorithms, getCustomAlgorithmById, updateCustomAlgorithm, deleteCustomAlgorithm } from "./api";
import { getToken } from "../../core/auth.store";
import { UnauthorizedError } from "../../core/http";
import styles from "./styles/algorithms.css?raw";

type BusyAction = "update" | "delete";

declare global {
  interface HTMLElementTagNameMap {
    "page-algorithms": PageAlgorithms;
  }
}

class PageAlgorithms extends HTMLElement {
  private root!: ShadowRoot;
  private activeTab: "predefined" | "custom" = "predefined";

  // Predefined algorithms state
  private algorithms: AlgorithmWeka[] = [];
  private filteredAlgorithms: AlgorithmWeka[] = [];
  private predefinedSearchData: SearchAlgorithmRequest = {
    keyword: ""
  };

  // Custom algorithms state
  private customAlgorithms: CustomAlgorithm[] = [];
  private filteredCustomAlgorithms: CustomAlgorithm[] = [];
  private customSearchMode: "simple" | "advanced" = "simple";
  private customSearchData: SearchCustomAlgorithmRequest = {
    simpleSearchInput: "",
    searchMode: "AND"
  };

  private loading = false;
  private error: string | null = null;
  private busy = new Map<number, BusyAction>();
  private showViewModal = false;
  private showEditModal = false;
  private showDeleteModal = false;
  private selectedAlgorithmId: number | null = null;
  private selectedAlgorithm: CustomAlgorithm | null = null;
  private formData = {
    name: "",
    description: "",
    version: "",
    keywords: "",
    accessibility: "PRIVATE" as "PUBLIC" | "PRIVATE" | "SHARED"
  };

  connectedCallback() {
    this.root = this.shadowRoot ?? this.attachShadow({ mode: "open" });
    this.render();
    void this.loadAlgorithms();
  }

  private render() {
    this.root.innerHTML = `
      <style>${styles}</style>
      <div class="page">
        <header class="hero">
          <div class="hero__content">
            <p class="hero__eyebrow">Algorithms</p>
            <h1>Browse available algorithms</h1>
            <p>Review the predefined Weka algorithms and upload your own Docker-based models to reuse across the workspace.</p>
          </div>
          <div class="hero__actions">
            <button class="btn primary" type="button" data-action="create">Upload custom algorithm</button>
            <button class="btn ghost" type="button" data-action="refresh" ${this.loading ? "disabled" : ""}>${this.loading ? "Refreshing…" : "Refresh"}</button>
          </div>
        </header>
        ${this.renderTabs()}
        ${this.renderContent()}
        ${this.renderViewModal()}
        ${this.renderEditModal()}
        ${this.renderDeleteModal()}
      </div>
    `;

    this.bindEvents();
  }

  private renderTabs(): string {
    return `
      <div class="tabs-container">
        <div class="tabs-nav">
          <button
            class="tab-btn ${this.activeTab === "predefined" ? "active" : ""}"
            data-tab="predefined">
            Predefined Algorithms
          </button>
          <button
            class="tab-btn ${this.activeTab === "custom" ? "active" : ""}"
            data-tab="custom">
            Custom Algorithms
          </button>
        </div>
        ${this.activeTab === "predefined" ? this.renderPredefinedSearchPanel() : this.renderCustomSearchPanel()}
      </div>
    `;
  }

  private renderPredefinedSearchPanel(): string {
    return `
      <div class="search-panel">
        <div class="search-form">
          <input
            type="text"
            id="predefined-keyword"
            placeholder="Search by keyword in name or description..."
            value="${this.predefinedSearchData.keyword || ""}">
          <button class="btn primary" data-action="search-predefined">Search</button>
          <button class="btn ghost" data-action="clear-predefined">Clear</button>
        </div>
      </div>
    `;
  }

  private renderCustomSearchPanel(): string {
    return `
      <div class="search-panel">
        <div class="form-group" style="margin-bottom: 1rem;">
          <label>
            <input type="radio" name="customSearchMode" value="simple" ${this.customSearchMode === "simple" ? "checked" : ""} data-custom-search-mode="simple" />
            Simple Search
          </label>
          <label style="margin-left: 1rem;">
            <input type="radio" name="customSearchMode" value="advanced" ${this.customSearchMode === "advanced" ? "checked" : ""} data-custom-search-mode="advanced" />
            Advanced Search
          </label>
        </div>

        ${this.customSearchMode === "simple" ? `
          <div class="search-form">
            <input
              type="text"
              id="custom-simple-search"
              placeholder="Search in name, description, keywords, accessibility, date..."
              value="${this.customSearchData.simpleSearchInput || ""}">
            <button class="btn primary" data-action="search-custom">Search</button>
            <button class="btn ghost" data-action="clear-custom">Clear</button>
          </div>
        ` : `
          <div class="search-form" style="grid-template-columns: 1fr;">
            <input
              type="text"
              id="custom-name"
              placeholder="Algorithm Name"
              value="${this.customSearchData.name || ""}">
            <input
              type="text"
              id="custom-description"
              placeholder="Description"
              value="${this.customSearchData.description || ""}">
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem;">
              <input
                type="date"
                id="custom-created-from"
                placeholder="Created From"
                value="${this.customSearchData.createdAtFrom || ""}">
              <input
                type="date"
                id="custom-created-to"
                placeholder="Created To"
                value="${this.customSearchData.createdAtTo || ""}">
            </div>
            <select id="custom-accessibility">
              <option value="">All Accessibility</option>
              <option value="PUBLIC" ${this.customSearchData.accessibility === "PUBLIC" ? "selected" : ""}>Public</option>
              <option value="PRIVATE" ${this.customSearchData.accessibility === "PRIVATE" ? "selected" : ""}>Private</option>
            </select>
            <select id="custom-search-mode">
              <option value="AND" ${this.customSearchData.searchMode === "AND" ? "selected" : ""}>Match All (AND)</option>
              <option value="OR" ${this.customSearchData.searchMode === "OR" ? "selected" : ""}>Match Any (OR)</option>
            </select>
            <div style="display: flex; gap: 0.75rem;">
              <button class="btn primary" data-action="search-custom">Search</button>
              <button class="btn ghost" data-action="clear-custom">Clear</button>
            </div>
          </div>
        `}
      </div>
    `;
  }

  private renderContent(): string {
    if (this.loading && this.algorithms.length === 0 && this.customAlgorithms.length === 0 && !this.error) {
      return `
        <section class="panel state">
          <p>Loading algorithms…</p>
        </section>
      `;
    }

    if (this.error) {
      return `
        <section class="panel state">
          <h2>Something went wrong</h2>
          <p>${this.error}</p>
          <button class="btn ghost" type="button" data-action="refresh" ${this.loading ? "disabled" : ""}>Try again</button>
        </section>
      `;
    }

    // Render content based on active tab
    return this.activeTab === "predefined"
      ? this.renderPredefinedContent()
      : this.renderCustomContent();
  }

  private renderPredefinedContent(): string {
    if (this.algorithms.length === 0) {
      return `
        <section class="panel state empty">
          <h2>No predefined algorithms available</h2>
          <p>No Weka algorithms found in the system.</p>
        </section>
      `;
    }

    if (this.filteredAlgorithms.length === 0) {
      return `
        <section class="panel state empty">
          <h2>No algorithms match your search</h2>
          <p>Try adjusting your search criteria.</p>
        </section>
      `;
    }

    return `
      <section class="panel">
        <header class="panel__header">
          <h2>Predefined Weka algorithms</h2>
          <p>Found ${this.filteredAlgorithms.length} algorithm(s). These algorithms are ready to use for standard training flows.</p>
        </header>
        <ul class="algo-list">
          ${this.filteredAlgorithms
            .map(
              (algorithm) => `
                <li class="algo-card">
                  <div class="algo-card__body">
                    <span class="algo-card__label">Weka Algorithm</span>
                    <h3>${algorithm.name}</h3>
                    <p>ID <strong>#${algorithm.id}</strong></p>
                  </div>
                </li>
              `
            )
            .join("")}
        </ul>
      </section>
    `;
  }

  private renderCustomContent(): string {
    if (this.customAlgorithms.length === 0) {
      return `
        <section class="panel state empty">
          <h2>No custom algorithms available yet</h2>
          <p>Upload your first custom algorithm to see it listed here.</p>
          <button class="btn primary" type="button" data-action="create">Upload custom algorithm</button>
        </section>
      `;
    }

    if (this.filteredCustomAlgorithms.length === 0) {
      return `
        <section class="panel state empty">
          <h2>No algorithms match your search</h2>
          <p>Try adjusting your search criteria.</p>
        </section>
      `;
    }

    return `
      <section class="panel">
        <header class="panel__header">
          <h2>Custom algorithms</h2>
          <p>Found ${this.filteredCustomAlgorithms.length} algorithm(s). Your own algorithms and public algorithms from other users.</p>
        </header>
        <ul class="algo-list">
          ${this.filteredCustomAlgorithms
            .map((algorithm) => this.renderCustomAlgorithmCard(algorithm))
            .join("")}
        </ul>
      </section>
    `;
  }

  private renderCustomAlgorithmCard(algorithm: CustomAlgorithm): string {
    const busyState = this.busy.get(algorithm.id);
    const isUpdating = busyState === "update";
    const isDeleting = busyState === "delete";

    const createdDate = algorithm.createdAt ? new Date(algorithm.createdAt).toLocaleDateString() : 'N/A';

    return `
      <li class="algo-card ${algorithm.isOwner ? 'algo-card--owned' : ''}">
        <div class="algo-card__body">
          <span class="algo-card__label">${algorithm.isOwner ? 'Your Algorithm' : 'Public Algorithm'}</span>
          <h3>${algorithm.name}</h3>
          <p>Version <strong>${algorithm.version}</strong> • by <strong>${algorithm.ownerUsername}</strong> • Created: <strong>${createdDate}</strong></p>
          ${algorithm.description ? `<p class="algo-card__desc">${algorithm.description}</p>` : ''}
          <div class="algo-card__tags">
            ${algorithm.keywords.map(keyword => `<span class="tag">${keyword}</span>`).join('')}
          </div>
          <div class="algo-card__meta">
            <span class="accessibility ${algorithm.accessibility.toLowerCase()}">${algorithm.accessibility}</span>
          </div>
          <div class="algo-card__actions">
            <button
              class="btn small ghost"
              type="button"
              data-algo-view="${algorithm.id}"
              ${this.loading ? "disabled" : ""}
            >View</button>
            ${algorithm.isOwner ? `
              <button
                class="btn small ghost"
                type="button"
                data-algo-edit="${algorithm.id}"
                ${isUpdating || this.loading ? "disabled" : ""}
              >${isUpdating ? "Updating…" : "Edit"}</button>
              <button
                class="btn small ghost"
                type="button"
                data-algo-delete="${algorithm.id}"
                ${isDeleting || this.loading ? "disabled" : ""}
              >${isDeleting ? "Deleting…" : "Delete"}</button>
            ` : ''}
          </div>
        </div>
      </li>
    `;
  }


  private renderViewModal(): string {
    if (!this.showViewModal || !this.selectedAlgorithm) {
      return "";
    }

    return `
      <div class="modal" role="dialog" aria-modal="true">
        <div class="modal__overlay" data-action="close-view-modal"></div>
        <section class="modal__panel">
          <header class="modal__header">
            <h2>${this.selectedAlgorithm.name || "Algorithm Details"}</h2>
          </header>
          <div class="modal__body">
            <p><strong>Name:</strong> ${this.selectedAlgorithm.name}</p>
            <p><strong>Description:</strong> ${this.selectedAlgorithm.description || "N/A"}</p>
            <p><strong>Version:</strong> ${this.selectedAlgorithm.version}</p>
            <p><strong>Accessibility:</strong> ${this.selectedAlgorithm.accessibility}</p>
            <p><strong>Keywords:</strong> ${this.selectedAlgorithm.keywords?.join(", ") || "None"}</p>
            <p><strong>Owner:</strong> ${this.selectedAlgorithm.ownerUsername}</p>
            <p><strong>Created:</strong> ${this.selectedAlgorithm.createdAt ? new Date(this.selectedAlgorithm.createdAt).toLocaleString() : "N/A"}</p>
          </div>
          <div class="modal__actions">
            <button class="btn ghost" type="button" data-action="close-view-modal">Close</button>
          </div>
        </section>
      </div>
    `;
  }

  private renderEditModal(): string {
    if (!this.showEditModal || !this.selectedAlgorithm) {
      return "";
    }

    return `
      <div class="modal" role="dialog" aria-modal="true">
        <div class="modal__overlay" data-action="close-edit-modal"></div>
        <section class="modal__panel">
          <header class="modal__header">
            <h2>Edit Algorithm</h2>
          </header>
          <form id="editForm">
            <div class="form-group">
              <label for="edit-name">Algorithm Name *</label>
              <input type="text" id="edit-name" name="name" required value="${this.formData.name}" />
            </div>
            <div class="form-group">
              <label for="edit-description">Description</label>
              <textarea id="edit-description" name="description" maxlength="500">${this.formData.description}</textarea>
            </div>
            <div class="form-group">
              <label for="edit-version">Version *</label>
              <input type="text" id="edit-version" name="version" required value="${this.formData.version}" />
            </div>
            <div class="form-group">
              <label for="edit-keywords">Keywords</label>
              <input type="text" id="edit-keywords" name="keywords" value="${this.formData.keywords}" />
              <small>Comma-separated keywords</small>
            </div>
            <div class="form-group">
              <label for="edit-accessibility">Accessibility *</label>
              <select id="edit-accessibility" name="accessibility" required>
                <option value="PRIVATE" ${this.formData.accessibility === "PRIVATE" ? "selected" : ""}>Private</option>
                <option value="PUBLIC" ${this.formData.accessibility === "PUBLIC" ? "selected" : ""}>Public</option>
                <option value="SHARED" ${this.formData.accessibility === "SHARED" ? "selected" : ""}>Shared</option>
              </select>
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
    if (!this.showDeleteModal || !this.selectedAlgorithm) {
      return "";
    }

    return `
      <div class="modal" role="dialog" aria-modal="true">
        <div class="modal__overlay" data-action="close-delete-modal"></div>
        <section class="modal__panel">
          <header class="modal__header">
            <h2>Delete Algorithm</h2>
          </header>
          <div class="modal__body">
            <p>Are you sure you want to delete the algorithm <strong>"${this.selectedAlgorithm.name || "Unnamed Algorithm"}"</strong>?</p>
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

  private async loadAlgorithms(force = false) {
    if (this.loading && !force) {
      return;
    }

    this.loading = true;
    this.error = null;
    this.render();

    try {
      const token = getToken();

      // Fetch both types in parallel
      const [wekaList, customList] = await Promise.all([
        fetchAlgorithms(),
        token ? fetchCustomAlgorithms(token) : Promise.resolve([])
      ]);

      this.algorithms = wekaList.sort((a, b) => a.name.localeCompare(b.name));
      this.filteredAlgorithms = [...this.algorithms]; // Initially show all

      this.customAlgorithms = customList.sort((a, b) => {
        // Sort by ownership first (user's algorithms first), then by name
        if (a.isOwner && !b.isOwner) return -1;
        if (!a.isOwner && b.isOwner) return 1;
        return a.name.localeCompare(b.name);
      });
      this.filteredCustomAlgorithms = [...this.customAlgorithms]; // Initially show all
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to load algorithms.";
      this.error = message;
    } finally {
      this.loading = false;
      this.render();
    }
  }

  private switchTab(tab: "predefined" | "custom") {
    this.activeTab = tab;
    this.render();
  }

  private async searchPredefinedAlgorithms() {
    try {
      const token = getToken();
      this.filteredAlgorithms = await searchAlgorithms(this.predefinedSearchData, token);
      this.render();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to search algorithms";
      console.error(message, error);
      this.error = message;
      this.render();
    }
  }

  private async searchCustomAlgorithmsHandler() {
    try {
      const token = getToken();
      if (!token) return;

      this.filteredCustomAlgorithms = await searchCustomAlgorithms(this.customSearchData, token);
      this.render();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to search custom algorithms";
      console.error(message, error);
      this.error = message;
      this.render();
    }
  }

  private clearPredefinedSearch() {
    this.predefinedSearchData = { keyword: "" };
    this.filteredAlgorithms = [...this.algorithms];
    this.render();
  }

  private clearCustomSearch() {
    this.customSearchData = { simpleSearchInput: "", searchMode: "AND" };
    this.filteredCustomAlgorithms = [...this.customAlgorithms];
    this.render();
  }

  private bindEvents() {
    // Tab switching
    this.root.querySelectorAll<HTMLButtonElement>(".tab-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const tab = btn.dataset.tab as "predefined" | "custom";
        if (tab) {
          this.switchTab(tab);
        }
      });
    });

    // Predefined search inputs
    this.root.querySelector<HTMLInputElement>("#predefined-keyword")?.addEventListener("input", (e) => {
      this.predefinedSearchData.keyword = (e.target as HTMLInputElement).value;
    });

    // Custom search mode toggle (simple/advanced)
    this.root.querySelectorAll<HTMLInputElement>("[data-custom-search-mode]").forEach((radio) => {
      radio.addEventListener("change", (e) => {
        const target = e.target as HTMLInputElement;
        if (target.checked) {
          this.customSearchMode = target.value as "simple" | "advanced";
          this.render();
        }
      });
    });

    // Custom search inputs - simple mode
    this.root.querySelector<HTMLInputElement>("#custom-simple-search")?.addEventListener("input", (e) => {
      this.customSearchData.simpleSearchInput = (e.target as HTMLInputElement).value;
    });

    // Custom search inputs - advanced mode
    this.root.querySelector<HTMLInputElement>("#custom-name")?.addEventListener("input", (e) => {
      this.customSearchData.name = (e.target as HTMLInputElement).value;
    });

    this.root.querySelector<HTMLInputElement>("#custom-description")?.addEventListener("input", (e) => {
      this.customSearchData.description = (e.target as HTMLInputElement).value;
    });

    this.root.querySelector<HTMLInputElement>("#custom-created-from")?.addEventListener("change", (e) => {
      this.customSearchData.createdAtFrom = (e.target as HTMLInputElement).value;
    });

    this.root.querySelector<HTMLInputElement>("#custom-created-to")?.addEventListener("change", (e) => {
      this.customSearchData.createdAtTo = (e.target as HTMLInputElement).value;
    });

    this.root.querySelector<HTMLSelectElement>("#custom-accessibility")?.addEventListener("change", (e) => {
      const value = (e.target as HTMLSelectElement).value;
      this.customSearchData.accessibility = value ? (value as "PUBLIC" | "PRIVATE") : undefined;
    });

    this.root.querySelector<HTMLSelectElement>("#custom-search-mode")?.addEventListener("change", (e) => {
      this.customSearchData.searchMode = (e.target as HTMLSelectElement).value as "AND" | "OR";
    });

    // Search buttons
    this.root.querySelector<HTMLButtonElement>("[data-action='search-predefined']")?.addEventListener("click", () => {
      void this.searchPredefinedAlgorithms();
    });

    this.root.querySelector<HTMLButtonElement>("[data-action='search-custom']")?.addEventListener("click", () => {
      void this.searchCustomAlgorithmsHandler();
    });

    // Clear buttons
    this.root.querySelector<HTMLButtonElement>("[data-action='clear-predefined']")?.addEventListener("click", () => {
      this.clearPredefinedSearch();
    });

    this.root.querySelector<HTMLButtonElement>("[data-action='clear-custom']")?.addEventListener("click", () => {
      this.clearCustomSearch();
    });

    // Create button
    this.root.querySelector<HTMLButtonElement>("[data-action='create']")?.addEventListener("click", () => {
      window.location.hash = "#/algorithms/create";
    });

    // Refresh button
    this.root.querySelectorAll<HTMLButtonElement>("[data-action='refresh']").forEach((button) => {
      button.addEventListener("click", () => {
        if (!this.loading) {
          void this.loadAlgorithms(true);
        }
      });
    });


    // View algorithm button
    this.root.querySelectorAll<HTMLButtonElement>("[data-algo-view]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const value = btn.dataset.algoView;
        const id = value ? Number.parseInt(value, 10) : NaN;
        if (!Number.isFinite(id)) {
          return;
        }
        void this.openViewModal(id);
      });
    });

    // Edit algorithm button
    this.root.querySelectorAll<HTMLButtonElement>("[data-algo-edit]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const value = btn.dataset.algoEdit;
        const id = value ? Number.parseInt(value, 10) : NaN;
        if (!Number.isFinite(id)) {
          return;
        }
        void this.openEditModal(id);
      });
    });

    // Delete algorithm button
    this.root.querySelectorAll<HTMLButtonElement>("[data-algo-delete]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const value = btn.dataset.algoDelete;
        const id = value ? Number.parseInt(value, 10) : NaN;
        if (!Number.isFinite(id)) {
          return;
        }
        this.openDeleteModal(id);
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
        if (name && name in this.formData) {
          (this.formData as any)[name] = target.value;
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


  private async openViewModal(algorithmId: number) {
    try {
      const token = getToken() ?? undefined;

      // Fetch fresh data from API
      const algorithm = await getCustomAlgorithmById(algorithmId, token);

      this.selectedAlgorithm = algorithm;
      this.showViewModal = true;
      this.render();
    } catch (err) {
      if (err instanceof UnauthorizedError) {
        return;
      }
      const message = err instanceof Error ? err.message : "Failed to load algorithm";
      window.alert(message);
    }
  }

  private closeViewModal() {
    this.showViewModal = false;
    this.selectedAlgorithm = null;
    this.render();
  }

  private async openEditModal(algorithmId: number) {
    try {
      const token = getToken() ?? undefined;

      // Fetch fresh data from API
      const algorithm = await getCustomAlgorithmById(algorithmId, token);

      this.selectedAlgorithmId = algorithmId;
      this.selectedAlgorithm = algorithm;
      this.formData = {
        name: algorithm.name || "",
        description: algorithm.description || "",
        version: algorithm.version || "",
        keywords: algorithm.keywords ? algorithm.keywords.join(", ") : "",
        accessibility: algorithm.accessibility
      };
      this.showEditModal = true;
      this.render();
    } catch (err) {
      if (err instanceof UnauthorizedError) {
        return;
      }
      const message = err instanceof Error ? err.message : "Failed to load algorithm";
      window.alert(message);
    }
  }

  private closeEditModal() {
    this.showEditModal = false;
    this.selectedAlgorithmId = null;
    this.selectedAlgorithm = null;
    this.formData = {
      name: "",
      description: "",
      version: "",
      keywords: "",
      accessibility: "PRIVATE"
    };
    this.render();
  }

  private async handleEdit() {
    if (!this.selectedAlgorithmId) {
      return;
    }

    // Save algorithmId before it gets cleared by closeEditModal
    const algorithmId = this.selectedAlgorithmId;

    const form = this.root.querySelector<HTMLFormElement>("#editForm");
    if (!form || !form.checkValidity()) {
      form?.reportValidity();
      return;
    }

    this.busy.set(algorithmId, "update");
    this.render();

    try {
      const token = getToken() ?? undefined;

      const keywords = this.formData.keywords
        .split(",")
        .map(k => k.trim())
        .filter(k => k.length > 0);

      const payload: UpdateCustomAlgorithmPayload = {
        name: this.formData.name,
        description: this.formData.description,
        version: this.formData.version,
        keywords,
        accessibility: this.formData.accessibility
      };

      await updateCustomAlgorithm(algorithmId, payload, token);

      window.alert("Algorithm updated successfully!");
      this.closeEditModal();
      await this.loadAlgorithms(true);
    } catch (err) {
      if (err instanceof UnauthorizedError) {
        return;
      }
      const message = err instanceof Error ? err.message : "Failed to update algorithm";
      window.alert(message);
    } finally {
      this.busy.delete(algorithmId);
      this.render();
    }
  }

  private openDeleteModal(algorithmId: number) {
    const algorithm = this.customAlgorithms.find(a => a.id === algorithmId);
    if (!algorithm) {
      return;
    }

    this.selectedAlgorithmId = algorithmId;
    this.selectedAlgorithm = algorithm;
    this.showDeleteModal = true;
    this.render();
  }

  private closeDeleteModal() {
    this.showDeleteModal = false;
    this.selectedAlgorithmId = null;
    this.selectedAlgorithm = null;
    this.render();
  }

  private async handleDelete() {
    if (!this.selectedAlgorithmId) {
      return;
    }

    // Save algorithmId before it gets cleared by closeDeleteModal
    const algorithmId = this.selectedAlgorithmId;

    this.busy.set(algorithmId, "delete");
    this.render();

    try {
      const token = getToken() ?? undefined;
      await deleteCustomAlgorithm(algorithmId, token);

      window.alert("Algorithm deleted successfully!");
      this.closeDeleteModal();
      await this.loadAlgorithms(true);
    } catch (err) {
      if (err instanceof UnauthorizedError) {
        return;
      }
      const message = err instanceof Error ? err.message : "Failed to delete algorithm";
      window.alert(message);
    } finally {
      this.busy.delete(algorithmId);
      this.render();
    }
  }
}

customElements.define("page-algorithms", PageAlgorithms);
