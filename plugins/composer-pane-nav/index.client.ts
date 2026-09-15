import type { PluginClientContext } from "@getpaseo/plugin/client";
import { installComposerPaneNav } from "./client/bridge";

export default function contribute(_client: PluginClientContext) {
  return installComposerPaneNav();
}
