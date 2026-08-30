import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
} from "@tanstack/react-router";
import { Workbench } from "./components/workbench";
import { Library } from "./surfaces/library";

const rootRoute = createRootRoute({
  component: () => (
    <Workbench>
      <Outlet />
    </Workbench>
  ),
});

const libraryRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: Library,
});

const routeTree = rootRoute.addChildren([libraryRoute]);

export const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
