import { getToken } from "../../core/auth.store";
import { UnauthorizedError } from "../../core/http";
import styles from "./styles/results.css?raw";

declare global {
  interface HTMLElementTagNameMap {
    "page-results": PageResults;
  }
}

type ChartConfig = {
  title: string;
  description: string;
  endpoint: string;
  algorithmType: string; // CLASSIFICATION, REGRESSION, or CLUSTERING
};

const CHARTS_BY_TYPE: Record<string, ChartConfig[]> = {
  CLASSIFICATION: [
    {
      title: "Metrics Bar Chart",
      description: "Accuracy, Precision, Recall, and F1 Score",
      endpoint: "/api/models/metrics-bar/model",
      algorithmType: "CLASSIFICATION"
    },
    {
      title: "Confusion Matrix",
      description: "Visualize classification predictions vs actual values",
      endpoint: "/api/models/metrics-confusion/model",
      algorithmType: "CLASSIFICATION"
    }
  ],
  REGRESSION: [
    {
      title: "Regression Scatter Plot",
      description: "Actual vs Predicted values",
      endpoint: "/api/models/metrics-scatter/model",
      algorithmType: "REGRESSION"
    },
    {
      title: "Residual Plot",
      description: "Residuals vs Predicted values",
      endpoint: "/api/models/metrics-residual/model",
      algorithmType: "REGRESSION"
    }
  ],
  CLUSTERING: [
    {
      title: "Cluster Sizes",
      description: "Distribution of instances across clusters",
      endpoint: "/api/models/metrics-cluster-sizes/model",
      algorithmType: "CLUSTERING"
    },
    {
      title: "Cluster Scatter Plot",
      description: "2D visualization of clusters using PCA",
      endpoint: "/api/models/metrics-scatter-cluster/model",
      algorithmType: "CLUSTERING"
    }
  ]
};

type ModelInfo = {
  id: number;
  name: string;
  algorithmName: string;
  algorithmType: string;
};

class PageResults extends HTMLElement {
  private root!: ShadowRoot;
  private modelId: number | null = null;
  private modelInfo: ModelInfo | null = null;
  private loading = true;
  private error: string | null = null;
  private chartImages = new Map<string, string>(); // endpoint -> blob URL
  private chartErrors = new Map<string, string>();

  connectedCallback() {
    this.root = this.shadowRoot ?? this.attachShadow({ mode: "open" });

    // Extract modelId from URL hash: #/results/123
    const hash = window.location.hash;
    const match = hash.match(/\/results\/(\d+)/);
    if (match) {
      this.modelId = Number.parseInt(match[1], 10);
    }

    this.render();

    if (this.modelId) {
      void this.loadModelInfo();
    }
  }

  private render() {
    this.root.innerHTML = `
      <style>${styles}</style>
      <div class="page">
        <header class="hero">
          <div class="hero__content">
            <h1>Training Results</h1>
            <p>${this.modelInfo ? `Visualizations for ${this.modelInfo.name || 'Model'} (${this.modelInfo.algorithmName})` : 'Visual analysis of your trained model\'s performance metrics and evaluation results.'}</p>
          </div>
          <div class="hero__actions">
            <button class="btn ghost" type="button" data-action="back">Back to Trainings</button>
          </div>
        </header>
        ${this.renderBody()}
      </div>
    `;

    this.bindEvents();
  }

  private renderBody(): string {
    if (!this.modelId) {
      return `
        <section class="panel state">
          <p>No model ID provided</p>
          <button class="btn ghost" type="button" data-action="back">Go back</button>
        </section>
      `;
    }

    if (this.loading) {
      return `
        <section class="panel state">
          <p>Loading model information...</p>
        </section>
      `;
    }

    if (this.error) {
      return `
        <section class="panel state">
          <p>${this.error}</p>
          <button class="btn ghost" type="button" data-action="back">Go back</button>
        </section>
      `;
    }

    if (!this.modelInfo || !this.modelInfo.algorithmType) {
      return `
        <section class="panel state">
          <p>Algorithm type not available for this model</p>
          <button class="btn ghost" type="button" data-action="back">Go back</button>
        </section>
      `;
    }

    const charts = CHARTS_BY_TYPE[this.modelInfo.algorithmType] || [];

    if (charts.length === 0) {
      return `
        <section class="panel state">
          <p>No visualizations available for ${this.modelInfo.algorithmType} models</p>
          <button class="btn ghost" type="button" data-action="back">Go back</button>
        </section>
      `;
    }

    return `
      <section class="panel">
        <h2 style="margin: 0 0 1.5rem 0; font-size: 1.5rem;">
          ${this.modelInfo.algorithmType} Model Visualizations
        </h2>
        <div class="charts-grid">
          ${charts.map(config => this.renderChart(config)).join("")}
        </div>
      </section>
    `;
  }

  private renderChart(config: ChartConfig): string {
    const chartError = this.chartErrors.get(config.endpoint);
    const blobUrl = this.chartImages.get(config.endpoint);

    return `
      <div class="chart-card">
        <h3>${config.title}</h3>
        <p>${config.description}</p>
        ${chartError ? `
          <div class="chart-error">
            ${chartError}
          </div>
        ` : blobUrl ? `
          <img
            class="chart-image"
            src="${blobUrl}"
            alt="${config.title}"
          />
        ` : `
          <div class="chart-loading">
            <p>Loading chart...</p>
          </div>
        `}
      </div>
    `;
  }

  private bindEvents() {
    this.root.querySelectorAll<HTMLButtonElement>("[data-action='back']").forEach((btn) => {
      btn.addEventListener("click", () => {
        window.location.hash = "#/trainings";
      });
    });
  }

  private async loadModelInfo() {
    this.loading = true;
    this.error = null;
    this.render();

    try {
      const token = getToken();
      if (!token) {
        throw new UnauthorizedError();
      }

      const response = await fetch(`/api/models`, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json"
        }
      });

      if (!response.ok) {
        throw new Error(`Failed to load model info: ${response.status}`);
      }

      const models = await response.json();
      const model = models.find((m: any) => m.id === this.modelId);

      if (!model) {
        throw new Error("Model not found");
      }

      this.modelInfo = {
        id: model.id,
        name: model.name || "Unnamed Model",
        algorithmName: model.algorithmName || "Unknown",
        algorithmType: model.algorithmType
      };

      this.loading = false;
      this.render();

      // Now load all chart images
      if (this.modelInfo.algorithmType) {
        await this.loadCharts();
      }
    } catch (err) {
      if (err instanceof UnauthorizedError) {
        window.location.hash = "#/login";
        return;
      }
      this.error = err instanceof Error ? err.message : "Failed to load model information";
      this.loading = false;
      this.render();
    }
  }

  private async loadCharts() {
    if (!this.modelInfo) return;

    const charts = CHARTS_BY_TYPE[this.modelInfo.algorithmType] || [];

    for (const chart of charts) {
      await this.loadChartImage(chart);
    }
  }

  private async loadChartImage(config: ChartConfig) {
    try {
      const token = getToken();
      if (!token) {
        throw new UnauthorizedError();
      }

      const url = `${config.endpoint}/${this.modelId}`;
      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "image/png"
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      this.chartImages.set(config.endpoint, objectUrl);
      this.render();
    } catch (err) {
      if (err instanceof UnauthorizedError) {
        this.chartErrors.set(config.endpoint, "Unauthorized to view this chart.");
      } else {
        this.chartErrors.set(config.endpoint, "Failed to load chart.");
      }
      this.render();
    }
  }

  disconnectedCallback() {
    // Clean up blob URLs
    for (const url of this.chartImages.values()) {
      URL.revokeObjectURL(url);
    }
  }
}

customElements.define("page-results", PageResults);
