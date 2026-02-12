import { getToken } from "../../core/auth.store";
import { UnauthorizedError } from "../../core/http";
import { fetchCategories, createCategory, deleteCategory, updateCategory, fetchCategoryById } from "./api";
import type { CategoryDTO, CategoryCreateRequest, CategoryUpdateRequest } from "./api";
import styles from "./styles/categories.css?raw";

type BusyAction = "delete" | "create" | "update";
type DialogMode = "create" | "edit" | "view" | null;

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
  private dialogMode: DialogMode = null;
  private dialogCategoryId: number | null = null;
  private formData: Partial<CategoryDTO> = {};
  private currentPage = 1;
  private itemsPerPage = 10;

  connectedCallback() {
    this.root = this.shadowRoot ?? this.attachShadow({ mode: "open" });
    this.render();
    void this.loadCategories();
  }

  private get paginatedCategories(): CategoryDTO[] {
    const start = (this.currentPage - 1) * this.itemsPerPage;
    const end = start + this.itemsPerPage;
    return this.categories.slice(start, end);
  }

  private get totalPages(): number {
    return Math.ceil(this.categories.length / this.itemsPerPage);
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
        ${this.renderDialog()}
        ${this.renderBody()}
      </div>
    `;

    this.bindEvents();
  }

  private renderDialog(): string {
    if (!this.dialogMode) {
      return "";
    }

    const isView = this.dialogMode === "view";
    const isEdit = this.dialogMode === "edit";
    const isCreate = this.dialogMode === "create";

    const title = isView ? "View Category" : isEdit ? "Edit Category" : "Propose New Category";
    const intro = isCreate
      ? "Submit a category request for admin approval. Categories support hierarchical relationships with parent categories."
      : isView
      ? "Category details"
      : "Update category information. Changes require admin approval.";

    const parentCategoryNames = this.formData.parentCategoryIds
      ? this.formData.parentCategoryIds.map(id => {
          const parent = this.categories.find(c => c.id === id);
          return parent?.name ?? `ID: ${id}`;
        }).join(", ")
      : "—";

    return `
      <div class="dialog" role="dialog" aria-modal="true">
        <div class="dialog__overlay" data-action="close-dialog"></div>
        <section class="dialog__panel">
          <header>
            <h2>${title}</h2>
            <p class="intro">${intro}</p>
          </header>
          ${isView ? `
            <div class="view-content">
              <div class="view-field">
                <label>Name</label>
                <p>${this.formData.name ?? "—"}</p>
              </div>
              <div class="view-field">
                <label>Description</label>
                <p>${this.formData.description ?? "—"}</p>
              </div>
              <div class="view-field">
                <label>Created By</label>
                <p>${this.formData.createdByUsername ?? "—"}</p>
              </div>
              <div class="view-field">
                <label>Parent Categories</label>
                <p>${parentCategoryNames}</p>
              </div>
              <div class="form-actions">
                <button class="btn ghost" type="button" data-action="close-dialog">Close</button>
              </div>
            </div>
          ` : `
            <form class="dialog__form" data-form="category-form">
              <div class="form-group">
                <label for="category-name">Name ${isCreate ? "*" : ""}</label>
                <input
                  type="text"
                  id="category-name"
                  name="name"
                  ${isCreate ? "required" : ""}
                  placeholder="e.g., Computer Vision"
                  value="${this.formData.name ?? ""}"
                  ${isView ? "disabled" : ""}
                />
              </div>
              <div class="form-group">
                <label for="category-description">Description</label>
                <textarea
                  id="category-description"
                  name="description"
                  rows="3"
                  placeholder="Brief description of this category..."
                  ${isView ? "disabled" : ""}
                >${this.formData.description ?? ""}</textarea>
              </div>
              <div class="form-group">
                <label>Parent Categories (optional)</label>
                <p class="field-hint">Select categories that this category belongs to. A category can have multiple parents.</p>
                <div class="parent-categories-list">
                  ${this.renderParentCategoryCheckboxes(isEdit)}
                </div>
              </div>
              ${isView ? `
                <div class="form-group">
                  <label>Created By</label>
                  <input type="text" value="${this.formData.createdByUsername ?? "—"}" disabled />
                </div>
              ` : ""}
              <div class="form-actions">
                <button class="btn primary" type="submit">${isCreate ? "Submit Request" : "Update"}</button>
                <button class="btn ghost" type="button" data-action="close-dialog">Cancel</button>
              </div>
            </form>
          `}
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
              ${this.paginatedCategories.map((item) => this.renderRow(item)).join("")}
            </tbody>
          </table>
        </div>
        ${this.renderPagination()}
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
                data-category-view="${category.id}"
              >View</button>
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

  private renderParentCategoryCheckboxes(isEdit: boolean): string {
    // Filter out the current category being edited (can't be its own parent)
    const availableCategories = this.categories.filter(c =>
      !c.deleted && c.id !== this.dialogCategoryId
    );

    if (availableCategories.length === 0) {
      return '<p class="no-categories">No other categories available</p>';
    }

    const currentParentIds = this.formData.parentCategoryIds ?? [];

    return availableCategories.map(cat => {
      const isChecked = currentParentIds.includes(cat.id);
      return `
        <label class="checkbox-label">
          <input
            type="checkbox"
            name="parentCategoryIds"
            value="${cat.id}"
            ${isChecked ? "checked" : ""}
          />
          <span>${this.escapeHtml(cat.name)}</span>
        </label>
      `;
    }).join("");
  }

  private escapeHtml(text: string): string {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }

  private bindEvents() {
    this.root.querySelector<HTMLButtonElement>("[data-action='create']")?.addEventListener("click", () => {
      this.dialogMode = "create";
      this.formData = {};
      this.render();
    });

    this.root.querySelectorAll<HTMLButtonElement>("[data-action='refresh']").forEach((btn) => {
      btn.addEventListener("click", () => {
        void this.loadCategories(true);
      });
    });

    this.root.querySelectorAll<HTMLElement>("[data-action='close-dialog']").forEach((el) => {
      el.addEventListener("click", () => {
        this.dialogMode = null;
        this.dialogCategoryId = null;
        this.formData = {};
        this.render();
      });
    });

    this.root.querySelector<HTMLFormElement>("[data-form='category-form']")?.addEventListener("submit", (e) => {
      e.preventDefault();
      const formData = new FormData(e.target as HTMLFormElement);
      const name = formData.get("name") as string;
      const description = formData.get("description") as string;

      // Collect selected parent category IDs
      const selectedParentIds = formData.getAll("parentCategoryIds").map(v => Number(v));

      if (this.dialogMode === "create" && name) {
        void this.handleCreate({
          name,
          description: description || undefined,
          parentCategoryIds: selectedParentIds.length > 0 ? selectedParentIds : undefined
        });
      } else if (this.dialogMode === "edit" && this.dialogCategoryId) {
        // For edit, we need to calculate which parents to add and which to remove
        const currentParentIds = this.formData.parentCategoryIds ?? [];
        const newParentCategoryIds = selectedParentIds.filter(id => !currentParentIds.includes(id));
        const parentCategoryIdsToRemove = currentParentIds.filter(id => !selectedParentIds.includes(id));

        void this.handleUpdate(this.dialogCategoryId, {
          name: name || undefined,
          description: description || undefined,
          newParentCategoryIds: newParentCategoryIds.length > 0 ? newParentCategoryIds : undefined,
          parentCategoryIdsToRemove: parentCategoryIdsToRemove.length > 0 ? parentCategoryIdsToRemove : undefined
        });
      }
    });

    this.root.querySelectorAll<HTMLButtonElement>("[data-category-view]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const value = btn.dataset.categoryView;
        const id = value ? Number.parseInt(value, 10) : NaN;
        if (!Number.isFinite(id)) {
          return;
        }
        void this.handleView(id);
      });
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

  private async loadCategories(force = false) {
    if (this.loading && !force) {
      return;
    }
    this.loading = true;
    this.error = null;
    this.currentPage = 1;
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
      this.dialogMode = null;
      this.formData = {};
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

  private async handleView(id: number) {
    this.loading = true;
    this.render();

    try {
      const token = getToken() ?? undefined;
      const category = await fetchCategoryById(id, token);
      this.dialogMode = "view";
      this.dialogCategoryId = id;
      this.formData = category;
      this.render();
    } catch (err) {
      if (err instanceof UnauthorizedError) {
        return;
      }
      const message = err instanceof Error ? err.message : "Failed to load category";
      window.alert(message);
    } finally {
      this.loading = false;
      this.render();
    }
  }

  private async handleEdit(id: number) {
    this.loading = true;
    this.render();

    try {
      const token = getToken() ?? undefined;
      const category = await fetchCategoryById(id, token);
      this.dialogMode = "edit";
      this.dialogCategoryId = id;
      this.formData = category;
      this.render();
    } catch (err) {
      if (err instanceof UnauthorizedError) {
        return;
      }
      const message = err instanceof Error ? err.message : "Failed to load category";
      window.alert(message);
    } finally {
      this.loading = false;
      this.render();
    }
  }

  private async handleUpdate(id: number, request: CategoryUpdateRequest) {
    this.busy.set(id, "update");
    this.render();

    try {
      const token = getToken() ?? undefined;
      await updateCategory(id, request, token);
      this.dialogMode = null;
      this.dialogCategoryId = null;
      this.formData = {};
      window.alert("Category updated successfully");
      void this.loadCategories(true);
    } catch (err) {
      if (err instanceof UnauthorizedError) {
        return;
      }
      const message = err instanceof Error ? err.message : "Failed to update category";
      window.alert(message);
    } finally {
      this.busy.delete(id);
      this.render();
    }
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
