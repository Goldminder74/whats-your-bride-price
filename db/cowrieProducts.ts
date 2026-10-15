export const cowrieProducts = Object.freeze({
  cowrie_5_v1: Object.freeze({ quantity: 5, amountMinor: 199, displayPrice: "£1.99", approximateUnitPrice: "approximately 40p each" }),
  cowrie_15_v1: Object.freeze({ quantity: 15, amountMinor: 499, displayPrice: "£4.99", approximateUnitPrice: "approximately 33p each" }),
  cowrie_40_v1: Object.freeze({ quantity: 40, amountMinor: 999, displayPrice: "£9.99", approximateUnitPrice: "approximately 25p each" }),
});
export type CowrieProductKey = keyof typeof cowrieProducts;
export type CommerceProductKey = CowrieProductKey | "royal_reveal_v1";
export const cowrieProductKeys = Object.freeze(Object.keys(cowrieProducts) as CowrieProductKey[]);
export function isCowrieProduct(value: unknown): value is CowrieProductKey {
  return typeof value === "string" && Object.hasOwn(cowrieProducts, value);
}
export const COWRIE_DELIVERY_NOTICE_VERSION = "cowrie-immediate-delivery-draft-v1";
