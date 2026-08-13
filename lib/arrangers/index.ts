import type { ArrangementPart } from "../arrangement";
import type { StyleId } from "../types";
import { arrangeChoir } from "./choir";
import type { ArrangeContext } from "./context";
import { arrangeOrchestra } from "./orchestra";
import { arrangeQuartet } from "./quartet";
import { arrangeQuintet } from "./quintet";

export type Arranger = (ctx: ArrangeContext) => ArrangementPart[];

export const ARRANGERS: Record<StyleId, Arranger> = {
  orchestra: arrangeOrchestra,
  chamber: arrangeQuartet,
  windQuintet: arrangeQuintet,
  choir: arrangeChoir,
};

export { arrangeChoir, arrangeOrchestra, arrangeQuartet, arrangeQuintet };
export type { ArrangeContext };
