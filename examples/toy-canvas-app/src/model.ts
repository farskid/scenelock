/**
 * Pure retained model for the toy drawing app.
 * Shapes: rect / ellipse. Ops: add, move, select, delete, undo/redo.
 */

export type ShapeKind = "rect" | "ellipse";

export type Rgba = readonly [number, number, number, number];

export interface Shape {
  readonly id: string;
  readonly kind: ShapeKind;
  readonly name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fill: Rgba;
}

export type EditorOp =
  | { type: "add"; shape: Shape }
  | { type: "move"; id: string; x: number; y: number; prevX: number; prevY: number }
  | { type: "select"; id: string | null; prevId: string | null }
  | { type: "delete"; shape: Shape; prevSelected: string | null };

export interface EditorSnapshot {
  readonly shapes: readonly Shape[];
  readonly selectedId: string | null;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
}

function cloneShape(s: Shape): Shape {
  return {
    id: s.id,
    kind: s.kind,
    name: s.name,
    x: s.x,
    y: s.y,
    width: s.width,
    height: s.height,
    fill: [...s.fill] as unknown as Rgba,
  };
}

export class EditorModel {
  private readonly shapes = new Map<string, Shape>();
  private selectedId: string | null = null;
  private readonly undoStack: EditorOp[] = [];
  private readonly redoStack: EditorOp[] = [];
  private nextId = 1;

  allocId(prefix: string): string {
    return `${prefix}-${this.nextId++}`;
  }

  list(): Shape[] {
    return [...this.shapes.values()].map(cloneShape);
  }

  get(id: string): Shape | undefined {
    const s = this.shapes.get(id);
    return s ? cloneShape(s) : undefined;
  }

  get selected(): string | null {
    return this.selectedId;
  }

  snapshot(): EditorSnapshot {
    return {
      shapes: this.list(),
      selectedId: this.selectedId,
      canUndo: this.undoStack.length > 0,
      canRedo: this.redoStack.length > 0,
    };
  }

  /** JSON-stable public snapshot for discovery invariants (shapes + selection). */
  stableSnapshot(): unknown {
    return {
      selectedId: this.selectedId,
      shapes: this.list().map((s) => ({
        id: s.id,
        kind: s.kind,
        name: s.name,
        x: s.x,
        y: s.y,
        width: s.width,
        height: s.height,
        fill: [...s.fill],
      })),
    };
  }

  /** Full fork state including undo/redo stacks (for WalkExecutor.probe). */
  forkState(): {
    selectedId: string | null;
    shapes: Shape[];
    undoStack: EditorOp[];
    redoStack: EditorOp[];
    nextId: number;
  } {
    return {
      selectedId: this.selectedId,
      shapes: this.list(),
      undoStack: this.undoStack.map((op) => structuredClone(op)),
      redoStack: this.redoStack.map((op) => structuredClone(op)),
      nextId: this.nextId,
    };
  }

  restoreFork(state: ReturnType<EditorModel["forkState"]>): void {
    this.shapes.clear();
    for (const shape of state.shapes) {
      this.shapes.set(shape.id, cloneShape(shape));
    }
    this.selectedId = state.selectedId;
    this.undoStack.length = 0;
    this.undoStack.push(...state.undoStack.map((op) => structuredClone(op)));
    this.redoStack.length = 0;
    this.redoStack.push(...state.redoStack.map((op) => structuredClone(op)));
    this.nextId = state.nextId;
  }

  add(kind: ShapeKind, opts: {
    name?: string;
    x: number;
    y: number;
    width: number;
    height: number;
    fill?: Rgba;
    id?: string;
  }): Shape {
    const shape: Shape = {
      id: opts.id ?? this.allocId(kind),
      kind,
      name: opts.name ?? `${kind}`,
      x: opts.x,
      y: opts.y,
      width: opts.width,
      height: opts.height,
      fill: opts.fill ?? (kind === "rect" ? [220, 60, 60, 255] : [60, 120, 220, 255]),
    };
    this.apply({ type: "add", shape }, true);
    return cloneShape(shape);
  }

  move(id: string, x: number, y: number): void {
    const s = this.shapes.get(id);
    if (!s) throw new Error(`unknown shape ${id}`);
    this.apply(
      { type: "move", id, x, y, prevX: s.x, prevY: s.y },
      true,
    );
  }

  /** Non-undoable position write (animation frames). */
  setPosition(id: string, x: number, y: number): void {
    const s = this.shapes.get(id);
    if (!s) throw new Error(`unknown shape ${id}`);
    s.x = x;
    s.y = y;
  }

  select(id: string | null): void {
    if (id !== null && !this.shapes.has(id)) {
      throw new Error(`unknown shape ${id}`);
    }
    this.apply({ type: "select", id, prevId: this.selectedId }, true);
  }

  deleteSelected(): void {
    if (this.selectedId === null) throw new Error("nothing selected");
    const shape = this.shapes.get(this.selectedId);
    if (!shape) throw new Error(`unknown shape ${this.selectedId}`);
    this.apply(
      { type: "delete", shape: cloneShape(shape), prevSelected: this.selectedId },
      true,
    );
  }

  undo(): void {
    const op = this.undoStack.pop();
    if (!op) throw new Error("nothing to undo");
    this.invert(op);
    this.redoStack.push(op);
  }

  redo(): void {
    const op = this.redoStack.pop();
    if (!op) throw new Error("nothing to redo");
    this.apply(op, false);
    this.undoStack.push(op);
  }

  /** Restore from a stable snapshot (probe fork). */
  restore(snap: ReturnType<EditorModel["stableSnapshot"]>): void {
    const s = snap as {
      selectedId: string | null;
      shapes: Shape[];
    };
    this.shapes.clear();
    for (const shape of s.shapes) {
      this.shapes.set(shape.id, cloneShape(shape));
    }
    this.selectedId = s.selectedId;
    this.undoStack.length = 0;
    this.redoStack.length = 0;
  }

  private apply(op: EditorOp, record: boolean): void {
    switch (op.type) {
      case "add":
        this.shapes.set(op.shape.id, cloneShape(op.shape));
        break;
      case "move": {
        const s = this.shapes.get(op.id);
        if (!s) throw new Error(`unknown shape ${op.id}`);
        s.x = op.x;
        s.y = op.y;
        break;
      }
      case "select":
        this.selectedId = op.id;
        break;
      case "delete":
        this.shapes.delete(op.shape.id);
        this.selectedId = null;
        break;
    }
    if (record) {
      this.undoStack.push(op);
      this.redoStack.length = 0;
    }
  }

  private invert(op: EditorOp): void {
    switch (op.type) {
      case "add":
        this.shapes.delete(op.shape.id);
        if (this.selectedId === op.shape.id) this.selectedId = null;
        break;
      case "move": {
        const s = this.shapes.get(op.id);
        if (!s) throw new Error(`unknown shape ${op.id}`);
        s.x = op.prevX;
        s.y = op.prevY;
        break;
      }
      case "select":
        this.selectedId = op.prevId;
        break;
      case "delete":
        this.shapes.set(op.shape.id, cloneShape(op.shape));
        this.selectedId = op.prevSelected;
        break;
    }
  }
}
