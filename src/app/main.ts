// main.ts
import { startHashRouter } from "./router";
import { routes } from "./routes";
import "../features/home/home.page";
import "../features/trainings/training-weka.page";
import "../features/trainings/trainings.page";
import "../features/auth/register.page";
import "../features/auth/login.page";
import "../features/auth/reset-pass.page";
import "../features/models/models.page";
import "../features/executions/executions.page";
import "../features/categories/categories.page";

const app = document.getElementById("app")!;
startHashRouter(
  Object.fromEntries(Object.entries(routes).map(([path, fn]) => [path, () => fn(app)])),
  () => (app.innerHTML = `<h1>404</h1>`)
);
