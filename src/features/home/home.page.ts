import styles from "./styles/home.css?raw";
import { getToken, getUser } from "../../core/auth.store";

type StoredUser = {
  firstName?: string;
  lastName?: string;
  username?: string;
  roles?: unknown;
  status?: string;
};

type Scope = "admin" | "manager" | "user";

export class PageHome extends HTMLElement {
  private root!: ShadowRoot;

  connectedCallback() {
    this.root = this.shadowRoot ?? this.attachShadow({ mode: "open" });
    this.render();

    // Re-render when navigating back to this page to show updated user data
    window.addEventListener('hashchange', this.handleHashChange);
  }

  disconnectedCallback() {
    window.removeEventListener('hashchange', this.handleHashChange);
  }

  private handleHashChange = () => {
    // Re-render only if we're on the home page
    if (window.location.hash === '#/' || window.location.hash === '') {
      this.render();
    }
  }

  private render() {
    const token = getToken();
    const user = getUser<StoredUser | null>();

    if (token) {
      this.mount(this.dashboardView(user));
    } else {
      this.mount(this.guestView());
      this.bindGuest();
    }
  }

  private mount(content: string) {
    this.root.innerHTML = `<style>${styles}</style>${content}`;
  }

  private guestView(): string {
    return `
      <div class="guest" style="--home-bg-image: url('/assets/background-home.png')">
        <div class="overlay">
          <h1 class="title">Manage ML models</h1>
          <p class="subtitle">Sign in to explore trainings, models, executions and more.</p>
          <div class="buttons">
            <button class="btn login" type="button" data-route="/login">Login</button>
            <button class="btn register" type="button" data-route="/register">Register</button>
          </div>
        </div>
      </div>
    `;
  }

  private dashboardView(user: StoredUser | null): string {
    const name = this.resolveName(user);
    const status = (user?.status ?? "").toString();
    const roles = this.resolveRoles(user);
    const roleLabel = roles.join(", ") || "USER";
    const scope = this.resolveScope(roles);
    const { eyebrow, lead } = this.scopeCopy(scope);
    const headline = this.scopeHeadline(scope, name);

    return `
      <div class="dashboard" style="--home-bg-image: url('/assets/background-home.png')">
        <header class="hero">
          <div class="hero__text">
            <p class="hero__eyebrow">${eyebrow}</p>
            <h1>${headline}</h1>
            <p class="hero__lead">${lead}</p>
            <div class="hero__meta">
              <span class="chip">${status || "ACTIVE"}</span>
              <span class="chip chip--muted">${roleLabel}</span>
            </div>
          </div>
        </header>
      </div>
    `;
  }

  private bindGuest() {
    this.root.querySelectorAll<HTMLButtonElement>("[data-route]").forEach((btn) => {
      const route = btn.dataset.route;
      if (!route) return;
      btn.addEventListener("click", () => this.go(route));
    });
  }

  private go(route: string) {
    const trimmed = route.trim();
    if (!trimmed) return;
    const hash = trimmed.startsWith("#")
      ? trimmed
      : `#${trimmed.startsWith("/") ? trimmed : `/${trimmed}`}`;
    window.location.hash = hash;
  }

  private resolveName(user: StoredUser | null): string {
    if (!user) return "";
    const parts = [user.firstName, user.lastName].filter(Boolean) as string[];
    if (parts.length) {
      return parts.join(" ");
    }
    return user.username ?? "";
  }

  private resolveRoles(user: StoredUser | null): string[] {
    const raw = user?.roles;
    if (!raw) return [];
    if (Array.isArray(raw)) {
      return raw.map((role) => String(role));
    }
    if (typeof raw === "string") {
      return raw
        .split(",")
        .map((role) => role.trim())
        .filter(Boolean);
    }
    if (typeof raw === "object") {
      const values = Object.values(raw as Record<string, unknown>).filter((value) => typeof value === "string");
      if (values.length) {
        return values as string[];
      }
    }
    return [];
  }

  private resolveScope(roles: string[]): Scope {
    if (roles.some((role) => role.toUpperCase() === "ADMIN")) {
      return "admin";
    }

    const managerRoles = new Set([
      "GROUP_LEADER",
      "GROUP_MEMBER",
      "DATASET_MANAGER",
      "ALGORITHM_MANAGER",
      "CATEGORY_MANAGER",
      "TRAINING_MODEL_MANAGER",
    ]);

    if (roles.some((role) => managerRoles.has(role.toUpperCase()))) {
      return "manager";
    }

    return "user";
  }

  private scopeCopy(scope: Scope): { eyebrow: string; lead: string } {
    switch (scope) {
      case "admin":
        return {
          eyebrow: "Admin workspace",
          lead: "Oversee the entire ML platform, manage access and keep the system running smoothly.",
        };
      case "manager":
        return {
          eyebrow: "Team workspace",
          lead: "Coordinate datasets, trainings and reviews so your team ships better models together.",
        };
      default:
        return {
          eyebrow: "Welcome back",
          lead: "Manage your machine learning workspace, keep track of experiments and organise your assets.",
        };
    }
  }

  private scopeHeadline(scope: Scope, name: string): string {
    if (scope === "admin") {
      return name ? `Platform control, ${name}` : "Platform control center";
    }
    if (scope === "manager") {
      return name ? `Ready to lead, ${name}?` : "Lead your workspace";
    }
    return name ? `Hi, ${name}!` : "Ready to build?";
  }
}

customElements.define("page-home", PageHome);
