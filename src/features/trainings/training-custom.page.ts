import { getToken } from "../../core/auth.store";
import { UnauthorizedError } from "../../core/http";
import { fetchCustomAlgorithms } from "../algorithms/api";
import type { CustomAlgorithm } from "../algorithms/api";
import { startCustomTraining } from "./api";
import type { CustomTrainingRequest } from "./api";
import { getTaskStatus } from "../tasks/api";
import styles from "./styles/training-custom.css?raw";

type StatusTone = "info" | "success" | "error" | "warning";

type ComponentState = {
  algorithms: CustomAlgorithm[];
  algorithmsLoading: boolean;
  algorithmsError: string | null;
  selectedAlgorithmId: string;
  basicColumns: string;
  targetColumn: string;
  submitting: boolean;
  taskId: string | null;
  taskStatus: string | null;
  statusMessage: string | null;
  statusTone: StatusTone | null;
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
  basicColumnsInput: HTMLInputElement;
  targetColumnInput: HTMLInputElement;
  submitButton: HTMLButtonElement;
  resetButton: HTMLButtonElement;
  statusBanner: HTMLElement;
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
    basicColumns: "",
    targetColumn: "",
    submitting: false,
    taskId: null,
    taskStatus: null,
    statusMessage: null,
    statusTone: null
  };
  private selectedDatasetFile: File | null = null;
  private selectedParametersFile: File | null = null;
  private pollTimer: number | null = null;

  connectedCallback() {
    this.root = this.shadowRoot ?? this.attachShadow({ mode: "open" });
    this.render();
    void this.loadAlgorithms();
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

        <form class="panel form" data-ref="form" novalidate>
          <!-- Algorithm Selection -->
          <div class="field">
            <span>Custom Algorithm *</span>
            <select name="algorithm" id="algorithm" data-ref="algorithmSelect" required>
              <option value="">Choose an algorithm...</option>
            </select>
            <small>Select from your own algorithms or public algorithms from other users.</small>
          </div>

          <!-- Dataset File Upload -->
          <div class="field">
            <span>Training Dataset *</span>
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

          <!-- Feature Columns -->
          <div class="field">
            <span>Feature Columns (Optional)</span>
            <input
              type="text"
              name="basicColumns"
              id="basicColumns"
              data-ref="basicColumnsInput"
              placeholder="e.g., age,income,balance"
            >
            <small>Comma-separated list of feature columns. If empty, all columns except the last will be used.</small>
          </div>

          <!-- Target Column -->
          <div class="field">
            <span>Target Column (Optional)</span>
            <input
              type="text"
              name="targetColumn"
              id="targetColumn"
              data-ref="targetColumnInput"
              placeholder="e.g., class"
            >
            <small>The target (class) column to predict. If empty, the last column will be used.</small>
          </div>

          <div class="form__actions">
            <button type="button" class="btn ghost" data-ref="resetButton">Reset Form</button>
            <button type="submit" class="btn primary" data-ref="submitButton">
              <span class="btn__text">Start Training</span>
            </button>
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
      basicColumnsInput: query("basicColumnsInput"),
      targetColumnInput: query("targetColumnInput"),
      submitButton: query("submitButton"),
      resetButton: query("resetButton"),
      statusBanner: query("statusBanner")
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

    // Form events
    this.refs.form.addEventListener("submit", (e) => this.handleSubmit(e));
    this.refs.resetButton.addEventListener("click", () => this.resetForm());

    // State binding
    this.refs.algorithmSelect.addEventListener("change", (e) => {
      this.state.selectedAlgorithmId = (e.target as HTMLSelectElement).value;
    });

    this.refs.basicColumnsInput.addEventListener("input", (e) => {
      this.state.basicColumns = (e.target as HTMLInputElement).value;
    });

    this.refs.targetColumnInput.addEventListener("input", (e) => {
      this.state.targetColumn = (e.target as HTMLInputElement).value;
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

  private clearDatasetFile() {
    this.selectedDatasetFile = null;
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

    if (!this.selectedDatasetFile) {
      this.showStatusBanner("Please select a dataset file", "error");
      return;
    }

    this.state.submitting = true;
    this.updateSubmitButton();

    try {
      const token = getToken();
      if (!token) {
        throw new UnauthorizedError();
      }

      const request: CustomTrainingRequest = {
        algorithmId: parseInt(this.state.selectedAlgorithmId),
        datasetFile: this.selectedDatasetFile!,
        parametersFile: this.selectedParametersFile || undefined,
        basicAttributesColumns: this.state.basicColumns || undefined,
        targetColumn: this.state.targetColumn || undefined
      };

      const result = await startCustomTraining(request, token);

      this.state.taskId = result.taskId;
      this.showStatusBanner("Training started successfully! Tracking progress...", "success");
      this.startPolling();

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
    this.hideStatusBanner();
    this.stopPolling();
  }

  private startPolling() {
    if (!this.state.taskId) return;

    this.pollTimer = window.setInterval(async () => {
      if (!this.state.taskId) {
        this.stopPolling();
        return;
      }

      try {
        const token = getToken();
        if (!token) return;

        const status: TaskStatusDTO = await getTaskStatus(this.state.taskId, token);
        this.state.taskStatus = status.status;

        switch (status.status) {
          case "COMPLETED":
            this.showStatusBanner("Training completed successfully! Check the Trainings page for results.", "success");
            this.stopPolling();
            break;
          case "FAILED":
            const errorMsg = status.errorMessage || "Training failed";
            this.showStatusBanner(`Training failed: ${errorMsg}`, "error");
            this.stopPolling();
            break;
          case "RUNNING":
            this.showStatusBanner("Training is in progress...", "info");
            break;
          case "PENDING":
            this.showStatusBanner("Training is queued...", "info");
            break;
          default:
            this.showStatusBanner(`Training status: ${status.status}`, "info");
        }
      } catch (error) {
        console.error("Polling error:", error);
      }
    }, 3000); // Poll every 3 seconds
  }

  private stopPolling() {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
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
