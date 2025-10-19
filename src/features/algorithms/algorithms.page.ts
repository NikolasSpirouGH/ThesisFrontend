import type { AlgorithmWeka, CustomAlgorithm, SearchCustomAlgorithmRequest, UpdateCustomAlgorithmPayload } from "./api";
import { fetchAlgorithms, fetchCustomAlgorithms, getCustomAlgorithmById, updateCustomAlgorithm, deleteCustomAlgorithm } from "./api";
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
  private algorithms: AlgorithmWeka[] = [];
  private customAlgorithms: CustomAlgorithm[] = [];
  private filteredCustomAlgorithms: CustomAlgorithm[] = [];
  private loading = false;
  private error: string | null = null;
  private busy = new Map<number, BusyAction>();
  private showViewModal = false;
  private showEditModal = false;
  private showDeleteModal = false;
  private showSearchPanel = false;
  private searchMode: "simple" | "advanced" = "simple";
  private selectedAlgorithmId: number | null = null;
  private selectedAlgorithm: CustomAlgorithm | null = null;
  private formData = {
    name: "",
    description: "",
    version: "",
    keywords: "",
    accessibility: "PRIVATE" as "PUBLIC" | "PRIVATE" | "SHARED"
  };
  private searchData: SearchCustomAlgorithmRequest = {
    keyword: "",
    searchMode: "AND"
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
            <button class="btn ghost" type="button" data-action="toggle-search">${this.showSearchPanel ? "Hide Search" : "Show Search"}</button>
            <button class="btn ghost" type="button" data-action="refresh" ${this.loading ? "disabled" : ""}>${this.loading ? "Refreshing…" : "Refresh"}</button>
          </div>
        </header>
        ${this.renderSearchPanel()}
        ${this.renderContent()}
        ${this.renderViewModal()}
        ${this.renderEditModal()}
        ${this.renderDeleteModal()}
      </div>
    `;

    this.bindEvents();
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

    if (this.algorithms.length === 0 && this.customAlgorithms.length === 0) {
      return `
        <section class="panel state empty">
          <h2>No algorithms available yet</h2>
          <p>Upload your first custom algorithm to see it listed here alongside the predefined Weka catalog.</p>
        </section>
      `;
    }

    // Determine if a search is active
    const isSearchActive = this.filteredCustomAlgorithms.length > 0 || this.hasSearchCriteria();
    const displayCustomAlgorithms = isSearchActive ? this.filteredCustomAlgorithms : this.customAlgorithms;

    let content = "";

    // Custom algorithms section
    if (this.customAlgorithms.length > 0) {
      // Show "no results" message if search is active but no results
      if (isSearchActive && this.filteredCustomAlgorithms.length === 0) {
        content += `
          <section class="panel state empty">
            <h2>No algorithms match your search</h2>
            <p>Try adjusting your search criteria.</p>
          </section>
        `;
      } else {
        content += `
          <section class="panel">
            <header class="panel__header">
              <h2>Custom algorithms</h2>
              <p>Your own algorithms and public algorithms from other users.</p>
            </header>
            <ul class="algo-list">
              ${displayCustomAlgorithms
                .map((algorithm) => this.renderCustomAlgorithmCard(algorithm))
                .join("")}
            </ul>
          </section>
        `;
      }
    }

    // Predefined Weka algorithms section
    if (this.algorithms.length > 0) {
      content += `
        <section class="panel">
          <header class="panel__header">
            <h2>Predefined Weka algorithms</h2>
            <p>These algorithms are ready to use for standard training flows.</p>
          </header>
          <ul class="algo-list">
            ${this.algorithms
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

    return content;
  }

  private renderCustomAlgorithmCard(algorithm: CustomAlgorithm): string {
    const busyState = this.busy.get(algorithm.id);
    const isUpdating = busyState === "update";
    const isDeleting = busyState === "delete";

    return `
      <li class="algo-card ${algorithm.isOwner ? 'algo-card--owned' : ''}">
        <div class="algo-card__body">
          <span class="algo-card__label">${algorithm.isOwner ? 'Your Algorithm' : 'Public Algorithm'}</span>
          <h3>${algorithm.name}</h3>
          <p>Version <strong>${algorithm.version}</strong> • by <strong>${algorithm.ownerUsername}</strong></p>
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

  private hasSearchCriteria(): boolean {
    return !!(
      this.searchData.keyword ||
      this.searchData.name ||
      this.searchData.description ||
      (this.searchData.keywords && this.searchData.keywords.length > 0) ||
      this.searchData.accessibility ||
      this.searchData.version ||
      this.searchData.createdAtFrom ||
      this.searchData.createdAtTo
    );
  }

  private renderSearchPanel(): string {
    if (!this.showSearchPanel) {
      return "";
    }

    return `
      <section class="panel">
        <h2>Search Algorithms</h2>
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
              name="keyword"
              placeholder="Search in name, description, keywords..."
              value="${this.searchData.keyword || ""}"
            />
          </div>
        ` : `
          <div class="form-group">
            <label for="search-name">Algorithm Name</label>
            <input type="text" id="search-name" name="name" placeholder="Algorithm name" value="${this.searchData.name || ""}" />
          </div>
          <div class="form-group">
            <label for="search-description">Description</label>
            <input type="text" id="search-description" name="description" placeholder="Description" value="${this.searchData.description || ""}" />
          </div>
          <div class="form-group">
            <label for="search-version">Version</label>
            <input type="text" id="search-version" name="version" placeholder="Version" value="${this.searchData.version || ""}" />
          </div>
          <div class="form-group">
            <label for="search-accessibility">Accessibility</label>
            <select id="search-accessibility" name="accessibility">
              <option value="">All</option>
              <option value="PUBLIC" ${this.searchData.accessibility === "PUBLIC" ? "selected" : ""}>Public</option>
              <option value="PRIVATE" ${this.searchData.accessibility === "PRIVATE" ? "selected" : ""}>Private</option>
              <option value="SHARED" ${this.searchData.accessibility === "SHARED" ? "selected" : ""}>Shared</option>
            </select>
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
      this.customAlgorithms = customList.sort((a, b) => {
        // Sort by ownership first (user's algorithms first), then by name
        if (a.isOwner && !b.isOwner) return -1;
        if (!a.isOwner && b.isOwner) return 1;
        return a.name.localeCompare(b.name);
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to load algorithms.";
      this.error = message;
    } finally {
      this.loading = false;
      this.render();
    }
  }

  private bindEvents() {
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

    // Toggle search panel
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
      this.searchData.keyword = (e.target as HTMLInputElement).value;
    });

    this.root.querySelector<HTMLInputElement>("#search-name")?.addEventListener("input", (e) => {
      this.searchData.name = (e.target as HTMLInputElement).value;
    });

    this.root.querySelector<HTMLInputElement>("#search-description")?.addEventListener("input", (e) => {
      this.searchData.description = (e.target as HTMLInputElement).value;
    });

    this.root.querySelector<HTMLInputElement>("#search-version")?.addEventListener("input", (e) => {
      this.searchData.version = (e.target as HTMLInputElement).value;
    });

    this.root.querySelector<HTMLSelectElement>("#search-accessibility")?.addEventListener("change", (e) => {
      const value = (e.target as HTMLSelectElement).value;
      this.searchData.accessibility = value ? (value as "PUBLIC" | "PRIVATE" | "SHARED") : undefined;
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
      this.searchData = { keyword: "", searchMode: "AND" };
      this.filteredCustomAlgorithms = [];
      this.render();
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

  private async handleSearch() {
    try {
      // Perform client-side filtering
      // Note: Backend search endpoint is also available at /api/algorithms/search-custom-algorithms
      this.filteredCustomAlgorithms = this.customAlgorithms.filter((algo) => {
        if (this.searchMode === "simple") {
          const keyword = this.searchData.keyword?.toLowerCase() || "";
          if (!keyword) return true;

          return (
            algo.name.toLowerCase().includes(keyword) ||
            algo.description?.toLowerCase().includes(keyword) ||
            algo.keywords.some(k => k.toLowerCase().includes(keyword)) ||
            algo.version.toLowerCase().includes(keyword)
          );
        } else {
          // Advanced search with AND/OR logic
          const matches: boolean[] = [];

          if (this.searchData.name) {
            matches.push(algo.name.toLowerCase().includes(this.searchData.name.toLowerCase()));
          }
          if (this.searchData.description) {
            matches.push(algo.description?.toLowerCase().includes(this.searchData.description.toLowerCase()) || false);
          }
          if (this.searchData.version) {
            matches.push(algo.version.toLowerCase().includes(this.searchData.version.toLowerCase()));
          }
          if (this.searchData.accessibility) {
            matches.push(algo.accessibility === this.searchData.accessibility);
          }

          if (matches.length === 0) return true;

          return this.searchData.searchMode === "AND"
            ? matches.every(m => m)
            : matches.some(m => m);
        }
      });

      this.render();
    } catch (err) {
      if (err instanceof UnauthorizedError) {
        return;
      }
      const message = err instanceof Error ? err.message : "Failed to search algorithms";
      window.alert(message);
    }
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

    const form = this.root.querySelector<HTMLFormElement>("#editForm");
    if (!form || !form.checkValidity()) {
      form?.reportValidity();
      return;
    }

    this.busy.set(this.selectedAlgorithmId, "update");
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

      await updateCustomAlgorithm(this.selectedAlgorithmId, payload, token);

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
      this.busy.delete(this.selectedAlgorithmId);
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

    this.busy.set(this.selectedAlgorithmId, "delete");
    this.render();

    try {
      const token = getToken() ?? undefined;
      await deleteCustomAlgorithm(this.selectedAlgorithmId, token);

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
      this.busy.delete(this.selectedAlgorithmId);
      this.render();
    }
  }
}

customElements.define("page-algorithms", PageAlgorithms);
