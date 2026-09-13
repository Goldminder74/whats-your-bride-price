export const PROPOSED_D1_BINDING = "DB";
export const PROPOSED_R2_BINDING = "MEDIA";

export interface DurableStorageReadiness {
  hostingTarget: "chatgpt-sites";
  d1Configured: boolean;
  r2Configured: boolean;
  active: false;
  proposedD1Binding: typeof PROPOSED_D1_BINDING;
  proposedR2Binding: typeof PROPOSED_R2_BINDING;
}

export const durableStorageReadiness: DurableStorageReadiness = Object.freeze({
  hostingTarget: "chatgpt-sites",
  d1Configured: false,
  r2Configured: false,
  active: false,
  proposedD1Binding: PROPOSED_D1_BINDING,
  proposedR2Binding: PROPOSED_R2_BINDING,
});
