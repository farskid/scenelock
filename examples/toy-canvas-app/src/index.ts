/**
 * Toy retained-model canvas host — in-repo adoption demo + integration proof.
 *
 * One adapter surface (`createToySceneAdapter`) + software raster + step loop.
 */

export { EditorModel, type Shape, type ShapeKind, type Rgba, type EditorOp, type EditorSnapshot } from "./model.js";
export { renderShapes, TOY_RASTER_FINGERPRINT, type RasterResult } from "./raster.js";
export { ToyCanvasApp } from "./app.js";
export {
  createToySceneAdapter,
  createToyStepLoop,
  createToyStepLoopBare,
  createToyRasterSurface,
} from "./adapter.js";
export {
  TOY_EDITOR_MODEL,
  toyEditorStateModel,
  createToyWalkExecutor,
  toyUndoRedoIdentity,
} from "./discovery-model.js";
