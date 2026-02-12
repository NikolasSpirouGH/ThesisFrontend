import { getToken, getCurrentUsername } from "../../core/auth.store";
import { UnauthorizedError } from "../../core/http";
import { taskStore } from "../../core/task.store";
import type { TaskType } from "../../core/task.store";
import { fetchAlgorithms, fetchAlgorithmWithOptions } from "../algorithms/api";
import type { AlgorithmWeka } from "../algorithms/api";
import { startTraining, startCustomRetrain, fetchRetrainOptions, fetchRetrainTrainingDetails, fetchRetrainModelDetails, parseDatasetColumns } from "./api";
import type {
  RetrainModelOption,
  RetrainOptions,
  RetrainTrainingDetails,
  RetrainTrainingOption
} from "./api";
import { fetchDatasets, fetchDatasetColumns } from "../datasets/api";
import type { DatasetDTO } from "../datasets/api";
import { getTaskStatus, stopTask } from "../tasks/api";
import styles from "./styles/training-retrain.css?raw";
import "./components/algorithm-options-configurator";
import type { AlgorithmOptionsConfigurator } from "./components/algorithm-options-configurator";
import "./components/dataset-column-selector";
import type { DatasetColumnSelector } from "./components/dataset-column-selector";

type StatusTone = "info" | "success" | "error" | "warning";
type SourceMode = "training" | "model";
type TrainingType = "PREDEFINED" | "CUSTOM";
type DatasetMode = "original" | "upload" | "existing";

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
  selectedAlgorithm: AlgorithmWeka | null;
  algorithmConfigurationId: string | null;
  datasetConfigurationId: string | null;
  datasetId: string | null;
  datasetName: string | null;
  algorithmOptionsLoading: boolean;
  columnsLoading: boolean;
  initialAlgorithmId: string;
  submitting: boolean;
  taskId: string | null;
  taskStatus: string | null;
  statusMessage: string | null;
  statusTone: StatusTone | null;
  trainingType: TrainingType | null;  // Track if selected source is Weka or Custom
  // Dataset mode state
  datasetMode: DatasetMode;
  existingDatasets: DatasetDTO[];
  datasetsLoading: boolean;
  selectedExistingDatasetId: number | null;
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
  optionsConfigurator: AlgorithmOptionsConfigurator;
  columnSelector: DatasetColumnSelector;
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
  algorithmFieldset: HTMLFieldSetElement;
  paramsFieldset: HTMLFieldSetElement;
  paramsInput: HTMLInputElement;
  paramsFileName: HTMLElement;
  chooseParamsBtn: HTMLButtonElement;
  clearParamsBtn: HTMLButtonElement;
  // Dataset mode refs
  datasetModeOriginal: HTMLInputElement;
  datasetModeUpload: HTMLInputElement;
  datasetModeExisting: HTMLInputElement;
  originalSection: HTMLElement;
  uploadSection: HTMLElement;
  existingSection: HTMLElement;
  datasetSelect: HTMLSelectElement;
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
    selectedAlgorithm: null,
    algorithmConfigurationId: null,
    datasetConfigurationId: null,
    datasetId: null,
    datasetName: null,
    algorithmOptionsLoading: false,
    columnsLoading: false,
    initialAlgorithmId: "",
    submitting: false,
    taskId: null,
    taskStatus: null,
    statusMessage: null,
    statusTone: null,
    trainingType: null,
    // Dataset mode state
    datasetMode: "original",
    existingDatasets: [],
    datasetsLoading: false,
    selectedExistingDatasetId: null
  };
  private selectedFile: File | null = null;
  private selectedParamsFile: File | null = null;
  private pollTimers: Map<string, number> = new Map();
  private storeUnsubscribe: (() => void) | null = null;

  connectedCallback() {
    this.root = this.shadowRoot ?? this.attachShadow({ mode: "open" });
    this.render();
    this.collectRefs();
    this.bind();
    void this.initialise();
    this.restoreActiveTasks();

    this.storeUnsubscribe = taskStore.subscribe(() => this.renderActiveTasksPanel());
  }

  disconnectedCallback() {
    if (this.storeUnsubscribe) {
      this.storeUnsubscribe();
    }
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

        <section class="active-tasks-panel" data-active-tasks hidden></section>

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
              <div class="dataset-mode-toggle">
                <label class="dataset-mode-option">
                  <input type="radio" name="datasetMode" value="original" checked data-ref="datasetModeOriginal" />
                  <span>Use original dataset</span>
                </label>
                <label class="dataset-mode-option">
                  <input type="radio" name="datasetMode" value="upload" data-ref="datasetModeUpload" />
                  <span>Upload new file</span>
                </label>
                <label class="dataset-mode-option">
                  <input type="radio" name="datasetMode" value="existing" data-ref="datasetModeExisting" />
                  <span>Select existing dataset</span>
                </label>
              </div>

              <!-- Original dataset section -->
              <div data-section="original" data-ref="originalSection">
                <div class="original-dataset-info">
                  <p class="original-dataset-name" data-dataset-caption>Select a training/model first</p>
                </div>
              </div>

              <!-- Upload section -->
              <div data-section="upload" data-ref="uploadSection" hidden>
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
              <div data-section="existing" data-ref="existingSection" hidden>
                <label class="field">
                  <span>Select Dataset</span>
                  <select data-ref="datasetSelect">
                    <option value="">Select a dataset...</option>
                  </select>
                </label>
              </div>
            </fieldset>

            <fieldset class="group" data-fieldset-algorithm hidden>
              <legend>Algorithm (Weka)</legend>
              <label class="field">
                <span>Algorithm</span>
                <select id="algorithm" required>
                  <option value="" disabled selected>Select a source first</option>
                </select>
              </label>
              <div class="field">
                <span>Algorithm Options</span>
                <algorithm-options-configurator data-ref="optionsConfigurator"></algorithm-options-configurator>
                <small>Defaults come from the selected training. Adjust to test a variant.</small>
              </div>
            </fieldset>

            <fieldset class="group" data-fieldset-params hidden>
              <legend>Parameters (Custom Algorithm)</legend>
              <p class="field-hint">Optionally upload a new parameters JSON file to override defaults.</p>
              <div class="params-upload">
                <p class="params-file-name" data-params-file-name>No parameters file selected</p>
                <div class="params-actions">
                  <button class="btn ghost small" type="button" data-action="choose-params">Select params.json</button>
                  <button class="btn ghost small" type="button" data-action="clear-params" disabled>Remove</button>
                </div>
              </div>
              <input type="file" id="paramsFile" accept=".json,.JSON" hidden />
              <small>If not provided, the algorithm's default parameters will be used.</small>
            </fieldset>

            <fieldset class="group">
              <legend>Dataset Column Selection</legend>
              <dataset-column-selector data-ref="columnSelector"></dataset-column-selector>
              <small>Column selection will be loaded from the dataset or reused from the selected training.</small>
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
    const optionsConfigurator = this.root.querySelector<AlgorithmOptionsConfigurator>("[data-ref='optionsConfigurator']");
    const columnSelector = this.root.querySelector<DatasetColumnSelector>("[data-ref='columnSelector']");
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
    const algorithmFieldset = this.root.querySelector<HTMLFieldSetElement>("[data-fieldset-algorithm]");
    const paramsFieldset = this.root.querySelector<HTMLFieldSetElement>("[data-fieldset-params]");
    const paramsInput = this.root.querySelector<HTMLInputElement>("#paramsFile");
    const paramsFileName = this.root.querySelector<HTMLElement>("[data-params-file-name]");
    const chooseParamsBtn = this.root.querySelector<HTMLButtonElement>("[data-action='choose-params']");
    const clearParamsBtn = this.root.querySelector<HTMLButtonElement>("[data-action='clear-params']");
    // Dataset mode refs
    const datasetModeOriginal = this.root.querySelector<HTMLInputElement>("[data-ref='datasetModeOriginal']");
    const datasetModeUpload = this.root.querySelector<HTMLInputElement>("[data-ref='datasetModeUpload']");
    const datasetModeExisting = this.root.querySelector<HTMLInputElement>("[data-ref='datasetModeExisting']");
    const originalSection = this.root.querySelector<HTMLElement>("[data-ref='originalSection']");
    const uploadSection = this.root.querySelector<HTMLElement>("[data-ref='uploadSection']");
    const existingSection = this.root.querySelector<HTMLElement>("[data-ref='existingSection']");
    const datasetSelect = this.root.querySelector<HTMLSelectElement>("[data-ref='datasetSelect']");

    if (
      !form || !datasetInput || !dropzone || !chooseFileBtn || !clearFileBtn || !fileName || !datasetCaption ||
      !algorithmSelect || !optionsConfigurator || !columnSelector ||
      !submitButton || !resetButton || !stopButton || !statusBanner || !modeTrainingRadio || !modeModelRadio ||
      !trainingWrapper || !modelWrapper || !trainingSelect || !modelSelect ||
      !algorithmFieldset || !paramsFieldset || !paramsInput || !paramsFileName || !chooseParamsBtn || !clearParamsBtn ||
      !datasetModeOriginal || !datasetModeUpload || !datasetModeExisting || !originalSection || !uploadSection || !existingSection || !datasetSelect
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
      optionsConfigurator,
      columnSelector,
      submitButton,
      resetButton,
      stopButton,
      statusBanner,
      modeTrainingRadio,
      modeModelRadio,
      trainingWrapper,
      modelWrapper,
      trainingSelect,
      modelSelect,
      algorithmFieldset,
      paramsFieldset,
      paramsInput,
      paramsFileName,
      chooseParamsBtn,
      clearParamsBtn,
      datasetModeOriginal,
      datasetModeUpload,
      datasetModeExisting,
      originalSection,
      uploadSection,
      existingSection,
      datasetSelect
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

    // Params file handlers for custom training
    this.refs.chooseParamsBtn.addEventListener("click", () => this.refs.paramsInput.click());
    this.refs.paramsInput.addEventListener("change", () => this.handleParamsFileInput(this.refs.paramsInput.files));
    this.refs.clearParamsBtn.addEventListener("click", () => this.setParamsFile(null));

    this.refs.modeTrainingRadio.addEventListener("change", () => this.setMode("training"));
    this.refs.modeModelRadio.addEventListener("change", () => this.setMode("model"));

    this.refs.trainingSelect.addEventListener("change", (event) => this.handleTrainingSelection(event));
    this.refs.modelSelect.addEventListener("change", (event) => this.handleModelSelection(event));

    // Dataset mode toggle handlers
    this.refs.datasetModeOriginal.addEventListener("change", () => this.handleDatasetModeChange("original"));
    this.refs.datasetModeUpload.addEventListener("change", () => this.handleDatasetModeChange("upload"));
    this.refs.datasetModeExisting.addEventListener("change", () => this.handleDatasetModeChange("existing"));

    // Existing dataset select handler
    this.refs.datasetSelect.addEventListener("change", (event) => {
      const value = (event.target as HTMLSelectElement).value;
      if (value) {
        void this.handleExistingDatasetSelect(parseInt(value));
      } else {
        this.state.selectedExistingDatasetId = null;
        this.refs.columnSelector.setColumns([]);
        this.updateSubmitState();
      }
    });

    this.refs.algorithmSelect.addEventListener("change", (event) => {
      const value = (event.target as HTMLSelectElement).value;
      this.state.selectedAlgorithmId = value;
      this.updateSubmitState();
      if (value && value !== this.state.initialAlgorithmId) {
        void this.loadAlgorithmOptions(parseInt(value));
      }
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

  private async loadAlgorithmOptions(algorithmId: number) {
    this.state.algorithmOptionsLoading = true;

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
      this.state.algorithmOptionsLoading = false;
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

  private handleDatasetModeChange(mode: DatasetMode) {
    this.state.datasetMode = mode;

    // Always clear all selections when switching modes
    this.state.selectedExistingDatasetId = null;
    this.selectedFile = null;
    this.refs.datasetInput.value = "";
    this.refs.fileName.textContent = "No file selected";
    this.refs.datasetSelect.value = "";
    this.refs.columnSelector.setColumns([]);

    // Update UI visibility
    this.refs.originalSection.hidden = mode !== "original";
    this.refs.uploadSection.hidden = mode !== "upload";
    this.refs.existingSection.hidden = mode !== "existing";

    // Load datasets when switching to existing mode
    if (mode === "existing") {
      void this.loadExistingDatasets();
    }

    this.updateDatasetDisplay();
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

  private async handleExistingDatasetSelect(datasetId: number) {
    this.state.selectedExistingDatasetId = datasetId;
    this.state.columnsLoading = true;
    this.refs.columnSelector.setColumns([]);

    try {
      const token = getToken() ?? undefined;
      const response = await fetchDatasetColumns(datasetId, token);

      if (response.columns && response.columns.length > 0) {
        this.refs.columnSelector.setColumns(response.columns);
      } else {
        this.showStatus("No columns found in dataset", "warning");
      }
    } catch (error) {
      if (error instanceof UnauthorizedError) {
        return;
      }
      const message = error instanceof Error ? error.message : "Failed to load dataset columns";
      this.showStatus(message, "warning");
    } finally {
      this.state.columnsLoading = false;
      this.updateSubmitState();
    }
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
      const typePrefix = training.trainingType === "CUSTOM" ? "[Custom]" : "[Weka]";
      const sequenceLabel = `Training #${index + 1}`;
      const algorithmPart = training.algorithmName ? ` · ${training.algorithmName}` : "";
      const label = `${typePrefix} ${sequenceLabel}${algorithmPart}`;
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
      const typePrefix = model.trainingType === "CUSTOM" ? "[Custom]" : "[Weka]";
      const sequenceLabel = `Model #${index + 1}`;
      // Prioritize modelName for finalized models, then algorithmName, then datasetName
      const descriptor = model.modelName ?? model.algorithmName ?? model.datasetName ?? "";
      const label = descriptor ? `${typePrefix} ${sequenceLabel} · ${descriptor}` : `${typePrefix} ${sequenceLabel}`;
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
    this.state.trainingType = null;
    this.selectedFile = null;
    this.selectedParamsFile = null;
    this.syncSourceRadios();
    this.updateModeUI();
    this.updateDatasetDisplay();
    this.updateTrainingTypeUI();
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
    this.selectedParamsFile = null;

    // Find the selected training and set trainingType
    const selectedTraining = this.state.trainings.find(t => String(t.trainingId) === value);
    this.state.trainingType = selectedTraining?.trainingType ?? null;

    this.updateTrainingTypeUI();
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
    this.selectedParamsFile = null;

    // Find the selected model and set trainingType
    const selectedModel = this.state.models.find(m => String(m.modelId) === value);
    this.state.trainingType = selectedModel?.trainingType ?? null;

    this.updateTrainingTypeUI();
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

    // Load algorithm options for the initial algorithm
    if (this.state.initialAlgorithmId) {
      void this.loadAlgorithmOptions(parseInt(this.state.initialAlgorithmId));
    }

    // Note: Column selection will be applied when user uploads a new dataset
    // or will use the original values if no new dataset is provided

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

    if (file) {
      void this.loadDatasetColumns(file);
    } else {
      // Reset columns only if there's no file and no details
      if (!this.state.details || (!this.state.details.basicAttributesColumns && !this.state.details.targetColumn)) {
        this.refs.columnSelector.setColumns([]);
      }
    }

    this.updateDatasetDisplay();
    this.updateSubmitState();
  }

  private updateDatasetDisplay() {
    // Update based on current dataset mode
    if (this.state.datasetMode === "original") {
      if (this.state.datasetName) {
        this.refs.datasetCaption.textContent = this.state.datasetName;
      } else {
        this.refs.datasetCaption.textContent = "Select a training/model first";
      }
    } else if (this.state.datasetMode === "upload") {
      if (this.selectedFile) {
        this.refs.fileName.textContent = this.selectedFile.name;
      } else {
        this.refs.fileName.textContent = "No file selected";
      }
    }
    // For "existing" mode, the select dropdown handles the display
  }

  private handleParamsFileInput(files: FileList | null) {
    const file = files && files.length > 0 ? files[0] : null;
    if (file) {
      this.setParamsFile(file);
    }
  }

  private setParamsFile(file: File | null) {
    this.selectedParamsFile = file;
    if (!file) {
      this.refs.paramsInput.value = "";
    }
    this.refs.clearParamsBtn.disabled = !file || this.state.submitting;
    this.updateParamsDisplay();
  }

  private updateParamsDisplay() {
    if (this.selectedParamsFile) {
      this.refs.paramsFileName.textContent = this.selectedParamsFile.name;
    } else {
      this.refs.paramsFileName.textContent = "No parameters file selected";
    }
  }

  private updateTrainingTypeUI() {
    const isCustom = this.state.trainingType === "CUSTOM";
    const isPredefined = this.state.trainingType === "PREDEFINED";
    // hasSelection is kept for potential future use
    const _hasSelection = this.state.trainingType !== null;
    void _hasSelection;

    // Hide both sections if no training/model selected yet
    // Show algorithm fieldset only for Weka (PREDEFINED)
    this.refs.algorithmFieldset.hidden = !isPredefined;

    // Show params fieldset only for Custom
    this.refs.paramsFieldset.hidden = !isCustom;

    // Reset params file when switching away from custom
    if (!isCustom) {
      this.setParamsFile(null);
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
      // Reset components to empty
      this.refs.optionsConfigurator.setOptions([]);
      this.refs.columnSelector.setColumns([]);
    } else {
      // Reset to initial values from details
      this.state.selectedAlgorithmId = this.state.initialAlgorithmId;
      this.renderAlgorithmOptions();

      // Reload algorithm options
      if (this.state.initialAlgorithmId) {
        void this.loadAlgorithmOptions(parseInt(this.state.initialAlgorithmId));
      }

      // Note: Column selection will reset when user uploads a new dataset
      // If no new dataset is uploaded, original column indices will be used
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

    // Check dataset based on mode
    let hasDataset = false;
    if (this.state.datasetMode === "original") {
      hasDataset = Boolean(this.state.details.datasetConfigurationId || this.state.details.datasetId);
    } else if (this.state.datasetMode === "upload") {
      hasDataset = Boolean(this.selectedFile);
    } else if (this.state.datasetMode === "existing") {
      hasDataset = Boolean(this.state.selectedExistingDatasetId);
    }

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

    // Params file buttons for custom training
    this.refs.chooseParamsBtn.disabled = this.state.submitting;
    this.refs.clearParamsBtn.disabled = !this.selectedParamsFile || this.state.submitting;

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

    this.stopPolling();
    this.setSubmitting(true);
    this.showStatus("Submitting retrain request…", "info");

    try {
      const token = getToken() ?? undefined;
      let response: unknown;

      if (this.state.trainingType === "CUSTOM") {
        // Custom training retrain - use startCustomRetrain
        // Determine dataset source based on mode
        let datasetFile: File | undefined;
        let datasetId: number | undefined;

        if (this.state.datasetMode === "upload") {
          datasetFile = this.selectedFile ?? undefined;
        } else if (this.state.datasetMode === "existing") {
          datasetId = this.state.selectedExistingDatasetId ?? undefined;
        }
        // For "original" mode, no dataset is sent - backend uses the original

        response = await startCustomRetrain({
          trainingId: this.state.mode === "training" ? parseInt(sourceId) : undefined,
          modelId: this.state.mode === "model" ? parseInt(sourceId) : undefined,
          datasetFile,
          datasetId,
          parametersFile: this.selectedParamsFile ?? undefined,
          basicAttributesColumns: this.refs.columnSelector.getSelectionAsStrings().attributes ?? undefined,
          targetColumn: this.refs.columnSelector.getSelectionAsStrings().classColumn ?? undefined
        }, token);
      } else {
        // Weka (PREDEFINED) training retrain - use startTraining
        const formData = new FormData();

        if (this.state.mode === "training") {
          formData.append("trainingId", sourceId);
        } else {
          formData.append("modelId", sourceId);
        }

        // Add dataset based on dataset mode
        if (this.state.datasetMode === "upload" && this.selectedFile) {
          formData.append("file", this.selectedFile);
        } else if (this.state.datasetMode === "existing" && this.state.selectedExistingDatasetId) {
          formData.append("datasetId", this.state.selectedExistingDatasetId.toString());
        } else if (this.state.datasetMode === "original") {
          // Use original dataset configuration
          if (this.state.datasetConfigurationId) {
            formData.append("datasetConfigurationId", this.state.datasetConfigurationId);
          } else if (this.state.datasetId) {
            formData.append("datasetId", this.state.datasetId);
          }
        }

        // Get options from configurator
        const optionsValue = this.refs.optionsConfigurator.getCliString().trim();
        if (optionsValue) {
          formData.append("options", optionsValue);
        }

        // Get column selection from selector
        const columnSelection = this.refs.columnSelector.getSelectionAsStrings();
        const basicColumns = columnSelection.attributes;
        const targetColumn = columnSelection.classColumn;

        if (basicColumns) {
          formData.append("basicCharacteristicsColumns", basicColumns);
        }
        if (targetColumn) {
          formData.append("targetClassColumn", targetColumn);
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

        response = await startTraining(formData, token);
      }
      const taskId = this.extractTaskId(response);
      this.state.taskId = taskId;
      this.state.taskStatus = "PENDING";
      this.updateStopButton();

      // Build description for the active task
      const typeLabel = this.state.trainingType === 'CUSTOM' ? 'Custom' : 'Weka';
      const sourceName = this.state.details?.algorithmName || this.state.details?.datasetName || '';
      const desc = sourceName ? `${typeLabel} Retrain · ${sourceName}` : `${typeLabel} Retrain`;
      this.saveActiveTask(desc);

      this.showStatus(`Retraining task ${taskId} started. Monitoring status…`, "info");

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

  private getRetrainTaskType(): TaskType {
    return this.state.trainingType === 'CUSTOM' ? 'CUSTOM_RETRAIN' : 'WEKA_RETRAIN';
  }

  private restoreActiveTasks() {
    const wekaRetrains = taskStore.getActiveTasksByType('WEKA_RETRAIN');
    const customRetrains = taskStore.getActiveTasksByType('CUSTOM_RETRAIN');
    const activeTasks = [...wekaRetrains, ...customRetrains];

    if (activeTasks.length > 0) {
      activeTasks.forEach(task => {
        if (!this.pollTimers.has(task.taskId)) {
          this.beginPollingForTask(task.taskId);
        }
      });

      const mostRecent = activeTasks[activeTasks.length - 1];
      this.state.taskId = mostRecent.taskId;
      this.state.taskStatus = mostRecent.status;
      this.showStatus(`Monitoring ${activeTasks.length} active retraining(s)...`, "info");
      this.updateStopButton();
      this.renderActiveTasksPanel();
    }
  }

  private saveActiveTask(description?: string) {
    if (this.state.taskId) {
      taskStore.addTask({
        taskId: this.state.taskId,
        type: this.getRetrainTaskType(),
        status: this.state.taskStatus || 'PENDING',
        description: description || 'Retraining'
      });
    }
  }

  private clearActiveTask(taskId?: string) {
    const id = taskId || this.state.taskId;
    if (id) {
      taskStore.removeTask(id);
    }
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
          this.showStatus("Retraining completed successfully. Review it in the Trainings page.", "success");
          this.resetOverrides();
        }
      } else if (status === "FAILED") {
        const extra = data.errorMessage ? ` Reason: ${data.errorMessage}` : "";
        this.stopPollingForTask(taskId);
        this.clearActiveTask(taskId);
        if (this.state.taskId === taskId) {
          this.showStatus(`Retraining failed.${extra}`, "error");
        }
      } else if (status === "STOPPED") {
        this.stopPollingForTask(taskId);
        this.clearActiveTask(taskId);
        if (this.state.taskId === taskId) {
          this.showStatus("Retraining was stopped by the user.", "warning");
          this.state.taskId = null;
          this.state.taskStatus = null;
          this.updateStopButton();
        }
      } else {
        if (this.state.taskId === taskId) {
          this.showStatus(`Retraining task ${taskId} is ${status.toLowerCase()}.`, "info");
        }
      }

      this.renderActiveTasksPanel();

    } catch (error) {
      if (error instanceof UnauthorizedError) {
        return;
      }
      const message = error instanceof Error ? error.message : "Cannot fetch task status";
      if (this.state.taskId === taskId) {
        this.showStatus(`Unable to check task status: ${message}`, "warning");
      }
      this.stopPollingForTask(taskId);
    }
  }

  private stopPolling() {
    this.pollTimers.forEach((timer) => {
      clearInterval(timer);
    });
    this.pollTimers.clear();
  }

  private renderActiveTasksPanel() {
    const panel = this.root.querySelector<HTMLElement>('[data-active-tasks]');
    if (!panel) return;

    const wekaRetrains = taskStore.getActiveTasksByType('WEKA_RETRAIN');
    const customRetrains = taskStore.getActiveTasksByType('CUSTOM_RETRAIN');
    const activeTasks = [...wekaRetrains, ...customRetrains];

    if (activeTasks.length === 0) {
      panel.hidden = true;
      return;
    }

    panel.hidden = false;
    panel.innerHTML = `
      <h3>Active Retrainings (${activeTasks.length})</h3>
      <ul class="active-tasks-list">
        ${activeTasks.map(task => `
          <li class="active-task-item ${this.state.taskId === task.taskId ? 'active-task-item--current' : ''}"
              data-task-id="${task.taskId}">
            <span class="active-task-status active-task-status--${task.status.toLowerCase()}">${task.status}</span>
            <span class="active-task-type">${task.type === 'WEKA_RETRAIN' ? 'Weka' : 'Custom'}</span>
            <span class="active-task-id">${task.taskId.substring(0, 8)}...</span>
            <span class="active-task-desc">${task.description || 'Retraining'}</span>
            <button type="button" class="btn small ghost" data-action="view-task" data-task-id="${task.taskId}">View</button>
            <button type="button" class="btn small danger" data-action="stop-task" data-task-id="${task.taskId}">Stop</button>
          </li>
        `).join('')}
      </ul>
    `;

    panel.querySelectorAll('[data-action="view-task"]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const tid = (e.target as HTMLElement).dataset.taskId;
        if (tid) this.switchToTask(tid);
      });
    });

    panel.querySelectorAll('[data-action="stop-task"]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const tid = (e.target as HTMLElement).dataset.taskId;
        if (tid) void this.handleStopTask(tid);
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
      if (!token) {
        throw new UnauthorizedError();
      }

      this.showStatus(`Stopping task ${taskId}...`, "warning");
      await stopTask(taskId, token);
      this.showStatus("Stop request sent successfully.", "info");

    } catch (error) {
      console.error('Failed to stop retraining:', error);
      const message = error instanceof Error ? error.message : "Failed to stop retraining";
      this.showStatus(`Failed to stop retraining: ${message}`, "error");
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
