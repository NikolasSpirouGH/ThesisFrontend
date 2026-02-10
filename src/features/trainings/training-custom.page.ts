import { getToken, getCurrentUsername } from "../../core/auth.store";
import { UnauthorizedError } from "../../core/http";
import { taskStore } from "../../core/task.store";
import { fetchCustomAlgorithms } from "../algorithms/api";
import type { CustomAlgorithm } from "../algorithms/api";
import { startCustomTraining, parseDatasetColumns } from "./api";
import type { CustomTrainingRequest } from "./api";
import { getTaskStatus, stopTask } from "../tasks/api";
import { fetchDatasets, fetchDatasetColumns } from "../datasets/api";
import type { DatasetDTO } from "../datasets/api";
import styles from "./styles/training-custom.css?raw";
import "./components/dataset-column-selector";
import type { DatasetColumnSelector } from "./components/dataset-column-selector";

type StatusTone = "info" | "success" | "error" | "warning";

type DatasetMode = "upload" | "existing";

type ComponentState = {
  algorithms: CustomAlgorithm[];
  algorithmsLoading: boolean;
  algorithmsError: string | null;
  selectedAlgorithmId: string;
  columnsLoading: boolean;
  basicColumns: string;
  targetColumn: string;
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
  parametersInput: HTMLInputElement;
  dropzoneDataset: HTMLElement;
  dropzoneParams: HTMLElement;
  chooseDatasetBtn: HTMLButtonElement;
  chooseParamsBtn: HTMLButtonElement;
  clearDatasetBtn: HTMLButtonElement;
  clearParamsBtn: HTMLButtonElement;
  datasetFileName: HTMLElement;
  paramsFileName: HTMLElement;
  algorithmSelect: HTMLSelectElement;
  columnSelector: DatasetColumnSelector;
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

export class PageTrainCustom extends HTMLElement {
  private root!: ShadowRoot;
  private refs!: Refs;
  private state: ComponentState = {
    algorithms: [],
    algorithmsLoading: true,
    algorithmsError: null,
    selectedAlgorithmId: "",
    columnsLoading: false,
    basicColumns: "",
    targetColumn: "",
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
  private selectedDatasetFile: File | null = null;
  private selectedParametersFile: File | null = null;
  private pollTimer: number | null = null;
  private pollTimers: Map<string, number> = new Map();
  private storeUnsubscribe: (() => void) | null = null;

  connectedCallback() {
    this.root = this.shadowRoot ?? this.attachShadow({ mode: "open" });
    this.render();
    void this.loadAlgorithms();
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
    const activeTasks = taskStore.getActiveTasksByType('CUSTOM_TRAINING');
    if (activeTasks.length > 0) {
      activeTasks.forEach(task => {
        if (!this.pollTimers.has(task.taskId)) {
          this.startPollingForTask(task.taskId);
        }
      });
      const mostRecent = activeTasks[activeTasks.length - 1];
      this.state.taskId = mostRecent.taskId;
      this.state.taskStatus = mostRecent.status;
      this.showStatusBanner(`Monitoring ${activeTasks.length} active training(s)...`, "info");
      this.updateStopButton();
      this.renderActiveTasksPanel();
    }
  }

  private saveActiveTask(description?: string) {
    if (this.state.taskId) {
      taskStore.addTask({
        taskId: this.state.taskId,
        type: 'CUSTOM_TRAINING',
        status: this.state.taskStatus || 'PENDING',
        description: description || 'Custom Training'
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
            <p class="hero__eyebrow">Training</p>
            <h1>Launch a custom training</h1>
            <p class="hero__lead">
              Upload a dataset, choose one of your custom algorithms, and start an asynchronous training task.
              Monitor its progress from the Trainings overview once it launches.
            </p>
          </div>
          <ul class="hero__list">
            <li>Accepts CSV, ARFF, or XLSX datasets</li>
            <li>Optional parameter override file</li>
            <li>Fine-tune feature columns and target</li>
            <li>Uses your Docker-based custom algorithms</li>
          </ul>
        </header>

        <div class="status-banner" data-ref="statusBanner"></div>

        <section class="active-tasks-panel" data-active-tasks hidden></section>

        <form class="panel form" data-ref="form" novalidate>
          <!-- Algorithm Selection -->
          <div class="field">
            <span>Custom Algorithm *</span>
            <select name="algorithm" id="algorithm" data-ref="algorithmSelect" required>
              <option value="">Choose an algorithm...</option>
            </select>
            <small>Select from your own algorithms or public algorithms from other users.</small>
          </div>

          <!-- Dataset Selection -->
          <div class="field">
            <span>Training Dataset *</span>
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
              <div class="dropzone" data-ref="dropzoneDataset">
                <div class="dropzone__content">
                  <h3 class="dropzone__title">📄 Drop your dataset file here</h3>
                  <p class="dropzone__hint">or <button type="button" class="link-btn" data-ref="chooseDatasetBtn">browse files</button></p>
                  <p class="dropzone__hint">CSV, ARFF, or XLSX formats</p>
                </div>
                <div class="dropzone__selected" style="display: none;">
                  <p>Selected: <span data-ref="datasetFileName">filename.csv</span></p>
                  <button type="button" class="btn small ghost" data-ref="clearDatasetBtn">Remove</button>
                </div>
              </div>
              <input type="file" style="position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0;" data-ref="datasetInput" accept=".csv,.arff,.xlsx" required>
            </div>

            <!-- Existing dataset section -->
            <div data-ref="existingSection" hidden>
              <select data-ref="datasetSelect" class="dataset-select">
                <option value="">Select a dataset...</option>
              </select>
            </div>
          </div>

          <!-- Parameters File Upload (Optional) -->
          <div class="field">
            <span>Parameters File (Optional)</span>
            <div class="dropzone" data-ref="dropzoneParams">
              <div class="dropzone__content">
                <h3 class="dropzone__title">⚙️ Drop your parameters JSON file here</h3>
                <p class="dropzone__hint">or <button type="button" class="link-btn" data-ref="chooseParamsBtn">browse files</button></p>
                <p class="dropzone__hint">JSON format to override default algorithm parameters</p>
              </div>
              <div class="dropzone__selected" style="display: none;">
                <p>Selected: <span data-ref="paramsFileName">params.json</span></p>
                <button type="button" class="btn small ghost" data-ref="clearParamsBtn">Remove</button>
              </div>
            </div>
            <input type="file" style="position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0;" data-ref="parametersInput" accept=".json">
          </div>

          <!-- Dataset Column Selection -->
          <fieldset class="group">
            <legend>Dataset Column Selection</legend>
            <dataset-column-selector data-ref="columnSelector"></dataset-column-selector>
          </fieldset>

          <div class="form__actions">
            <button type="button" class="btn ghost" data-ref="resetButton">Reset Form</button>
            <button type="submit" class="btn primary" data-ref="submitButton">
              <span class="btn__text">Start Training</span>
            </button>
            <button type="button" class="btn danger" data-ref="stopButton" style="display: none;">Stop Training</button>
          </div>
        </form>
      </div>
    `;

    this.collectRefs();
    this.bindEvents();
  }

  private collectRefs() {
    const query = <T extends HTMLElement>(selector: string): T =>
      this.root.querySelector(`[data-ref="${selector}"]`) as T;

    this.refs = {
      form: query("form"),
      datasetInput: query("datasetInput"),
      parametersInput: query("parametersInput"),
      dropzoneDataset: query("dropzoneDataset"),
      dropzoneParams: query("dropzoneParams"),
      chooseDatasetBtn: query("chooseDatasetBtn"),
      chooseParamsBtn: query("chooseParamsBtn"),
      clearDatasetBtn: query("clearDatasetBtn"),
      clearParamsBtn: query("clearParamsBtn"),
      datasetFileName: query("datasetFileName"),
      paramsFileName: query("paramsFileName"),
      algorithmSelect: query("algorithmSelect"),
      columnSelector: query("columnSelector"),
      submitButton: query("submitButton"),
      resetButton: query("resetButton"),
      stopButton: query("stopButton"),
      statusBanner: query("statusBanner"),
      // Dataset mode refs
      datasetModeUpload: query("datasetModeUpload"),
      datasetModeExisting: query("datasetModeExisting"),
      uploadSection: query("uploadSection"),
      existingSection: query("existingSection"),
      datasetSelect: query("datasetSelect")
    };
  }

  private bindEvents() {
    // File input events
    this.refs.datasetInput.addEventListener("change", () => this.handleDatasetFileChange());
    this.refs.parametersInput.addEventListener("change", () => this.handleParametersFileChange());

    // Dropzone events
    this.bindDropzoneEvents(this.refs.dropzoneDataset, this.refs.datasetInput);
    this.bindDropzoneEvents(this.refs.dropzoneParams, this.refs.parametersInput);

    // Button events
    this.refs.chooseDatasetBtn.addEventListener("click", () => this.refs.datasetInput.click());
    this.refs.chooseParamsBtn.addEventListener("click", () => this.refs.parametersInput.click());
    this.refs.clearDatasetBtn.addEventListener("click", () => this.clearDatasetFile());
    this.refs.clearParamsBtn.addEventListener("click", () => this.clearParametersFile());

    // Dataset mode toggle handlers
    this.refs.datasetModeUpload.addEventListener("change", () => this.handleDatasetModeChange("upload"));
    this.refs.datasetModeExisting.addEventListener("change", () => this.handleDatasetModeChange("existing"));

    // Existing dataset select handler
    this.refs.datasetSelect.addEventListener("change", (event) => {
      const value = (event.target as HTMLSelectElement).value;
      if (value) {
        void this.handleDatasetSelect(parseInt(value));
      } else {
        this.state.selectedDatasetId = null;
        this.refs.columnSelector.setColumns([]);
      }
    });

    // Form events
    this.refs.form.addEventListener("submit", (e) => this.handleSubmit(e));
    this.refs.resetButton.addEventListener("click", () => this.resetForm());
    this.refs.stopButton.addEventListener("click", () => void this.handleStop());

    // State binding
    this.refs.algorithmSelect.addEventListener("change", (e) => {
      this.state.selectedAlgorithmId = (e.target as HTMLSelectElement).value;
    });
  }

  private bindDropzoneEvents(dropzone: HTMLElement, fileInput: HTMLInputElement) {
    ["dragenter", "dragover", "dragleave", "drop"].forEach(eventName => {
      dropzone.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
      });
    });

    ["dragenter", "dragover"].forEach(eventName => {
      dropzone.addEventListener(eventName, () => {
        dropzone.classList.add("dropzone--active");
      });
    });

    ["dragleave", "drop"].forEach(eventName => {
      dropzone.addEventListener(eventName, () => {
        dropzone.classList.remove("dropzone--active");
      });
    });

    dropzone.addEventListener("drop", (e: DragEvent) => {
      const files = e.dataTransfer?.files;
      if (files && files.length > 0) {
        fileInput.files = files;
        fileInput.dispatchEvent(new Event("change"));
      }
    });
  }

  private handleDatasetFileChange() {
    const file = this.refs.datasetInput.files?.[0];
    if (file) {
      this.selectedDatasetFile = file;
      this.refs.datasetFileName.textContent = file.name;
      this.toggleDropzoneView(this.refs.dropzoneDataset, true);
      void this.loadDatasetColumns(file);
    }
  }

  private handleParametersFileChange() {
    const file = this.refs.parametersInput.files?.[0];
    if (file) {
      this.selectedParametersFile = file;
      this.refs.paramsFileName.textContent = file.name;
      this.toggleDropzoneView(this.refs.dropzoneParams, true);
    }
  }

  private async loadDatasetColumns(file: File) {
    this.state.columnsLoading = true;

    try {
      const response = await parseDatasetColumns(file);

      if (response.columns && response.columns.length > 0) {
        this.refs.columnSelector.setColumns(response.columns);
      } else {
        this.refs.columnSelector.setColumns([]);
        this.showStatusBanner("No columns found in dataset", "warning");
      }
    } catch (error) {
      if (error instanceof UnauthorizedError) {
        return;
      }
      const message = error instanceof Error ? error.message : "Failed to parse dataset columns";
      this.showStatusBanner(message, "warning");
      this.refs.columnSelector.setColumns([]);
    } finally {
      this.state.columnsLoading = false;
    }
  }

  private handleDatasetModeChange(mode: DatasetMode) {
    this.state.datasetMode = mode;
    this.state.selectedDatasetId = null;
    this.refs.columnSelector.setColumns([]);

    if (mode === "upload") {
      this.refs.uploadSection.hidden = false;
      this.refs.existingSection.hidden = true;
    } else {
      this.refs.uploadSection.hidden = true;
      this.refs.existingSection.hidden = false;
      void this.loadExistingDatasets();
    }
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
      this.showStatusBanner(message, "error");
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

  private async handleDatasetSelect(datasetId: number) {
    this.state.selectedDatasetId = datasetId;
    this.state.columnsLoading = true;
    this.refs.columnSelector.setColumns([]);

    try {
      const token = getToken() ?? undefined;
      const response = await fetchDatasetColumns(datasetId, token);

      if (response.columns && response.columns.length > 0) {
        this.refs.columnSelector.setColumns(response.columns);
      } else {
        this.showStatusBanner("No columns found in dataset", "warning");
      }
    } catch (error) {
      if (error instanceof UnauthorizedError) {
        return;
      }
      const message = error instanceof Error ? error.message : "Failed to load dataset columns";
      this.showStatusBanner(message, "warning");
    } finally {
      this.state.columnsLoading = false;
    }
  }

  private clearDatasetFile() {
    this.selectedDatasetFile = null;
    this.refs.columnSelector.setColumns([]);
    this.refs.datasetInput.value = "";
    this.toggleDropzoneView(this.refs.dropzoneDataset, false);
  }

  private clearParametersFile() {
    this.selectedParametersFile = null;
    this.refs.parametersInput.value = "";
    this.toggleDropzoneView(this.refs.dropzoneParams, false);
  }

  private toggleDropzoneView(dropzone: HTMLElement, showSelected: boolean) {
    const content = dropzone.querySelector(".dropzone__content") as HTMLElement | null;
    const selected = dropzone.querySelector(".dropzone__selected") as HTMLElement | null;

    if (content) {
      content.style.display = showSelected ? "none" : "block";
    }
    if (selected) {
      selected.style.display = showSelected ? "block" : "none";
    }
  }

  private async loadAlgorithms() {
    this.state.algorithmsLoading = true;
    this.state.algorithmsError = null;
    this.updateAlgorithmsSelect();

    try {
      const token = getToken();
      if (!token) {
        throw new UnauthorizedError();
      }

      const algorithms = await fetchCustomAlgorithms(token);
      this.state.algorithms = algorithms.filter(alg => alg.isOwner || alg.accessibility === "PUBLIC");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to load algorithms";
      this.state.algorithmsError = message;
      console.error('❌ Error loading algorithms:', error);
    } finally {
      this.state.algorithmsLoading = false;
      this.updateAlgorithmsSelect();
    }
  }

  private updateAlgorithmsSelect() {
    const select = this.refs.algorithmSelect;

    // Clear existing options except the first placeholder
    while (select.children.length > 1) {
      select.removeChild(select.lastChild!);
    }

    if (this.state.algorithmsLoading) {
      const option = document.createElement("option");
      option.textContent = "Loading algorithms...";
      option.disabled = true;
      select.appendChild(option);
      return;
    }

    if (this.state.algorithmsError) {
      const option = document.createElement("option");
      option.textContent = `Error: ${this.state.algorithmsError}`;
      option.disabled = true;
      select.appendChild(option);
      return;
    }

    if (this.state.algorithms.length === 0) {
      const option = document.createElement("option");
      option.textContent = "No custom algorithms available";
      option.disabled = true;
      select.appendChild(option);
      return;
    }

    // Add algorithms grouped by ownership
    const ownAlgorithms = this.state.algorithms.filter(alg => alg.isOwner);
    const publicAlgorithms = this.state.algorithms.filter(alg => !alg.isOwner);

    if (ownAlgorithms.length > 0) {
      const ownGroup = document.createElement("optgroup");
      ownGroup.label = "Your Algorithms";
      ownAlgorithms.forEach(algorithm => {
        const option = document.createElement("option");
        option.value = algorithm.id.toString();
        option.textContent = `${algorithm.name} (v${algorithm.version})`;
        ownGroup.appendChild(option);
      });
      select.appendChild(ownGroup);
    }

    if (publicAlgorithms.length > 0) {
      const publicGroup = document.createElement("optgroup");
      publicGroup.label = "Public Algorithms";
      publicAlgorithms.forEach(algorithm => {
        const option = document.createElement("option");
        option.value = algorithm.id.toString();
        option.textContent = `${algorithm.name} (v${algorithm.version}) - by ${algorithm.ownerUsername}`;
        publicGroup.appendChild(option);
      });
      select.appendChild(publicGroup);
    }
  }

  private async handleSubmit(e: Event) {
    e.preventDefault();

    if (this.state.submitting) return;

    // Simple validation
    if (!this.state.selectedAlgorithmId) {
      this.showStatusBanner("Please select an algorithm", "error");
      return;
    }

    // Validate dataset based on mode
    if (this.state.datasetMode === "upload") {
      if (!this.selectedDatasetFile) {
        this.showStatusBanner("Please select a dataset file", "error");
        return;
      }
    } else {
      if (!this.state.selectedDatasetId) {
        this.showStatusBanner("Please select an existing dataset", "error");
        return;
      }
    }

    this.state.submitting = true;
    this.updateSubmitButton();

    try {
      const token = getToken();
      if (!token) {
        throw new UnauthorizedError();
      }

      // Get column selection as names (custom training uses names, not indices)
      const columnSelection = this.refs.columnSelector.getSelectionAsNames();

      const request: CustomTrainingRequest = {
        algorithmId: parseInt(this.state.selectedAlgorithmId),
        datasetFile: this.state.datasetMode === "upload" ? this.selectedDatasetFile! : undefined,
        datasetId: this.state.datasetMode === "existing" ? this.state.selectedDatasetId! : undefined,
        parametersFile: this.selectedParametersFile || undefined,
        basicAttributesColumns: columnSelection.attributes || undefined,
        targetColumn: columnSelection.classColumn || undefined
      };

      const result = await startCustomTraining(request, token);

      this.state.taskId = result.taskId;
      this.state.taskStatus = "PENDING";

      // Save to task store with description
      const algorithm = this.state.algorithms.find(a => a.id.toString() === this.state.selectedAlgorithmId);
      const algorithmName = algorithm?.name || 'Custom Algorithm';
      const fileName = this.selectedDatasetFile?.name || 'dataset';
      this.saveActiveTask(`${algorithmName} on ${fileName}`);

      this.updateStopButton();
      this.showStatusBanner("Training started successfully! Tracking progress...", "success");
      this.renderActiveTasksPanel();

      // Start polling after a small delay to allow backend to initialize the task
      setTimeout(() => {
        this.startPolling();
      }, 1000);

    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to start training";
      this.showStatusBanner(message, "error");
    } finally {
      this.state.submitting = false;
      this.updateSubmitButton();
    }
  }

  private updateSubmitButton() {
    const button = this.refs.submitButton;
    button.disabled = this.state.submitting;
    button.classList.toggle("loading", this.state.submitting);

    const text = button.querySelector(".btn__text") as HTMLElement | null;
    if (text) {
      text.textContent = this.state.submitting ? "Starting..." : "Start Training";
    }
  }

  private resetForm() {
    this.refs.form.reset();
    this.clearDatasetFile();
    this.clearParametersFile();
    this.state.selectedAlgorithmId = "";
    this.state.basicColumns = "";
    this.state.targetColumn = "";
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

    this.hideStatusBanner();
    this.stopPolling();
    this.updateStopButton();
  }

  private startPolling() {
    if (!this.state.taskId) return;
    this.startPollingForTask(this.state.taskId);
  }

  private startPollingForTask(taskId: string) {
    if (this.pollTimers.has(taskId)) return;

    const timer = window.setInterval(async () => {
      try {
        const token = getToken();
        if (!token) return;

        const status: TaskStatusDTO = await getTaskStatus(taskId, token);
        taskStore.updateTaskStatus(taskId, status.status);

        if (this.state.taskId === taskId) {
          this.state.taskStatus = status.status;
          this.updateStopButton();
        }

        switch (status.status) {
          case "COMPLETED":
            this.stopPollingForTask(taskId);
            this.clearActiveTask(taskId);
            if (this.state.taskId === taskId) {
              this.showStatusBanner("Training completed successfully! Check the Trainings page for results.", "success");
            }
            break;
          case "FAILED":
            const errorMsg = status.errorMessage || "Training failed";
            this.stopPollingForTask(taskId);
            this.clearActiveTask(taskId);
            if (this.state.taskId === taskId) {
              this.showStatusBanner(`Training failed: ${errorMsg}`, "error");
            }
            break;
          case "STOPPED":
            this.stopPollingForTask(taskId);
            this.clearActiveTask(taskId);
            if (this.state.taskId === taskId) {
              this.showStatusBanner("Training was stopped by the user.", "warning");
              this.state.taskId = null;
              this.state.taskStatus = null;
              this.updateStopButton();
            }
            break;
          case "RUNNING":
            if (this.state.taskId === taskId) {
              this.showStatusBanner("Training is in progress...", "info");
            }
            break;
          case "PENDING":
            if (this.state.taskId === taskId) {
              this.showStatusBanner("Training is queued...", "info");
            }
            break;
          default:
            if (this.state.taskId === taskId) {
              this.showStatusBanner(`Training status: ${status.status}`, "info");
            }
        }
        this.renderActiveTasksPanel();
      } catch (error) {
        console.error("Polling error:", error);
      }
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

  private stopPolling() {
    this.pollTimers.forEach((timer) => clearInterval(timer));
    this.pollTimers.clear();
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  private renderActiveTasksPanel() {
    const panel = this.root.querySelector<HTMLElement>('[data-active-tasks]');
    if (!panel) return;

    const activeTasks = taskStore.getActiveTasksByType('CUSTOM_TRAINING');
    if (activeTasks.length === 0) {
      panel.hidden = true;
      return;
    }

    panel.hidden = false;
    panel.innerHTML = `
      <h3>Active Custom Trainings (${activeTasks.length})</h3>
      <ul class="active-tasks-list">
        ${activeTasks.map(task => `
          <li class="active-task-item ${this.state.taskId === task.taskId ? 'active-task-item--current' : ''}"
              data-task-id="${task.taskId}">
            <span class="active-task-status active-task-status--${task.status.toLowerCase()}">${task.status}</span>
            <span class="active-task-id">${task.taskId.substring(0, 8)}...</span>
            <span class="active-task-desc">${task.description || 'Custom Training'}</span>
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
      this.showStatusBanner(`Viewing task ${taskId} - Status: ${task.status}`, "info");
      this.updateStopButton();
      this.renderActiveTasksPanel();
    }
  }

  private async handleStopTask(taskId: string) {
    try {
      const token = getToken();
      if (!token) throw new UnauthorizedError();
      this.showStatusBanner(`Stopping task ${taskId}...`, "warning");
      await stopTask(taskId, token);
      this.showStatusBanner("Stop request sent successfully.", "info");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to stop training";
      this.showStatusBanner(`Failed to stop: ${message}`, "error");
    }
  }

  private updateStopButton() {
    const isTraining = this.state.taskId && this.state.taskStatus &&
                      (this.state.taskStatus === "RUNNING" || this.state.taskStatus === "PENDING");
    this.refs.stopButton.style.display = isTraining ? 'inline-block' : 'none';
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
      this.showStatusBanner("Stopping training...", "warning");

      await stopTask(this.state.taskId, token);
      this.showStatusBanner("Stop request sent successfully. The training will be stopped shortly.", "info");

    } catch (error) {
      console.error('Failed to stop training:', error);
      const message = error instanceof Error ? error.message : "Failed to stop training";
      this.showStatusBanner(`Failed to stop training: ${message}`, "error");
    } finally {
      this.refs.stopButton.disabled = false;
    }
  }

  private showStatusBanner(message: string, tone: StatusTone) {
    this.state.statusMessage = message;
    this.state.statusTone = tone;

    const banner = this.refs.statusBanner;
    banner.className = `status-banner status-banner--${tone} status-banner--visible`;
    banner.textContent = message;
  }

  private hideStatusBanner() {
    const banner = this.refs.statusBanner;
    banner.className = "status-banner";
    this.state.statusMessage = null;
    this.state.statusTone = null;
  }

}

customElements.define("page-train-custom", PageTrainCustom);
