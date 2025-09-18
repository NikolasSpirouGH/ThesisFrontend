// main.ts
import { startHashRouter } from "./router";
import { routes } from "./routes";
import "../features/home/home.page";
import "../features/trainings/training-weka.page";
import "../auth/register.page";
import "../auth/login.page";

const app = document.getElementById("app")!;
startHashRouter(
  Object.fromEntries(Object.entries(routes).map(([path, fn]) => [path, () => fn(app)])),
  () => (app.innerHTML = `<h1>404</h1>`)
);
