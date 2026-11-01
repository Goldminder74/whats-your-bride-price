import { PaidError } from "./errors.ts";

/**
 * Seam for a later Paystack adapter. Nigeria bank transfer, Ghana mobile money
 * and Kenya M-Pesa are not implemented. Callers receive a stable error.
 */
export interface LocalPaymentProvider {
  readonly id: "paystack";
  readonly markets: readonly ["NG", "GH", "KE"];
  createCheckout(input: Readonly<{ productKey: string; email: string; country: string }>): Promise<{ url: string }>;
}

export const paystackSeam: LocalPaymentProvider = {
  id: "paystack",
  markets: ["NG", "GH", "KE"],
  createCheckout() {
    return Promise.reject(new PaidError("paystack_not_enabled", 501));
  },
};
