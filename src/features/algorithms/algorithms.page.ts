import type { AlgorithmWeka } from "./api";
import { fetchAlgorithms } from "./api";
import styles from "./styles/algorithms.css?raw";

declare global {
  interface HTMLElementTagNameMap {
    "page-algorithms": PageAlgorithms;
  }
}

class PageAlgorithms extends HTMLElement {
  private root!: ShadowRoot;
  private algorithms: AlgorithmWeka[] = [];
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
    if (this.loading && this.algorithms.length === 0 && !this.error) {
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

    if (this.algorithms.length === 0) {
      return `
        <section class="panel state empty">
          <h2>No algorithms available yet</h2>
          <p>Upload your first custom algorithm to see it listed here alongside the predefined Weka catalog.</p>
        </section>
      `;
    }

    return `
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
                    <span class="algo-card__label">Algorithm</span>
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

  private async loadAlgorithms(force = false) {
    if (this.loading && !force) {
      return;
    }

    this.loading = true;
    this.error = null;
    this.render();

    try {
      const list = await fetchAlgorithms();
      this.algorithms = list.sort((a, b) => a.name.localeCompare(b.name));
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
