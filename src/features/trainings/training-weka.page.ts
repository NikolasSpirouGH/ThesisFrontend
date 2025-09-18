import { fetchAlgorithms } from "../algorithms/api";
import { startTraining } from "../trainings/api";
import { getTaskStatus } from "../tasks/api";
import styles from './styles/training-weka.css?raw';

export class PageTrainWeka extends HTMLElement {

    private form!: HTMLFormElement;

  connectedCallback() {
    let root = this.shadowRoot;
    if (!root) {
    root = this.attachShadow({ mode: 'open' });
    }
    this.renderForm();
    this.form.addEventListener('submit', this.handleSubmit.bind(this));
  }

  private renderForm() {

    this.shadowRoot!.innerHTML = `

        <style>${styles}</style>

        <main class="app">
          <section class="panel">
            <h1>Train (Weka)</h1>

            <form id="trainForm" novalidate>
              <div class="field">
                <label for="dataset">Upload Dataset</label>
                <div class="filebox" id="fileBox">
                  <input type="file" id="dataset" name="file" accept=".csv" />
                  <span class="filebox__label" id="fileName">No file selected.</span>
                </div>
              </div>

              <div class="field">
                <label for="algorithm">Algorithm - Weka</label>
                <select id="algorithm" name="algorithmId" required>
                </select>
              </div>

              <div class="field">
                <label for="options">Algorithm Options</label>
                <input type="text" id="options" name="options" placeholder="ex. -C 0.5 -M 2" />
              </div>

              <div class="field">
                <label for="attrDataset">Dataset Attributes</label>
                <input type="text" id="attrDataset" name="basicCharacteristicsColumns" placeholder="Optional ex. attr1, attr2" />
              </div>

              <div class="field">
                <label for="classDataset">Class Attribute</label>
                <input type="text" id="classDataset" name="targetClassColumn" placeholder="Optional ex. class" />
              </div>

              <button id="startBtn" class="btn" type="submit" disabled>Start</button>
            </form>
          </section>
        </main>
    `;

    const fileInput = this.shadowRoot!.querySelector<HTMLInputElement>('#dataset');
    const fileNameLabel = this.shadowRoot!.querySelector<HTMLElement>('#fileName');
    const startButton = this.shadowRoot!.querySelector<HTMLButtonElement>('#startBtn');
    const algorithmSelect = this.shadowRoot!.querySelector<HTMLSelectElement>('#algorithm');
    const fileBox = this.shadowRoot!.querySelector<HTMLElement>('#fileBox')!;

    const updateFormState = () => {
      const file = fileInput?.files?.[0] ?? null;
      const hasFile = Boolean(file);

      if (fileNameLabel) {
        fileNameLabel.textContent = hasFile && file ? file.name : 'No file selected.';
      }

      if (startButton) {
        const hasAlgorithm = Boolean(algorithmSelect?.value);
        startButton.disabled = !(hasFile && hasAlgorithm);
      }
    };

    fileInput?.addEventListener('change', updateFormState);
    algorithmSelect?.addEventListener('change', updateFormState);
    fileBox?.addEventListener('click', () => fileInput?.click());
    updateFormState();
    this.form = this.shadowRoot!.querySelector('#trainForm') as HTMLFormElement;
    this.loadAlgorithms();
  }

private async loadAlgorithms() {
  const select = this.shadowRoot!.querySelector('#algorithm') as HTMLSelectElement;
  if (!select) return;

  try {
    const items = await fetchAlgorithms();

    // καθάρισε τα options
    select.innerHTML = '';

    // placeholder
    const ph = document.createElement('option');
    ph.value = '';
    ph.textContent = 'Select an algorithm';
    ph.disabled = true;
    ph.selected = true;
    select.appendChild(ph);

    // γέμισμα με τα δεδομένα
    for (const alg of items) {
      const opt = document.createElement('option');
      opt.value = String(alg.id);
      opt.textContent = alg.name;
      select.appendChild(opt);
    }
  } catch (err) {
    console.error(err);
    select.innerHTML = `<option value="" disabled selected>Failed to load</option>`;
  }
}

private async handleSubmit(e: Event) {
  e.preventDefault();

  const fileInput = this.shadowRoot!.querySelector<HTMLInputElement>('#dataset');
  const algoSelect = this.shadowRoot!.querySelector<HTMLSelectElement>('#algorithm');
  const algoOptions = this.shadowRoot!.querySelector<HTMLInputElement>('#options');
  const attrDatasetInput = this.shadowRoot!.querySelector<HTMLInputElement>('#attrDataset');
  const classDatasetInput = this.shadowRoot!.querySelector<HTMLInputElement>('#classDataset');

  if (!fileInput?.files?.length || !algoSelect?.value) {
    alert('Please select both a dataset file and an algorithm');
    return;
  }

  if (!/^\d+$/.test(algoSelect.value)) {
    alert('Algorithm must be a numeric id');
    return;
  }

  const basicCols = attrDatasetInput?.value.trim() ?? '';
  if (basicCols && !/^(\d+)(,\d+)*$/.test(basicCols)) {
    alert('Attributes must be numbers separated by commas (e.g. 1,2,3)');
    return;
  }

  const targetClass = classDatasetInput?.value.trim() ?? '';
  if (targetClass && !/^\d+$/.test(targetClass)) {
    alert('Class column must be a number (e.g. 4)');
    return;
  }

  const formData = new FormData();
  formData.append('file', fileInput.files[0]);
  formData.append('algorithmId', algoSelect.value);
  formData.append('options', algoOptions?.value ?? '');
  formData.append('basicCharacteristicsColumns', basicCols);
  formData.append('targetClassColumn', targetClass);

  const token = localStorage.getItem("jwt");

  try {
    const data = await startTraining(formData, token || undefined);
    alert(`Training started with id ${data.dataHeader}`);
    this.pollTaskStatus(data.dataHeader);
  } catch (err) {
    console.error(err);
    alert('Training failed');
  }
}

private pollTaskStatus(trackingId: string) {
  const token = localStorage.getItem("jwt");

  const interval = setInterval(async () => {
    try {
      const statusData = await getTaskStatus(trackingId, token || undefined);
      if (statusData.status === "COMPLETED") {
        clearInterval(interval);
        alert("✅ Training completed!");
      } else if (statusData.status === "FAILED") {
        clearInterval(interval);
        alert(`❌ Training ${statusData.status.toLowerCase()}${statusData.errorMessage ? `: ${statusData.errorMessage}` : ''}`);      
      }
    } catch (err: any) {
      console.error("Status check failed:", err);
      clearInterval(interval); // ΣΤΑΜΑΤΑ το polling σε error
      alert(`⚠️ Cannot check status: ${err.message || err}`);
    }
  }, 3000);
}


}

customElements.define('page-train-weka', PageTrainWeka);
