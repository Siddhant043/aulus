import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
} from "@tanstack/react-router";
import { Workbench } from "./components/workbench";
import { Library } from "./surfaces/library";
import { ChatIndex, ChatDetail } from "./surfaces/chat";

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

const chatIndexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/chats",
  component: ChatIndex,
});

const chatDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/chats/$chatId",
  component: ChatDetail,
});

const routeTree = rootRoute.addChildren([
  libraryRoute,
  chatIndexRoute,
  chatDetailRoute,
]);

export const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
