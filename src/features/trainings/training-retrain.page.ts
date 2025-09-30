import { getToken } from "../../core/auth.store";
import { UnauthorizedError } from "../../core/http";
import { fetchAlgorithms } from "../algorithms/api";
import type { AlgorithmWeka } from "../algorithms/api";
import { startTraining, fetchRetrainOptions, fetchRetrainTrainingDetails, fetchRetrainModelDetails } from "./api";
import type {
  RetrainModelOption,
  RetrainOptions,
  RetrainTrainingDetails,
  RetrainTrainingOption
} from "./api";
import { getTaskStatus, stopTask } from "../tasks/api";
import styles from "./styles/training-retrain.css?raw";

type StatusTone = "info" | "success" | "error" | "warning";
type SourceMode = "training" | "model";

type ComponentState = {
  mode: SourceMode;
  trainings: RetrainTrainingOption[];
  models: RetrainModelOption[];
  optionsLoading: boolean;
  optionsError: string | null;
  algorithms: AlgorithmWeka[];
  algorithmsLoading: boolean;
  algorithmsError: string | null;
  selectedTrainingId: string;
  selectedModelId: string;
  details: RetrainTrainingDetails | null;
  detailsLoading: boolean;
  selectedAlgorithmId: string;
  algorithmConfigurationId: string | null;
  datasetConfigurationId: string | null;
  datasetId: string | null;
  datasetName: string | null;
  options: string;
  basicColumns: string;
  targetColumn: string;
  initialAlgorithmId: string;
  initialOptions: string;
  initialBasicColumns: string;
  initialTargetColumn: string;
  submitting: boolean;
  taskId: string | null;
  taskStatus: string | null;
  statusMessage: string | null;
  statusTone: StatusTone | null;
};

type TaskStatusDTO = {
  status: string;
  errorMessage?: string | null;
  [key: string]: unknown;
};

type Refs = {
  form: HTMLFormElement;
  datasetInput: HTMLInputElement;
  dropzone: HTMLElement;
  chooseFileBtn: HTMLButtonElement;
  clearFileBtn: HTMLButtonElement;
  fileName: HTMLElement;
  datasetCaption: HTMLElement;
  algorithmSelect: HTMLSelectElement;
  optionsInput: HTMLInputElement;
  basicColumnsInput: HTMLInputElement;
  targetColumnInput: HTMLInputElement;
  submitButton: HTMLButtonElement;
  resetButton: HTMLButtonElement;
  stopButton: HTMLButtonElement;
  statusBanner: HTMLElement;
  modeTrainingRadio: HTMLInputElement;
  modeModelRadio: HTMLInputElement;
  trainingWrapper: HTMLElement;
  modelWrapper: HTMLElement;
  trainingSelect: HTMLSelectElement;
  modelSelect: HTMLSelectElement;
};

export class PageTrainRetrain extends HTMLElement {
  private root!: ShadowRoot;
  private refs!: Refs;
  private state: ComponentState = {
    mode: "training",
    trainings: [],
    models: [],
    optionsLoading: true,
    optionsError: null,
    algorithms: [],
    algorithmsLoading: true,
    algorithmsError: null,
    selectedTrainingId: "",
    selectedModelId: "",
    details: null,
    detailsLoading: false,
    selectedAlgorithmId: "",
    algorithmConfigurationId: null,
    datasetConfigurationId: null,
    datasetId: null,
    datasetName: null,
    options: "",
    basicColumns: "",
    targetColumn: "",
    initialAlgorithmId: "",
    initialOptions: "",
    initialBasicColumns: "",
    initialTargetColumn: "",
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
    this.collectRefs();
    this.bind();
    void this.initialise();
  }

  disconnectedCallback() {
    this.stopPolling();
  }

  private render() {
    this.root.innerHTML = `
      <style>${styles}</style>
      <div class="page">
        <header class="hero">
          <div class="hero__content">
            <p class="hero__eyebrow">Retraining</p>
            <h1>Retrain an existing model</h1>
            <p class="hero__lead">
              Start from a completed training or a finalised model, reuse its dataset and algorithm configuration, and tweak only the pieces you need before launching a new run.
            </p>
          </div>
          <ul class="hero__list">
            <li>Select a previous training or model as the baseline</li>
            <li>Optionally upload a new dataset or adjust Weka options</li>
            <li>Track the new task from the Trainings overview</li>
          </ul>
        </header>

        <section class="panel">
          <form class="form" novalidate>
            <div class="status-banner" data-status hidden></div>

            <fieldset class="group">
              <legend>Source selection</legend>
              <div class="source-toggle">
                <label class="radio">
                  <input type="radio" name="retrain-source" value="training" checked />
                  <span>Training</span>
                </label>
                <label class="radio">
                  <input type="radio" name="retrain-source" value="model" />
                  <span>Model</span>
                </label>
              </div>
              <label class="field" data-source-training>
                <span>Choose training</span>
                <select id="retrainTraining">
                  <option value="" disabled selected>Loading trainings…</option>
                </select>
              </label>
              <label class="field" data-source-model>
                <span>Choose model</span>
                <select id="retrainModel">
                  <option value="" disabled selected>Select a training first</option>
                </select>
              </label>
            </fieldset>

            <fieldset class="group">
              <legend>Dataset</legend>
              <div class="dropzone" data-dropzone>
                <p class="dropzone__title" data-file-name>No file selected</p>
                <p class="dropzone__hint">Drag &amp; drop a <code>.csv</code> or <code>.arff</code> file, or</p>
                <button class="btn ghost" type="button" data-action="choose-file">Select file</button>
                <p class="dropzone__caption" data-dataset-caption></p>
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
                  <option value="" disabled selected>Select a source first</option>
                </select>
              </label>
              <label class="field">
                <span>Options (optional)</span>
                <input type="text" id="options" placeholder="e.g. -C 0.5 -M 2" autocomplete="off" />
                <small>Defaults come from the selected training. Adjust to test a variant.</small>
              </label>
            </fieldset>

            <fieldset class="group">
              <legend>Dataset configuration (optional)</legend>
              <label class="field">
                <span>Attribute columns</span>
                <input type="text" id="basicColumns" placeholder="e.g. 1,2,3" inputmode="numeric" autocomplete="off" />
                <small>Comma-separated column numbers to include. Leave empty to reuse the original selection.</small>
              </label>
              <label class="field">
                <span>Class column</span>
                <input type="text" id="targetColumn" placeholder="e.g. 4" inputmode="numeric" autocomplete="off" />
                <small>Column number representing the target class. Leave empty to reuse the original value.</small>
              </label>
            </fieldset>

            <div class="form__actions">
              <button class="btn primary" type="submit" disabled>Start retraining</button>
              <button class="btn danger" type="button" data-action="stop" style="display: none;">Stop retraining</button>
              <button class="btn ghost" type="button" data-action="reset" disabled>Reset overrides</button>
            </div>
          </form>
        </section>
      </div>
    `;
  }

  private collectRefs() {
    const form = this.root.querySelector<HTMLFormElement>("form");
    const datasetInput = this.root.querySelector<HTMLInputElement>("#dataset");
    const dropzone = this.root.querySelector<HTMLElement>("[data-dropzone]");
    const chooseFileBtn = this.root.querySelector<HTMLButtonElement>("[data-action='choose-file']");
    const clearFileBtn = this.root.querySelector<HTMLButtonElement>("[data-action='clear-file']");
    const fileName = this.root.querySelector<HTMLElement>("[data-file-name]");
    const datasetCaption = this.root.querySelector<HTMLElement>("[data-dataset-caption]");
    const algorithmSelect = this.root.querySelector<HTMLSelectElement>("#algorithm");
    const optionsInput = this.root.querySelector<HTMLInputElement>("#options");
    const basicColumnsInput = this.root.querySelector<HTMLInputElement>("#basicColumns");
    const targetColumnInput = this.root.querySelector<HTMLInputElement>("#targetColumn");
    const submitButton = this.root.querySelector<HTMLButtonElement>(".form__actions .btn.primary");
    const resetButton = this.root.querySelector<HTMLButtonElement>("[data-action='reset']");
    const stopButton = this.root.querySelector<HTMLButtonElement>("[data-action='stop']");
    const statusBanner = this.root.querySelector<HTMLElement>("[data-status]");
    const modeTrainingRadio = this.root.querySelector<HTMLInputElement>("input[name='retrain-source'][value='training']");
    const modeModelRadio = this.root.querySelector<HTMLInputElement>("input[name='retrain-source'][value='model']");
    const trainingWrapper = this.root.querySelector<HTMLElement>("[data-source-training]");
    const modelWrapper = this.root.querySelector<HTMLElement>("[data-source-model]");
    const trainingSelect = this.root.querySelector<HTMLSelectElement>("#retrainTraining");
    const modelSelect = this.root.querySelector<HTMLSelectElement>("#retrainModel");

    if (
      !form || !datasetInput || !dropzone || !chooseFileBtn || !clearFileBtn || !fileName || !datasetCaption ||
      !algorithmSelect || !optionsInput || !basicColumnsInput || !targetColumnInput ||
      !submitButton || !resetButton || !stopButton || !statusBanner || !modeTrainingRadio || !modeModelRadio ||
      !trainingWrapper || !modelWrapper || !trainingSelect || !modelSelect
    ) {
      throw new Error("Missing retrain form elements");
    }

    this.refs = {
      form,
      datasetInput,
      dropzone,
      chooseFileBtn,
      clearFileBtn,
      fileName,
      datasetCaption,
      algorithmSelect,
      optionsInput,
      basicColumnsInput,
      targetColumnInput,
      submitButton,
      resetButton,
      stopButton,
      statusBanner,
      modeTrainingRadio,
      modeModelRadio,
      trainingWrapper,
      modelWrapper,
      trainingSelect,
      modelSelect
    } as Refs;
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

    this.refs.modeTrainingRadio.addEventListener("change", () => this.setMode("training"));
    this.refs.modeModelRadio.addEventListener("change", () => this.setMode("model"));

    this.refs.trainingSelect.addEventListener("change", (event) => this.handleTrainingSelection(event));
    this.refs.modelSelect.addEventListener("change", (event) => this.handleModelSelection(event));

    this.refs.algorithmSelect.addEventListener("change", (event) => {
      this.state.selectedAlgorithmId = (event.target as HTMLSelectElement).value;
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

    this.refs.resetButton.addEventListener("click", () => this.resetOverrides());
    this.refs.stopButton.addEventListener("click", () => void this.handleStop());
    this.refs.form.addEventListener("submit", (event) => void this.handleSubmit(event));
  }

  private async initialise() {
    await Promise.all([this.loadAlgorithms(), this.loadOptions()]);
    this.updateModeUI();
    this.updateSubmitState();
  }

  private async loadAlgorithms() {
    this.state.algorithmsLoading = true;
    this.state.algorithmsError = null;
    this.renderAlgorithmOptions();

    try {
      const list = await fetchAlgorithms();
      this.state.algorithms = list;
      this.state.algorithmsError = null;
    } catch (error) {
      if (error instanceof UnauthorizedError) {
        return;
      }
      const message = error instanceof Error ? error.message : "Failed to load algorithms";
      this.state.algorithmsError = message;
      this.showStatus(message, "warning");
    } finally {
      this.state.algorithmsLoading = false;
      this.renderAlgorithmOptions();
      this.updateSubmitState();
    }
  }

  private async loadOptions() {
    this.state.optionsLoading = true;
    this.state.optionsError = null;
    this.populateTrainingOptions();
    this.populateModelOptions();
    this.updateSubmitState();

    try {
      const token = getToken() ?? undefined;
      const options: RetrainOptions = await fetchRetrainOptions(token);
      this.state.trainings = options.trainings ?? [];
      this.state.models = options.models ?? [];
      this.state.selectedTrainingId = "";
      this.state.selectedModelId = "";
      this.state.details = null;
      this.state.datasetName = null;
      this.selectedFile = null;
      this.state.mode = "training";
      this.clearStatusIfInfoOnly();
    } catch (error) {
      if (error instanceof UnauthorizedError) {
        return;
      }
      const message = error instanceof Error ? error.message : "Failed to load retrain options";
      this.state.optionsError = message;
      this.showStatus(message, "error");
    } finally {
      this.state.optionsLoading = false;
      this.syncSourceRadios();
      this.populateTrainingOptions();
      this.populateModelOptions();
      this.updateDatasetDisplay();
      this.updateModeUI();
      this.updateSubmitState();
    }
  }

  private populateTrainingOptions() {
    const select = this.refs.trainingSelect;
    select.innerHTML = "";

    if (this.state.optionsLoading) {
      select.append(new Option("Loading trainings…", "", true, true));
      select.disabled = true;
      return;
    }

    if (this.state.optionsError) {
      select.append(new Option(this.state.optionsError, "", true, true));
      select.disabled = true;
      return;
    }

    if (this.state.trainings.length === 0) {
      select.append(new Option("No trainings available", "", true, true));
      select.disabled = true;
      return;
    }

    select.append(new Option("Select a training", "", true, true));
    this.state.trainings.forEach((training, index) => {
      const sequenceLabel = `Training #${index + 1}`;
      const algorithmPart = training.algorithmName ? ` · ${training.algorithmName}` : "";
      const label = `${sequenceLabel}${algorithmPart}`;
      select.append(new Option(label, String(training.trainingId)));
    });
    select.disabled = false;
  }

  private populateModelOptions() {
    const select = this.refs.modelSelect;
    select.innerHTML = "";

    if (this.state.optionsLoading) {
      select.append(new Option("Loading models…", "", true, true));
      select.disabled = true;
      return;
    }

    if (this.state.optionsError) {
      select.append(new Option(this.state.optionsError, "", true, true));
      select.disabled = true;
      return;
    }

    if (this.state.models.length === 0) {
      select.append(new Option("No models available", "", true, true));
      select.disabled = true;
      return;
    }

    select.append(new Option("Select a model", "", true, true));
    this.state.models.forEach((model, index) => {
      const sequenceLabel = `Model #${index + 1}`;
      const descriptor = model.algorithmName ?? model.datasetName ?? model.modelName ?? "";
      const label = descriptor ? `${sequenceLabel} · ${descriptor}` : sequenceLabel;
      select.append(new Option(label, String(model.modelId)));
    });

    select.disabled = this.state.mode !== "model";
  }

  private setMode(mode: SourceMode) {
    if (this.state.mode === mode) return;
    this.state.mode = mode;
    this.state.selectedTrainingId = "";
    this.state.selectedModelId = "";
    this.state.details = null;
    this.state.datasetName = null;
    this.selectedFile = null;
    this.syncSourceRadios();
    this.updateModeUI();
    this.updateDatasetDisplay();
    this.renderAlgorithmOptions();
    this.updateSubmitState();
  }

  private syncSourceRadios() {
    if (this.refs.modeTrainingRadio) {
      this.refs.modeTrainingRadio.checked = this.state.mode === "training";
    }
    if (this.refs.modeModelRadio) {
      this.refs.modeModelRadio.checked = this.state.mode === "model";
    }
  }

  private updateModeUI() {
    this.refs.trainingWrapper.hidden = this.state.mode !== "training";
    this.refs.modelWrapper.hidden = this.state.mode !== "model";
    this.refs.trainingSelect.disabled = this.state.mode !== "training" || this.state.optionsLoading || !!this.state.optionsError;
    this.refs.modelSelect.disabled = this.state.mode !== "model" || this.state.optionsLoading || !!this.state.optionsError;
    if (this.state.mode === "training") {
      this.refs.trainingSelect.value = "";
    } else {
      this.refs.modelSelect.value = "";
    }
  }

  private handleTrainingSelection(event: Event) {
    const value = (event.target as HTMLSelectElement).value;
    this.state.selectedTrainingId = value;
    this.state.selectedModelId = "";
    this.state.details = null;
    this.state.datasetName = null;
    this.selectedFile = null;
    this.renderAlgorithmOptions();
    this.updateDatasetDisplay();
    this.updateSubmitState();

    if (!value) {
      return;
    }

    const id = Number.parseInt(value, 10);
    if (!Number.isFinite(id)) {
      this.showStatus("Invalid training id", "error");
      return;
    }

    void this.loadTrainingDetails(id);
  }

  private handleModelSelection(event: Event) {
    const value = (event.target as HTMLSelectElement).value;
    this.state.selectedModelId = value;
    this.state.selectedTrainingId = "";
    this.state.details = null;
    this.state.datasetName = null;
    this.selectedFile = null;
    this.renderAlgorithmOptions();
    this.updateDatasetDisplay();
    this.updateSubmitState();

    if (!value) {
      return;
    }

    const id = Number.parseInt(value, 10);
    if (!Number.isFinite(id)) {
      this.showStatus("Invalid model id", "error");
      return;
    }

    void this.loadModelDetails(id);
  }

  private async loadTrainingDetails(trainingId: number) {
    this.state.detailsLoading = true;
    this.showStatus(`Loading training ${trainingId}…`, "info");
    this.updateSubmitState();

    try {
      const token = getToken() ?? undefined;
      const details = await fetchRetrainTrainingDetails(trainingId, token);
      this.clearStatusIfInfoOnly();
      this.applyDetails(details);
      this.showStatus(`Loaded configuration from training ${trainingId}.`, "info");
    } catch (error) {
      if (error instanceof UnauthorizedError) {
        return;
      }
      const message = error instanceof Error ? error.message : "Failed to load training details";
      this.showStatus(message, "error");
    } finally {
      this.state.detailsLoading = false;
      this.updateSubmitState();
    }
  }

  private async loadModelDetails(modelId: number) {
    this.state.detailsLoading = true;
    this.showStatus(`Loading model ${modelId}…`, "info");
    this.updateSubmitState();

    try {
      const token = getToken() ?? undefined;
      const details = await fetchRetrainModelDetails(modelId, token);
      this.clearStatusIfInfoOnly();
      this.applyDetails(details);
      this.showStatus(`Loaded configuration from model ${modelId}.`, "info");
    } catch (error) {
      if (error instanceof UnauthorizedError) {
        return;
      }
      const message = error instanceof Error ? error.message : "Failed to load model details";
      this.showStatus(message, "error");
    } finally {
      this.state.detailsLoading = false;
      this.updateSubmitState();
    }
  }

  private applyDetails(details: RetrainTrainingDetails) {
    this.state.details = details;
    this.state.datasetConfigurationId = details.datasetConfigurationId != null ? String(details.datasetConfigurationId) : null;
    this.state.datasetId = details.datasetId != null ? String(details.datasetId) : null;
    this.state.datasetName = details.datasetName;

    this.state.initialAlgorithmId = details.algorithmId != null ? String(details.algorithmId) : "";
    this.state.selectedAlgorithmId = this.state.initialAlgorithmId;
    this.state.algorithmConfigurationId = details.algorithmConfigurationId != null ? String(details.algorithmConfigurationId) : null;

    this.state.initialOptions = details.algorithmOptions ?? "";
    this.state.options = this.state.initialOptions;
    this.refs.optionsInput.value = this.state.options;

    this.state.initialBasicColumns = details.basicAttributesColumns ?? "";
    this.state.basicColumns = this.state.initialBasicColumns;
    this.refs.basicColumnsInput.value = this.state.basicColumns;

    this.state.initialTargetColumn = details.targetColumn ?? "";
    this.state.targetColumn = this.state.initialTargetColumn;
    this.refs.targetColumnInput.value = this.state.targetColumn;

    this.setFile(null);
    this.renderAlgorithmOptions();
    this.updateDatasetDisplay();
    this.updateSubmitState();
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
    if (!file) {
      this.refs.datasetInput.value = "";
    }
    this.refs.clearFileBtn.disabled = !file || this.state.submitting;
    this.updateDatasetDisplay();
    this.updateSubmitState();
  }

  private updateDatasetDisplay() {
    if (this.selectedFile) {
      this.refs.fileName.textContent = this.selectedFile.name;
      this.refs.datasetCaption.textContent = "Uploading new dataset";
      return;
    }

    if (this.state.datasetName) {
      this.refs.fileName.textContent = "Using existing dataset";
      this.refs.datasetCaption.textContent = this.state.datasetName;
    } else {
      this.refs.fileName.textContent = "No file selected";
      this.refs.datasetCaption.textContent = "";
    }
  }

  private renderAlgorithmOptions() {
    const select = this.refs.algorithmSelect;
    select.innerHTML = "";

    if (!this.state.details) {
      select.append(new Option("Select a source first", "", true, true));
      select.disabled = true;
      return;
    }

    if (this.state.algorithmsLoading) {
      select.append(new Option("Loading algorithms…", "", true, true));
      select.disabled = true;
      return;
    }

    if (this.state.algorithmsError) {
      select.append(new Option(this.state.algorithmsError, "", true, true));
      select.disabled = true;
      return;
    }

    const baseAlgorithmId = this.state.details.algorithmId != null ? String(this.state.details.algorithmId) : null;

    if (!baseAlgorithmId) {
      select.append(new Option("Algorithm managed by custom workflow", "", true, true));
      select.disabled = true;
      this.state.selectedAlgorithmId = "";
      return;
    }

    const baseLabel = this.state.details.algorithmName ?? `Algorithm ${baseAlgorithmId}`;
    const originalOption = new Option(`Original – ${baseLabel}`, baseAlgorithmId);
    select.append(originalOption);

    for (const algorithm of this.state.algorithms) {
      const value = String(algorithm.id);
      if (value === baseAlgorithmId) continue;
      select.append(new Option(algorithm.name, value));
    }

    if (this.state.selectedAlgorithmId) {
      select.value = this.state.selectedAlgorithmId;
    } else {
      select.value = baseAlgorithmId;
      this.state.selectedAlgorithmId = baseAlgorithmId;
    }

    select.disabled = this.state.submitting;
  }

  private resetOverrides() {
    this.setFile(null);
    if (!this.state.details) {
      this.state.options = "";
      this.state.basicColumns = "";
      this.state.targetColumn = "";
      this.refs.optionsInput.value = "";
      this.refs.basicColumnsInput.value = "";
      this.refs.targetColumnInput.value = "";
    } else {
      this.state.options = this.state.initialOptions;
      this.state.basicColumns = this.state.initialBasicColumns;
      this.state.targetColumn = this.state.initialTargetColumn;
      this.state.selectedAlgorithmId = this.state.initialAlgorithmId;
      this.refs.optionsInput.value = this.state.options;
      this.refs.basicColumnsInput.value = this.state.basicColumns;
      this.refs.targetColumnInput.value = this.state.targetColumn;
      this.renderAlgorithmOptions();
    }

    this.updateSubmitState();
  }

  private canEditAlgorithm(): boolean {
    return Boolean(this.state.details && this.state.details.algorithmId !== null);
  }

  private canSubmit(): boolean {
    if (this.state.submitting || this.state.detailsLoading) return false;

    const sourceId = this.state.mode === "training" ? this.state.selectedTrainingId : this.state.selectedModelId;
    if (!sourceId) return false;
    if (!this.state.details) return false;

    const hasDataset = Boolean(this.selectedFile || this.state.details.datasetConfigurationId || this.state.details.datasetId);
    if (!hasDataset) return false;

    return true;
  }

  private updateSubmitState() {
    const canSubmit = this.canSubmit();
    this.refs.submitButton.disabled = !canSubmit;
    this.refs.submitButton.textContent = this.state.submitting ? "Starting…" : "Start retraining";

    this.refs.resetButton.disabled = this.state.submitting || !this.state.details;
    this.refs.chooseFileBtn.disabled = this.state.submitting;
    this.refs.clearFileBtn.disabled = !this.selectedFile || this.state.submitting;

    this.refs.basicColumnsInput.disabled = this.state.submitting || !this.state.details;
    this.refs.targetColumnInput.disabled = this.state.submitting || !this.state.details;
    this.refs.optionsInput.disabled = this.state.submitting || !this.canEditAlgorithm();

    this.refs.trainingSelect.disabled = this.state.mode !== "training" || this.state.optionsLoading || !!this.state.optionsError;
    this.refs.modelSelect.disabled = this.state.mode !== "model" || this.state.optionsLoading || !!this.state.optionsError;
    this.refs.algorithmSelect.disabled = this.state.submitting || !this.canEditAlgorithm();
  }

  private async handleSubmit(event: Event) {
    event.preventDefault();

    if (!this.canSubmit() || !this.state.details) {
      this.showStatus("Select a source and ensure configuration is loaded before starting.", "error");
      return;
    }

    const sourceId = this.state.mode === "training" ? this.state.selectedTrainingId : this.state.selectedModelId;
    if (!sourceId) {
      this.showStatus("Please choose a training or model.", "error");
      return;
    }

    const formData = new FormData();

    if (this.state.mode === "training") {
      formData.append("trainingId", sourceId);
    } else {
      formData.append("modelId", sourceId);
    }

    if (this.selectedFile) {
      formData.append("file", this.selectedFile);
    } else if (this.state.datasetConfigurationId) {
      formData.append("datasetConfigurationId", this.state.datasetConfigurationId);
    } else if (this.state.datasetId) {
      formData.append("datasetId", this.state.datasetId);
    }

    const trimmedOptions = this.state.options.trim();
    const optionsChanged = trimmedOptions !== (this.state.initialOptions ?? "");
    if (trimmedOptions || optionsChanged) {
      formData.append("options", trimmedOptions);
    }

    const trimmedBasic = this.state.basicColumns.trim();
    const basicChanged = trimmedBasic !== (this.state.initialBasicColumns ?? "");
    if (basicChanged || trimmedBasic === "") {
      if (basicChanged || this.state.initialBasicColumns !== "") {
        formData.append("basicCharacteristicsColumns", trimmedBasic);
      }
    }

    const trimmedTarget = this.state.targetColumn.trim();
    const targetChanged = trimmedTarget !== (this.state.initialTargetColumn ?? "");
    if (targetChanged || trimmedTarget === "") {
      if (targetChanged || this.state.initialTargetColumn !== "") {
        formData.append("targetClassColumn", trimmedTarget);
      }
    }

    const selectedAlgorithmId = this.state.selectedAlgorithmId;
    const initialAlgorithmId = this.state.initialAlgorithmId;
    if (this.canEditAlgorithm()) {
      if (selectedAlgorithmId && (!initialAlgorithmId || selectedAlgorithmId !== initialAlgorithmId)) {
        formData.append("algorithmId", selectedAlgorithmId);
      } else if (this.state.algorithmConfigurationId) {
        formData.append("algorithmConfigurationId", this.state.algorithmConfigurationId);
      }
    }

    this.stopPolling();
    this.setSubmitting(true);
    this.showStatus("Submitting retrain request…", "info");

    try {
      const token = getToken() ?? undefined;
      const response = await startTraining(formData, token);
      const taskId = this.extractTaskId(response);
      this.state.taskId = taskId;
      this.state.taskStatus = "PENDING";
      this.updateStopButton(); // Make sure stop button appears
      this.showStatus(`Retraining task ${taskId} started. Monitoring status…`, "info");

      // Start polling after a small delay to allow backend to initialize the task
      setTimeout(() => {
        this.beginPolling(taskId);
      }, 1000);
    } catch (error) {
      if (error instanceof UnauthorizedError) {
        return;
      }
      const message = error instanceof Error ? error.message : "Retraining failed";
      this.showStatus(message, "error");
    } finally {
      this.setSubmitting(false);
      this.updateSubmitState();
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
    throw new Error("Retraining started but task id was not returned by the server.");
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
        this.showStatus("Retraining completed successfully. Review it in the Trainings page.", "success");
        this.stopPolling();
        this.state.taskId = null;
        this.state.taskStatus = null;
        this.updateStopButton();
        this.resetOverrides();
      } else if (status === "FAILED") {
        const extra = data.errorMessage ? ` Reason: ${data.errorMessage}` : "";
        this.showStatus(`Retraining failed.${extra}`, "error");
        this.stopPolling();
        this.state.taskId = null;
        this.state.taskStatus = null;
        this.updateStopButton();
      } else if (status === "STOPPED") {
        this.showStatus("Retraining was stopped by the user.", "warning");
        this.stopPolling();
        this.state.taskId = null;
        this.state.taskStatus = null;
        this.updateStopButton();
      } else {
        this.showStatus(`Retraining task ${taskId} is ${status.toLowerCase()}.`, "info");
      }
    } catch (error) {
      if (error instanceof UnauthorizedError) {
        return;
      }
      const message = error instanceof Error ? error.message : "Cannot fetch task status";
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
    const isRetraining = this.state.taskId && this.state.taskStatus &&
                        (this.state.taskStatus === "RUNNING" || this.state.taskStatus === "PENDING");
    this.refs.stopButton.style.display = isRetraining ? 'inline-block' : 'none';
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
      this.showStatus("Stopping retraining...", "warning");

      await stopTask(this.state.taskId, token);
      this.showStatus("Stop request sent successfully. The retraining will be stopped shortly.", "info");

    } catch (error) {
      console.error('Failed to stop retraining:', error);
      const message = error instanceof Error ? error.message : "Failed to stop retraining";
      this.showStatus(`Failed to stop retraining: ${message}`, "error");
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
}

customElements.define("page-train-retrain", PageTrainRetrain);
