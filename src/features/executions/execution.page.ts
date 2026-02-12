import { getToken, getCurrentUsername } from "../../core/auth.store";
import { UnauthorizedError } from "../../core/http";
import { taskStore } from "../../core/task.store";
import { getModels, startExecution } from "./api";
import type { RetrainModelOptionDTO } from "./api";
import { getTaskStatus, stopTask } from "../tasks/api";
import { fetchDatasets } from "../datasets/api";
import type { DatasetDTO } from "../datasets/api";
import styles from "./styles/execution.css?raw";

type StatusTone = "info" | "success" | "error" | "warning";
type DatasetMode = "upload" | "existing";

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
  // Dataset mode state
  datasetMode: DatasetMode;
  existingDatasets: DatasetDTO[];
  datasetsLoading: boolean;
  selectedDatasetId: number | null;
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
  // Dataset mode refs
  datasetModeUpload: HTMLInputElement;
  datasetModeExisting: HTMLInputElement;
  uploadSection: HTMLElement;
  existingSection: HTMLElement;
  datasetSelect: HTMLSelectElement;
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
    statusTone: null,
    // Dataset mode state
    datasetMode: "upload",
    existingDatasets: [],
    datasetsLoading: false,
    selectedDatasetId: null
  };
  private selectedFile: File | null = null;
  private pollTimer: number | null = null;
  private pollTimers: Map<string, number> = new Map();
  private storeUnsubscribe: (() => void) | null = null;

  connectedCallback() {
    this.root = this.shadowRoot ?? this.attachShadow({ mode: "open" });
    this.render();
    void this.loadModels();
    this.restoreActiveTasks();
    this.storeUnsubscribe = taskStore.subscribe(() => this.onTaskStoreChange());
  }

  disconnectedCallback() {
    if (this.storeUnsubscribe) {
      this.storeUnsubscribe();
    }
  }

  private onTaskStoreChange() {
    this.renderActiveTasksPanel();
  }

  private restoreActiveTasks() {
    const activeTasks = taskStore.getActiveTasksByType('PREDICTION');
    if (activeTasks.length > 0) {
      activeTasks.forEach(task => {
        if (!this.pollTimers.has(task.taskId)) {
          this.beginPollingForTask(task.taskId);
        }
      });
      const mostRecent = activeTasks[activeTasks.length - 1];
      this.state.taskId = mostRecent.taskId;
      this.state.taskStatus = mostRecent.status;
      this.showStatus(`Monitoring ${activeTasks.length} active prediction(s)...`, "info");
      this.updateStopButton();
      this.renderActiveTasksPanel();
    }
  }

  private saveActiveTask(description?: string) {
    if (this.state.taskId) {
      taskStore.addTask({
        taskId: this.state.taskId,
        type: 'PREDICTION',
        status: this.state.taskStatus || 'PENDING',
        description: description || 'Prediction'
      });
    }
  }

  private clearActiveTask(taskId?: string) {
    const id = taskId || this.state.taskId;
    if (id) {
      taskStore.removeTask(id);
    }
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

        <section class="active-tasks-panel" data-active-tasks hidden></section>

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
              <div class="dataset-mode-toggle">
                <label class="dataset-mode-option">
                  <input type="radio" name="datasetMode" value="upload" checked data-ref="datasetModeUpload" />
                  <span>Upload new file</span>
                </label>
                <label class="dataset-mode-option">
                  <input type="radio" name="datasetMode" value="existing" data-ref="datasetModeExisting" />
                  <span>Select existing dataset</span>
                </label>
              </div>

              <!-- Upload section -->
              <div data-ref="uploadSection">
                <div class="dropzone" data-dropzone>
                  <p class="dropzone__title" data-file-name>No file selected</p>
                  <p class="dropzone__hint">Drag &amp; drop a <code>.csv</code> or <code>.arff</code> file, or</p>
                  <button class="btn ghost" type="button" data-action="choose-file">Select file</button>
                </div>
                <input type="file" id="dataset" accept=".csv,.CSV,.arff,.ARFF" hidden />
                <div class="group__actions">
                  <button class="btn ghost small" type="button" data-action="clear-file" disabled>Remove file</button>
                </div>
              </div>

              <!-- Existing dataset section -->
              <div data-ref="existingSection" hidden>
                <label class="field">
                  <span>Select Dataset</span>
                  <select data-ref="datasetSelect">
                    <option value="">Select a dataset...</option>
                  </select>
                </label>
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
    // Dataset mode refs
    const datasetModeUpload = this.root.querySelector<HTMLInputElement>("[data-ref='datasetModeUpload']");
    const datasetModeExisting = this.root.querySelector<HTMLInputElement>("[data-ref='datasetModeExisting']");
    const uploadSection = this.root.querySelector<HTMLElement>("[data-ref='uploadSection']");
    const existingSection = this.root.querySelector<HTMLElement>("[data-ref='existingSection']");
    const datasetSelect = this.root.querySelector<HTMLSelectElement>("[data-ref='datasetSelect']");

    if (
      !form || !datasetInput || !dropzone || !chooseFileBtn || !clearFileBtn || !fileName ||
      !modelSelect || !submitButton || !resetButton || !stopButton || !statusBanner ||
      !datasetModeUpload || !datasetModeExisting || !uploadSection || !existingSection || !datasetSelect
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
      statusBanner,
      datasetModeUpload,
      datasetModeExisting,
      uploadSection,
      existingSection,
      datasetSelect
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

    // Dataset mode toggle handlers
    this.refs.datasetModeUpload.addEventListener("change", () => this.handleDatasetModeChange("upload"));
    this.refs.datasetModeExisting.addEventListener("change", () => this.handleDatasetModeChange("existing"));

    // Existing dataset select handler
    this.refs.datasetSelect.addEventListener("change", (event) => {
      const value = (event.target as HTMLSelectElement).value;
      if (value) {
        this.state.selectedDatasetId = parseInt(value);
      } else {
        this.state.selectedDatasetId = null;
      }
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

  private handleDatasetModeChange(mode: DatasetMode) {
    this.state.datasetMode = mode;

    // Always clear both selections when switching modes
    this.state.selectedDatasetId = null;
    this.setFile(null);
    this.refs.datasetInput.value = "";
    this.refs.datasetSelect.value = "";

    if (mode === "upload") {
      this.refs.uploadSection.hidden = false;
      this.refs.existingSection.hidden = true;
    } else {
      this.refs.uploadSection.hidden = true;
      this.refs.existingSection.hidden = false;
      void this.loadExistingDatasets();
    }

    this.updateSubmitState();
  }

  private async loadExistingDatasets() {
    this.state.datasetsLoading = true;
    this.refs.datasetSelect.innerHTML = '<option value="">Loading datasets...</option>';
    this.refs.datasetSelect.disabled = true;

    try {
      const token = getToken() ?? undefined;
      const datasets = await fetchDatasets(token);
      this.state.existingDatasets = datasets;
      this.populateDatasetSelect();
    } catch (error) {
      if (error instanceof UnauthorizedError) {
        return;
      }
      const message = error instanceof Error ? error.message : "Failed to load datasets";
      this.showStatus(message, "error");
      this.refs.datasetSelect.innerHTML = '<option value="">Failed to load datasets</option>';
    } finally {
      this.state.datasetsLoading = false;
      this.refs.datasetSelect.disabled = false;
    }
  }

  private populateDatasetSelect() {
    const select = this.refs.datasetSelect;
    const currentUsername = getCurrentUsername();

    // My datasets = owned by me (regardless of accessibility)
    const myDatasets = this.state.existingDatasets.filter(d => d.ownerUsername === currentUsername);
    // Public datasets = NOT owned by me AND status is PUBLIC
    const publicDatasets = this.state.existingDatasets.filter(d => d.ownerUsername !== currentUsername && d.status === "PUBLIC");

    let optionsHtml = '<option value="">Select a dataset...</option>';

    if (myDatasets.length > 0) {
      optionsHtml += '<optgroup label="Your Datasets">';
      optionsHtml += myDatasets.map(d =>
        `<option value="${d.id}">${this.escapeHtml(d.originalFileName)}</option>`
      ).join("");
      optionsHtml += '</optgroup>';
    }

    if (publicDatasets.length > 0) {
      optionsHtml += '<optgroup label="Public Datasets">';
      optionsHtml += publicDatasets.map(d =>
        `<option value="${d.id}">${this.escapeHtml(d.originalFileName)} (${this.escapeHtml(d.ownerUsername)})</option>`
      ).join("");
      optionsHtml += '</optgroup>';
    }

    select.innerHTML = optionsHtml;
  }

  private updateSubmitState() {
    // Check if dataset is provided based on mode
    const hasDataset = this.state.datasetMode === "upload"
      ? Boolean(this.selectedFile)
      : Boolean(this.state.selectedDatasetId);

    console.log("🔄 updateSubmitState:", {
      datasetMode: this.state.datasetMode,
      selectedFile: this.selectedFile?.name,
      selectedDatasetId: this.state.selectedDatasetId,
      hasDataset,
      selectedModelId: this.state.selectedModelId,
      submitting: this.state.submitting,
      modelsLoading: this.state.modelsLoading,
      modelsError: this.state.modelsError
    });

    const canSubmit = Boolean(
      hasDataset &&
      this.state.selectedModelId &&
      !this.state.submitting &&
      !this.state.modelsLoading &&
      !this.state.modelsError
    );

    console.log("🔄 canSubmit:", canSubmit);

    this.refs.submitButton.disabled = !canSubmit;
    this.refs.submitButton.textContent = this.state.submitting ? "Starting…" : "Start execution";

    this.refs.modelSelect.disabled = this.state.modelsLoading || !!this.state.modelsError || this.state.submitting;
    this.refs.chooseFileBtn.disabled = this.state.submitting;
    this.refs.resetButton.disabled = this.state.submitting;
    this.refs.clearFileBtn.disabled = !this.selectedFile || this.state.submitting;
    this.refs.datasetSelect.disabled = this.state.datasetsLoading || this.state.submitting;
  }

  private async handleSubmit(event: Event) {
    event.preventDefault();

    // Validate dataset based on mode
    if (this.state.datasetMode === "upload") {
      if (!this.selectedFile) {
        this.showStatus("Please select a prediction dataset file before starting the execution.", "error");
        return;
      }
    } else {
      if (!this.state.selectedDatasetId) {
        this.showStatus("Please select an existing dataset before starting the execution.", "error");
        return;
      }
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

    // Add dataset based on mode
    console.log("📤 Submit - mode:", this.state.datasetMode);
    console.log("📤 Submit - selectedFile:", this.selectedFile?.name, "size:", this.selectedFile?.size, "type:", this.selectedFile?.type);
    console.log("📤 Submit - selectedDatasetId:", this.state.selectedDatasetId);
    console.log("📤 Submit - datasetInput.files:", this.refs.datasetInput.files?.[0]?.name, "size:", this.refs.datasetInput.files?.[0]?.size);

    if (this.state.datasetMode === "upload" && this.selectedFile) {
      // Use the file from the input element directly in case this.selectedFile is stale
      const fileToSend = this.refs.datasetInput.files?.[0] || this.selectedFile;
      console.log("📤 File to send:", fileToSend.name, "size:", fileToSend.size);
      formData.append("predictionFile", fileToSend);
      console.log("📤 Appending predictionFile:", fileToSend.name);
    } else if (this.state.datasetMode === "existing" && this.state.selectedDatasetId) {
      formData.append("datasetId", this.state.selectedDatasetId.toString());
      console.log("📤 Appending datasetId:", this.state.selectedDatasetId);
    } else {
      console.error("❌ No file or datasetId to send!");
    }

    formData.append("modelId", modelId);
    console.log("📤 FormData keys:", [...formData.keys()]);

    this.state.taskId = null;
    this.state.taskStatus = null;
    this.stopPolling();
    this.setSubmitting(true);

    const statusMessage = this.state.datasetMode === "upload"
      ? "Uploading dataset and starting execution…"
      : "Starting execution with existing dataset…";
    this.showStatus(statusMessage, "info");

    try {
      const token = getToken() ?? undefined;
      const response = await startExecution(formData, token);
      const taskId = this.extractTaskId(response);
      this.state.taskId = taskId;
      this.state.taskStatus = "PENDING";

      // Save to task store with description
      const model = this.state.models.find(m => m.modelId.toString() === modelId);
      const modelName = model?.modelName || 'Model';
      const fileName = this.selectedFile?.name || 'data';
      this.saveActiveTask(`${modelName} on ${fileName}`);

      this.updateStopButton();
      this.showStatus(`Execution task ${taskId} started. Monitoring status…`, "info");
      this.renderActiveTasksPanel();

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
    this.beginPollingForTask(taskId);
  }

  private beginPollingForTask(taskId: string) {
    if (this.pollTimers.has(taskId)) return;

    const timer = window.setInterval(() => {
      void this.pollTaskStatusForTask(taskId);
    }, 3000);

    this.pollTimers.set(taskId, timer);
  }

  private stopPollingForTask(taskId: string) {
    const timer = this.pollTimers.get(taskId);
    if (timer) {
      clearInterval(timer);
      this.pollTimers.delete(taskId);
    }
  }

  private async pollTaskStatusForTask(taskId: string) {
    try {
      const token = getToken() ?? undefined;
      const data = (await getTaskStatus(taskId, token)) as TaskStatusDTO;
      const status = data.status ?? "UNKNOWN";

      taskStore.updateTaskStatus(taskId, status);

      if (this.state.taskId === taskId) {
        this.state.taskStatus = status;
        this.updateStopButton();
      }

      if (status === "COMPLETED") {
        this.stopPollingForTask(taskId);
        this.clearActiveTask(taskId);
        if (this.state.taskId === taskId) {
          this.showStatus(`Execution completed successfully. Check the Executions page to download the results.`, "success");
          this.resetForm(false);
        }
      } else if (status === "FAILED") {
        const extra = data.errorMessage ? ` Reason: ${data.errorMessage}` : "";
        this.stopPollingForTask(taskId);
        this.clearActiveTask(taskId);
        if (this.state.taskId === taskId) {
          this.showStatus(`Execution failed.${extra}`, "error");
        }
      } else if (status === "STOPPED") {
        this.stopPollingForTask(taskId);
        this.clearActiveTask(taskId);
        if (this.state.taskId === taskId) {
          this.showStatus("Execution was stopped by the user.", "warning");
          this.state.taskId = null;
          this.state.taskStatus = null;
          this.updateStopButton();
        }
      } else {
        if (this.state.taskId === taskId) {
          this.showStatus(`Execution task ${taskId} is ${status.toLowerCase()}.`, "info");
        }
      }
      this.renderActiveTasksPanel();
    } catch (error) {
      if (error instanceof UnauthorizedError) {
        return;
      }
      const message = error instanceof Error ? error.message : "Cannot fetch execution status";
      if (this.state.taskId === taskId) {
        this.showStatus(`Unable to check task status: ${message}`, "warning");
      }
      this.stopPollingForTask(taskId);
    }
  }

  private stopPolling() {
    this.pollTimers.forEach((timer) => clearInterval(timer));
    this.pollTimers.clear();
    if (this.pollTimer !== null) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  private renderActiveTasksPanel() {
    const panel = this.root.querySelector<HTMLElement>('[data-active-tasks]');
    if (!panel) return;

    const activeTasks = taskStore.getActiveTasksByType('PREDICTION');
    if (activeTasks.length === 0) {
      panel.hidden = true;
      return;
    }

    panel.hidden = false;
    panel.innerHTML = `
      <h3>Active Predictions (${activeTasks.length})</h3>
      <ul class="active-tasks-list">
        ${activeTasks.map(task => `
          <li class="active-task-item ${this.state.taskId === task.taskId ? 'active-task-item--current' : ''}"
              data-task-id="${task.taskId}">
            <span class="active-task-status active-task-status--${task.status.toLowerCase()}">${task.status}</span>
            <span class="active-task-id">${task.taskId.substring(0, 8)}...</span>
            <span class="active-task-desc">${task.description || 'Prediction'}</span>
            <button type="button" class="btn small ghost" data-action="view-task" data-task-id="${task.taskId}">View</button>
            <button type="button" class="btn small danger" data-action="stop-task" data-task-id="${task.taskId}">Stop</button>
          </li>
        `).join('')}
      </ul>
    `;

    panel.querySelectorAll('[data-action="view-task"]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const taskId = (e.target as HTMLElement).dataset.taskId;
        if (taskId) this.switchToTask(taskId);
      });
    });

    panel.querySelectorAll('[data-action="stop-task"]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const taskId = (e.target as HTMLElement).dataset.taskId;
        if (taskId) void this.handleStopTask(taskId);
      });
    });
  }

  private switchToTask(taskId: string) {
    const task = taskStore.getTask(taskId);
    if (task) {
      this.state.taskId = taskId;
      this.state.taskStatus = task.status;
      this.showStatus(`Viewing task ${taskId} - Status: ${task.status}`, "info");
      this.updateStopButton();
      this.renderActiveTasksPanel();
    }
  }

  private async handleStopTask(taskId: string) {
    try {
      const token = getToken();
      if (!token) throw new UnauthorizedError();
      this.showStatus(`Stopping task ${taskId}...`, "warning");
      await stopTask(taskId, token);
      this.showStatus("Stop request sent successfully.", "info");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to stop execution";
      this.showStatus(`Failed to stop: ${message}`, "error");
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

    // Reset dataset mode state
    this.state.datasetMode = "upload";
    this.state.selectedDatasetId = null;
    this.refs.datasetModeUpload.checked = true;
    this.refs.datasetModeExisting.checked = false;
    this.refs.uploadSection.hidden = false;
    this.refs.existingSection.hidden = true;
    this.refs.datasetSelect.selectedIndex = 0;

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