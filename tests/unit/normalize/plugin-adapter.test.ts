import { describe, it, expect } from "vitest";

import { adaptFigmaDesignV1 } from "@/lib/figma/plugin/adapter";
import { isFigmaDesignV1, type FigmaDesignV1 } from "@/lib/figma/plugin/schema";
import { normalizeFigmaExport } from "@/lib/figma/normalize";

// Synthetic FigmaDesignV1 fixture mirroring the shape the FYB Extractor
// plugin emits. Verified against the user's real export ("Untitled.json").
function makeFixture(): FigmaDesignV1 {
  return {
    schemaVersion: 1,
    pluginVersion: "0.1.0",
    exportedAt: new Date().toISOString(),
    source: { documentColorProfile: "SRGB", documentName: "Untitled" },
    warnings: [],
    pages: [
      {
        id: "0:1",
        name: "Page 1",
        backgrounds: [
          {
            type: "SOLID",
            visible: true,
            opacity: 1,
            blendMode: "NORMAL",
            color: { r: 0.117, g: 0.117, b: 0.117 },
            css: "rgb(30, 30, 30)",
          },
        ],
        prototypeBackgrounds: [],
        prototypeStartNodeId: null,
        flowStartingPoints: [],
        guides: [],
        isPageDivider: false,
        children: [
          {
            id: "1:2",
            name: "Card",
            type: "FRAME",
            visible: true,
            locked: false,
            opacity: 1,
            blendMode: "PASS_THROUGH",
            isMask: false,
            x: 0,
            y: 0,
            width: 735,
            height: 858,
            rotation: 0,
            relativeTransform: [
              [1, 0, 0],
              [0, 1, 0],
            ],
            absoluteTransform: [
              [1, 0, 0],
              [0, 1, 0],
            ],
            absoluteBoundingBox: { x: 0, y: 0, width: 735, height: 858 },
            absoluteRenderBounds: { x: 0, y: 0, width: 735, height: 858 },
            children: [
              {
                id: "1:3",
                name: "Background",
                type: "RECTANGLE",
                visible: true,
                locked: false,
                opacity: 1,
                blendMode: "PASS_THROUGH",
                isMask: false,
                x: 0,
                y: 0,
                width: 735,
                height: 858,
                rotation: 0,
                relativeTransform: [
                  [1, 0, 0],
                  [0, 1, 0],
                ],
                absoluteTransform: [
                  [1, 0, 0],
                  [0, 1, 0],
                ],
                absoluteBoundingBox: { x: 0, y: 0, width: 735, height: 858 },
                absoluteRenderBounds: { x: 0, y: 0, width: 735, height: 858 },
                topLeftRadius: 0,
                topRightRadius: 0,
                bottomLeftRadius: 0,
                bottomRightRadius: 0,
                cornerSmoothing: 0,
                fills: [
                  {
                    type: "SOLID",
                    visible: true,
                    opacity: 1,
                    blendMode: "NORMAL",
                    color: { r: 0, g: 0.305, b: 0.592 },
                    css: "rgb(0, 78, 151)",
                  },
                ],
                fillGeometry: [{ data: "M0 0L735 0L735 858L0 858Z", windingRule: "NONZERO" }],
                strokeGeometry: [],
              } as FigmaDesignV1["pages"][0]["children"][0],
              {
                id: "1:5",
                name: "CLASS OF 2026",
                type: "TEXT",
                visible: true,
                locked: false,
                opacity: 1,
                blendMode: "PASS_THROUGH",
                isMask: false,
                x: 265,
                y: 803,
                width: 206,
                height: 22,
                rotation: 0,
                relativeTransform: [
                  [1, 0, 265],
                  [0, 1, 803],
                ],
                absoluteTransform: [
                  [1, 0, 265],
                  [0, 1, 803],
                ],
                absoluteBoundingBox: { x: 265, y: 803, width: 206, height: 22 },
                absoluteRenderBounds: { x: 265, y: 803, width: 206, height: 22 },
                characters: "CLASS OF 2026",
                hasMissingFont: false,
                textAutoResize: "WIDTH_AND_HEIGHT",
                textAlignHorizontal: "LEFT",
                textAlignVertical: "TOP",
                paragraphIndent: 0,
                paragraphSpacing: 0,
                fontName: { family: "Inter", style: "Bold" },
                fontSize: 18,
                fontWeight: 700,
                letterSpacing: { unit: "PERCENT", value: 30 },
                lineHeight: { unit: "AUTO" },
                textCase: "ORIGINAL",
                textDecoration: "NONE",
                fills: [
                  {
                    type: "SOLID",
                    visible: true,
                    opacity: 0.94,
                    blendMode: "NORMAL",
                    color: { r: 0, g: 0, b: 0 },
                    css: "rgba(0, 0, 0, 0.94)",
                  },
                ],
                allFontNames: [{ family: "Inter", style: "Bold" }],
                runs: [
                  {
                    start: 0,
                    end: 13,
                    characters: "CLASS OF 2026",
                    fontName: { family: "Inter", style: "Bold" },
                    fontSize: 18,
                    fontWeight: 700,
                    textCase: "ORIGINAL",
                    textDecoration: "NONE",
                    letterSpacing: { unit: "PERCENT", value: 30 },
                    lineHeight: { unit: "AUTO" },
                    fills: [
                      {
                        type: "SOLID",
                        visible: true,
                        opacity: 0.94,
                        blendMode: "NORMAL",
                        color: { r: 0, g: 0, b: 0 },
                        css: "rgba(0, 0, 0, 0.94)",
                      },
                    ],
                  },
                ],
                outlinePaths: [],
              } as FigmaDesignV1["pages"][0]["children"][0],
            ],
            clipsContent: false,
            topLeftRadius: 0,
            topRightRadius: 0,
            bottomLeftRadius: 0,
            bottomRightRadius: 0,
            cornerSmoothing: 0,
            layoutMode: "NONE",
            layoutWrap: "NO_WRAP",
            itemSpacing: 0,
            paddingTop: 0,
            paddingRight: 0,
            paddingBottom: 0,
            paddingLeft: 0,
            layoutGrids: [],
          } as FigmaDesignV1["pages"][0]["children"][0],
        ],
      },
    ],
    globals: {
      fonts: [
        { family: "Inter", style: "Bold", fontWeight: 700, sampleNodeIds: ["1:5"] },
      ],
      styles: { paint: [], text: [], effect: [], grid: [] },
      variables: { collections: [], variables: [] },
      components: { components: [], componentSets: [] },
      environmentFonts: [],
    },
    assets: {
      images: {
        abc123: {
          mime: "image/png",
          base64: "iVBORw0KGgo=",
          width: 100,
          height: 100,
        },
      },
      videos: {},
    },
  };
}

describe("FigmaDesignV1 adapter", () => {
  it("isFigmaDesignV1 detects plugin output", () => {
    expect(isFigmaDesignV1(makeFixture())).toBe(true);
    expect(isFigmaDesignV1({ document: {} })).toBe(false);
    expect(isFigmaDesignV1(null)).toBe(false);
  });

  it("normalizeFigmaExport routes plugin output through the adapter", () => {
    const out = normalizeFigmaExport(makeFixture());
    expect(out.version).toBe(2);
    expect(out.source).toBe("figma");
    expect(out.canvas.width).toBe(735);
    expect(out.canvas.height).toBe(858);
    expect(out.rootIds).toEqual(["1:2"]);
    expect(out.nodesById["1:2"]?.kind).toBe("container");
    expect(out.nodesById["1:3"]?.kind).toBe("shape");
    expect(out.nodesById["1:5"]?.kind).toBe("text");
  });

  it("emits just family names in assets.fonts so the Google Fonts loader can resolve them", () => {
    const out = normalizeFigmaExport(makeFixture());
    // assets.fonts feeds <link rel="stylesheet" href="…?family=Inter…">; it must
    // be family-only. Style/weight detail lives per-text-node (see fontStyleName / fontWeight tests).
    expect(out.assets.fonts).toContain("Inter");
    expect(out.assets.fonts).not.toContain("Inter Bold");
  });

  it("preserves text runs with per-run styling", () => {
    const out = normalizeFigmaExport(makeFixture());
    const text = out.nodesById["1:5"];
    expect(text?.kind).toBe("text");
    if (text?.kind !== "text") return;
    expect(text.text.characters).toBe("CLASS OF 2026");
    expect(text.text.fontFamily).toBe("Inter");
    expect(text.text.fontWeight).toBe(700);
    expect(text.text.fontSize).toBe(18);
    expect(text.text.runs).toHaveLength(1);
    expect(text.text.runs?.[0].fontFamily).toBe("Inter");
  });

  it("captures rectangle fill as SOLID with raw float color", () => {
    const out = normalizeFigmaExport(makeFixture());
    const rect = out.nodesById["1:3"];
    if (rect?.kind !== "shape") throw new Error("expected shape");
    expect(rect.fills).toHaveLength(1);
    expect(rect.fills[0].kind).toBe("solid");
  });

  it("emits a __pluginImages map with base64 → data URLs", () => {
    const { design } = adaptFigmaDesignV1(makeFixture());
    const pluginImages = (design as unknown as { __pluginImages?: { byHash: Record<string, { dataUrl: string }> } }).__pluginImages;
    expect(pluginImages).toBeDefined();
    expect(pluginImages?.byHash["abc123"]?.dataUrl).toMatch(/^data:image\/png;base64,iVBORw0KGgo=$/);
  });

  it("propagates per-side stroke weights from the node when they differ", () => {
    const fixture = makeFixture();
    const rect = fixture.pages[0].children[0] as unknown as {
      children: Array<Record<string, unknown>>;
    };
    const bg = rect.children[0] as Record<string, unknown>;
    bg.strokeTopWeight = 3;
    bg.strokeRightWeight = 1;
    bg.strokeBottomWeight = 1;
    bg.strokeLeftWeight = 1;
    bg.strokes = [
      {
        paints: [
          {
            type: "SOLID",
            visible: true,
            opacity: 1,
            blendMode: "NORMAL",
            color: { r: 0, g: 0, b: 0 },
            css: "rgb(0, 0, 0)",
          },
        ],
        strokeStyleId: null,
        weight: 1,
        align: "INSIDE",
        cap: "NONE",
        join: "MITER",
        miterLimit: 4,
        dashPattern: [],
        geometry: [],
        includedInLayout: false,
      },
    ];

    const out = normalizeFigmaExport(fixture);
    const node = out.nodesById["1:3"];
    if (node?.kind !== "shape") throw new Error("expected shape");
    expect(node.strokes).toHaveLength(1);
    expect(node.strokes[0].weight).toBe(3); // max of the four sides
    expect(node.strokes[0].individualWeights).toEqual({ top: 3, right: 1, bottom: 1, left: 1 });
  });

  it("collapses per-side stroke weights to a single weight when uniform", () => {
    const fixture = makeFixture();
    const rect = fixture.pages[0].children[0] as unknown as {
      children: Array<Record<string, unknown>>;
    };
    const bg = rect.children[0] as Record<string, unknown>;
    bg.strokeTopWeight = 2;
    bg.strokeRightWeight = 2;
    bg.strokeBottomWeight = 2;
    bg.strokeLeftWeight = 2;
    bg.strokes = [
      {
        paints: [
          {
            type: "SOLID",
            visible: true,
            opacity: 1,
            blendMode: "NORMAL",
            color: { r: 0, g: 0, b: 0 },
            css: "rgb(0, 0, 0)",
          },
        ],
        strokeStyleId: null,
        weight: 2,
        align: "CENTER",
        cap: "NONE",
        join: "MITER",
        miterLimit: 4,
        dashPattern: [],
        geometry: [],
        includedInLayout: false,
      },
    ];

    const out = normalizeFigmaExport(fixture);
    const node = out.nodesById["1:3"];
    if (node?.kind !== "shape") throw new Error("expected shape");
    expect(node.strokes[0].weight).toBe(2);
    expect(node.strokes[0].individualWeights).toBeUndefined();
  });

  it("does not forward maskType when isMask is false", () => {
    const fixture = makeFixture();
    // The plugin emits maskType: 'ALPHA' on every node - verify it's stripped
    // for nodes that aren't actually masks.
    const rectRaw = (fixture.pages[0].children[0] as unknown as { children: Array<Record<string, unknown>> })
      .children[0];
    rectRaw.maskType = "ALPHA";
    rectRaw.isMask = false;

    const out = normalizeFigmaExport(fixture);
    const node = out.nodesById["1:3"];
    expect(node).toBeDefined();
    expect((node as unknown as { maskType?: string }).maskType).toBeUndefined();
  });

  it("warns when an unsupported effect kind is encountered", () => {
    const fixture = makeFixture();
    const rectRaw = (fixture.pages[0].children[0] as unknown as { children: Array<Record<string, unknown>> })
      .children[0];
    rectRaw.effects = [{ type: "NOISE", visible: true }];

    const out = normalizeFigmaExport(fixture);
    expect(out.warnings.some((w) => w.code === "unsupported_effect")).toBe(true);
  });

  it("preserves gradient stop colors at full float precision (no integer rounding)", () => {
    const fixture = makeFixture();
    const rect = (fixture.pages[0].children[0] as unknown as { children: Array<Record<string, unknown>> })
      .children[0];
    // A stop with sub-integer precision: r=0.5019607843137255 → 128.000000000000... after *255.
    // A naive Math.round would emit 128 and lose the trailing precision; Figma's
    // raw float values matter for crisp gradient interpolation.
    rect.fills = [
      {
        type: "GRADIENT_LINEAR",
        visible: true,
        opacity: 1,
        blendMode: "NORMAL",
        gradientTransform: [
          [1, 0, 0],
          [0, 1, 0],
        ],
        gradientStops: [
          { position: 0, color: { r: 0.13472408056259155, g: 0.305882, b: 0.5921568870544434, a: 1 }, boundVariables: {} },
        ],
      },
    ];
    const out = normalizeFigmaExport(fixture);
    const node = out.nodesById["1:3"];
    if (node?.kind !== "shape") throw new Error("expected shape");
    const grad = node.fills[0];
    if (grad.kind !== "gradient") throw new Error("expected gradient");
    // rgbaCss multiplies each channel by 255 with no rounding; the result must
    // contain a non-integer numeric literal for at least one channel.
    expect(grad.stops[0].colorCss).toMatch(/rgba\(/);
    expect(grad.stops[0].colorCss).toMatch(/\d+\.\d+/);
  });

  it("multiplies paint opacity into gradient stop alpha", () => {
    const fixture = makeFixture();
    const rect = (fixture.pages[0].children[0] as unknown as { children: Array<Record<string, unknown>> })
      .children[0];
    rect.fills = [
      {
        type: "GRADIENT_LINEAR",
        visible: true,
        opacity: 0.5, // half transparent paint
        blendMode: "NORMAL",
        gradientTransform: [
          [1, 0, 0],
          [0, 1, 0],
        ],
        gradientStops: [
          { position: 0, color: { r: 1, g: 0, b: 0, a: 1 }, boundVariables: {} },
          { position: 1, color: { r: 0, g: 0, b: 1, a: 1 }, boundVariables: {} },
        ],
      },
    ];

    const out = normalizeFigmaExport(fixture);
    const node = out.nodesById["1:3"];
    if (node?.kind !== "shape") throw new Error("expected shape");
    const grad = node.fills[0];
    if (grad.kind !== "gradient") throw new Error("expected gradient");
    // 1 (stop alpha) × 0.5 (paint opacity) = 0.5 final alpha on every stop.
    expect(grad.stops[0].colorCss).toMatch(/rgba\(255, *0, *0, *0\.5\)/);
    expect(grad.stops[1].colorCss).toMatch(/rgba\(0, *0, *255, *0\.5\)/);
  });

  it("emits type-correct gradient handles using forward transform", () => {
    const fixture = makeFixture();
    const rect = (fixture.pages[0].children[0] as unknown as { children: Array<Record<string, unknown>> })
      .children[0];
    // Identity transform → linear gradient handles at (0,0.5), (1,0.5), (0,1).
    rect.fills = [
      {
        type: "GRADIENT_LINEAR",
        visible: true,
        opacity: 1,
        blendMode: "NORMAL",
        gradientTransform: [
          [1, 0, 0],
          [0, 1, 0],
        ],
        gradientStops: [
          { position: 0, color: { r: 0, g: 0, b: 0, a: 1 }, boundVariables: {} },
          { position: 1, color: { r: 1, g: 1, b: 1, a: 1 }, boundVariables: {} },
        ],
      },
    ];
    const out = normalizeFigmaExport(fixture);
    const node = out.nodesById["1:3"];
    if (node?.kind !== "shape") throw new Error("expected shape");
    const grad = node.fills[0];
    if (grad.kind !== "gradient") throw new Error("expected gradient");
    expect(grad.handlePositions?.[0]).toEqual({ x: 0, y: 0.5 });
    expect(grad.handlePositions?.[1]).toEqual({ x: 1, y: 0.5 });
  });

  it("places angular gradient center at bbox (0.5, 0.5) under the Untitled.json transform", () => {
    const fixture = makeFixture();
    const rect = (fixture.pages[0].children[0] as unknown as { children: Array<Record<string, unknown>> })
      .children[0];
    // Same transform as 1:7 in Untitled.json - cssInspect reports center at 50% 50%.
    rect.fills = [
      {
        type: "GRADIENT_ANGULAR",
        visible: true,
        opacity: 1,
        blendMode: "NORMAL",
        gradientTransform: [
          [0, 1, 0],
          [-1, 0, 1],
        ],
        gradientStops: [
          { position: 0, color: { r: 0, g: 0, b: 0, a: 1 }, boundVariables: {} },
          { position: 1, color: { r: 1, g: 1, b: 1, a: 1 }, boundVariables: {} },
        ],
      },
    ];
    const out = normalizeFigmaExport(fixture);
    const node = out.nodesById["1:3"];
    if (node?.kind !== "shape") throw new Error("expected shape");
    const grad = node.fills[0];
    if (grad.kind !== "gradient") throw new Error("expected gradient");
    // Angular handle[0] is the center - should land at the bbox center.
    expect(grad.handlePositions?.[0]).toEqual({ x: 0.5, y: 0.5 });
  });

  it("promotes a uniform cornerRadius on a VECTOR node to all four corners", () => {
    const fixture = makeFixture();
    const rect = (fixture.pages[0].children[0] as unknown as { children: Array<Record<string, unknown>> });
    // Replace the rectangle child with a vector that has uniform cornerRadius.
    rect.children = [
      {
        ...(rect.children[0] as Record<string, unknown>),
        id: "1:99",
        type: "VECTOR",
        cornerRadius: 100,
        topLeftRadius: undefined,
        topRightRadius: undefined,
        bottomLeftRadius: undefined,
        bottomRightRadius: undefined,
        vectorPaths: [],
        vectorNetwork: { vertices: [], segments: [], regions: [] },
        fillGeometry: [],
        strokeGeometry: [],
      },
    ];

    const out = normalizeFigmaExport(fixture);
    const node = out.nodesById["1:99"];
    if (node?.kind !== "shape") throw new Error("expected shape");
    expect(node.cornerRadius).toEqual({ tl: 100, tr: 100, bl: 100, br: 100 });
  });

  it("preserves font metadata for text editing (style name, original font, line-height per run)", () => {
    const out = normalizeFigmaExport(makeFixture());
    const text = out.nodesById["1:5"];
    if (text?.kind !== "text") throw new Error("expected text");
    expect(text.text.fontStyleName).toBe("Bold");
    expect(text.text.originalFontName).toEqual({ family: "Inter", style: "Bold" });
    const run = text.text.runs?.[0];
    expect(run?.fontStyleName).toBe("Bold");
    expect(run?.lineHeight).toEqual({ unit: "AUTO" });
  });

  it("collapses repeated warnings into one entry per code with a count suffix", () => {
    const fixture = makeFixture();
    const card = fixture.pages[0].children[0] as unknown as { children: Array<Record<string, unknown>> };
    const a = { ...(card.children[0] as Record<string, unknown>), id: "1:100", effects: [{ type: "NOISE", visible: true }] };
    const b = { ...(card.children[0] as Record<string, unknown>), id: "1:101", effects: [{ type: "NOISE", visible: true }] };
    const c = { ...(card.children[0] as Record<string, unknown>), id: "1:102", effects: [{ type: "GLASS", visible: true }] };
    card.children.push(a, b, c);

    const out = normalizeFigmaExport(fixture);
    const dropped = out.warnings.filter((w) => w.code === "unsupported_effect");
    expect(dropped).toHaveLength(1);
    expect(dropped[0].message).toMatch(/and 2 more nodes/);
  });

  it("captures every editor-relevant text property so a user's edit reuses the original layout metrics", () => {
    // Editing flow: user types into the form input → previewTextByNodeId override
    // engages → renderer drops per-character runs (they no longer make sense for
    // user-supplied text) and falls back to node-level text.* values. If any of
    // the metric-affecting properties are missing here, the layout shifts the
    // moment a user starts typing. Lock down the full list.
    const out = normalizeFigmaExport(makeFixture());
    const text = out.nodesById["1:5"];
    if (text?.kind !== "text") throw new Error("expected text");
    const t = text.text;

    expect(t.fontFamily).toBe("Inter");
    expect(t.fontStyle).toBe("normal");
    expect(t.fontStyleName).toBe("Bold");
    expect(t.fontWeight).toBe(700);
    expect(t.fontSize).toBe(18);
    expect(t.letterSpacing).toEqual({ unit: "PERCENT", value: 30 });
    expect(t.lineHeight).toEqual({ unit: "AUTO" });
    expect(t.textAlignHorizontal).toBe("LEFT");
    expect(t.textAlignVertical).toBe("TOP");
    expect(t.textCase).toBe("ORIGINAL");
    expect(t.textDecoration).toBe("none");
    expect(t.paragraphSpacing).toBe(0);
    expect(t.paragraphIndent).toBe(0);
    expect(t.autoResize).toBe("WIDTH_AND_HEIGHT");
    expect(t.originalFontName).toEqual({ family: "Inter", style: "Bold" });
  });

  it("falls back to the first run's font when run fonts are mixed (so editing a mixed-font text doesn't drop to system-ui)", () => {
    const fixture = makeFixture();
    const card = fixture.pages[0].children[0] as unknown as { children: Array<Record<string, unknown>> };
    const text = card.children[1] as Record<string, unknown>;
    // Force figma.mixed envelopes on every per-character field - what Figma
    // returns when runs disagree. The adapter should still surface the first
    // run's values on text.* so the renderer can paint sensible characters
    // when the user starts typing into the form input.
    text.fontName = { __mixed: true };
    text.fontSize = { __mixed: true };
    text.fontWeight = { __mixed: true };
    text.letterSpacing = { __mixed: true };
    text.lineHeight = { __mixed: true };
    text.textCase = { __mixed: true };
    text.textDecoration = { __mixed: true };
    text.runs = [
      {
        start: 0,
        end: 5,
        characters: "Hello",
        fontName: { family: "Montserrat", style: "Bold" },
        fontSize: 24,
        fontWeight: 700,
        textCase: "ORIGINAL",
        textDecoration: "NONE",
        letterSpacing: { unit: "PERCENT", value: 0 },
        lineHeight: { unit: "AUTO" },
        fills: [
          {
            type: "SOLID",
            visible: true,
            opacity: 1,
            blendMode: "NORMAL",
            color: { r: 0, g: 0, b: 0 },
            css: "rgb(0, 0, 0)",
          },
        ],
      },
      {
        start: 5,
        end: 8,
        characters: "Hi!",
        fontName: { family: "Inter", style: "Light" },
        fontSize: 12,
        fontWeight: 300,
        textCase: "UPPER",
        textDecoration: "UNDERLINE",
        letterSpacing: { unit: "PIXELS", value: 1 },
        lineHeight: { unit: "PIXELS", value: 18 },
        fills: [
          {
            type: "SOLID",
            visible: true,
            opacity: 1,
            blendMode: "NORMAL",
            color: { r: 1, g: 0, b: 0 },
            css: "rgb(255, 0, 0)",
          },
        ],
      },
    ];

    const out = normalizeFigmaExport(fixture);
    const node = out.nodesById["1:5"];
    if (node?.kind !== "text") throw new Error("expected text");
    // First run wins as the representative metrics for the edit fallback.
    expect(node.text.fontFamily).toBe("Montserrat");
    expect(node.text.fontStyleName).toBe("Bold");
    expect(node.text.fontWeight).toBe(700);
    expect(node.text.fontSize).toBe(24);
    expect(node.text.letterSpacing).toEqual({ unit: "PERCENT", value: 0 });
    expect(node.text.lineHeight).toEqual({ unit: "AUTO" });
    expect(node.text.textCase).toBe("ORIGINAL");
    expect(node.text.textDecoration).toBe("none");
    expect(node.text.originalFontName).toEqual({ family: "Montserrat", style: "Bold" });
    // Per-run details still preserved on runs[] for the original (non-edited) render.
    expect(node.text.runs).toHaveLength(2);
    expect(node.text.runs?.[1].fontFamily).toBe("Inter");
    expect(node.text.runs?.[1].fontWeight).toBe(300);
  });

  it("computes the canvas as the union bounding box of visible top-level children", () => {
    const fixture = makeFixture();
    // Add a second top-level frame offset right
    const second = JSON.parse(JSON.stringify(fixture.pages[0].children[0]));
    second.id = "2:1";
    second.absoluteBoundingBox = { x: 1000, y: 200, width: 100, height: 100 };
    second.x = 1000;
    second.y = 200;
    second.width = 100;
    second.height = 100;
    second.relativeTransform = [
      [1, 0, 1000],
      [0, 1, 200],
    ];
    second.absoluteTransform = second.relativeTransform;
    second.children = [];
    fixture.pages[0].children.push(second);

    const out = normalizeFigmaExport(fixture);
    // Width spans from the first frame at 0 to the second frame at 1100.
    expect(out.canvas.width).toBe(1100);
    expect(out.canvas.offsetX).toBe(0);
  });
});
