export const routes = {
  "/": (app: HTMLElement) => (app.innerHTML = `<h1>Home</h1><a href="#/train/weka">Train Weka</a>`),
  "/train/weka": (app: HTMLElement) => {
    app.replaceChildren(document.createElement("page-train-weka"));
  },
};