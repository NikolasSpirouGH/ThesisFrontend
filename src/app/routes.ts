export const routes = {
  "/": (app: HTMLElement) => {
    app.replaceChildren(document.createElement("page-home"));
  },
  "/trainings": (app: HTMLElement) => {
    app.replaceChildren(document.createElement("page-trainings"));
  },
  "/train/weka": (app: HTMLElement) => {
    app.replaceChildren(document.createElement("page-train-weka"));
  },
  "/train/custom": (app: HTMLElement) => {
    app.replaceChildren(document.createElement("page-train-custom"));
  },
  "/train/retrain": (app: HTMLElement) => {
    app.replaceChildren(document.createElement("page-train-retrain"));
  },
  "/algorithms": (app: HTMLElement) => {
    app.replaceChildren(document.createElement("page-algorithms"));
  },
  "/algorithms/create": (app: HTMLElement) => {
    app.replaceChildren(document.createElement("page-create-algorithm"));
  },
  "/register": (app: HTMLElement) => {
    app.replaceChildren(document.createElement("page-register"));
  },
  "/login": (app: HTMLElement) => {
    app.replaceChildren(document.createElement("page-login"));
  },
  "/reset-password": (app: HTMLElement) => {
    app.replaceChildren(document.createElement("page-reset-pass"));
  },
  "/models": (app: HTMLElement) => {
    app.replaceChildren(document.createElement("page-models"));
  },
  "/executions": (app: HTMLElement) => {
    app.replaceChildren(document.createElement("page-executions"));
  },
  "/categories": (app: HTMLElement) => {
    app.replaceChildren(document.createElement("page-categories"));
  },
  "/execute": (app: HTMLElement) => {
    app.replaceChildren(document.createElement("page-execution"));
  },
  "/results/:id": (app: HTMLElement) => {
    app.replaceChildren(document.createElement("page-results"));
  },
};
