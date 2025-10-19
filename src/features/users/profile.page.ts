import { getToken, getUser } from "../../core/auth.store";
import {
  fetchUserByUsername,
  updateUser,
  type UserDTO,
  type UserUpdateRequest
} from "./api";

export class PageProfile extends HTMLElement {
  private user: UserDTO | null = null;
  private loading = false;
  private error: string | null = null;
  private success: string | null = null;
  private editing = false;

  async connectedCallback() {
    this.render();
    await this.loadUserProfile();
  }

  private async loadUserProfile() {
    this.loading = true;
    this.error = null;
    this.render();

    try {
      const token = getToken() ?? undefined;
      const currentUser = getUser<{ username: string }>();

      if (!currentUser?.username) {
        throw new Error("Not logged in");
      }

      this.user = await fetchUserByUsername(currentUser.username, token);
      this.error = null;
    } catch (err: any) {
      console.error("Failed to load profile:", err);
      this.error = err?.message ?? "Failed to load your profile";
    } finally {
      this.loading = false;
      this.render();
    }
  }

  private render() {
    this.innerHTML = `
      <div class="page-profile">
        <header class="page-header">
          <h1>My Profile</h1>
          <p>Manage your account information</p>
        </header>

        ${this.error ? `<div class="alert alert-error">${this.error}</div>` : ""}
        ${this.success ? `<div class="alert alert-success">${this.success}</div>` : ""}

        ${this.renderBody()}
      </div>
    `;

    this.attachEventListeners();
  }

  private renderBody(): string {
    if (this.loading) {
      return `<div class="loading-state">Loading your profile...</div>`;
    }

    if (!this.user) {
      return `
        <section class="panel state empty">
          <h2>Profile Not Found</h2>
          <p>Unable to load your profile information.</p>
        </section>
      `;
    }

    if (this.editing) {
      return this.renderEditForm();
    }

    return this.renderViewMode();
  }

  private renderViewMode(): string {
    if (!this.user) return "";

    const fullName = [this.user.firstName, this.user.lastName].filter(Boolean).join(" ") || "Not provided";
    const roles = this.user.roles?.join(", ") || "User";

    return `
      <section class="panel profile-card">
        <div class="profile-header">
          <div class="profile-avatar">
            <div class="avatar-placeholder">${this.user.username.charAt(0).toUpperCase()}</div>
          </div>
          <div class="profile-info">
            <h2>${this.user.username}</h2>
            <span class="badge">${roles}</span>
          </div>
        </div>

        <div class="profile-details">
          <div class="detail-row">
            <span class="detail-label">Full Name</span>
            <span class="detail-value">${fullName}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Email</span>
            <span class="detail-value">${this.user.email || "Not provided"}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Age</span>
            <span class="detail-value">${this.user.age || "Not provided"}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Profession</span>
            <span class="detail-value">${this.user.profession || "Not provided"}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Country</span>
            <span class="detail-value">${this.user.country || "Not provided"}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Status</span>
            <span class="detail-value">
              <span class="status status--${(this.user.status || "active").toLowerCase()}">${this.user.status || "Active"}</span>
            </span>
          </div>
        </div>

        <div class="profile-actions">
          <button class="btn primary" data-edit-profile>Edit Profile</button>
        </div>
      </section>
    `;
  }

  private renderEditForm(): string {
    if (!this.user) return "";

    return `
      <section class="panel">
        <form class="edit-form" data-profile-form>
          <h3>Edit Profile Information</h3>
          <p class="form-description">Update your personal information below.</p>

          <div class="form-group">
            <label>First Name</label>
            <input type="text" name="firstName" value="${this.user.firstName || ""}" placeholder="Enter your first name" />
          </div>

          <div class="form-group">
            <label>Last Name</label>
            <input type="text" name="lastName" value="${this.user.lastName || ""}" placeholder="Enter your last name" />
          </div>

          <div class="form-group">
            <label>Email <span class="required">*</span></label>
            <input type="email" name="email" value="${this.user.email || ""}" required placeholder="your.email@example.com" />
          </div>

          <div class="form-group">
            <label>Age</label>
            <input type="number" name="age" value="${this.user.age || ""}" min="1" max="150" placeholder="Enter your age" />
          </div>

          <div class="form-group">
            <label>Profession</label>
            <input type="text" name="profession" value="${this.user.profession || ""}" placeholder="e.g., Software Engineer" />
          </div>

          <div class="form-group">
            <label>Country</label>
            <input type="text" name="country" value="${this.user.country || ""}" placeholder="e.g., Greece" />
          </div>

          <div class="form-actions">
            <button type="button" class="btn secondary" data-cancel-edit>Cancel</button>
            <button type="submit" class="btn primary">Save Changes</button>
          </div>
        </form>
      </section>
    `;
  }

  private attachEventListeners() {
    // Edit button
    const editBtn = this.querySelector("[data-edit-profile]");
    if (editBtn) {
      editBtn.addEventListener("click", () => {
        this.editing = true;
        this.success = null;
        this.error = null;
        this.render();
      });
    }

    // Cancel edit button
    const cancelBtn = this.querySelector("[data-cancel-edit]");
    if (cancelBtn) {
      cancelBtn.addEventListener("click", () => {
        this.editing = false;
        this.error = null;
        this.render();
      });
    }

    // Form submission
    const form = this.querySelector("[data-profile-form]") as HTMLFormElement;
    if (form) {
      form.addEventListener("submit", async (e) => {
        e.preventDefault();
        await this.handleSubmit(form);
      });
    }
  }

  private async handleSubmit(form: HTMLFormElement) {
    const formData = new FormData(form);
    const request: UserUpdateRequest = {
      firstName: formData.get("firstName") as string || undefined,
      lastName: formData.get("lastName") as string || undefined,
      email: formData.get("email") as string,
      age: formData.get("age") ? parseInt(formData.get("age") as string) : undefined,
      profession: formData.get("profession") as string || undefined,
      country: formData.get("country") as string || undefined
    };

    this.loading = true;
    this.error = null;
    this.success = null;
    this.render();

    try {
      const token = getToken() ?? undefined;
      this.user = await updateUser(request, token);
      this.editing = false;
      this.success = "Profile updated successfully!";

      // Update user in localStorage
      const currentUser = getUser();
      if (currentUser && typeof currentUser === "object") {
        const updatedUser = { ...currentUser, ...this.user };
        localStorage.setItem("user", JSON.stringify(updatedUser));
      }
    } catch (err: any) {
      console.error("Failed to update profile:", err);
      this.error = err?.message ?? "Failed to update your profile";
    } finally {
      this.loading = false;
      this.render();
    }
  }
}

customElements.define("page-profile", PageProfile);
