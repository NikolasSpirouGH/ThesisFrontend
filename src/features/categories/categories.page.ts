import { getToken } from "../../core/auth.store";
import { UnauthorizedError } from "../../core/http";
import { fetchCategories, createCategory, deleteCategory } from "./api";
import type { CategoryDTO, CategoryCreateRequest } from "./api";
import styles from "./styles/categories.css?raw";

type BusyAction = "delete" | "create";

declare global {
  interface HTMLElementTagNameMap {
    "page-categories": PageCategories;
  }
}

class PageCategories extends HTMLElement {
  private root!: ShadowRoot;
  private categories: CategoryDTO[] = [];
  private loading = false;
  private error: string | null = null;
  private busy = new Map<number, BusyAction>();
  private showCreateDialog = false;
  private createFormData: Partial<CategoryCreateRequest> = {};

  connectedCallback() {
    this.root = this.shadowRoot ?? this.attachShadow({ mode: "open" });
    this.render();
    void this.loadCategories();
  }

  private render() {
    this.root.innerHTML = `
      <style>${styles}</style>
      <div class="page">
        <header class="hero">
          <div class="hero__content">
            <h1>Categories</h1>
            <p>View approved categories and propose new ones. Admins review and approve category requests to maintain taxonomy quality.</p>
          </div>
          <div class="hero__actions">
            <button class="btn primary" type="button" data-action="create">Propose Category</button>
            <button class="btn ghost" type="button" data-action="refresh" ${this.loading ? "disabled" : ""}>${this.loading ? "Refreshing…" : "Refresh"}</button>
          </div>
        </header>
        ${this.renderCreateDialog()}
        ${this.renderBody()}
      </div>
    `;

    this.bindEvents();
  }

  private renderCreateDialog(): string {
    if (!this.showCreateDialog) {
      return "";
    }

    return `
      <div class="dialog" role="dialog" aria-modal="true">
        <div class="dialog__overlay" data-action="close-dialog"></div>
        <section class="dialog__panel">
          <header>
            <h2>Propose New Category</h2>
            <p class="intro">Submit a category request for admin approval. Categories support hierarchical relationships with parent categories.</p>
          </header>
          <form class="dialog__form" data-form="create-category">
            <div class="form-group">
              <label for="category-name">Name *</label>
              <input
                type="text"
                id="category-name"
                name="name"
                required
                placeholder="e.g., Computer Vision"
                value="${this.createFormData.name ?? ""}"
              />
            </div>
            <div class="form-group">
              <label for="category-description">Description</label>
              <textarea
                id="category-description"
                name="description"
                rows="3"
                placeholder="Brief description of this category..."
              >${this.createFormData.description ?? ""}</textarea>
            </div>
            <div class="form-actions">
              <button class="btn primary" type="submit">Submit Request</button>
              <button class="btn ghost" type="button" data-action="close-dialog">Cancel</button>
            </div>
          </form>
        </section>
      </div>
    `;
  }

  private renderBody(): string {
    if (this.loading && this.categories.length === 0 && !this.error) {
      return `
        <section class="panel state">
          <p>Loading categories…</p>
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

    if (this.categories.length === 0) {
      return `
        <section class="panel state empty">
          <h2>No Categories Yet</h2>
          <p>Create your first category to start organizing your models and datasets.</p>
        </section>
      `;
    }

    return `
      <section class="panel">
        <div class="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Description</th>
                <th>Created By</th>
                <th>Parent Categories</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              ${this.categories.map((item) => this.renderRow(item)).join("")}
            </tbody>
          </table>
        </div>
      </section>
    `;
  }

  private renderRow(category: CategoryDTO): string {
    const busyState = this.busy.get(category.id);
    const isDeleting = busyState === "delete";
    const parentCategories = this.getParentCategoryNames(category.parentCategoryIds);

    return `
      <tr>
        <td>
          <div class="meta">
            <span class="category-name">${category.name}</span>
          </div>
        </td>
        <td class="description">${category.description ?? "—"}</td>
        <td>${category.createdByUsername ?? "—"}</td>
        <td class="parent-categories">
          ${parentCategories.length > 0 ? parentCategories.join(", ") : "—"}
        </td>
        <td>
          <div class="actions-dropdown">
            <button
              class="btn small ghost"
              type="button"
              data-toggle-actions="${category.id}"
              ${this.loading ? "disabled" : ""}
            >Actions ▼</button>
            <div class="dropdown-menu" data-actions-menu="${category.id}">
              <button
                class="dropdown-item"
                type="button"
                data-category-edit="${category.id}"
              >Edit</button>
              <button
                class="dropdown-item dropdown-item--danger"
                type="button"
                data-category-delete="${category.id}"
                ${isDeleting ? "disabled" : ""}
              >${isDeleting ? "Deleting…" : "Delete"}</button>
            </div>
          </div>
        </td>
      </tr>
    `;
  }

  private getParentCategoryNames(parentIds: number[]): string[] {
    return parentIds
      .map(id => {
        const parent = this.categories.find(c => c.id === id);
        return parent?.name ?? `ID: ${id}`;
      })
      .filter(name => name !== null);
  }

  private bindEvents() {
    this.root.querySelector<HTMLButtonElement>("[data-action='create']")?.addEventListener("click", () => {
      this.showCreateDialog = true;
      this.createFormData = {};
      this.render();
    });

    this.root.querySelectorAll<HTMLButtonElement>("[data-action='refresh']").forEach((btn) => {
      btn.addEventListener("click", () => {
        void this.loadCategories(true);
      });
    });

    this.root.querySelectorAll<HTMLElement>("[data-action='close-dialog']").forEach((el) => {
      el.addEventListener("click", () => {
        this.showCreateDialog = false;
        this.createFormData = {};
        this.render();
      });
    });

    this.root.querySelector<HTMLFormElement>("[data-form='create-category']")?.addEventListener("submit", (e) => {
      e.preventDefault();
      const formData = new FormData(e.target as HTMLFormElement);
      const name = formData.get("name") as string;
      const description = formData.get("description") as string;

      if (name) {
        void this.handleCreate({ name, description: description || undefined });
      }
    });

    this.root.querySelectorAll<HTMLButtonElement>("[data-category-edit]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const value = btn.dataset.categoryEdit;
        const id = value ? Number.parseInt(value, 10) : NaN;
        if (!Number.isFinite(id)) {
          return;
        }
        void this.handleEdit(id);
      });
    });

    this.root.querySelectorAll<HTMLButtonElement>("[data-category-delete]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const value = btn.dataset.categoryDelete;
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
  }

  private async loadCategories(force = false) {
    if (this.loading && !force) {
      return;
    }
    this.loading = true;
    this.error = null;
    this.render();

    try {
      const token = getToken() ?? undefined;
      const items = await fetchCategories(token);
      this.categories = items.filter(c => !c.deleted).sort((a, b) => a.name.localeCompare(b.name));
    } catch (err) {
      if (err instanceof UnauthorizedError) {
        return;
      }
      const message = err instanceof Error ? err.message : "Failed to load categories";
      this.error = message;
    } finally {
      this.loading = false;
      this.render();
    }
  }

  private async handleCreate(request: CategoryCreateRequest) {
    this.loading = true;
    this.render();

    try {
      const token = getToken() ?? undefined;
      await createCategory(request, token);
      this.showCreateDialog = false;
      this.createFormData = {};
      window.alert("Category request submitted successfully. Awaiting admin approval.");
      void this.loadCategories(true);
    } catch (err) {
      if (err instanceof UnauthorizedError) {
        return;
      }
      const message = err instanceof Error ? err.message : "Failed to create category";
      window.alert(message);
    } finally {
      this.loading = false;
      this.render();
    }
  }

  private async handleEdit(id: number) {
    const category = this.categories.find(c => c.id === id);
    if (!category) {
      return;
    }
    window.alert(`Edit functionality for "${category.name}" will be implemented soon.`);
  }

  private async handleDelete(id: number) {
    const category = this.categories.find(c => c.id === id);
    if (!category) {
      return;
    }

    if (!window.confirm(`Delete category "${category.name}"? Models and datasets using this category will be reassigned to parent categories.`)) {
      return;
    }

    this.busy.set(id, "delete");
    this.render();

    try {
      const token = getToken() ?? undefined;
      await deleteCategory(id, token);
      this.categories = this.categories.filter((item) => item.id !== id);
      window.alert("Category deleted successfully");
    } catch (err) {
      if (err instanceof UnauthorizedError) {
        return;
      }
      const message = err instanceof Error ? err.message : "Failed to delete category";
      window.alert(message);
    } finally {
      this.busy.delete(id);
      this.render();
    }
  }
}

customElements.define("page-categories", PageCategories);
