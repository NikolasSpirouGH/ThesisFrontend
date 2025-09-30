import { getToken } from "../../core/auth.store";
import { UnauthorizedError } from "../../core/http";
import { getExecutions, downloadExecutionResult, deleteExecution } from "./api";
import type { ModelExecutionDTO } from "./api";
import styles from "./styles/executions.css?raw";

type BusyAction = "download" | "delete";

declare global {
  interface HTMLElementTagNameMap {
    "page-executions": PageExecutions;
  }
}

class PageExecutions extends HTMLElement {
  private root!: ShadowRoot;
  private executions: ModelExecutionDTO[] = [];
  private loading = false;
  private error: string | null = null;
  private busy = new Map<number, BusyAction>();

  connectedCallback() {
    this.root = this.shadowRoot ?? this.attachShadow({ mode: "open" });
    this.render();
    void this.loadExecutions();
  }

  private render() {
    this.root.innerHTML = `
      <style>${styles}</style>
      <div class="page">
        <header class="hero">
          <div class="hero__content">
            <h1>Model Executions</h1>
            <p>View and manage your model execution results. Download prediction outputs from both Weka and Custom models.</p>
          </div>
          <div class="hero__actions">
            <button class="btn primary" type="button" data-action="execute">Start Execution</button>
            <button class="btn ghost" type="button" data-action="refresh" ${this.loading ? "disabled" : ""}>${this.loading ? "Refreshing…" : "Refresh"}</button>
          </div>
        </header>
        ${this.renderBody()}
      </div>
    `;

    this.bindEvents();
  }

  private renderBody(): string {
    if (this.loading && this.executions.length === 0 && !this.error) {
      return `
        <section class="panel state">
          <p>Loading executions…</p>
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

    if (this.executions.length === 0) {
      return `
        <section class="panel state empty">
          <h2>No Executions Yet</h2>
          <p>Start by executing a trained model to see results here.</p>
        </section>
      `;
    }

    return `
      <section class="panel">
        <div class="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Model</th>
                <th>Algorithm</th>
                <th>Dataset</th>
                <th>Type</th>
                <th>Status</th>
                <th>Executed</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              ${this.executions.map((item) => this.renderRow(item)).join("")}
            </tbody>
          </table>
        </div>
      </section>
    `;
  }

  private renderRow(execution: ModelExecutionDTO): string {
    const status = (execution.status ?? "").toLowerCase();
    const busyState = this.busy.get(execution.id);
    const isDownloading = busyState === "download";
    const isDeleting = busyState === "delete";
    const canDownload = status === "finished" && execution.hasResultFile;
    const cannotDelete = status === "in_progress";

    return `
      <tr>
        <td>
          <div class="meta">
            <span>${execution.modelName ?? "—"}</span>
          </div>
        </td>
        <td>${execution.algorithmName ?? "—"}</td>
        <td class="dataset">${execution.datasetName ?? "—"}</td>
        <td>
          <span class="model-type">${execution.modelType ?? "—"}</span>
        </td>
        <td>
          <span class="status status--${this.statusModifier(status)}">${this.prettyStatus(execution.status)}</span>
        </td>
        <td>${this.formatDate(execution.executedAt)}</td>
        <td>
          <div class="row-actions">
            <button
              class="btn small ghost"
              type="button"
              data-execution-download="${execution.id}"
              ${isDownloading || !canDownload || this.loading ? "disabled" : ""}
            >${isDownloading ? "Downloading…" : "Download"}</button>
            <button
              class="btn small danger"
              type="button"
              data-execution-delete="${execution.id}"
              ${isDeleting || cannotDelete || this.loading ? "disabled" : ""}
            >${isDeleting ? "Deleting…" : "Delete"}</button>
          </div>
        </td>
      </tr>
    `;
  }

  private bindEvents() {
    this.root.querySelector<HTMLButtonElement>("[data-action='execute']")?.addEventListener("click", () => {
      window.location.hash = "#/execute";
    });

    this.root.querySelectorAll<HTMLButtonElement>("[data-action='refresh']").forEach((btn) => {
      btn.addEventListener("click", () => {
        void this.loadExecutions(true);
      });
    });

    this.root.querySelectorAll<HTMLButtonElement>("[data-execution-download]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const value = btn.dataset.executionDownload;
        const id = value ? Number.parseInt(value, 10) : NaN;
        if (!Number.isFinite(id)) {
          return;
        }
        void this.handleDownload(id);
      });
    });

    this.root.querySelectorAll<HTMLButtonElement>("[data-execution-delete]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const value = btn.dataset.executionDelete;
        const id = value ? Number.parseInt(value, 10) : NaN;
        if (!Number.isFinite(id)) {
          return;
        }
        void this.handleDelete(id);
      });
    });
  }

  private async loadExecutions(force = false) {
    if (this.loading && !force) {
      return;
    }
    this.loading = true;
    this.error = null;
    this.render();

    try {
      const token = getToken() ?? undefined;
      if (!token) {
        throw new UnauthorizedError();
      }
      const response = await getExecutions(token);
      this.executions = (response.dataHeader || []).sort((a, b) =>
        this.dateValue(b.executedAt) - this.dateValue(a.executedAt)
      );
    } catch (err) {
      if (err instanceof UnauthorizedError) {
        return;
      }
      const message = err instanceof Error ? err.message : "Failed to load executions";
      this.error = message;
    } finally {
      this.loading = false;
      this.render();
    }
  }

  private async handleDownload(id: number) {
    this.busy.set(id, "download");
    this.render();

    try {
      const token = getToken();
      if (!token) {
        throw new UnauthorizedError();
      }

      const blob = await downloadExecutionResult(id, token);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `execution-${id}-results.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(url), 0);
    } catch (err) {
      if (err instanceof UnauthorizedError) {
        return;
      }
      const message = err instanceof Error ? err.message : "Failed to download results";
      window.alert(message);
    } finally {
      this.busy.delete(id);
      this.render();
    }
  }

  private async handleDelete(id: number) {
    if (!window.confirm("Delete this execution? The prediction result will be removed.")) {
      return;
    }

    this.busy.set(id, "delete");
    this.render();

    try {
      const token = getToken() ?? undefined;
      await deleteExecution(id, token);
      this.executions = this.executions.filter((item) => item.id !== id);
      window.alert("Execution deleted");
    } catch (err) {
      if (err instanceof UnauthorizedError) {
        return;
      }
      const message = err instanceof Error ? err.message : "Failed to delete execution";
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
      case "finished":
        return "completed";
      case "failed":
        return "failed";
      case "in_progress":
        return "running";
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

customElements.define("page-executions", PageExecutions);
