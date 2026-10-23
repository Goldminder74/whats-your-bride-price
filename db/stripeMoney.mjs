// Display only: never determines fulfilment, refunds or an exchange rate.
// Stripe charge units, including ISK/UGX compatibility and zero-decimal MGA,
// are documented at https://docs.stripe.com/currencies .
const zero=new Set(['BIF','CLP','DJF','GNF','JPY','KMF','KRW','MGA','PYG','RWF','VND','VUV','XAF','XOF','XPF']);
export function stripeMoney(currency,amount){
 if(typeof currency!=='string'||!Intl.supportedValuesOf('currency').includes(currency)||!Number.isSafeInteger(amount)||amount<0)throw Error('payment_display_unavailable');
 const digits=zero.has(currency)?0:['ISK','UGX','HUF','TWD'].includes(currency)?2:new Intl.NumberFormat('en-GB',{style:'currency',currency}).resolvedOptions().maximumFractionDigits;
 const scale=10**digits;if(['ISK','UGX'].includes(currency)&&amount%100)throw Error('payment_display_unavailable');
 const integer=BigInt(amount)/BigInt(scale),fraction=String(BigInt(amount)%BigInt(scale)).padStart(digits,'0');
 return currency+' '+integer.toLocaleString('en-GB')+(digits?'.'+fraction:'');
}
