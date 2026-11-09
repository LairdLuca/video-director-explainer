import type React from "react";
import type { SceneName } from "../lib/timeline.mjs";
import { BarChart } from "./BarChart";
import { CodeWalk } from "./CodeWalk";
import { Diagram } from "./Diagram";
import { FlowDiagram } from "./FlowDiagram";
import { HookStatus } from "./HookStatus";
import { Lanes } from "./Lanes";
import { Lesson } from "./Lesson";
import { Matrix } from "./Matrix";
import { ScreenPath } from "./ScreenPath";
import { ScreenProposal } from "./ScreenProposal";
import { Screenshot } from "./Screenshot";
import { StatusCard } from "./StatusCard";
import { StepList } from "./StepList";
import { StrikeReplace } from "./StrikeReplace";
import { Terminal } from "./Terminal";

// The scene catalogue (style guide section 2). "Custom" is resolved separately.
export const scenes: Record<Exclude<SceneName, "Custom">, React.FC> = {
  HookStatus,
  Terminal,
  CodeWalk,
  FlowDiagram,
  StrikeReplace,
  StatusCard,
  StepList,
  Lesson,
  Screenshot,
  ScreenPath,
  ScreenProposal,
  Diagram,
  Lanes,
  Matrix,
  BarChart,
};
