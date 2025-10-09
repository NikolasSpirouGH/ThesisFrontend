import { getToken, getUser } from "../../core/auth.store";
import { UnauthorizedError } from "../../core/http";
import { fetchModels, fetchCategories, finalizeModel } from "./api";
import type { ModelItem, CategoryItem, FinalizeModelRequest } from "./api";
import styles from "./styles/models.css?raw";

type BusyAction = "finalize";

declare global {
  interface HTMLElementTagNameMap {
    "page-models": PageModels;
  }
}

class PageModels extends HTMLElement {
  private root!: ShadowRoot;
  private models: ModelItem[] = [];
  private categories: CategoryItem[] = [];
  private loading = false;
  private error: string | null = null;
  private busy = new Map<number, BusyAction>();
  private showFinalizeModal = false;
  private selectedModelId: number | null = null;
  private formData = {
    name: "",
    description: "",
    dataDescription: "",
    categoryId: "",
    keywords: "",
    isPublic: false
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
            <button class="btn ghost" type="button" data-action="refresh" ${this.loading ? "disabled" : ""}>${this.loading ? "Refreshing…" : "Refresh"}</button>
          </div>
        </header>
        ${this.renderBody()}
        ${this.renderFinalizeModal()}
      </div>
    `;

    this.bindEvents();
  }

  private renderBody(): string {
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

    return `
      <section class="panel">
        <div class="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Model Name</th>
                <th>Algorithm</th>
                <th>Dataset</th>
                <th>Type</th>
                <th>Category</th>
                <th>Status</th>
                <th>Access</th>
                <th>Owner</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              ${this.models.map((item) => this.renderRow(item)).join("")}
            </tbody>
          </table>
        </div>
      </section>
    `;
  }

  private renderRow(model: ModelItem): string {
    const status = (model.status ?? "").toLowerCase();
    const busyState = this.busy.get(model.id);
    const isFinalizing = busyState === "finalize";
    const canFinalize = !model.finalized && (status === "finished" || status === "in_progress");
    const isOwner = this.isModelOwner(model);

    return `
      <tr>
        <td>
          <div class="meta">
            <span>${model.name || "Unnamed Model"}</span>
            ${model.finalized ? '<span>Finalized</span>' : '<span>Not finalized</span>'}
          </div>
        </td>
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
        <td>${model.ownerUsername ?? "—"}</td>
        <td>
          <div class="row-actions">
            ${isOwner && canFinalize ? `
              <button
                class="btn small primary"
                type="button"
                data-model-finalize="${model.id}"
                ${isFinalizing || this.loading ? "disabled" : ""}
              >${isFinalizing ? "Processing…" : "Finalize"}</button>
            ` : ''}
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
        this.dateValue(b.finishedAt) - this.dateValue(a.finishedAt)
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
}

customElements.define("page-models", PageModels);
