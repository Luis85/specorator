// The board's Lucide icon helper now lives in the shared Vue layer (a second
// consumer, the Marketplace storefront, needed the same function-ref host). This
// re-export keeps the board's many `../mountLucide` imports and its
// characterization test unchanged.
export { mountLucide } from '../../../../shared/vue/mountLucide';
