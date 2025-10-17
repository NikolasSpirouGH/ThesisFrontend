import { getToken } from "../../core/auth.store";
import { UnauthorizedError } from "../../core/http";
import { deleteTraining, downloadTrainingModel, fetchTrainings, fetchUsedAlgorithms } from "./api";
import type { TrainingItem, TrainingSearchParams } from "./api";
import styles from "./styles/trainings.css?raw";

type BusyAction = "delete" | "download";

declare global {
  interface HTMLElementTagNameMap {
    "page-trainings": PageTrainings;
  }
}

type AlgorithmOption = {
  id: number;
  name: string;
  type: "predefined" | "custom";
};

class PageTrainings extends HTMLElement {
  private root!: ShadowRoot;
  private trainings: TrainingItem[] = [];
  private algorithms: AlgorithmOption[] = [];
  private loading = false;
  private error: string | null = null;
  private busy = new Map<number, BusyAction>();
  private showLauncher = false;
  private showSearchPanel = false;
  private searchParams: TrainingSearchParams = {};

  connectedCallback() {
    this.root = this.shadowRoot ?? this.attachShadow({ mode: "open" });
    this.render();
    void this.loadAlgorithms();
    void this.loadTrainings();
  }

  private render() {
    this.root.innerHTML = `
      <style>${styles}</style>
      <div class="page">
        <header class="hero">
          <div class="hero__content">
            <h1>Trainings</h1>
            <p>View the status of your training runs, start new jobs, and download completed models.</p>
          </div>
          <div class="hero__actions">
            <button class="btn ghost" type="button" data-action="toggle-search">${this.showSearchPanel ? "Hide Search" : "Show Search"}</button>
            <button class="btn primary" type="button" data-action="start">Start training</button>
            <button class="btn ghost" type="button" data-action="refresh" ${this.loading ? "disabled" : ""}>${this.loading ? "Refreshing…" : "Refresh"}</button>
          </div>
        </header>
        ${this.renderSearchPanel()}
        ${this.renderLauncher()}
        ${this.renderBody()}
      </div>
    `;

    this.bindEvents();
  }

  private renderLauncher(): string {
    if (!this.showLauncher) {
      return "";
    }

    return `
      <div class="launcher" role="dialog" aria-modal="true">
        <div class="launcher__overlay" data-action="close-launcher"></div>
        <section class="launcher__panel">
          <header>
            <p class="eyebrow">Choose a workflow</p>
            <h2>Launch a training</h2>
            <p class="intro">Pick the flow that fits your experiment. You can always configure the details on the next screen.</p>
          </header>
          <div class="launcher__grid">
            <article class="launcher__card">
              <h3>Train</h3>
              <p>Use the predefined Weka algorithms to kick off a standard training run.</p>
              <button class="btn ghost" type="button" data-launch-route="/train/weka">Open Weka flow</button>
            </article>
            <article class="launcher__card">
              <h3>Custom train</h3>
              <p>Bring your own algorithm image, parameters, and dataset to execute a bespoke pipeline.</p>
              <button class="btn ghost" type="button" data-launch-route="/train/custom">Configure custom run</button>
            </article>
            <article class="launcher__card">
              <h3>Retrain</h3>
              <p>Start from an existing model, adjust inputs, and launch a retraining session.</p>
              <button class="btn ghost" type="button" data-launch-route="/train/retrain">Select a model</button>
            </article>
          </div>
          <button class="btn small ghost" type="button" data-action="close-launcher">Cancel</button>
        </section>
      </div>
    `;
  }

  private renderSearchPanel(): string {
    if (!this.showSearchPanel) {
      return "";
    }

    // Group algorithms by type for better UX
    const predefined = this.algorithms.filter((a) => a.type === "predefined");
    const custom = this.algorithms.filter((a) => a.type === "custom");

    // Create a compound value to track both selected algorithm and its type
    const selectedValue = this.searchParams.algorithmId && this.searchParams.type
      ? `${this.searchParams.type}:${this.searchParams.algorithmId}`
      : "";

    return `
      <section class="panel">
        <h2>Search Trainings</h2>
        <div class="form-group">
          <label for="search-fromDate">From Date</label>
          <input
            type="date"
            id="search-fromDate"
            name="fromDate"
            value="${this.searchParams.fromDate || ""}"
          />
        </div>
        <div class="form-group">
          <label for="search-algorithm">Algorithm</label>
          <select id="search-algorithm" name="algorithmId">
            <option value="">All Algorithms</option>
            ${predefined.length > 0 ? `<optgroup label="Predefined Algorithms">
              ${predefined.map((alg) => {
                const value = `PREDEFINED:${alg.id}`;
                return `<option value="${value}" ${selectedValue === value ? "selected" : ""}>${alg.name}</option>`;
              }).join("")}
            </optgroup>` : ""}
            ${custom.length > 0 ? `<optgroup label="Custom Algorithms">
              ${custom.map((alg) => {
                const value = `CUSTOM:${alg.id}`;
                return `<option value="${value}" ${selectedValue === value ? "selected" : ""}>${alg.name}</option>`;
              }).join("")}
            </optgroup>` : ""}
          </select>
        </div>
        <div class="form-group" style="display: flex; gap: 0.5rem;">
          <button class="btn primary" type="button" data-action="execute-search">Search</button>
          <button class="btn ghost" type="button" data-action="clear-search">Clear</button>
        </div>
      </section>
    `;
  }

  private renderBody(): string {
    if (this.loading && this.trainings.length === 0 && !this.error) {
      return `
        <section class="panel state">
          <p>Loading trainings…</p>
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

    if (this.trainings.length === 0) {
      return `
        <section class="panel state empty">
          <h2>No trainings yet</h2>
          <p>Kick off your first experiment to see it appear in this list.</p>
        </section>
      `;
    }

    return `
      <section class="panel">
        <div class="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Algorithm</th>
                <th>Dataset</th>
                <th>Status</th>
                <th>Started</th>
                <th>Finished</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              ${this.trainings.map((item) => this.renderRow(item)).join("")}
            </tbody>
          </table>
        </div>
      </section>
    `;
  }

  private renderRow(training: TrainingItem): string {
    const status = (training.status ?? "").toLowerCase();
    const busyState = this.busy.get(training.trainingId);
    const isDeleting = busyState === "delete";
    const isDownloading = busyState === "download";
    const cannotDelete = status === "running" || status === "requested";
    const canDownload = status === "completed";
    const canViewResults = status === "completed" && training.modelId;

    return `
      <tr>
        <td>
          <div class="meta">
            <span>${training.algorithmName ?? "—"}</span>
            <span>${training.modelType ?? ""}</span>
          </div>
        </td>
        <td class="dataset">${training.datasetName ?? "—"}</td>
        <td>
          <span class="status status--${this.statusModifier(status)}">${this.prettyStatus(training.status)}</span>
        </td>
        <td>${this.formatDate(training.startedDate)}</td>
        <td>${this.formatDate(training.finishedDate)}</td>
        <td>
          <div class="row-actions">
            ${canViewResults ? `
              <button
                class="btn small primary"
                type="button"
                data-view-results="${training.modelId}"
                ${this.loading ? "disabled" : ""}
              >View Results</button>
            ` : ''}
            <button
              class="btn small ghost"
              type="button"
              data-training-download="${training.trainingId}"
              ${isDownloading || !canDownload || this.loading ? "disabled" : ""}
            >${isDownloading ? "Downloading…" : "Download"}</button>
            <button
              class="btn small danger"
              type="button"
              data-training-delete="${training.trainingId}"
              ${isDeleting || cannotDelete || this.loading ? "disabled" : ""}
            >${isDeleting ? "Deleting…" : "Delete"}</button>
          </div>
        </td>
      </tr>
    `;
  }

  private bindEvents() {
    this.root.querySelector<HTMLButtonElement>("[data-action='start']")?.addEventListener("click", () => {
      this.showLauncher = true;
      this.render();
    });

    this.root.querySelectorAll<HTMLButtonElement>("[data-action='refresh']").forEach((btn) => {
      btn.addEventListener("click", () => {
        void this.loadTrainings(true);
      });
    });

    this.root.querySelectorAll<HTMLElement>("[data-action='close-launcher']").forEach((el) => {
      el.addEventListener("click", () => {
        this.showLauncher = false;
        this.render();
      });
    });

    this.root.querySelectorAll<HTMLButtonElement>("[data-launch-route]").forEach((btn) => {
      const route = btn.dataset.launchRoute;
      if (!route) return;
      btn.addEventListener("click", () => {
        this.showLauncher = false;
        this.render();
        const hash = route.startsWith("#") ? route : `#${route.startsWith("/") ? route : `/${route}`}`;
        window.location.hash = hash;
      });
    });

    this.root.querySelectorAll<HTMLButtonElement>("[data-training-delete]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const value = btn.dataset.trainingDelete;
        const id = value ? Number.parseInt(value, 10) : NaN;
        if (!Number.isFinite(id)) {
          return;
        }
        void this.handleDelete(id);
      });
    });

    this.root.querySelectorAll<HTMLButtonElement>("[data-training-download]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const value = btn.dataset.trainingDownload;
        const id = value ? Number.parseInt(value, 10) : NaN;
        if (!Number.isFinite(id)) {
          return;
        }
        void this.handleDownload(id);
      });
    });

    this.root.querySelectorAll<HTMLButtonElement>("[data-view-results]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const value = btn.dataset.viewResults;
        const modelId = value ? Number.parseInt(value, 10) : NaN;
        if (!Number.isFinite(modelId)) {
          return;
        }
        window.location.hash = `#/results/${modelId}`;
      });
    });

    // Search toggle
    this.root.querySelector<HTMLButtonElement>("[data-action='toggle-search']")?.addEventListener("click", () => {
      this.showSearchPanel = !this.showSearchPanel;
      this.render();
    });

    // Search input bindings
    this.root.querySelector<HTMLInputElement>("#search-fromDate")?.addEventListener("input", (e) => {
      this.searchParams.fromDate = (e.target as HTMLInputElement).value;
    });

    this.root.querySelector<HTMLSelectElement>("#search-algorithm")?.addEventListener("change", (e) => {
      const value = (e.target as HTMLSelectElement).value;
      if (value) {
        // Value format: "PREDEFINED:1" or "CUSTOM:5"
        const [type, idStr] = value.split(":");
        this.searchParams.algorithmId = Number.parseInt(idStr, 10);
        this.searchParams.type = type as "CUSTOM" | "PREDEFINED";
      } else {
        this.searchParams.algorithmId = undefined;
        this.searchParams.type = undefined;
      }
    });

    // Execute search
    this.root.querySelector<HTMLButtonElement>("[data-action='execute-search']")?.addEventListener("click", () => {
      void this.loadTrainings(true);
    });

    // Clear search
    this.root.querySelector<HTMLButtonElement>("[data-action='clear-search']")?.addEventListener("click", () => {
      this.searchParams = {};
      void this.loadTrainings(true);
      this.render();
    });
  }

  private async loadAlgorithms() {
    try {
      const token = getToken() ?? undefined;
      const usedAlgorithms = await fetchUsedAlgorithms(token);

      this.algorithms = [
        ...usedAlgorithms.predefined.map((alg) => ({ id: alg.id, name: alg.name, type: "predefined" as const })),
        ...usedAlgorithms.custom.map((alg) => ({ id: alg.id, name: alg.name, type: "custom" as const }))
      ];
    } catch (err) {
      console.error("Failed to load algorithms:", err);
    }
  }

  private async loadTrainings(force = false) {
    if (this.loading && !force) {
      return;
    }
    this.loading = true;
    this.error = null;
    this.render();

    try {
      const token = getToken() ?? undefined;
      const items = await fetchTrainings(token, this.searchParams);
      this.trainings = [...items].sort((a, b) => this.dateValue(b.startedDate) - this.dateValue(a.startedDate));
    } catch (err) {
      if (err instanceof UnauthorizedError) {
        return;
      }
      const message = err instanceof Error ? err.message : "Failed to load trainings";
      this.error = message;
    } finally {
      this.loading = false;
      this.render();
    }
  }

  private async handleDelete(id: number) {
    if (!window.confirm("Delete this training? Completed models will be removed.")) {
      return;
    }

    this.busy.set(id, "delete");
    this.render();

    try {
      const token = getToken() ?? undefined;
      await deleteTraining(id, token);
      this.trainings = this.trainings.filter((item) => item.trainingId !== id);
      window.alert("Training deleted");
    } catch (err) {
      if (err instanceof UnauthorizedError) {
        return;
      }
      const message = err instanceof Error ? err.message : "Failed to delete training";
      window.alert(message);
    } finally {
      this.busy.delete(id);
      this.render();
    }
  }

  private async handleDownload(id: number) {
    this.busy.set(id, "download");
    this.render();

    try {
      const token = getToken() ?? undefined;
      const { blob, filename } = await downloadTrainingModel(id, token);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(url), 0);
    } catch (err) {
      if (err instanceof UnauthorizedError) {
        return;
      }
      const message = err instanceof Error ? err.message : "Failed to download model";
      window.alert(message);
    } finally {
      this.busy.delete(id);
      this.render();
    }
  }

  private dateValue(value: string | null): number {
    if (!value) {
      return 0;
    }
    const timestamp = Date.parse(value);
    return Number.isNaN(timestamp) ? 0 : timestamp;
  }

  private formatDate(value: string | null): string {
    if (!value) {
      return "—";
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return "—";
    }
    try {
      return new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeStyle: "short"
      }).format(date);
    } catch {
      return date.toLocaleString();
    }
  }

  private statusModifier(status: string): string {
    switch (status) {
      case "completed":
        return "completed";
      case "failed":
        return "failed";
      case "running":
      case "requested":
        return "running";
      case "stopped":
      case "cancelled":
        return "stopped";
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

customElements.define("page-trainings", PageTrainings);
