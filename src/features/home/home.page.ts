import styles from "./styles/home.css?raw";

export class PageHome extends HTMLElement {
  connectedCallback() {
    let root = this.shadowRoot;
    if (!root) {
      root = this.attachShadow({ mode: "open" });
    }

    root.innerHTML = `
      <style>${styles}</style>
      <div id="home-container" style="--home-bg-image: url('/assets/background-home.png')">
        <div class="overlay">
          <h1 class="title">Manage ML models</h1>
          <div class="buttons">
            <button id="login-btn" class="btn login">Login</button>
            <button id="register-btn" class="btn register">Register</button>
          </div>
        </div>
      </div>
    `;

    this.shadowRoot
      ?.querySelector<HTMLButtonElement>("#login-btn")
      ?.addEventListener("click", () => {
        window.location.hash = "#/login";
      });

    this.shadowRoot
      ?.querySelector<HTMLButtonElement>("#register-btn")
      ?.addEventListener("click", () => {
        window.location.hash = "#/register";
      });
  }
}

customElements.define("page-home", PageHome);
