import { getToken } from "../../core/auth.store";
import { UnauthorizedError } from "../../core/http";
import { getModels, startExecution } from "./api";
import type { RetrainModelOptionDTO } from "./api";
import { getTaskStatus, stopTask } from "../tasks/api";
import styles from "./styles/execution.css?raw";

type StatusTone = "info" | "success" | "error" | "warning";

type ComponentState = {
  models: RetrainModelOptionDTO[];
  modelsLoading: boolean;
  modelsError: string | null;
  selectedModelId: string;
  submitting: boolean;
  taskId: string | null;
  taskStatus: string | null;
  statusMessage: string | null;
  statusTone: StatusTone | null;
};

type Refs = {
  form: HTMLFormElement;
  datasetInput: HTMLInputElement;
  dropzone: HTMLElement;
  chooseFileBtn: HTMLButtonElement;
  clearFileBtn: HTMLButtonElement;
  fileName: HTMLElement;
  modelSelect: HTMLSelectElement;
  submitButton: HTMLButtonElement;
  resetButton: HTMLButtonElement;
  stopButton: HTMLButtonElement;
  statusBanner: HTMLElement;
};

type TaskStatusDTO = {
  status: string;
  errorMessage?: string | null;
  [key: string]: unknown;
};

export class PageExecution extends HTMLElement {
  private root!: ShadowRoot;
  private refs!: Refs;
  private state: ComponentState = {
    models: [],
    modelsLoading: true,
    modelsError: null,
    selectedModelId: "",
    submitting: false,
    taskId: null,
    taskStatus: null,
    statusMessage: null,
    statusTone: null
  };
  private selectedFile: File | null = null;
  private pollTimer: number | null = null;

  connectedCallback() {
    this.root = this.shadowRoot ?? this.attachShadow({ mode: "open" });
    this.render();
    void this.loadModels();
  }

  disconnectedCallback() {
    this.stopPolling();
  }

  private render() {
    if (this.root.childNodes.length) {
      return;
    }

    this.root.innerHTML = `
      <style>${styles}</style>
      <div class="page">
        <header class="hero">
          <div class="hero__content">
            <p class="hero__eyebrow">Execution</p>
            <h1>Execute a Trained Model</h1>
            <p class="hero__lead">
              Upload a dataset and execute predictions using your trained models.
              Works with both Weka algorithms and Custom Docker-based models.
              Monitor the execution progress and download results once completed.
            </p>
          </div>
          <ul class="hero__list">
            <li>Select from your trained models (Weka & Custom)</li>
            <li>Accepts CSV or ARFF prediction datasets</li>
            <li>Download prediction results as CSV</li>
          </ul>
        </header>

        <section class="panel">
          <form class="form" novalidate>
            <div class="status-banner" data-status hidden></div>

            <fieldset class="group">
              <legend>Model Selection</legend>
              <label class="field">
                <span>Trained Model</span>
                <select id="model" required>
                  <option value="" disabled selected>Loading models…</option>
                </select>
              </label>
            </fieldset>

            <fieldset class="group">
              <legend>Prediction Dataset</legend>
              <div class="dropzone" data-dropzone>
                <p class="dropzone__title" data-file-name>No file selected</p>
                <p class="dropzone__hint">Drag &amp; drop a <code>.csv</code> or <code>.arff</code> file, or</p>
                <button class="btn ghost" type="button" data-action="choose-file">Select file</button>
              </div>
              <input type="file" id="dataset" accept=".csv,.CSV,.arff,.ARFF" hidden />
              <div class="group__actions">
                <button class="btn ghost small" type="button" data-action="clear-file" disabled>Remove file</button>
              </div>
            </fieldset>

            <div class="form__actions">
              <button class="btn primary" type="submit" disabled>Start execution</button>
              <button class="btn danger" type="button" data-action="stop" style="display: none;">Stop execution</button>
              <button class="btn ghost" type="button" data-action="reset">Reset</button>
            </div>
          </form>
        </section>
      </div>
    `;

    this.collectRefs();
    this.bind();
    this.updateSubmitState();
    this.refreshStatusBanner();
  }

  private collectRefs() {
    const form = this.root.querySelector<HTMLFormElement>("form");
    const datasetInput = this.root.querySelector<HTMLInputElement>("#dataset");
    const dropzone = this.root.querySelector<HTMLElement>("[data-dropzone]");
    const chooseFileBtn = this.root.querySelector<HTMLButtonElement>("[data-action='choose-file']");
    const clearFileBtn = this.root.querySelector<HTMLButtonElement>("[data-action='clear-file']");
    const fileName = this.root.querySelector<HTMLElement>("[data-file-name]");
    const modelSelect = this.root.querySelector<HTMLSelectElement>("#model");
    const submitButton = this.root.querySelector<HTMLButtonElement>(".form__actions .btn.primary");
    const resetButton = this.root.querySelector<HTMLButtonElement>("[data-action='reset']");
    const stopButton = this.root.querySelector<HTMLButtonElement>("[data-action='stop']");
    const statusBanner = this.root.querySelector<HTMLElement>("[data-status]");

    if (
      !form || !datasetInput || !dropzone || !chooseFileBtn || !clearFileBtn || !fileName ||
      !modelSelect || !submitButton || !resetButton || !stopButton || !statusBanner
    ) {
      throw new Error("Missing execution form elements");
    }

    this.refs = {
      form,
      datasetInput,
      dropzone,
      chooseFileBtn,
      clearFileBtn,
      fileName,
      modelSelect,
      submitButton,
      resetButton,
      stopButton,
      statusBanner
    };
  }

  private bind() {
    this.refs.chooseFileBtn.addEventListener("click", () => this.refs.datasetInput.click());
    this.refs.datasetInput.addEventListener("change", () => this.handleFileInput(this.refs.datasetInput.files));

    this.refs.dropzone.addEventListener("dragover", (event) => this.handleDragOver(event));
    this.refs.dropzone.addEventListener("dragenter", (event) => this.handleDragOver(event));
    ["dragleave", "dragend"].forEach((type) => {
      this.refs.dropzone.addEventListener(type, () => this.updateDropzoneActive(false));
    });
    this.refs.dropzone.addEventListener("drop", (event) => this.handleDrop(event));

    this.refs.clearFileBtn.addEventListener("click", () => this.setFile(null));

    this.refs.modelSelect.addEventListener("change", (event) => {
      const value = (event.target as HTMLSelectElement).value;
      this.state.selectedModelId = value;
      this.updateSubmitState();
    });

    this.refs.resetButton.addEventListener("click", () => this.resetForm(true));
    this.refs.stopButton.addEventListener("click", () => void this.handleStop());
    this.refs.form.addEventListener("submit", (event) => void this.handleSubmit(event));
  }

  private async loadModels() {
    this.state.modelsLoading = true;
    this.state.modelsError = null;
    this.populateModelsPlaceholder("Loading models…", true);
    this.updateSubmitState();

    try {
      console.log("🔍 Starting to load models...");
      const token = getToken() ?? undefined;
      console.log("🔑 Token exists:", !!token);

      const models = await getModels(token);
      console.log("📊 Raw models response:", models);

      // For debugging: show all models first, then filter
      console.log("🔍 All models with details:", models);
      console.log("🔍 Models summary:", models.map(m => ({
        id: m.modelId,
        name: m.modelName,
        algorithm: m.algorithmName,
        status: m.status,
        trainingId: m.trainingId
      })));

      // Filter only models with FINISHED status
      const finishedModels = models.filter(model => model.status === "FINISHED");
      console.log("✅ Finished models:", finishedModels);

      // Temporarily show all models for debugging
      const modelsToShow = models.length > 0 ? models : finishedModels;
      console.log("📝 Showing models:", modelsToShow);

      this.state.models = modelsToShow;
      this.state.modelsLoading = false;
      this.state.modelsError = null;
      this.populateModels(modelsToShow);

      if (modelsToShow.length === 0) {
        this.showStatus("No trained models found. Please train a model first.", "warning");
      } else if (finishedModels.length === 0 && models.length > 0) {
        this.showStatus(`Found ${models.length} models but none are finished. Showing all for debugging.`, "info");
      } else {
        this.clearStatusIfInfoOnly();
      }
    } catch (error) {
      console.error("❌ Error loading models:", error);
      if (error instanceof UnauthorizedError) {
        return;
      }
      const message = error instanceof Error ? error.message : "Failed to load models";
      this.state.modelsLoading = false;
      this.state.modelsError = message;
      this.populateModelsPlaceholder("Failed to load models", false);
      this.showStatus(message, "error");
    } finally {
      this.updateSubmitState();
    }
  }

  private populateModels(models: RetrainModelOptionDTO[]) {
    const select = this.refs.modelSelect;
    const previous = this.state.selectedModelId;

    const options = [
      '<option value="" disabled>Select a trained model</option>',
      ...models.map((model) => {
        // Ensure consistent formatting: ModelName - Model ID (Algorithm)
        const displayName = `${this.escapeHtml(model.modelName)} - Model ${model.modelId} (${this.escapeHtml(model.algorithmName)})`;
        return `<option value="${model.modelId}">${displayName}</option>`;
      })
    ];

    select.innerHTML = options.join("");

    if (previous && models.some((item) => String(item.modelId) === previous)) {
      select.value = previous;
    } else {
      select.selectedIndex = 0;
      this.state.selectedModelId = "";
    }

    select.disabled = this.state.modelsLoading || !!this.state.modelsError;
  }

  private populateModelsPlaceholder(label: string, loading: boolean) {
    const select = this.refs.modelSelect;
    select.innerHTML = `<option value="" disabled ${loading ? "selected" : ""}>${this.escapeHtml(label)}</option>`;
    select.disabled = true;
  }

  private handleFileInput(files: FileList | null) {
    const file = files && files.length > 0 ? files[0] : null;
    if (!file) {
      return;
    }
    this.setFile(file);
  }

  private handleDragOver(event: DragEvent) {
    event.preventDefault();
    this.updateDropzoneActive(true);
  }

  private handleDrop(event: DragEvent) {
    event.preventDefault();
    this.updateDropzoneActive(false);

    const file = event.dataTransfer?.files?.[0] ?? null;
    if (!file) {
      return;
    }

    this.refs.datasetInput.value = "";
    this.setFile(file);
  }

  private updateDropzoneActive(active: boolean) {
    this.refs.dropzone.classList.toggle("dropzone--active", active);
  }

  private setFile(file: File | null) {
    this.selectedFile = file;
    this.refs.fileName.textContent = file ? file.name : "No file selected";
    this.refs.clearFileBtn.disabled = !file || this.state.submitting;
    this.updateSubmitState();
  }

  private updateSubmitState() {
    const canSubmit = Boolean(
      this.selectedFile &&
      this.state.selectedModelId &&
      !this.state.submitting &&
      !this.state.modelsLoading &&
      !this.state.modelsError
    );

    this.refs.submitButton.disabled = !canSubmit;
    this.refs.submitButton.textContent = this.state.submitting ? "Starting…" : "Start execution";

    this.refs.modelSelect.disabled = this.state.modelsLoading || !!this.state.modelsError || this.state.submitting;
    this.refs.chooseFileBtn.disabled = this.state.submitting;
    this.refs.resetButton.disabled = this.state.submitting;
    this.refs.clearFileBtn.disabled = !this.selectedFile || this.state.submitting;
  }

  private async handleSubmit(event: Event) {
    event.preventDefault();

    if (!this.selectedFile) {
      this.showStatus("Please select a prediction dataset file before starting the execution.", "error");
      return;
    }

    const modelId = this.state.selectedModelId || this.refs.modelSelect.value;
    if (!modelId) {
      this.showStatus("Select a trained model to continue.", "error");
      return;
    }

    if (!/^\d+$/.test(modelId)) {
      this.showStatus("Model id must be numeric.", "error");
      return;
    }

    const formData = new FormData();
    formData.append("predictionFile", this.selectedFile);
    formData.append("modelId", modelId);

    this.state.taskId = null;
    this.state.taskStatus = null;
    this.stopPolling();
    this.setSubmitting(true);
    this.showStatus("Uploading dataset and starting execution…", "info");

    try {
      const token = getToken() ?? undefined;
      const response = await startExecution(formData, token);
      const taskId = this.extractTaskId(response);
      this.state.taskId = taskId;
      this.state.taskStatus = "PENDING";
      this.updateStopButton(); // Make sure stop button appears
      this.showStatus(`Execution task ${taskId} started. Monitoring status…`, "info");

      // Start polling after a small delay to allow backend to initialize the task
      setTimeout(() => {
        this.beginPolling(taskId);
      }, 1000);
    } catch (error) {
      if (error instanceof UnauthorizedError) {
        return;
      }
      const message = error instanceof Error ? error.message : "Execution failed";
      this.showStatus(message, "error");
    } finally {
      this.setSubmitting(false);
    }
  }

  private extractTaskId(response: unknown): string {
    if (typeof response === "string") {
      return response;
    }
    if (response && typeof response === "object") {
      const record = response as Record<string, unknown>;
      const dataHeader = record.dataHeader;
      if (typeof dataHeader === "string" || typeof dataHeader === "number") {
        return String(dataHeader);
      }
      const taskId = record.taskId;
      if (typeof taskId === "string" || typeof taskId === "number") {
        return String(taskId);
      }
    }
    throw new Error("Execution started but task id was not returned by the server.");
  }

  private beginPolling(taskId: string) {
    this.stopPolling();
    this.pollTimer = window.setInterval(() => {
      void this.pollTaskStatus(taskId);
    }, 3000);
  }

  private async pollTaskStatus(taskId: string) {
    try {
      const token = getToken() ?? undefined;
      const data = (await getTaskStatus(taskId, token)) as TaskStatusDTO;
      const status = data.status ?? "UNKNOWN";
      this.state.taskStatus = status;
      this.updateStopButton();

      if (status === "COMPLETED") {
        this.showStatus(`Execution completed successfully. Check the Executions page to download the results.`, "success");
        this.stopPolling();
        this.resetForm(false);
      } else if (status === "FAILED") {
        const extra = data.errorMessage ? ` Reason: ${data.errorMessage}` : "";
        this.showStatus(`Execution failed.${extra}`, "error");
        this.stopPolling();
      } else if (status === "STOPPED") {
        this.showStatus("Execution was stopped by the user.", "warning");
        this.stopPolling();
        this.state.taskId = null;
        this.state.taskStatus = null;
        this.updateStopButton();
      } else {
        this.showStatus(`Execution task ${taskId} is ${status.toLowerCase()}.`, "info");
      }
    } catch (error) {
      if (error instanceof UnauthorizedError) {
        return;
      }
      const message = error instanceof Error ? error.message : "Cannot fetch execution status";
      this.showStatus(`Unable to check task status: ${message}`, "warning");
      this.stopPolling();
    }
  }

  private stopPolling() {
    if (this.pollTimer !== null) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  private async handleStop() {
    if (!this.state.taskId) {
      return;
    }

    try {
      const token = getToken();
      if (!token) {
        throw new UnauthorizedError();
      }

      this.refs.stopButton.disabled = true;
      this.showStatus("Stopping execution...", "warning");

      await stopTask(this.state.taskId, token);
      this.showStatus("Stop request sent successfully. The execution will be stopped shortly.", "info");

    } catch (error) {
      console.error('Failed to stop execution:', error);
      const message = error instanceof Error ? error.message : "Failed to stop execution";
      this.showStatus(`Failed to stop execution: ${message}`, "error");
    } finally {
      this.refs.stopButton.disabled = false;
    }
  }

  private setSubmitting(isSubmitting: boolean) {
    this.state.submitting = isSubmitting;
    this.refs.form.classList.toggle("form--submitting", isSubmitting);
    this.updateSubmitState();
    this.updateStopButton();
  }

  private updateStopButton() {
    const isExecuting = this.state.taskId && this.state.taskStatus &&
                       (this.state.taskStatus === "RUNNING" || this.state.taskStatus === "PENDING");
    this.refs.stopButton.style.display = isExecuting ? 'inline-block' : 'none';
  }

  private resetForm(clearStatus: boolean) {
    this.refs.form.reset();
    this.setFile(null);
    this.state.selectedModelId = "";
    this.state.taskId = null;
    this.state.taskStatus = null;

    if (this.state.models.length > 0) {
      this.populateModels(this.state.models);
    }

    if (clearStatus) {
      this.state.statusMessage = null;
      this.state.statusTone = null;
      this.refreshStatusBanner();
    }

    this.updateSubmitState();
    this.updateStopButton();
  }

  private showStatus(message: string, tone: StatusTone) {
    this.state.statusMessage = message;
    this.state.statusTone = tone;
    this.refreshStatusBanner();
  }

  private clearStatusIfInfoOnly() {
    if (this.state.statusTone === "info" && this.state.taskId === null) {
      this.state.statusMessage = null;
      this.state.statusTone = null;
      this.refreshStatusBanner();
    }
  }

  private refreshStatusBanner() {
    const banner = this.refs.statusBanner;
    const { statusMessage, statusTone } = this.state;

    if (!statusMessage) {
      banner.hidden = true;
      banner.textContent = "";
      banner.className = "status-banner";
      return;
    }

    banner.hidden = false;
    banner.textContent = statusMessage;
    banner.className = `status-banner status-banner--${statusTone ?? "info"}`;
  }

  private escapeHtml(value: string): string {
    return value.replace(/[&<>\"']/g, (char) => {
      switch (char) {
        case "&": return "&amp;";
        case "<": return "&lt;";
        case ">": return "&gt;";
        case '"': return "&quot;";
        case "'": return "&#39;";
        default: return char;
      }
    });
  }
}

customElements.define("page-execution", PageExecution);