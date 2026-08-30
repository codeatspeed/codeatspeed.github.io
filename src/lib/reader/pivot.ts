export type PivotMeasurement = {
  beforeWidth: number;
  pivotWidth: number;
  railX: number;
};

/** Return the x offset at which a measured word should start. */
export function computePivotOffset(input: PivotMeasurement): number {
  return input.railX - input.beforeWidth - input.pivotWidth / 2;
}
