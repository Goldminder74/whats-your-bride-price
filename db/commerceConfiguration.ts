import { validateCommerceConfiguration, type CommerceConfiguration, type CowrieBundleConfiguration } from "./commerceContracts.ts";
import { cowrieProductKeys, type CowrieProductKey } from "./cowrieProducts.ts";

export function loadCommerceConfiguration(runtime: Record<string, unknown>, cowries: boolean): CommerceConfiguration | null {
  try {
    if (!["true","false"].includes(String(runtime.STRIPE_EXPECTED_LIVEMODE))) return null;
    const bundles = {} as Record<CowrieProductKey,CowrieBundleConfiguration>;
    if (cowries) for (const key of cowrieProductKeys) {
      const prefix = key.toUpperCase();
      if (!["true","false"].includes(String(runtime[`${prefix}_LIVEMODE`]))) return null;
      bundles[key] = {publicPaymentLinkUrl:String(runtime[`${prefix}_PAYMENT_LINK_URL`]||""),expectedPaymentLinkId:String(runtime[`${prefix}_PAYMENT_LINK_ID`]||""),expectedProductKey:runtime[`${prefix}_PRODUCT_KEY`] as CowrieProductKey,expectedQuantity:Number(runtime[`${prefix}_QUANTITY`]),expectedAmountMinor:Number(runtime[`${prefix}_AMOUNT_MINOR`]),expectedCurrency:runtime[`${prefix}_CURRENCY`] as "GBP",expectedLivemode:runtime[`${prefix}_LIVEMODE`] === "true"};
    }
    return validateCommerceConfiguration({ publicPaymentLinkUrl:runtime.STRIPE_PAYMENT_LINK_URL,expectedPaymentLinkId:runtime.STRIPE_PAYMENT_LINK_ID,webhookSigningSecret:runtime.STRIPE_WEBHOOK_SIGNING_SECRET,expectedProductKey:runtime.ROYAL_REVEAL_PRODUCT_KEY,expectedAmountMinor:Number(runtime.ROYAL_REVEAL_AMOUNT_MINOR),expectedCurrency:runtime.ROYAL_REVEAL_CURRENCY,expectedLivemode:runtime.STRIPE_EXPECTED_LIVEMODE === "true",...(cowries?{cowrieBundles:bundles}:{}) });
  }
  catch { return null; }
}
