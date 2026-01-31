// main.ts
import { startHashRouter } from "./router";
import { routes } from "./routes";
import "../shared/navbar.component";
import "../features/home/home.page";
import "../features/trainings/training-weka.page";
import "../features/trainings/training-custom.page";
import "../features/trainings/training-retrain.page";
import "../features/trainings/trainings.page";
import "../features/algorithms/algorithms.page";
import "../features/algorithms/create-algorithm.page";
import "../features/auth/register.page";
import "../features/auth/login.page";
import "../features/auth/reset-pass.page";
import "../features/models/models.page";
import "../features/executions/executions.page";
import "../features/executions/execution.page";
import "../features/categories/categories.page";
import "../features/datasets/datasets.page";
import "../features/results/results.page";
import "../features/users/users.page";
import "../features/users/profile.page";
import "../features/users/edit-profile.page";
import "../features/users/change-password.page";
import "../features/users/delete-account.page";
import "../features/admin/admin-users.page";
import "../features/admin/admin-categories.page";
import type { AppNavbar } from "../shared/navbar.component";

const navbar = document.querySelector<AppNavbar>("app-navbar")!;
const app = document.getElementById("app")!;

startHashRouter(
  Object.fromEntries(
    Object.entries(routes).map(([path, fn]) => [
      path,
      () => {
        fn(app);
        navbar.refresh();
      },
    ])
  ),
  () => (app.innerHTML = `<h1>404</h1>`)
);
