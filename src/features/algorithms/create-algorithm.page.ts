import { getToken } from "../../core/auth.store";
import { UnauthorizedError } from "../../core/http";
import type { AlgorithmAccessibility, CreateCustomAlgorithmPayload } from "./api";
import { createCustomAlgorithm } from "./api";
import styles from "./styles/create-algorithm.css?raw";

type State = {
  submitting: boolean;
  error: string | null;
  success: string | null;
};

type Refs = {
  form: HTMLFormElement;
  status: HTMLElement;
  submit: HTMLButtonElement;
  name: HTMLInputElement;
  description: HTMLTextAreaElement;
  version: HTMLInputElement;
  accessibility: HTMLSelectElement;
  keywords: HTMLTextAreaElement;
  params: HTMLInputElement;
  dockerTar: HTMLInputElement;
  dockerHub: HTMLInputElement;
};

declare global {
  interface HTMLElementTagNameMap {
    "page-create-algorithm": PageCreateAlgorithm;
  }
}

class PageCreateAlgorithm extends HTMLElement {
  private root!: ShadowRoot;
  private refs!: Refs;
  private state: State = {
    submitting: false,
    error: null,
    success: null
  };

  connectedCallback() {
    this.root = this.shadowRoot ?? this.attachShadow({ mode: "open" });
    this.render();
    this.collectRefs();
    this.bind();
    this.updateUI();
  }

  private render() {
    this.root.innerHTML = `
      <style>${styles}</style>
      <div class="page">
        <header class="hero">
          <div class="hero__content">
            <p class="hero__eyebrow">Custom algorithm</p>
            <h1>Upload a Docker-based algorithm</h1>
            <p>Provide metadata, default parameters, and either a Docker TAR archive or a Docker Hub reference to share the algorithm with your workspace.</p>
          </div>
          <button class="btn ghost" type="button" data-action="back">Back to algorithms</button>
        </header>

        <section class="panel">
          <div class="status" data-role="status" hidden></div>
          <form class="form" novalidate>
            <fieldset class="group">
              <legend>Metadata</legend>
              <label class="field">
                <span>Name</span>
                <input type="text" id="name" name="name" autocomplete="off" required maxlength="100" />
                <small>Only letters, numbers, dots, underscores, and hyphens are allowed.</small>
              </label>
              <label class="field">
                <span>Description (optional)</span>
                <textarea id="description" name="description" rows="3" maxlength="500" placeholder="Explain what this algorithm does"></textarea>
              </label>
              <div class="group grid">
                <label class="field">
                  <span>Version</span>
                  <input type="text" id="version" name="version" autocomplete="off" required maxlength="40" />
                </label>
                <label class="field">
                  <span>Accessibility</span>
                  <select id="accessibility" name="accessibility" required>
                    <option value="">Select access level…</option>
                    <option value="PUBLIC">Public</option>
                    <option value="PRIVATE">Private</option>
                    <option value="SHARED">Shared</option>
                  </select>
                </label>
              </div>
              <label class="field">
                <span>Keywords</span>
                <textarea id="keywords" name="keywords" rows="2" placeholder="Comma or newline-separated values" required></textarea>
                <small>Keywords help teammates discover this algorithm.</small>
              </label>
            </fieldset>

            <fieldset class="group">
              <legend>Files</legend>
              <label class="field">
                <span>Parameters JSON</span>
                <input type="file" id="parametersFile" name="parametersFile" accept="application/json,.json" required />
                <small>Upload a JSON file describing the default parameters for this algorithm.</small>
              </label>
            </fieldset>

            <fieldset class="group">
              <legend>Docker image</legend>
              <p class="helper">Provide <strong>either</strong> a Docker TAR archive <strong>or</strong> a Docker Hub URL. The server will reject submissions with both or neither.</p>
              <label class="field">
                <span>Docker TAR archive</span>
                <input type="file" id="dockerTarFile" name="dockerTarFile" accept=".tar,.tar.gz,.tgz,application/x-tar,application/gzip" />
              </label>
              <div class="field">
                <span>Docker Hub image</span>
                <input type="text" id="dockerHubUrl" name="dockerHubUrl" placeholder="docker.io/user/image:tag" autocomplete="off" />
                <small>Leave blank when providing a TAR archive.</small>
              </div>
            </fieldset>

            <div class="form__actions">
              <button class="btn primary" type="submit">Create algorithm</button>
              <button class="btn ghost" type="button" data-action="back-secondary">Cancel</button>
            </div>
          </form>
        </section>
      </div>
    `;
  }

  private collectRefs() {
    const form = this.root.querySelector<HTMLFormElement>("form");
    const status = this.root.querySelector<HTMLElement>("[data-role='status']");
    const submit = this.root.querySelector<HTMLButtonElement>(".form__actions .btn.primary");
    const name = this.root.querySelector<HTMLInputElement>("#name");
    const description = this.root.querySelector<HTMLTextAreaElement>("#description");
    const version = this.root.querySelector<HTMLInputElement>("#version");
    const accessibility = this.root.querySelector<HTMLSelectElement>("#accessibility");
    const keywords = this.root.querySelector<HTMLTextAreaElement>("#keywords");
    const params = this.root.querySelector<HTMLInputElement>("#parametersFile");
    const dockerTar = this.root.querySelector<HTMLInputElement>("#dockerTarFile");
    const dockerHub = this.root.querySelector<HTMLInputElement>("#dockerHubUrl");

    if (
      !form ||
      !status ||
      !submit ||
      !name ||
      !description ||
      !version ||
      !accessibility ||
      !keywords ||
      !params ||
      !dockerTar ||
      !dockerHub
    ) {
      throw new Error("Missing form elements in create algorithm page");
    }

    this.refs = {
      form,
      status,
      submit,
      name,
      description,
      version,
      accessibility,
      keywords,
      params,
      dockerTar,
      dockerHub
    };
  }

  private bind() {
    this.refs.form.addEventListener("submit", this.handleSubmit);
    this.refs.form.addEventListener("input", () => {
      if (this.state.error) {
        this.state.error = null;
        this.updateUI();
      }
    });

    const backButtons = this.root.querySelectorAll<HTMLButtonElement>("[data-action='back'], [data-action='back-secondary']");
    backButtons.forEach((btn) => {
      btn.addEventListener("click", () => {
        window.location.hash = "#/algorithms";
      });
    });
  }

  private handleSubmit = async (event: Event) => {
    event.preventDefault();
    if (this.state.submitting) {
      return;
    }

    let payload: CreateCustomAlgorithmPayload;
    try {
      payload = this.buildPayload();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Please review the form and try again.";
      this.state.error = message;
      this.state.success = null;
      this.updateUI();
      return;
    }

    const token = getToken();
    if (!token) {
      window.location.hash = "#/login";
      return;
    }

    this.state.submitting = true;
    this.state.error = null;
    this.state.success = null;
    this.updateUI();

    try {
      const id = await createCustomAlgorithm(payload, token);
      this.state.success = `Algorithm created successfully (ID #${id}). Redirecting…`;
      this.updateUI();
      window.setTimeout(() => {
        window.location.hash = "#/algorithms";
      }, 1200);
    } catch (error) {
      if (error instanceof UnauthorizedError) {
        return;
      }
      const message = error instanceof Error ? error.message : "Failed to create algorithm.";
      this.state.error = message;
      this.state.success = null;
      this.updateUI();
    } finally {
      this.state.submitting = false;
      this.updateUI();
    }
  };

  private buildPayload(): CreateCustomAlgorithmPayload {
    const name = this.refs.name.value.trim();
    const description = this.refs.description.value.trim();
    const version = this.refs.version.value.trim();
    const accessibility = this.refs.accessibility.value as AlgorithmAccessibility | "";
    const keywordsRaw = this.refs.keywords.value
      .split(/[,\n]/)
      .map((value) => value.trim())
      .filter((value) => value.length > 0);

    const parametersFile = this.refs.params.files?.[0] ?? null;
    const dockerTarFile = this.refs.dockerTar.files?.[0] ?? undefined;
    const dockerHubUrl = this.refs.dockerHub.value.trim();

    if (!name) {
      throw new Error("Algorithm name is required.");
    }
    if (!version) {
      throw new Error("Version is required.");
    }
    if (!accessibility) {
      throw new Error("Select an accessibility option.");
    }
    if (keywordsRaw.length === 0) {
      throw new Error("Add at least one keyword.");
    }
    if (!parametersFile) {
      throw new Error("A parameters JSON file is required.");
    }

    const hasTar = Boolean(dockerTarFile);
    const hasHub = dockerHubUrl.length > 0;

    if (hasTar === hasHub) {
      throw new Error("Provide either a Docker TAR archive or a Docker Hub URL (but not both).");
    }

    const payload: CreateCustomAlgorithmPayload = {
      name,
      description,
      version,
      accessibility,
      keywords: keywordsRaw,
      parametersFile,
      dockerTarFile: hasTar ? dockerTarFile : undefined,
      dockerHubUrl: hasHub ? dockerHubUrl : undefined
    };

    return payload;
  }

  private updateUI() {
    const { submitting, error, success } = this.state;

    this.refs.submit.disabled = submitting;
    this.refs.submit.textContent = submitting ? "Uploading…" : "Create algorithm";

    const hasMessage = Boolean(error || success);
    this.refs.status.hidden = !hasMessage;
    this.refs.status.textContent = error ?? success ?? "";
    this.refs.status.className = `status ${error ? "status--error" : success ? "status--success" : ""}`.trim();
  }
}

customElements.define("page-create-algorithm", PageCreateAlgorithm);
