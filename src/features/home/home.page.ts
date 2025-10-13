import styles from "./styles/home.css?raw";
import { clearAuth, getToken, getUser } from "../../core/auth.store";

type StoredUser = {
  firstName?: string;
  lastName?: string;
  username?: string;
  roles?: unknown;
  status?: string;
};

type Scope = "admin" | "manager" | "user";

type CardSpec = {
  title: string;
  description: string;
  route?: string;
  featureKey?: string;
};

export class PageHome extends HTMLElement {
  private root!: ShadowRoot;

  connectedCallback() {
    this.root = this.shadowRoot ?? this.attachShadow({ mode: "open" });
    this.render();
  }

  private render() {
    const token = getToken();
    const user = getUser<StoredUser | null>();

    if (token) {
      this.mount(this.dashboardView(user));
      this.bindDashboard();
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
    const cards = this.cardsForScope(scope);
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
            <div class="hero__actions">
              <button class="btn ghost" type="button" data-route="/profile/edit">Edit Profile</button>
              <button class="btn ghost" type="button" data-route="/profile/change-password">Change Password</button>
              <button class="btn ghost" type="button" data-action="logout">Logout</button>
            </div>
            <div class="hero__danger">
              <button class="btn ghost danger" type="button" data-route="/profile/delete">Delete Account</button>
            </div>
          </div>
        </header>

        <section class="grid">
          ${cards.map((card) => this.cardTemplate(card)).join("")}
        </section>
      </div>
    `;
  }

  private cardTemplate({ title, description, route, featureKey }: CardSpec) {
    const attr = route ? `data-route="${route}"` : `data-soon="${featureKey ?? title}"`;
    const label = route ? "Open" : "Coming soon";

    return `
      <article class="card">
        <h2>${title}</h2>
        <p>${description}</p>
        <div class="card__actions">
          <button class="btn secondary" type="button" ${attr}>${label}</button>
        </div>
      </article>
    `;
  }

  private bindGuest() {
    this.root.querySelectorAll<HTMLButtonElement>("[data-route]").forEach((btn) => {
      const route = btn.dataset.route;
      if (!route) return;
      btn.addEventListener("click", () => this.go(route));
    });
  }

  private bindDashboard() {
    this.root.querySelectorAll<HTMLElement>("[data-route]").forEach((el) => {
      const route = el.dataset.route;
      if (!route) return;
      el.addEventListener("click", () => this.go(route));
    });

    this.root.querySelectorAll<HTMLElement>("[data-soon]").forEach((el) => {
      const feature = el.dataset.soon ?? "This feature";
      el.addEventListener("click", () => this.notifySoon(feature));
    });

    const logout = this.root.querySelector<HTMLButtonElement>("[data-action='logout']");
    logout?.addEventListener("click", () => this.logout());
  }

  private notifySoon(feature: string) {
    const pretty = feature.charAt(0).toUpperCase() + feature.slice(1);
    window.alert(`${pretty} is coming soon.`);
  }

  private logout() {
    clearAuth();
    this.go("/login");
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

  private cardsForScope(scope: Scope): CardSpec[] {
    const base: CardSpec[] = [
      { title: "Trainings", description: "Monitor active runs and review past experiments.", route: "/trainings" },
      { title: "Models", description: "Browse trained models and prepare deployments.", route: "/models" },
      { title: "Executions", description: "Inspect model execution history and runtime metrics.", route: "/executions" },
      { title: "Datasets", description: "Upload, manage and organize your training datasets.", route: "/datasets" },
      { title: "Categories", description: "Organize models and datasets with hierarchical taxonomy.", route: "/categories" },
      { title: "Algorithms", description: "Manage predefined and custom training algorithms.", route: "/algorithms" },
    ];

    if (scope === "admin") {
      return [
        ...base,
        { title: "User Management", description: "View, manage, and moderate all registered users.", route: "/admin/users" },
        { title: "Category Approval", description: "Review and approve category proposals from users.", route: "/admin/categories" },
      ];
    }

    if (scope === "manager") {
      return [
        ...base,
        { title: "Team activity", description: "See what your team is training and when results arrive.", featureKey: "team activity" },
        { title: "Approvals", description: "Review dataset and model requests from collaborators.", featureKey: "approvals" },
      ];
    }

    return base;
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
