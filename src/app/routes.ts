export const routes = {
  "/": (app: HTMLElement) => {
    app.replaceChildren(document.createElement("page-home"));
  },
  "/train/weka": (app: HTMLElement) => {
    app.replaceChildren(document.createElement("page-train-weka"));
  },
  "/register": (app: HTMLElement) => {
    app.replaceChildren(document.createElement("page-register"));
  },
  "/login": (app: HTMLElement) => {
    app.replaceChildren(document.createElement("page-login"));
  },
};
