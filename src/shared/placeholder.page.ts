const baseStyles = `
:host {
  display: block;
  min-height: 100vh;
  background: linear-gradient(140deg, #111828 0%, #0f172a 45%, #1f2937 100%);
  color: #f8fafc;
  font-family: "Inter", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}

*,
*::before,
*::after {
  box-sizing: border-box;
}

.wrapper {
  max-width: 960px;
  margin: 0 auto;
  padding: clamp(3rem, 6vw, 4.5rem) clamp(1.5rem, 5vw, 3rem) clamp(4rem, 8vw, 5rem);
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  gap: 2.5rem;
}

header {
  background: rgba(9, 12, 24, 0.78);
  border-radius: 24px;
  padding: clamp(2.25rem, 5vw, 3.25rem);
  box-shadow: 0 28px 70px rgba(7, 11, 22, 0.55);
  border: 1px solid rgba(148, 163, 184, 0.15);
}

.eyebrow {
  text-transform: uppercase;
  letter-spacing: 0.32em;
  font-size: 0.75rem;
  color: #60a5fa;
  margin-bottom: 0.75rem;
  font-weight: 600;
}

h1 {
  margin: 0 0 1rem;
  font-size: clamp(2.2rem, 5vw, 3.1rem);
  line-height: 1.1;
}

.lead {
  margin: 0;
  color: rgba(226, 232, 240, 0.82);
  line-height: 1.7;
  max-width: 48ch;
}

.panel {
  background: rgba(15, 23, 42, 0.72);
  border-radius: 20px;
  padding: clamp(2rem, 4vw, 2.5rem);
  border: 1px solid rgba(148, 163, 184, 0.12);
  box-shadow: 0 18px 50px rgba(7, 11, 22, 0.45);
}

.panel p {
  margin: 0 0 1.75rem;
  color: rgba(226, 232, 240, 0.78);
  line-height: 1.7;
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
}

.btn {
  font: inherit;
  border: none;
  border-radius: 999px;
  padding: 0.75rem 1.75rem;
  cursor: pointer;
  font-weight: 600;
  letter-spacing: 0.01em;
  background: #2563eb;
  color: #f8fafc;
  box-shadow: 0 18px 40px rgba(30, 64, 175, 0.32);
  transition: transform 0.2s ease, filter 0.2s ease;
}

.btn:hover {
  transform: translateY(-1px);
  filter: brightness(1.05);
}

@media (max-width: 640px) {
  header,
  .panel {
    padding: 2rem;
  }

  .actions {
    flex-direction: column;
  }

  .btn {
    width: 100%;
  }
}
`;

type PlaceholderOptions = {
  tag: string;
  title: string;
  description: string;
  details?: string;
  actionLabel?: string;
};

export function definePlaceholderPage({ tag, title, description, details, actionLabel }: PlaceholderOptions) {
  if (customElements.get(tag)) {
    return;
  }

  class PlaceholderPage extends HTMLElement {
    private root!: ShadowRoot;

    connectedCallback() {
      this.root = this.shadowRoot ?? this.attachShadow({ mode: "open" });
      this.render();
    }

    private render() {
      this.root.innerHTML = `
        <style>${baseStyles}</style>
        <div class="wrapper">
          <header>
            <p class="eyebrow">Workspace</p>
            <h1>${title}</h1>
            <p class="lead">${description}</p>
          </header>
          <section class="panel">
            <p>${details ?? "This area is under construction. Stay tuned for more capabilities."}</p>
            <div class="actions">
              <button class="btn" type="button" data-action="back">${actionLabel ?? "Back to overview"}</button>
            </div>
          </section>
        </div>
      `;

      this.root.querySelector<HTMLButtonElement>("[data-action='back']")?.addEventListener("click", () => {
        window.location.hash = "#/";
      });
    }
  }

  customElements.define(tag, PlaceholderPage);
}
