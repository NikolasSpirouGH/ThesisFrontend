import type { DatasetColumn } from "../api";
import styles from "./dataset-column-selector.css?raw";

export type ColumnSelection = {
  attributeIndices: number[];  // 1-based indices
  classIndex: number | null;   // 1-based index
};

type SelectorState = {
  columns: DatasetColumn[];
  selectedAttributeIndices: Set<number>;
  selectedClassIndex: number | null;
};

export class DatasetColumnSelector extends HTMLElement {
  private root!: ShadowRoot;
  private state: SelectorState = {
    columns: [],
    selectedAttributeIndices: new Set(),
    selectedClassIndex: null
  };

  connectedCallback() {
    this.root = this.shadowRoot ?? this.attachShadow({ mode: "open" });
    this.render();
  }

  /**
   * Set the dataset columns and initialize default selection
   * By default: all columns except last are attributes, last is class
   */
  setColumns(columns: DatasetColumn[]) {
    this.state.columns = columns;

    // Default selection: all columns except last as attributes
    this.state.selectedAttributeIndices = new Set(
      columns.slice(0, -1).map(col => col.index)
    );

    // Last column as class by default
    this.state.selectedClassIndex = columns.length > 0
      ? columns[columns.length - 1].index
      : null;

    this.render();
  }

  /**
   * Get current column selection
   */
  getSelection(): ColumnSelection {
    return {
      attributeIndices: Array.from(this.state.selectedAttributeIndices).sort((a, b) => a - b),
      classIndex: this.state.selectedClassIndex
    };
  }

  /**
   * Get selection as comma-separated strings (for backend)
   * Returns indices as strings (e.g., "1,2,3" and "4")
   */
  getSelectionAsStrings(): { attributes: string; classColumn: string } {
    const attributeIndices = Array.from(this.state.selectedAttributeIndices).sort((a, b) => a - b);
    return {
      attributes: attributeIndices.join(","),
      classColumn: this.state.selectedClassIndex?.toString() || ""
    };
  }

  /**
   * Get selection as column names (for custom algorithms)
   * Returns column names as strings (e.g., "age,income,balance" and "class")
   */
  getSelectionAsNames(): { attributes: string; classColumn: string } {
    const attributeNames: string[] = [];
    this.state.selectedAttributeIndices.forEach(index => {
      const column = this.state.columns.find(col => col.index === index);
      if (column) {
        attributeNames.push(column.name);
      }
    });

    const classColumn = this.state.selectedClassIndex !== null
      ? this.state.columns.find(col => col.index === this.state.selectedClassIndex)?.name || ""
      : "";

    return {
      attributes: attributeNames.join(","),
      classColumn
    };
  }

  /**
   * Reset to default selection
   */
  reset() {
    if (this.state.columns.length > 0) {
      this.state.selectedAttributeIndices = new Set(
        this.state.columns.slice(0, -1).map(col => col.index)
      );
      this.state.selectedClassIndex = this.state.columns[this.state.columns.length - 1].index;
      this.render();
    }
  }

  private render() {
    this.root.innerHTML = `
      <style>${styles}</style>
      <div class="column-selector">
        ${this.state.columns.length === 0
          ? '<p class="column-selector__empty">Upload a dataset to see available columns</p>'
          : this.renderColumns()
        }
      </div>
    `;

    this.bindEvents();
  }

  private renderColumns(): string {
    return `
      <div class="column-selector__header">
        <h4>Dataset Columns (${this.state.columns.length} total)</h4>
        <button type="button" class="btn-reset" data-action="reset">Reset to Default</button>
      </div>

      <div class="column-selector__sections">
        <div class="column-section">
          <h5>Attribute Columns</h5>
          <p class="column-section__hint">Select columns to use as features/attributes</p>
          <div class="column-list">
            ${this.state.columns.map(col => this.renderAttributeCheckbox(col)).join("")}
          </div>
        </div>

        <div class="column-section">
          <h5>Class Column</h5>
          <p class="column-section__hint">Select the target/class column to predict</p>
          <div class="column-list">
            ${this.state.columns.map(col => this.renderClassRadio(col)).join("")}
          </div>
        </div>
      </div>
    `;
  }

  private renderAttributeCheckbox(column: DatasetColumn): string {
    const isChecked = this.state.selectedAttributeIndices.has(column.index);
    const isClass = this.state.selectedClassIndex === column.index;

    return `
      <label class="column-item ${isClass ? 'column-item--disabled' : ''}">
        <input
          type="checkbox"
          data-attribute-index="${column.index}"
          ${isChecked ? 'checked' : ''}
          ${isClass ? 'disabled' : ''}
        />
        <span class="column-item__info">
          <span class="column-item__name">${this.escapeHtml(column.name)}</span>
          <span class="column-item__meta">
            <span class="column-item__type">${column.type}</span>
            ${column.distinctValues ? `<span class="column-item__distinct">${column.distinctValues} values</span>` : ''}
          </span>
        </span>
      </label>
    `;
  }

  private renderClassRadio(column: DatasetColumn): string {
    const isChecked = this.state.selectedClassIndex === column.index;

    return `
      <label class="column-item">
        <input
          type="radio"
          name="class-column"
          data-class-index="${column.index}"
          ${isChecked ? 'checked' : ''}
        />
        <span class="column-item__info">
          <span class="column-item__name">${this.escapeHtml(column.name)}</span>
          <span class="column-item__meta">
            <span class="column-item__type">${column.type}</span>
            ${column.distinctValues ? `<span class="column-item__distinct">${column.distinctValues} values</span>` : ''}
          </span>
        </span>
      </label>
    `;
  }

  private bindEvents() {
    // Attribute checkboxes
    const attributeCheckboxes = this.root.querySelectorAll<HTMLInputElement>("[data-attribute-index]");
    attributeCheckboxes.forEach(checkbox => {
      checkbox.addEventListener("change", () => {
        const index = parseInt(checkbox.getAttribute("data-attribute-index") || "0");
        if (checkbox.checked) {
          this.state.selectedAttributeIndices.add(index);
        } else {
          this.state.selectedAttributeIndices.delete(index);
        }
        this.dispatchChangeEvent();
      });
    });

    // Class radio buttons
    const classRadios = this.root.querySelectorAll<HTMLInputElement>("[data-class-index]");
    classRadios.forEach(radio => {
      radio.addEventListener("change", () => {
        if (radio.checked) {
          const index = parseInt(radio.getAttribute("data-class-index") || "0");
          const previousClassIndex = this.state.selectedClassIndex;

          this.state.selectedClassIndex = index;

          // Remove new class column from attributes if it was selected
          this.state.selectedAttributeIndices.delete(index);

          // Add previous class column back to attributes if it exists
          if (previousClassIndex !== null) {
            this.state.selectedAttributeIndices.add(previousClassIndex);
          }

          this.render();
          this.dispatchChangeEvent();
        }
      });
    });

    // Reset button
    const resetBtn = this.root.querySelector<HTMLButtonElement>("[data-action='reset']");
    if (resetBtn) {
      resetBtn.addEventListener("click", () => this.reset());
    }
  }

  private dispatchChangeEvent() {
    this.dispatchEvent(new CustomEvent("selectionchange", {
      detail: {
        selection: this.getSelection(),
        strings: this.getSelectionAsStrings()
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

customElements.define("dataset-column-selector", DatasetColumnSelector);
