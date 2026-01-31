import { clearAuth, getToken, getUser } from "../core/auth.store";

type StoredUser = {
  firstName?: string;
  lastName?: string;
  username?: string;
  roles?: unknown;
};

type NavItem = {
  label: string;
  route: string;
  /** Routes that also count as "active" for this item */
  matchRoutes?: string[];
};

export class AppNavbar extends HTMLElement {
  private root!: ShadowRoot;

  connectedCallback() {
    this.root = this.shadowRoot ?? this.attachShadow({ mode: "open" });
    this.render();
    window.addEventListener("hashchange", this.onRouteChange);
    window.addEventListener("storage", this.onStorageChange);
  }

  disconnectedCallback() {
    window.removeEventListener("hashchange", this.onRouteChange);
    window.removeEventListener("storage", this.onStorageChange);
  }

  private onRouteChange = () => this.render();
  private onStorageChange = () => this.render();

  /** Call this from outside when auth state changes within the same tab */
  public refresh() {
    this.render();
  }

  private render() {
    const token = getToken();
    if (!token) {
      this.root.innerHTML = "";
      this.style.display = "none";
      return;
    }

    this.style.display = "block";
    const user = getUser<StoredUser | null>();
    const roles = this.resolveRoles(user);
    const items = this.navItems(roles);
    const currentPath = (location.hash.slice(1) || "/").split("?")[0];
    const name = this.resolveName(user);

    this.root.innerHTML = `
      <style>${this.styles()}</style>
      <nav class="navbar">
        <a class="brand" href="#/" aria-label="Home">ML Platform</a>

        <button class="hamburger" type="button" aria-label="Toggle menu" data-toggle-menu>
          <span></span><span></span><span></span>
        </button>

        <div class="nav-links" data-nav-links>
          ${items
            .map((item) => {
              const active = this.isActive(currentPath, item);
              return `<a class="nav-link${active ? " active" : ""}" href="#${item.route}">${item.label}</a>`;
            })
            .join("")}
        </div>

        <div class="nav-end" data-nav-end>
          <div class="profile-dropdown">
            <button class="profile-btn" type="button" data-toggle-profile>
              ${name || "Profile"} &#9662;
            </button>
            <div class="dropdown-menu" data-profile-menu>
              <a class="dropdown-item" href="#/profile/edit">Edit Profile</a>
              <a class="dropdown-item" href="#/profile/change-password">Change Password</a>
              <a class="dropdown-item dropdown-item--danger" href="#/profile/delete">Delete Account</a>
              <div class="dropdown-divider"></div>
              <button class="dropdown-item" type="button" data-action="logout">Logout</button>
            </div>
          </div>
        </div>
      </nav>
    `;

    this.bind();
  }

  private bind() {
    // Hamburger toggle
    const hamburger = this.root.querySelector<HTMLButtonElement>("[data-toggle-menu]");
    const navLinks = this.root.querySelector<HTMLElement>("[data-nav-links]");
    const navEnd = this.root.querySelector<HTMLElement>("[data-nav-end]");

    hamburger?.addEventListener("click", () => {
      navLinks?.classList.toggle("open");
      navEnd?.classList.toggle("open");
      hamburger.classList.toggle("open");
    });

    // Profile dropdown
    const profileToggle = this.root.querySelector<HTMLButtonElement>("[data-toggle-profile]");
    const profileMenu = this.root.querySelector<HTMLElement>("[data-profile-menu]");

    profileToggle?.addEventListener("click", (e) => {
      e.stopPropagation();
      profileMenu?.classList.toggle("show");
    });

    // Close dropdown on outside click
    document.addEventListener("click", () => {
      profileMenu?.classList.remove("show");
    });

    // Close mobile menu on link click
    this.root.querySelectorAll<HTMLAnchorElement>(".nav-link").forEach((link) => {
      link.addEventListener("click", () => {
        navLinks?.classList.remove("open");
        navEnd?.classList.remove("open");
        hamburger?.classList.remove("open");
      });
    });

    // Logout
    const logout = this.root.querySelector<HTMLButtonElement>("[data-action='logout']");
    logout?.addEventListener("click", () => {
      clearAuth();
      window.location.hash = "#/login";
    });
  }

  private isActive(currentPath: string, item: NavItem): boolean {
    if (currentPath === item.route) return true;
    if (item.matchRoutes?.some((r) => currentPath.startsWith(r))) return true;
    return false;
  }

  private navItems(roles: string[]): NavItem[] {
    const items: NavItem[] = [
      { label: "Trainings", route: "/trainings", matchRoutes: ["/trainings", "/train/"] },
      { label: "Models", route: "/models" },
      { label: "Executions", route: "/executions", matchRoutes: ["/executions", "/execute"] },
      { label: "Datasets", route: "/datasets" },
      { label: "Categories", route: "/categories" },
      { label: "Algorithms", route: "/algorithms" },
    ];

    const isAdmin = roles.some((r) => r.toUpperCase() === "ADMIN");
    if (isAdmin) {
      items.push(
        { label: "Users", route: "/admin/users" },
        { label: "Approvals", route: "/admin/categories" },
      );
    }

    return items;
  }

  private resolveName(user: StoredUser | null): string {
    if (!user) return "";
    const parts = [user.firstName, user.lastName].filter(Boolean) as string[];
    if (parts.length) return parts.join(" ");
    return user.username ?? "";
  }

  private resolveRoles(user: StoredUser | null): string[] {
    const raw = user?.roles;
    if (!raw) return [];
    if (Array.isArray(raw)) return raw.map((r) => String(r));
    if (typeof raw === "string") return raw.split(",").map((r) => r.trim()).filter(Boolean);
    if (typeof raw === "object") {
      const values = Object.values(raw as Record<string, unknown>).filter((v) => typeof v === "string");
      if (values.length) return values as string[];
    }
    return [];
  }

  private styles(): string {
    return `
      :host {
        display: block;
        font-family: "Inter", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        position: sticky;
        top: 0;
        z-index: 9999;
      }

      *, *::before, *::after { box-sizing: border-box; }

      .navbar {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        background: rgba(9, 12, 24, 0.95);
        backdrop-filter: blur(12px);
        border-bottom: 1px solid rgba(148, 163, 184, 0.15);
        padding: 0 1.25rem;
        height: 56px;
        color: #f8fafc;
      }

      .brand {
        font-weight: 700;
        font-size: 1.05rem;
        color: #60a5fa;
        text-decoration: none;
        white-space: nowrap;
        margin-right: 1rem;
        flex-shrink: 0;
      }

      .brand:hover { color: #93bbfc; }

      /* ---- Nav links ---- */
      .nav-links {
        display: flex;
        align-items: center;
        gap: 0.15rem;
        flex: 1;
        overflow-x: auto;
        scrollbar-width: none;
      }
      .nav-links::-webkit-scrollbar { display: none; }

      .nav-link {
        padding: 0.45rem 0.85rem;
        border-radius: 8px;
        font-size: 0.875rem;
        font-weight: 500;
        color: rgba(226, 232, 240, 0.82);
        text-decoration: none;
        white-space: nowrap;
        transition: background 0.15s, color 0.15s;
      }

      .nav-link:hover {
        background: rgba(148, 163, 184, 0.12);
        color: #f8fafc;
      }

      .nav-link.active {
        background: rgba(37, 99, 235, 0.22);
        color: #93bbfc;
      }

      /* ---- End (profile) ---- */
      .nav-end {
        display: flex;
        align-items: center;
        margin-left: auto;
        flex-shrink: 0;
      }

      .profile-dropdown { position: relative; }

      .profile-btn {
        font: inherit;
        background: transparent;
        border: 1px solid rgba(148, 163, 184, 0.25);
        color: rgba(226, 232, 240, 0.9);
        border-radius: 999px;
        padding: 0.4rem 1rem;
        cursor: pointer;
        font-size: 0.85rem;
        font-weight: 500;
        white-space: nowrap;
        transition: background 0.15s;
      }

      .profile-btn:hover { background: rgba(148, 163, 184, 0.12); }

      .dropdown-menu {
        display: none;
        position: absolute;
        right: 0;
        top: calc(100% + 0.4rem);
        background: rgba(15, 23, 42, 0.98);
        border: 1px solid rgba(148, 163, 184, 0.2);
        border-radius: 12px;
        box-shadow: 0 12px 32px rgba(0, 0, 0, 0.4);
        min-width: 200px;
        padding: 0.5rem;
        z-index: 100;
      }

      .dropdown-menu.show { display: block; }

      .dropdown-item {
        display: block;
        width: 100%;
        padding: 0.65rem 1rem;
        border: none;
        background: transparent;
        color: #f8fafc;
        text-align: left;
        text-decoration: none;
        cursor: pointer;
        border-radius: 8px;
        font-size: 0.875rem;
        font-weight: 500;
        font-family: inherit;
        transition: background 0.15s;
      }

      .dropdown-item:hover {
        background: rgba(59, 130, 246, 0.15);
        color: #bfdbfe;
      }

      .dropdown-item--danger { color: #fca5a5; }
      .dropdown-item--danger:hover {
        background: rgba(239, 68, 68, 0.15);
        color: #f87171;
      }

      .dropdown-divider {
        height: 1px;
        background: rgba(148, 163, 184, 0.2);
        margin: 0.4rem 0;
      }

      /* ---- Hamburger ---- */
      .hamburger {
        display: none;
        flex-direction: column;
        justify-content: center;
        gap: 5px;
        background: none;
        border: none;
        cursor: pointer;
        padding: 0.4rem;
        margin-left: auto;
      }

      .hamburger span {
        display: block;
        width: 22px;
        height: 2px;
        background: #f8fafc;
        border-radius: 2px;
        transition: transform 0.25s, opacity 0.25s;
      }

      .hamburger.open span:nth-child(1) { transform: translateY(7px) rotate(45deg); }
      .hamburger.open span:nth-child(2) { opacity: 0; }
      .hamburger.open span:nth-child(3) { transform: translateY(-7px) rotate(-45deg); }

      /* ---- Mobile ---- */
      @media (max-width: 768px) {
        .navbar {
          flex-wrap: wrap;
          height: auto;
          min-height: 56px;
          padding: 0.65rem 1rem;
        }

        .hamburger { display: flex; }

        .nav-links,
        .nav-end {
          display: none;
          width: 100%;
          flex-direction: column;
          align-items: stretch;
          gap: 0.25rem;
          padding: 0.5rem 0;
        }

        .nav-links.open,
        .nav-end.open {
          display: flex;
        }

        .nav-link {
          padding: 0.65rem 0.85rem;
        }

        .profile-dropdown { width: 100%; }
        .profile-btn { width: 100%; text-align: left; }
        .dropdown-menu { position: static; width: 100%; margin-top: 0.25rem; }
      }
    `;
  }
}

customElements.define("app-navbar", AppNavbar);
