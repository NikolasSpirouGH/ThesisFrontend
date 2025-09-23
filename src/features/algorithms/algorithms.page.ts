import type { AlgorithmWeka, CustomAlgorithm } from "./api";
import { fetchAlgorithms, fetchCustomAlgorithms } from "./api";
import { getToken } from "../../core/auth.store";
import styles from "./styles/algorithms.css?raw";

declare global {
  interface HTMLElementTagNameMap {
    "page-algorithms": PageAlgorithms;
  }
}

class PageAlgorithms extends HTMLElement {
  private root!: ShadowRoot;
  private algorithms: AlgorithmWeka[] = [];
  private customAlgorithms: CustomAlgorithm[] = [];
  private loading = false;
  private error: string | null = null;

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
        ${this.renderContent()}
      </div>
    `;

    this.root.querySelector<HTMLButtonElement>("[data-action='create']")?.addEventListener("click", () => {
      window.location.hash = "#/algorithms/create";
    });

    this.root.querySelectorAll<HTMLButtonElement>("[data-action='refresh']").forEach((button) => {
      button.addEventListener("click", () => {
        if (!this.loading) {
          void this.loadAlgorithms(true);
        }
      });
    });
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

    let content = "";

    // Custom algorithms section
    if (this.customAlgorithms.length > 0) {
      content += `
        <section class="panel">
          <header class="panel__header">
            <h2>Custom algorithms</h2>
            <p>Your own algorithms and public algorithms from other users.</p>
          </header>
          <ul class="algo-list">
            ${this.customAlgorithms
              .map(
                (algorithm) => `
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
                    </div>
                  </li>
                `
              )
              .join("")}
          </ul>
        </section>
      `;
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
}

customElements.define("page-algorithms", PageAlgorithms);
