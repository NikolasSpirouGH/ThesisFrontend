import { fetchAlgorithms } from "../algorithms/api";
import { startTraining } from "../trainings/api";
import { getTaskStatus } from "../tasks/api";

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

        <style> 
            .wrap {
                max-width: 600px;
                margin: 20px auto;
                font-family: sans-serif;
            }
            
            .row {
                display: flex;
                flex-direction: column;
                margin-bottom: 16px;
            }

            label {
                font-weight: 600;
                margin-bottom: 6px;
            }

            input, select {
                padding: 8px;
                font-size: 14px;
            }

            .btn {
                background: var(--primary, #2563eb);
                color: white;
                border: none;
                border-radius: 6px;
                cursor: pointer;
            }

        </style>
        <div class="wrap">
            <form id="trainForm">
                <div class="row">
                    <label for="file">Upload Dataset</label>
                    <input type="file" id="file" name="file" accept=".csv"> 
                </div>  
                
                <div class="row">
                    <label for="algorithmId">Algorithm - Weka</label>
                    <select id="algorithmId" name="algorithmId">
                        <option value="" disabled selected>Loading...</option>
                    </select>
                </div>

                <div class="row">
                    <label for="options">Algorithm Options</label>
                    <input id="options" type="text" placeholder='ex. C 0.5 M 2' />

                </div>

                <div class="row"> 
                    <button type="submit" class="btn">Start</button>                     
                </div>
            </form>
        </div>
    `;

    this.form = this.shadowRoot!.querySelector('#trainForm') as HTMLFormElement;
    this.loadAlgorithms();
  }

private async loadAlgorithms() {
  const select = this.shadowRoot!.querySelector('#algorithmId') as HTMLSelectElement;
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

  const fileInput = this.shadowRoot!.querySelector<HTMLInputElement>('#file');
  const algoSelect = this.shadowRoot!.querySelector<HTMLSelectElement>('#algorithmId');
  const algoOptions = this.shadowRoot!.querySelector<HTMLInputElement>('#options');

  if (!fileInput?.files?.length || !algoSelect?.value) {
    alert('Please select both a dataset file and an algorithm');
    return;
  }

  const formData = new FormData();
  formData.append('file', fileInput.files[0]);
  formData.append('algorithmId', algoSelect.value);
  formData.append('options', algoOptions?.value ?? '');

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
