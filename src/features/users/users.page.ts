import { getToken } from "../../core/auth.store";
import {
  fetchAllUsers,
  updateUserByAdmin,
  deleteUserByAdmin,
  type UserDTO,
  type UserUpdateRequest
} from "./api";

export class PageUsers extends HTMLElement {
  private users: UserDTO[] = [];
  private loading = false;
  private error: string | null = null;
  private busy = new Map<string, "edit" | "delete">();
  private editingUser: UserDTO | null = null;
  private deleteConfirmUser: UserDTO | null = null;
  private deleteReason = "";
  private searchQuery = "";

  async connectedCallback() {
    this.render();
    await this.loadUsers();
  }

  private get filteredUsers(): UserDTO[] {
    if (!this.searchQuery.trim()) return this.users;
    const query = this.searchQuery.toLowerCase();
    return this.users.filter(
      (u) =>
        u.username.toLowerCase().includes(query) ||
        u.email?.toLowerCase().includes(query) ||
        u.firstName?.toLowerCase().includes(query) ||
        u.lastName?.toLowerCase().includes(query)
    );
  }

  private async loadUsers() {
    this.loading = true;
    this.error = null;
    this.render();

    try {
      const token = getToken() ?? undefined;
      this.users = await fetchAllUsers(token);
      this.error = null;
    } catch (err: any) {
      console.error("Failed to load users:", err);
      this.error = err?.message ?? "Failed to load users";
    } finally {
      this.loading = false;
      this.render();
    }
  }

  private render() {
    this.innerHTML = `
      <div class="page-users">
        <header class="page-header">
          <h1>User Management</h1>
          <p>Manage system users and their permissions</p>
        </header>

        ${this.error ? `<div class="alert alert-error">${this.error}</div>` : ""}

        <div class="controls">
          <input
            type="search"
            class="search-input"
            placeholder="Search users by username, email, or name..."
            value="${this.searchQuery}"
            data-search-input
          />
        </div>

        ${this.renderBody()}
        ${this.editingUser ? this.renderEditModal() : ""}
        ${this.deleteConfirmUser ? this.renderDeleteModal() : ""}
      </div>
    `;

    this.attachEventListeners();
  }

  private renderBody(): string {
    if (this.loading) {
      return `<div class="loading-state">Loading users...</div>`;
    }

    if (this.users.length === 0) {
      return `
        <section class="panel state empty">
          <h2>No Users Found</h2>
          <p>There are no users in the system.</p>
        </section>
      `;
    }

    const displayUsers = this.filteredUsers;

    if (displayUsers.length === 0) {
      return `
        <section class="panel state empty">
          <h2>No Results</h2>
          <p>No users match your search criteria.</p>
        </section>
      `;
    }

    return `
      <section class="panel">
        <div class="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Username</th>
                <th>Email</th>
                <th>Name</th>
                <th>Roles</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              ${displayUsers.map((user) => this.renderRow(user)).join("")}
            </tbody>
          </table>
        </div>
      </section>
    `;
  }

  private renderRow(user: UserDTO): string {
    const busyState = this.busy.get(user.username);
    const isEditing = busyState === "edit";
    const isDeleting = busyState === "delete";

    const fullName = [user.firstName, user.lastName].filter(Boolean).join(" ") || "-";
    const roles = user.roles?.join(", ") || "-";

    return `
      <tr>
        <td><strong>${user.username}</strong></td>
        <td>${user.email || "-"}</td>
        <td>${fullName}</td>
        <td><span class="badge">${roles}</span></td>
        <td><span class="status status--${(user.status || "unknown").toLowerCase()}">${user.status || "Unknown"}</span></td>
        <td>
          <div class="row-actions">
            <button
              class="btn small ghost"
              type="button"
              data-user-edit="${user.username}"
              ${isEditing || this.loading ? "disabled" : ""}
            >${isEditing ? "Editing..." : "Edit"}</button>
            <button
              class="btn small danger"
              type="button"
              data-user-delete="${user.username}"
              ${isDeleting || this.loading ? "disabled" : ""}
            >${isDeleting ? "Deleting..." : "Delete"}</button>
          </div>
        </td>
      </tr>
    `;
  }

  private renderEditModal(): string {
    if (!this.editingUser) return "";

    const user = this.editingUser;

    return `
      <div class="modal-overlay" data-modal-overlay>
        <div class="modal">
          <div class="modal-header">
            <h2>Edit User: ${user.username}</h2>
            <button class="btn-close" data-modal-close>✕</button>
          </div>
          <form class="modal-body" data-edit-form>
            <div class="form-group">
              <label>First Name</label>
              <input type="text" name="firstName" value="${user.firstName || ""}" />
            </div>
            <div class="form-group">
              <label>Last Name</label>
              <input type="text" name="lastName" value="${user.lastName || ""}" />
            </div>
            <div class="form-group">
              <label>Email</label>
              <input type="email" name="email" value="${user.email || ""}" required />
            </div>
            <div class="form-group">
              <label>Age</label>
              <input type="number" name="age" value="${user.age || ""}" min="1" max="150" />
            </div>
            <div class="form-group">
              <label>Profession</label>
              <input type="text" name="profession" value="${user.profession || ""}" />
            </div>
            <div class="form-group">
              <label>Country</label>
              <input type="text" name="country" value="${user.country || ""}" />
            </div>
            <div class="modal-actions">
              <button type="button" class="btn secondary" data-modal-close>Cancel</button>
              <button type="submit" class="btn primary">Save Changes</button>
            </div>
          </form>
        </div>
      </div>
    `;
  }

  private renderDeleteModal(): string {
    if (!this.deleteConfirmUser) return "";

    const user = this.deleteConfirmUser;

    return `
      <div class="modal-overlay" data-modal-overlay>
        <div class="modal modal-danger">
          <div class="modal-header">
            <h2>Delete User</h2>
            <button class="btn-close" data-modal-close>✕</button>
          </div>
          <form class="modal-body" data-delete-form>
            <p>Are you sure you want to delete user <strong>${user.username}</strong>?</p>
            <p class="warning-text">This action cannot be undone.</p>
            <div class="form-group">
              <label>Reason for deletion (required)</label>
              <textarea
                name="reason"
                rows="3"
                required
                placeholder="Enter the reason for deleting this user..."
              >${this.deleteReason}</textarea>
            </div>
            <div class="modal-actions">
              <button type="button" class="btn secondary" data-modal-close>Cancel</button>
              <button type="submit" class="btn danger">Delete User</button>
            </div>
          </form>
        </div>
      </div>
    `;
  }

  private attachEventListeners() {
    // Search input
    const searchInput = this.querySelector("[data-search-input]") as HTMLInputElement;
    if (searchInput) {
      searchInput.addEventListener("input", (e) => {
        this.searchQuery = (e.target as HTMLInputElement).value;
        this.render();
      });
    }

    // Edit buttons
    this.querySelectorAll("[data-user-edit]").forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        const username = (e.currentTarget as HTMLElement).dataset.userEdit!;
        await this.handleEditUser(username);
      });
    });

    // Delete buttons
    this.querySelectorAll("[data-user-delete]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const username = (e.currentTarget as HTMLElement).dataset.userDelete!;
        this.handleDeletePrompt(username);
      });
    });

    // Modal close buttons
    this.querySelectorAll("[data-modal-close]").forEach((btn) => {
      btn.addEventListener("click", () => this.closeModals());
    });

    // Modal overlay click to close
    const overlay = this.querySelector("[data-modal-overlay]");
    if (overlay) {
      overlay.addEventListener("click", (e) => {
        if (e.target === overlay) this.closeModals();
      });
    }

    // Edit form submission
    const editForm = this.querySelector("[data-edit-form]") as HTMLFormElement;
    if (editForm) {
      editForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        await this.handleEditSubmit(editForm);
      });
    }

    // Delete form submission
    const deleteForm = this.querySelector("[data-delete-form]") as HTMLFormElement;
    if (deleteForm) {
      deleteForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        await this.handleDeleteSubmit(deleteForm);
      });
    }
  }

  private handleEditUser(username: string) {
    const user = this.users.find((u) => u.username === username);
    if (!user) return;
    this.editingUser = user;
    this.render();
  }

  private handleDeletePrompt(username: string) {
    const user = this.users.find((u) => u.username === username);
    if (!user) return;
    this.deleteConfirmUser = user;
    this.deleteReason = "";
    this.render();
  }

  private closeModals() {
    this.editingUser = null;
    this.deleteConfirmUser = null;
    this.deleteReason = "";
    this.render();
  }

  private async handleEditSubmit(form: HTMLFormElement) {
    if (!this.editingUser) return;

    const formData = new FormData(form);
    const request: UserUpdateRequest = {
      firstName: formData.get("firstName") as string || undefined,
      lastName: formData.get("lastName") as string || undefined,
      email: formData.get("email") as string,
      age: formData.get("age") ? parseInt(formData.get("age") as string) : undefined,
      profession: formData.get("profession") as string || undefined,
      country: formData.get("country") as string || undefined
    };

    this.busy.set(this.editingUser.username, "edit");
    this.render();

    try {
      const token = getToken() ?? undefined;
      await updateUserByAdmin(this.editingUser.username, request, token);
      this.busy.delete(this.editingUser.username);
      this.editingUser = null;
      await this.loadUsers();
    } catch (err: any) {
      console.error("Failed to update user:", err);
      this.error = err?.message ?? "Failed to update user";
      this.busy.delete(this.editingUser?.username || "");
      this.render();
    }
  }

  private async handleDeleteSubmit(form: HTMLFormElement) {
    if (!this.deleteConfirmUser) return;

    const formData = new FormData(form);
    const reason = formData.get("reason") as string;

    if (!reason || reason.trim().length === 0) {
      this.error = "Deletion reason is required";
      this.render();
      return;
    }

    // Save username before clearing deleteConfirmUser
    const username = this.deleteConfirmUser.username;

    this.busy.set(username, "delete");
    this.render();

    try {
      const token = getToken() ?? undefined;
      await deleteUserByAdmin(username, reason, token);
      window.alert("User deleted successfully!");
      this.deleteConfirmUser = null;
      await this.loadUsers();
    } catch (err: any) {
      console.error("Failed to delete user:", err);
      this.error = err?.message ?? "Failed to delete user";
      this.render();
    } finally {
      this.busy.delete(username);
      this.render();
    }
  }
}

customElements.define("page-users", PageUsers);
