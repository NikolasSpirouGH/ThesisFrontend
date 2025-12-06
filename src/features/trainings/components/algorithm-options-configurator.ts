import type { AlgorithmWekaOption } from "../../algorithms/api";
import styles from "./algorithm-options-configurator.css?raw";

export type OptionValues = Record<string, string>;

type ConfiguratorState = {
  options: AlgorithmWekaOption[];
  values: OptionValues;
};

export class AlgorithmOptionsConfigurator extends HTMLElement {
  private root!: ShadowRoot;
  private state: ConfiguratorState = {
    options: [],
    values: {}
  };

  connectedCallback() {
    this.root = this.shadowRoot ?? this.attachShadow({ mode: "open" });
    this.render();
  }

  /**
   * Set the algorithm options to display
   */
  setOptions(options: AlgorithmWekaOption[]) {
    this.state.options = options;

    // Initialize values with defaults
    this.state.values = {};
    options.forEach(option => {
      this.state.values[option.flag] = option.defaultValue || "";
    });

    this.render();
  }

  /**
   * Get current option values
   */
  getValues(): OptionValues {
    return { ...this.state.values };
  }

  /**
   * Get values as Weka CLI string (e.g., "-C 0.5 -M 2")
   */
  getCliString(): string {
    const parts: string[] = [];

    for (const [flag, value] of Object.entries(this.state.values)) {
      if (value !== null && value !== undefined && value !== "") {
        // For boolean flags, only include the flag if true
        const option = this.state.options.find(opt => opt.flag === flag);
        if (option?.type === "boolean") {
          if (value === "true") {
            parts.push(`-${flag}`);
          }
        } else {
          parts.push(`-${flag} ${value}`);
        }
      }
    }

    return parts.join(" ");
  }

  /**
   * Reset all options to their default values
   */
  reset() {
    this.state.options.forEach(option => {
      this.state.values[option.flag] = option.defaultValue || "";
    });
    this.render();
  }

  private render() {
    this.root.innerHTML = `
      <style>${styles}</style>
      <div class="options-configurator">
        ${this.state.options.length === 0
          ? '<p class="options-configurator__empty">No options available for this algorithm</p>'
          : this.renderOptions()
        }
      </div>
    `;

    // Bind events after rendering
    this.bindEvents();
  }

  private renderOptions(): string {
    return `
      <div class="options-configurator__header">
        <h4>Algorithm Options</h4>
        <button type="button" class="btn-reset" data-action="reset-options">Reset to Default</button>
      </div>
      <div class="options-configurator__grid">
        ${this.state.options.map(option => this.renderOption(option)).join("")}
      </div>
    `;
  }

  private renderOption(option: AlgorithmWekaOption): string {
    const value = this.state.values[option.flag] || "";
    const inputId = `option-${option.flag}`;

    return `
      <div class="option-field">
        <label class="option-field__label" for="${inputId}">
          <span class="option-field__name">-${option.flag}</span>
          <span class="option-field__description">${this.escapeHtml(option.description)}</span>
        </label>
        ${this.renderInput(option, inputId, value)}
      </div>
    `;
  }

  private renderInput(option: AlgorithmWekaOption, id: string, value: string): string {
    switch (option.type) {
      case "boolean":
        return `
          <input
            type="checkbox"
            id="${id}"
            data-flag="${option.flag}"
            ${value === "true" ? "checked" : ""}
          />
        `;

      case "numeric":
        return `
          <input
            type="number"
            id="${id}"
            data-flag="${option.flag}"
            value="${this.escapeHtml(value)}"
            step="any"
          />
        `;

      default: // string
        return `
          <input
            type="text"
            id="${id}"
            data-flag="${option.flag}"
            value="${this.escapeHtml(value)}"
          />
        `;
    }
  }

  private bindEvents() {
    const inputs = this.root.querySelectorAll<HTMLInputElement>("input[data-flag]");

    inputs.forEach(input => {
      const flag = input.getAttribute("data-flag");
      if (!flag) return;

      if (input.type === "checkbox") {
        input.addEventListener("change", () => {
          this.state.values[flag] = input.checked ? "true" : "false";
          this.dispatchChangeEvent();
        });
      } else {
        input.addEventListener("input", () => {
          this.state.values[flag] = input.value;
          this.dispatchChangeEvent();
        });
      }
    });

    // Reset button
    const resetBtn = this.root.querySelector<HTMLButtonElement>("[data-action='reset-options']");
    if (resetBtn) {
      resetBtn.addEventListener("click", () => this.reset());
    }
  }

  private dispatchChangeEvent() {
    this.dispatchEvent(new CustomEvent("optionschange", {
      detail: {
        values: this.getValues(),
        cliString: this.getCliString()
      },
      bubbles: true
    }));
  }

  private escapeHtml(text: string): string {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }
}

customElements.define("algorithm-options-configurator", AlgorithmOptionsConfigurator);
