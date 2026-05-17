import type { NormalizedDesignV1 } from "../../normalized";

/**
 * Accumulator threaded through the normalizer. Each module pushes warnings,
 * image hashes and font families into here as it walks the tree.
 */
export type NormalizeCtx = {
  warnings: NormalizedDesignV1["warnings"];
  imageHashes: Set<string>;
  fonts: Set<string>;
  offsetX: number;
  offsetY: number;
  /** Background of the nearest ancestor with a solid paint - used to infer a contrasting text color when TEXT has no fills. */
  inheritedBg?: { r: number; g: number; b: number };
};
