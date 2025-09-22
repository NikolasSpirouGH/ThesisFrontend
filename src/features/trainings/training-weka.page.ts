import { getToken } from "../../core/auth.store";
import { UnauthorizedError } from "../../core/http";
import { fetchAlgorithms } from "../algorithms/api";
import type { AlgorithmWeka } from "../algorithms/api";
import { startTraining } from "./api";
import { getTaskStatus } from "../tasks/api";
import styles from "./styles/training-weka.css?raw";

type StatusTone = "info" | "success" | "error" | "warning";

type ComponentState = {
  algorithms: AlgorithmWeka[];
  algorithmsLoading: boolean;
  algorithmsError: string | null;
  selectedAlgorithmId: string;
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
  optionsInput: HTMLInputElement;
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

export class PageTrainWeka extends HTMLElement {
  private root!: ShadowRoot;
  private refs!: Refs;
  private state: ComponentState = {
    algorithms: [],
    algorithmsLoading: true,
    algorithmsError: null,
    selectedAlgorithmId: "",
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
              <label class="field">
                <span>Options (optional)</span>
                <input type="text" id="options" placeholder="e.g. -C 0.5 -M 2" autocomplete="off" />
                <small>Provide standard Weka flags. Leave blank to use the algorithm defaults.</small>
              </label>
            </fieldset>

            <fieldset class="group">
              <legend>Dataset configuration (optional)</legend>
              <label class="field">
                <span>Attribute columns</span>
                <input type="text" id="basicColumns" placeholder="e.g. 1,2,3" inputmode="numeric" autocomplete="off" />
                <small>Comma-separated column numbers to include during training.</small>
              </label>
              <label class="field">
                <span>Class column</span>
                <input type="text" id="targetColumn" placeholder="e.g. 4" inputmode="numeric" autocomplete="off" />
                <small>Column number representing the target class. Leave empty to use the dataset default.</small>
              </label>
            </fieldset>

            <div class="form__actions">
              <button class="btn primary" type="submit" disabled>Start training</button>
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
    const optionsInput = this.root.querySelector<HTMLInputElement>("#options");
    const basicColumnsInput = this.root.querySelector<HTMLInputElement>("#basicColumns");
    const targetColumnInput = this.root.querySelector<HTMLInputElement>("#targetColumn");
    const submitButton = this.root.querySelector<HTMLButtonElement>(".form__actions .btn.primary");
    const resetButton = this.root.querySelector<HTMLButtonElement>("[data-action='reset']");
    const statusBanner = this.root.querySelector<HTMLElement>("[data-status]");

    if (
      !form || !datasetInput || !dropzone || !chooseFileBtn || !clearFileBtn || !fileName ||
      !algorithmSelect || !optionsInput || !basicColumnsInput || !targetColumnInput ||
      !submitButton || !resetButton || !statusBanner
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
      optionsInput,
      basicColumnsInput,
      targetColumnInput,
      submitButton,
      resetButton,
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
    });

    this.refs.optionsInput.addEventListener("input", (event) => {
      this.state.options = (event.target as HTMLInputElement).value;
    });
    this.refs.basicColumnsInput.addEventListener("input", (event) => {
      this.state.basicColumns = (event.target as HTMLInputElement).value;
    });
    this.refs.targetColumnInput.addEventListener("input", (event) => {
      this.state.targetColumn = (event.target as HTMLInputElement).value;
    });

    this.refs.resetButton.addEventListener("click", () => this.resetForm(true));
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
    this.refs.basicColumnsInput.disabled = this.state.submitting;
    this.refs.targetColumnInput.disabled = this.state.submitting;
    this.refs.optionsInput.disabled = this.state.submitting;
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

    const basicRaw = (this.state.basicColumns || this.refs.basicColumnsInput.value).trim();
    const basicColumns = basicRaw.replace(/\s+/g, "");
    if (basicColumns && !/^\d+(,\d+)*$/.test(basicColumns)) {
      this.showStatus("Attributes must be comma-separated numbers (e.g. 1,2,3).", "error");
      return;
    }

    const targetRaw = (this.state.targetColumn || this.refs.targetColumnInput.value).trim();
    const targetColumn = targetRaw.replace(/\s+/g, "");
    if (targetColumn && !/^\d+$/.test(targetColumn)) {
      this.showStatus("Class column must be a numeric value (e.g. 4).", "error");
      return;
    }

    const optionsValue = (this.state.options || this.refs.optionsInput.value).trim();
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
    this.refs.basicColumnsInput.value = basicColumns;
    this.refs.targetColumnInput.value = targetColumn;
    this.refs.optionsInput.value = optionsValue;

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
      this.showStatus(`Training task ${taskId} started. Monitoring status…`, "info");
      this.beginPolling(taskId);
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

  private setSubmitting(isSubmitting: boolean) {
    this.state.submitting = isSubmitting;
    this.refs.form.classList.toggle("form--submitting", isSubmitting);
    this.updateSubmitState();
  }

  private resetForm(clearStatus: boolean) {
    this.refs.form.reset();
    this.setFile(null);
    this.state.selectedAlgorithmId = "";
    this.state.options = "";
    this.state.basicColumns = "";
    this.state.targetColumn = "";
    this.state.taskId = null;
    this.state.taskStatus = null;

    if (this.state.algorithms.length > 0) {
      this.populateAlgorithms(this.state.algorithms);
    }

    if (clearStatus) {
      this.state.statusMessage = null;
      this.state.statusTone = null;
      this.refreshStatusBanner();
    }

    this.updateSubmitState();
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
