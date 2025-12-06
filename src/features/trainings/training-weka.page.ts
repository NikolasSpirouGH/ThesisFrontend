import { getToken } from "../../core/auth.store";
import { UnauthorizedError } from "../../core/http";
import { fetchAlgorithms, fetchAlgorithmWithOptions } from "../algorithms/api";
import type { AlgorithmWeka } from "../algorithms/api";
import { startTraining, parseDatasetColumns } from "./api";
import { getTaskStatus, stopTask } from "../tasks/api";
import styles from "./styles/training-weka.css?raw";
import "./components/algorithm-options-configurator";
import type { AlgorithmOptionsConfigurator } from "./components/algorithm-options-configurator";
import "./components/dataset-column-selector";
import type { DatasetColumnSelector } from "./components/dataset-column-selector";

type StatusTone = "info" | "success" | "error" | "warning";

type ComponentState = {
  algorithms: AlgorithmWeka[];
  algorithmsLoading: boolean;
  algorithmsError: string | null;
  selectedAlgorithmId: string;
  selectedAlgorithm: AlgorithmWeka | null;
  optionsLoading: boolean;
  columnsLoading: boolean;
  options: string;
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
  dropzone: HTMLElement;
  chooseFileBtn: HTMLButtonElement;
  clearFileBtn: HTMLButtonElement;
  fileName: HTMLElement;
  algorithmSelect: HTMLSelectElement;
  optionsConfigurator: AlgorithmOptionsConfigurator;
  columnSelector: DatasetColumnSelector;
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

export class PageTrainWeka extends HTMLElement {
  private root!: ShadowRoot;
  private refs!: Refs;
  private state: ComponentState = {
    algorithms: [],
    algorithmsLoading: true,
    algorithmsError: null,
    selectedAlgorithmId: "",
    selectedAlgorithm: null,
    optionsLoading: false,
    columnsLoading: false,
    options: "",
    basicColumns: "",
    targetColumn: "",
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
            <h1>Launch a Weka training</h1>
            <p class="hero__lead">
              Upload a dataset, choose one of the predefined Weka algorithms, and start an asynchronous training task.
              Monitor its progress from the Trainings overview once it launches.
            </p>
          </div>
          <ul class="hero__list">
            <li>Accepts CSV or ARFF datasets</li>
            <li>Use Weka CLI flags in the options field</li>
            <li>Optional numeric columns let you fine-tune inputs</li>
          </ul>
        </header>

        <section class="panel">
          <form class="form" novalidate>
            <div class="status-banner" data-status hidden></div>

            <fieldset class="group">
              <legend>Dataset</legend>
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

            <fieldset class="group">
              <legend>Algorithm</legend>
              <label class="field">
                <span>Algorithm</span>
                <select id="algorithm" required>
                  <option value="" disabled selected>Loading algorithms…</option>
                </select>
              </label>
              <div class="field">
                <span>Algorithm Options</span>
                <algorithm-options-configurator data-ref="optionsConfigurator"></algorithm-options-configurator>
                <small>Configure algorithm parameters. Default values are pre-filled.</small>
              </div>
            </fieldset>

            <fieldset class="group">
              <legend>Dataset Column Selection</legend>
              <dataset-column-selector data-ref="columnSelector"></dataset-column-selector>
            </fieldset>

            <div class="form__actions">
              <button class="btn primary" type="submit" disabled>Start training</button>
              <button class="btn danger" type="button" data-action="stop" style="display: none;">Stop training</button>
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
    const algorithmSelect = this.root.querySelector<HTMLSelectElement>("#algorithm");
    const optionsConfigurator = this.root.querySelector<AlgorithmOptionsConfigurator>("[data-ref='optionsConfigurator']");
    const columnSelector = this.root.querySelector<DatasetColumnSelector>("[data-ref='columnSelector']");
    const submitButton = this.root.querySelector<HTMLButtonElement>(".form__actions .btn.primary");
    const resetButton = this.root.querySelector<HTMLButtonElement>("[data-action='reset']");
    const stopButton = this.root.querySelector<HTMLButtonElement>("[data-action='stop']");
    const statusBanner = this.root.querySelector<HTMLElement>("[data-status]");

    if (
      !form || !datasetInput || !dropzone || !chooseFileBtn || !clearFileBtn || !fileName ||
      !algorithmSelect || !optionsConfigurator || !columnSelector ||
      !submitButton || !resetButton || !stopButton || !statusBanner
    ) {
      throw new Error("Missing training form elements");
    }

    this.refs = {
      form,
      datasetInput,
      dropzone,
      chooseFileBtn,
      clearFileBtn,
      fileName,
      algorithmSelect,
      optionsConfigurator,
      columnSelector,
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

    this.refs.algorithmSelect.addEventListener("change", (event) => {
      const value = (event.target as HTMLSelectElement).value;
      this.state.selectedAlgorithmId = value;
      this.updateSubmitState();
      if (value) {
        void this.loadAlgorithmOptions(parseInt(value));
      }
    });

    this.refs.resetButton.addEventListener("click", () => this.resetForm(true));
    this.refs.stopButton.addEventListener("click", () => void this.handleStop());
    this.refs.form.addEventListener("submit", (event) => void this.handleSubmit(event));
  }

  private async loadAlgorithms() {
    this.state.algorithmsLoading = true;
    this.state.algorithmsError = null;
    this.populateAlgorithmsPlaceholder("Loading algorithms…", true);
    this.updateSubmitState();

    try {
      const algorithms = await fetchAlgorithms();
      this.state.algorithms = algorithms;
      this.state.algorithmsLoading = false;
      this.state.algorithmsError = null;
      this.populateAlgorithms(algorithms);

      if (algorithms.length === 0) {
        this.showStatus("No algorithms are available yet. Create one or contact an administrator.", "warning");
      } else {
        this.clearStatusIfInfoOnly();
      }
    } catch (error) {
      if (error instanceof UnauthorizedError) {
        return;
      }
      const message = error instanceof Error ? error.message : "Failed to load algorithms";
      this.state.algorithmsLoading = false;
      this.state.algorithmsError = message;
      this.populateAlgorithmsPlaceholder("Failed to load algorithms", false);
      this.showStatus(message, "error");
    } finally {
      this.updateSubmitState();
    }
  }

  private async loadAlgorithmOptions(algorithmId: number) {
    this.state.optionsLoading = true;

    try {
      const algorithm = await fetchAlgorithmWithOptions(algorithmId);
      this.state.selectedAlgorithm = algorithm;

      if (algorithm.options && algorithm.options.length > 0) {
        this.refs.optionsConfigurator.setOptions(algorithm.options);
      } else {
        this.refs.optionsConfigurator.setOptions([]);
      }
    } catch (error) {
      if (error instanceof UnauthorizedError) {
        return;
      }
      const message = error instanceof Error ? error.message : "Failed to load algorithm options";
      this.showStatus(message, "warning");
      this.refs.optionsConfigurator.setOptions([]);
    } finally {
      this.state.optionsLoading = false;
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
        this.showStatus("No columns found in dataset", "warning");
      }
    } catch (error) {
      if (error instanceof UnauthorizedError) {
        return;
      }
      const message = error instanceof Error ? error.message : "Failed to parse dataset columns";
      this.showStatus(message, "warning");
      this.refs.columnSelector.setColumns([]);
    } finally {
      this.state.columnsLoading = false;
    }
  }

  private populateAlgorithms(algorithms: AlgorithmWeka[]) {
    const select = this.refs.algorithmSelect;
    const previous = this.state.selectedAlgorithmId;

    const options = [
      '<option value="" disabled>Select an algorithm</option>',
      ...algorithms.map((algorithm) => `<option value="${algorithm.id}">${this.escapeHtml(algorithm.name)}</option>`)
    ];

    select.innerHTML = options.join("");

    if (previous && algorithms.some((item) => String(item.id) === previous)) {
      select.value = previous;
    } else {
      select.selectedIndex = 0;
      this.state.selectedAlgorithmId = "";
    }

    select.disabled = this.state.algorithmsLoading || !!this.state.algorithmsError;
  }

  private populateAlgorithmsPlaceholder(label: string, loading: boolean) {
    const select = this.refs.algorithmSelect;
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

    if (file) {
      void this.loadDatasetColumns(file);
    } else {
      this.refs.columnSelector.setColumns([]);
    }

    this.updateSubmitState();
  }

  private updateSubmitState() {
    const canSubmit = Boolean(
      this.selectedFile &&
      this.state.selectedAlgorithmId &&
      !this.state.submitting &&
      !this.state.algorithmsLoading &&
      !this.state.algorithmsError
    );

    this.refs.submitButton.disabled = !canSubmit;
    this.refs.submitButton.textContent = this.state.submitting ? "Starting…" : "Start training";

    this.refs.algorithmSelect.disabled = this.state.algorithmsLoading || !!this.state.algorithmsError || this.state.submitting;
    this.refs.chooseFileBtn.disabled = this.state.submitting;
    this.refs.resetButton.disabled = this.state.submitting;
    this.refs.clearFileBtn.disabled = !this.selectedFile || this.state.submitting;
  }

  private async handleSubmit(event: Event) {
    event.preventDefault();

    if (!this.selectedFile) {
      this.showStatus("Please select a dataset file before starting the training.", "error");
      return;
    }

    const algorithmId = this.state.selectedAlgorithmId || this.refs.algorithmSelect.value;
    if (!algorithmId) {
      this.showStatus("Select an algorithm to continue.", "error");
      return;
    }

    if (!/^\d+$/.test(algorithmId)) {
      this.showStatus("Algorithm id must be numeric.", "error");
      return;
    }

    // Get column selection from selector
    const columnSelection = this.refs.columnSelector.getSelectionAsStrings();
    const basicColumns = columnSelection.attributes;
    const targetColumn = columnSelection.classColumn;

    const optionsValue = this.refs.optionsConfigurator.getCliString().trim();
    const formData = new FormData();
    formData.append("file", this.selectedFile);
    formData.append("algorithmId", algorithmId);
    formData.append("options", optionsValue);

    if (basicColumns) {
      formData.append("basicCharacteristicsColumns", basicColumns);
    }
    if (targetColumn) {
      formData.append("targetClassColumn", targetColumn);
    }

    this.state.options = optionsValue;
    this.state.basicColumns = basicColumns;
    this.state.targetColumn = targetColumn;

    this.state.taskId = null;
    this.state.taskStatus = null;
    this.stopPolling();
    this.setSubmitting(true);
    this.showStatus("Uploading dataset and starting training…", "info");

    try {
      const token = getToken() ?? undefined;
      const response = await startTraining(formData, token);
      const taskId = this.extractTaskId(response);
      this.state.taskId = taskId;
      this.state.taskStatus = "PENDING";
      this.updateStopButton(); // Make sure stop button appears
      this.showStatus(`Training task ${taskId} started. Monitoring status…`, "info");

      // Start polling after a small delay to allow backend to initialize the task
      setTimeout(() => {
        this.beginPolling(taskId);
      }, 1000);
    } catch (error) {
      if (error instanceof UnauthorizedError) {
        return;
      }
      const message = error instanceof Error ? error.message : "Training failed";
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
    throw new Error("Training started but task id was not returned by the server.");
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
        this.showStatus(`Training completed successfully. Check the Trainings page to review the run.`, "success");
        this.stopPolling();
        this.resetForm(false);
      } else if (status === "FAILED") {
        const extra = data.errorMessage ? ` Reason: ${data.errorMessage}` : "";
        this.showStatus(`Training failed.${extra}`, "error");
        this.stopPolling();
      } else if (status === "STOPPED") {
        this.showStatus("Training was stopped by the user.", "warning");
        this.stopPolling();
        this.state.taskId = null;
        this.state.taskStatus = null;
        this.updateStopButton();
      } else {
        this.showStatus(`Training task ${taskId} is ${status.toLowerCase()}.`, "info");
      }
    } catch (error) {
      if (error instanceof UnauthorizedError) {
        return;
      }
      const message = error instanceof Error ? error.message : "Cannot fetch training status";
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
      this.showStatus("Stopping training...", "warning");

      await stopTask(this.state.taskId, token);
      this.showStatus("Stop request sent successfully. The training will be stopped shortly.", "info");

    } catch (error) {
      console.error('Failed to stop training:', error);
      const message = error instanceof Error ? error.message : "Failed to stop training";
      this.showStatus(`Failed to stop training: ${message}`, "error");
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

  private resetForm(clearStatus: boolean) {
    this.refs.form.reset();
    this.setFile(null);
    this.state.selectedAlgorithmId = "";
    this.state.selectedAlgorithm = null;
    this.state.options = "";
    this.state.basicColumns = "";
    this.state.targetColumn = "";
    this.state.taskId = null;
    this.state.taskStatus = null;

    // Reset components
    this.refs.optionsConfigurator.setOptions([]);
    this.refs.columnSelector.setColumns([]);

    if (this.state.algorithms.length > 0) {
      this.populateAlgorithms(this.state.algorithms);
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

customElements.define("page-train-weka", PageTrainWeka);
